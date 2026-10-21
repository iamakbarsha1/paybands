import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '../../generated/prisma/client';
import type { App } from '../app';
import { hasTestDatabase, resetAndSeed, testApp, testPrisma } from '../testing/db';

const EMPLOYEE = 3;

/**
 * Access and erasure, the two rights `docs/security.md` named and did not have.
 *
 * The erasure test asserts what is gone *and* what is not: a delete that took the subject's
 * manager chain with it would pass a test that only counted their own rows.
 */
describe.skipIf(!hasTestDatabase())("the subject's rights", () => {
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

  it('exports exactly the payload the detail screen reads', async () => {
    const [detail, exported] = await Promise.all([
      app.inject({ method: 'GET', url: `/employees/${EMPLOYEE}` }),
      app.inject({ method: 'GET', url: `/employees/${EMPLOYEE}/export` }),
    ]);

    expect(exported.statusCode).toBe(200);
    expect(exported.json()).toEqual(detail.json());
  });

  it('sends the export as a file named for the employee', async () => {
    const exported = await app.inject({ method: 'GET', url: `/employees/${EMPLOYEE}/export` });
    const { employee } = exported.json<{ employee: { employeeCode: string } }>();

    expect(exported.headers['content-disposition']).toBe(
      `attachment; filename="employee-${employee.employeeCode}.json"`,
    );
  });

  it('has nothing to export for an employee who is not there', async () => {
    expect((await app.inject({ method: 'GET', url: '/employees/9999/export' })).statusCode).toBe(
      404,
    );
  });

  it('erases the person, their salary history and their audit trail together', async () => {
    const record = await prisma.salaryRecord.findFirst({
      where: { employeeId: EMPLOYEE, effectiveTo: null },
    });
    if (record === null) throw new Error('the fixture employee has no open record');

    // One audited write first, so there is an audit row with something to say.
    const raised = await app.inject({
      method: 'POST',
      url: `/employees/${EMPLOYEE}/salary`,
      payload: {
        amountMinor: '9999000',
        currencyCode: record.currencyCode,
        effectiveFrom: '2026-09-15',
        reason: 'merit',
      },
    });
    expect(raised.statusCode).toBe(201);
    expect(await prisma.salaryAudit.count({ where: { employeeId: EMPLOYEE } })).toBe(1);

    const erased = await app.inject({ method: 'DELETE', url: `/employees/${EMPLOYEE}` });
    expect(erased.statusCode).toBe(204);

    expect(await prisma.employee.count({ where: { id: EMPLOYEE } })).toBe(0);
    expect(await prisma.salaryRecord.count({ where: { employeeId: EMPLOYEE } })).toBe(0);
    expect(await prisma.salaryAudit.count({ where: { employeeId: EMPLOYEE } })).toBe(0);
    expect((await app.inject({ method: 'GET', url: `/employees/${EMPLOYEE}` })).statusCode).toBe(
      404,
    );
  });

  it('detaches the people who reported to them rather than erasing them too', async () => {
    const manager = await prisma.employee.findFirst({
      where: { reports: { some: {} } },
      include: { reports: { select: { id: true } } },
    });
    if (manager === null) throw new Error('the fixture has nobody with reports');
    const reportIds = manager.reports.map((report) => report.id);

    const erased = await app.inject({ method: 'DELETE', url: `/employees/${manager.id}` });
    expect(erased.statusCode).toBe(204);

    const survivors = await prisma.employee.findMany({ where: { id: { in: reportIds } } });
    expect(survivors).toHaveLength(reportIds.length);
    expect(survivors.every((report) => report.managerId === null)).toBe(true);
  });

  it('has nobody to erase twice', async () => {
    expect((await app.inject({ method: 'DELETE', url: '/employees/9999' })).statusCode).toBe(404);
  });
});
