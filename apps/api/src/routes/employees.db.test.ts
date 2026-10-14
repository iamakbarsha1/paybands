import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '../../generated/prisma/client';
import type { App } from '../app';
import { hasTestDatabase, resetAndSeed, testApp, testPrisma } from '../testing/db';
import { FIXTURE, LANDMARKS } from '../testing/fixture';

const ACTIVE = FIXTURE.employees.filter((employee) => employee.terminationDate === null);

interface Page {
  employees: { id: number; employeeCode: string; status: string; countryCode: string }[];
  nextCursor: string | null;
}

describe.skipIf(!hasTestDatabase())('GET /employees', () => {
  let prisma: PrismaClient;
  let app: App;

  beforeAll(async () => {
    prisma = testPrisma();
    await resetAndSeed(prisma);
    app = testApp(prisma);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function get(url: string): Promise<{ status: number; body: Page }> {
    const response = await app.inject({ method: 'GET', url });
    return { status: response.statusCode, body: response.json<Page>() };
  }

  it('answers with a page, not the table', async () => {
    const { status, body } = await get('/employees?limit=10');

    expect(status).toBe(200);
    expect(body.employees).toHaveLength(10);
    expect(body.nextCursor).toBeTypeOf('string');
  });

  it('walks every active employee exactly once and stops', async () => {
    const seen: number[] = [];
    let cursor: string | null = null;
    let pages = 0;

    do {
      const url: string = `/employees?limit=7${cursor === null ? '' : `&cursor=${cursor}`}`;
      const { body } = await get(url);
      seen.push(...body.employees.map((employee) => employee.id));
      cursor = body.nextCursor;
      pages += 1;
      // A cursor that never advances would loop until the suite times out with no clue why.
      expect(pages).toBeLessThanOrEqual(ACTIVE.length);
    } while (cursor !== null);

    expect(seen).toHaveLength(ACTIVE.length);
    expect(new Set(seen).size).toBe(ACTIVE.length);
  });

  it('returns an empty page rather than a 404 when nothing matches', async () => {
    // Level 7 is a rung nobody in the fixture holds.
    const { status, body } = await get('/employees?level=7');

    expect(status).toBe(200);
    expect(body.employees).toEqual([]);
    expect(body.nextCursor).toBeNull();
  });

  it('rejects a cursor it did not issue', async () => {
    const response = await app.inject({ method: 'GET', url: '/employees?cursor=not-a-cursor' });

    expect(response.statusCode).toBe(400);
  });

  it('rejects a filter it does not have', async () => {
    const response = await app.inject({ method: 'GET', url: '/employees?departmant=2' });

    expect(response.statusCode).toBe(400);
  });

  it('filters on country, department, level and status', async () => {
    const { body: inGb } = await get('/employees?country=GB&limit=100');
    expect(inGb.employees.every((employee) => employee.countryCode === 'GB')).toBe(true);
    expect(inGb.employees).toHaveLength(
      ACTIVE.filter((employee) => employee.countryCode === 'GB').length,
    );

    const { body: leavers } = await get('/employees?status=left&limit=100');
    expect(leavers.employees.map((employee) => employee.id).sort((a, b) => a - b)).toEqual(
      [...LANDMARKS.leaverEmployeeIds].sort((a, b) => a - b),
    );

    const { body: everyone } = await get('/employees?status=all&limit=100');
    expect(everyone.employees).toHaveLength(FIXTURE.employees.length);

    const { body: sales } = await get(
      `/employees?department=${LANDMARKS.salesDepartmentId}&level=3&limit=100`,
    );
    expect(sales.employees.length).toBeGreaterThan(0);
  });

  it('sorts on the documented columns, in both directions', async () => {
    const { body: ascending } = await get('/employees?sort=hireDate&direction=asc&limit=100');
    const { body: descending } = await get('/employees?sort=hireDate&direction=desc&limit=100');

    expect(descending.employees.map((employee) => employee.id)).toEqual(
      [...ascending.employees].reverse().map((employee) => employee.id),
    );

    const { status } = await get('/employees?sort=salary');
    expect(status).toBe(400);
  });

  it('keeps the page boundary stable under a descending sort', async () => {
    const { body: whole } = await get('/employees?sort=name&direction=desc&limit=100');
    const { body: first } = await get('/employees?sort=name&direction=desc&limit=5');
    const { body: second } = await get(
      `/employees?sort=name&direction=desc&limit=5&cursor=${first.nextCursor}`,
    );

    expect([...first.employees, ...second.employees].map((employee) => employee.id)).toEqual(
      whole.employees.slice(0, 10).map((employee) => employee.id),
    );
  });

  it('reports who has left and who has not', async () => {
    const { body } = await get('/employees?status=all&limit=100');
    const byId = new Map(body.employees.map((employee) => [employee.id, employee.status]));

    expect(byId.get(LANDMARKS.leaverEmployeeIds[0] ?? 0)).toBe('left');
    expect(byId.get(LANDMARKS.unbandedEmployeeId)).toBe('active');
  });
});
