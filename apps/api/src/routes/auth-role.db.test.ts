import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '../../generated/prisma/client';
import type { App } from '../app';
import { hasTestDatabase, resetAndSeed, testApp, testPrisma } from '../testing/db';

/**
 * An `analyst` reads everything an `admin` reads and writes nothing.
 *
 * The reads are asserted as well as the writes, because a role that refuses too much is the
 * same bug wearing the opposite sign: a reporting account locked out of the reports.
 */
describe.skipIf(!hasTestDatabase())('what an analyst may do', () => {
  let prisma: PrismaClient;
  let analyst: App;
  let admin: App;

  beforeAll(() => {
    prisma = testPrisma();
    analyst = testApp(prisma, { as: 'analyst' });
    admin = testApp(prisma, { as: 'admin' });
  });

  beforeEach(async () => {
    await resetAndSeed(prisma);
  });

  afterAll(async () => {
    await analyst.close();
    await admin.close();
    await prisma.$disconnect();
  });

  const READS = [
    '/employees',
    '/employees/3',
    '/employees/3/export',
    '/reference',
    '/analytics/bands',
    '/analytics/distribution?groupBy=country',
    '/analytics/comp-ratio?groupBy=country',
    '/analytics/pay-gap?groupBy=country',
    '/analytics/outliers',
  ];

  it.each(READS)('serves %s', async (url) => {
    const response = await analyst.inject({ method: 'GET', url });
    expect(response.statusCode).toBe(200);
  });

  const WRITES = [
    { method: 'POST' as const, url: '/employees', payload: {} },
    { method: 'PATCH' as const, url: '/employees/3', payload: { firstName: 'Nope' } },
    { method: 'POST' as const, url: '/employees/3/salary', payload: {} },
    { method: 'DELETE' as const, url: '/employees/3' },
  ];

  // 403 rather than 400: the refusal has to land before the body is validated, or an analyst
  // learns the shape of a write by being told which field was wrong.
  it.each(WRITES)('refuses $method $url with 403', async (write) => {
    const response = await analyst.inject(write);
    expect(response.statusCode).toBe(403);
  });

  it('changes nothing when it refuses a delete', async () => {
    expect((await analyst.inject({ method: 'DELETE', url: '/employees/3' })).statusCode).toBe(403);
    expect(await prisma.employee.count({ where: { id: 3 } })).toBe(1);
  });

  it('lets the same writes through for an admin', async () => {
    const patched = await admin.inject({
      method: 'PATCH',
      url: '/employees/3',
      payload: { firstName: 'Yes' },
    });
    expect(patched.statusCode).toBe(200);
  });

  // `/ask` is a POST because the question is a body, not because it writes anything.
  it('may still ask a question', async () => {
    const asked = await analyst.inject({
      method: 'POST',
      url: '/ask',
      payload: { question: 'hi' },
    });
    // 503: this app is built without a key. The point is that it is not 403.
    expect(asked.statusCode).toBe(503);
  });

  it('reports its own role, so the browser can stop offering a refused write', async () => {
    const me = await analyst.inject({ method: 'GET', url: '/auth/me' });
    expect(me.json<{ user: { role: string } }>().user.role).toBe('analyst');
  });
});
