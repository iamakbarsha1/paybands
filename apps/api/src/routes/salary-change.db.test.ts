import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '../../generated/prisma/client';
import { buildApp, type App } from '../app';
import { hasTestDatabase, resetAndSeed, testPrisma } from '../testing/db';

const EMPLOYEE = 3;

interface Timeline {
  salaryHistory: { amountMinor: string; effectiveFrom: string; effectiveTo: string | null }[];
  currentSalary: { amountMinor: string; currencyCode: string } | null;
}

describe.skipIf(!hasTestDatabase())('POST /employees/:id/salary', () => {
  let prisma: PrismaClient;
  let app: App;

  beforeAll(() => {
    prisma = testPrisma();
    app = buildApp({ prisma });
  });

  beforeEach(async () => {
    await resetAndSeed(prisma);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function timeline(id = EMPLOYEE): Promise<Timeline> {
    const response = await app.inject({ method: 'GET', url: `/employees/${id}` });
    return response.json<Timeline>();
  }

  function raise(payload: Record<string, unknown>, id = EMPLOYEE) {
    return app.inject({ method: 'POST', url: `/employees/${id}/salary`, payload });
  }

  async function currency(id = EMPLOYEE): Promise<string> {
    const { currentSalary } = await timeline(id);
    if (currentSalary === null) throw new Error('the fixture employee has no open record');
    return currentSalary.currencyCode;
  }

  it('closes the open record and opens the new one', async () => {
    const before = await timeline();
    const raised = await raise({
      amountMinor: '9999000',
      currencyCode: await currency(),
      effectiveFrom: '2026-09-15',
      reason: 'merit',
    });

    expect(raised.statusCode).toBe(201);

    const after = await timeline();
    expect(after.salaryHistory).toHaveLength(before.salaryHistory.length + 1);
    expect(after.salaryHistory.at(-2)?.effectiveTo).toBe('2026-09-15');
    expect(after.salaryHistory.at(-1)).toMatchObject({
      amountMinor: '9999000',
      effectiveFrom: '2026-09-15',
      effectiveTo: null,
    });
    expect(after.currentSalary?.amountMinor).toBe('9999000');
  });

  it('refuses a date at or before the record it would close, and changes nothing', async () => {
    const before = await timeline();
    const openedOn = before.salaryHistory.at(-1)?.effectiveFrom ?? '';

    const backdated = await raise({
      amountMinor: '9999000',
      currencyCode: await currency(),
      effectiveFrom: openedOn,
      reason: 'merit',
    });

    expect(backdated.statusCode).toBe(400);
    expect(await timeline()).toEqual(before);
  });

  it('refuses a currency the timeline does not already use', async () => {
    const wrong = (await currency()) === 'USD' ? 'JPY' : 'USD';

    const mixed = await raise({
      amountMinor: '9999000',
      currencyCode: wrong,
      effectiveFrom: '2026-09-15',
      reason: 'market',
    });

    expect(mixed.statusCode).toBe(400);
  });

  it('refuses a body the schema does not describe, and an employee who is not there', async () => {
    const code = await currency();

    expect(
      (
        await raise({
          amountMinor: '-5',
          currencyCode: code,
          effectiveFrom: '2026-09-15',
          reason: 'merit',
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await raise({
          amountMinor: '9999000',
          currencyCode: code,
          effectiveFrom: '2026-09-15',
          reason: 'bonus',
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await raise(
          {
            amountMinor: '9999000',
            currencyCode: code,
            effectiveFrom: '2026-09-15',
            reason: 'merit',
          },
          9_999,
        )
      ).statusCode,
    ).toBe(404);
  });

  // The partial unique index is the backstop (decision 18): two raises landing together must
  // leave one open record, not two, and the loser must hear about it.
  it('lets one of two simultaneous raises through, and only one', async () => {
    const payload = {
      amountMinor: '9999000',
      currencyCode: await currency(),
      effectiveFrom: '2026-09-15',
      reason: 'merit',
    };

    const [first, second] = await Promise.all([
      raise(payload),
      raise({ ...payload, amountMinor: '8888000' }),
    ]);
    const statuses = [first.statusCode, second.statusCode].sort((a, b) => a - b);

    expect(statuses[0]).toBe(201);
    expect(statuses[1]).toBeGreaterThanOrEqual(400);

    const open = await prisma.salaryRecord.count({
      where: { employeeId: EMPLOYEE, effectiveTo: null },
    });
    expect(open).toBe(1);
  });
});
