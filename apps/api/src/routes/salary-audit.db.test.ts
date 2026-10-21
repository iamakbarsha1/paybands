import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '../../generated/prisma/client';
import type { App } from '../app';
import { FIXTURE } from '../testing/fixture';
import { hasTestDatabase, resetAndSeed, testApp, testPrisma } from '../testing/db';

const EMPLOYEE = 3;
const ADMIN = FIXTURE.appUsers.find((user) => user.role === 'admin')?.id ?? 1;

/**
 * The claim this table makes is that no salary exists without a row saying who set it. So
 * every test here counts audit rows against salary rows rather than only reading the one it
 * just wrote: a log that records the happy path and misses the rest is worse than none,
 * because it reads as complete.
 */
describe.skipIf(!hasTestDatabase())('the salary audit log', () => {
  let prisma: PrismaClient;
  let app: App;

  beforeAll(() => {
    prisma = testPrisma();
    app = testApp(prisma);
  });

  beforeEach(async () => {
    await resetAndSeed(prisma);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  function raise(payload: Record<string, unknown>, id = EMPLOYEE) {
    return app.inject({ method: 'POST', url: `/employees/${id}/salary`, payload });
  }

  async function openRecord() {
    const record = await prisma.salaryRecord.findFirst({
      where: { employeeId: EMPLOYEE, effectiveTo: null },
    });
    if (record === null) throw new Error('the fixture employee has no open record');
    return record;
  }

  it('names the actor, the record it wrote and the amount it replaced', async () => {
    const before = await openRecord();

    const raised = await raise({
      amountMinor: '9999000',
      currencyCode: before.currencyCode,
      effectiveFrom: '2026-09-15',
      reason: 'merit',
    });
    expect(raised.statusCode).toBe(201);

    const audits = await prisma.salaryAudit.findMany({ where: { employeeId: EMPLOYEE } });
    expect(audits).toHaveLength(1);

    const created = await openRecord();
    expect(audits[0]).toMatchObject({
      actorUserId: ADMIN,
      employeeId: EMPLOYEE,
      salaryRecordId: created.id,
      amountMinor: 9_999_000n,
      currencyCode: before.currencyCode,
      reason: 'merit',
      previousAmountMinor: before.amountMinor,
      previousCurrencyCode: before.currencyCode,
    });
  });

  // The fixture rows are written straight to the table, so the first raise through the API is
  // the first audited one. A refused raise must leave that count where it was.
  it('writes nothing when the raise is refused', async () => {
    const before = await openRecord();

    const backdated = await raise({
      amountMinor: '9999000',
      currencyCode: before.currencyCode,
      effectiveFrom: '2000-01-01',
      reason: 'merit',
    });
    expect(backdated.statusCode).toBe(400);

    expect(await prisma.salaryAudit.count()).toBe(0);
  });

  it('writes one row per accepted raise and none per refused one', async () => {
    const { currencyCode } = await openRecord();

    expect(
      (
        await raise({
          amountMinor: '1',
          currencyCode,
          effectiveFrom: '2026-09-15',
          reason: 'merit',
        })
      ).statusCode,
    ).toBe(201);
    expect(
      (
        await raise({
          amountMinor: '2',
          currencyCode,
          effectiveFrom: '2026-09-16',
          reason: 'market',
        })
      ).statusCode,
    ).toBe(201);
    // Same day as the record it would close: refused, and unrecorded.
    expect(
      (
        await raise({
          amountMinor: '3',
          currencyCode,
          effectiveFrom: '2026-09-16',
          reason: 'market',
        })
      ).statusCode,
    ).toBe(400);

    expect(await prisma.salaryAudit.count({ where: { employeeId: EMPLOYEE } })).toBe(2);
  });

  // The whole reason the audit write is inside the salary transaction. Two raises race, one
  // loses on the partial unique index, and the loser must leave no audit row behind.
  it('leaves exactly as many audit rows as raises that committed', async () => {
    const { currencyCode } = await openRecord();
    const payload = { amountMinor: '9999000', currencyCode, effectiveFrom: '2026-09-15' };

    const [first, second] = await Promise.all([
      raise({ ...payload, reason: 'merit' }),
      raise({ ...payload, amountMinor: '8888000', reason: 'market' }),
    ]);

    const committed = [first, second].filter((response) => response.statusCode === 201).length;
    expect(committed).toBe(1);
    expect(await prisma.salaryAudit.count({ where: { employeeId: EMPLOYEE } })).toBe(committed);
  });
});
