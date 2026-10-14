import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '../../generated/prisma/client';
import { buildApp, type App } from '../app';
import { hasTestDatabase, resetAndSeed, testPrisma } from '../testing/db';
import { FIXTURE } from '../testing/fixture';

const JOINER = {
  employeeCode: 'T-0051',
  firstName: 'Nadia',
  lastName: 'Okafor',
  email: 'nadia.okafor@paybands.example',
  gender: 'female',
  hireDate: '2026-09-01',
  countryCode: 'GB',
  departmentId: 1,
  jobLevelId: 3,
  managerId: 1,
};

describe.skipIf(!hasTestDatabase())('writing an employee', () => {
  let prisma: PrismaClient;
  let app: App;

  beforeAll(() => {
    prisma = testPrisma();
    app = buildApp({ prisma });
  });

  // Every test here changes rows, so each starts from the fixture rather than from its predecessor.
  beforeEach(async () => {
    await resetAndSeed(prisma);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  function post(payload: Record<string, unknown>) {
    return app.inject({ method: 'POST', url: '/employees', payload });
  }

  function patch(id: number, payload: Record<string, unknown>) {
    return app.inject({ method: 'PATCH', url: `/employees/${id}`, payload });
  }

  it('creates a joiner and hands back an id that reads', async () => {
    const created = await post(JOINER);
    expect(created.statusCode).toBe(201);

    const { id } = created.json<{ id: number }>();
    // The fixture writes explicit ids, so a sequence left at 1 would collide here.
    expect(id).toBeGreaterThan(FIXTURE.employees.length);

    const read = await app.inject({ method: 'GET', url: `/employees/${id}` });
    expect(read.statusCode).toBe(200);
    expect(read.json<{ employee: { email: string } }>().employee.email).toBe(JOINER.email);
  });

  it('refuses a code or an email somebody already has', async () => {
    const existing = FIXTURE.employees[0];
    if (existing === undefined) throw new Error('the fixture has no employees');

    const sameCode = await post({ ...JOINER, employeeCode: existing.employeeCode });
    expect(sameCode.statusCode).toBe(409);

    const sameEmail = await post({ ...JOINER, email: existing.email });
    expect(sameEmail.statusCode).toBe(409);
  });

  it('refuses a department, level or manager that does not exist', async () => {
    expect((await post({ ...JOINER, departmentId: 999 })).statusCode).toBe(400);
    expect((await post({ ...JOINER, jobLevelId: 999 })).statusCode).toBe(400);
    expect((await post({ ...JOINER, managerId: 999 })).statusCode).toBe(400);
  });

  it('refuses a body the schema does not describe', async () => {
    const { employeeCode: _dropped, ...withoutCode } = JOINER;
    expect((await post(withoutCode)).statusCode).toBe(400);
    expect((await post({ ...JOINER, gender: 'yes' })).statusCode).toBe(400);
    expect((await post({ ...JOINER, hireDate: 'last tuesday' })).statusCode).toBe(400);
    expect((await post({ ...JOINER, salary: 100 })).statusCode).toBe(400);
  });

  it('edits the fields it is given and leaves the rest alone', async () => {
    const before = await prisma.employee.findUniqueOrThrow({ where: { id: 2 } });

    const edited = await patch(2, { lastName: 'Renamed', jobLevelId: 5 });
    expect(edited.statusCode).toBe(200);

    const after = await prisma.employee.findUniqueOrThrow({ where: { id: 2 } });
    expect(after.lastName).toBe('Renamed');
    expect(after.jobLevelId).toBe(5);
    expect(after.email).toBe(before.email);
    expect(after.hireDate).toEqual(before.hireDate);
  });

  it('records a leaving date', async () => {
    const left = await patch(2, { terminationDate: '2026-09-30' });
    expect(left.statusCode).toBe(200);

    const read = await app.inject({ method: 'GET', url: '/employees/2' });
    expect(read.json<{ employee: { status: string } }>().employee.status).toBe('left');
  });

  it('refuses an edit that names nothing, an unknown field, or an unknown employee', async () => {
    expect((await patch(2, {})).statusCode).toBe(400);
    expect((await patch(2, { nickname: 'Bee' })).statusCode).toBe(400);
    expect((await patch(9_999, { lastName: 'Nobody' })).statusCode).toBe(404);
  });

  it('refuses an edit onto a code somebody else holds', async () => {
    const other = FIXTURE.employees[3];
    if (other === undefined) throw new Error('the fixture is too small');

    expect((await patch(2, { employeeCode: other.employeeCode })).statusCode).toBe(409);
  });
});
