import { GENDERS } from '@paybands/core';
import { z } from 'zod';
import type { PrismaClient } from '../../generated/prisma/client';
import type { App } from '../app';
import {
  EMPLOYEE_SORTS,
  EMPLOYEE_STATUSES,
  listEmployees,
  type EmployeeCursor,
} from '../repositories/employees';

/**
 * The cursor is this API's own JSON, base64url encoded. Opaque to the client on purpose:
 * it names a row position, and a client that builds its own would be writing SQL by proxy.
 */
const cursorPayload = z.strictObject({ value: z.string(), id: z.number().int().positive() });

function encodeCursor(cursor: EmployeeCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

const cursorSchema = z.string().transform((raw, ctx): EmployeeCursor => {
  const decoded = cursorPayload.safeParse(parseJson(Buffer.from(raw, 'base64url').toString()));
  if (!decoded.success) {
    ctx.addIssue({ code: 'custom', message: 'not a cursor this API issued' });
    return z.NEVER;
  }
  return decoded.data;
});

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

const querySchema = z.strictObject({
  country: z.string().length(2).optional(),
  department: z.coerce.number().int().positive().optional(),
  level: z.coerce.number().int().positive().optional(),
  status: z.enum(EMPLOYEE_STATUSES).default('active'),
  sort: z.enum(EMPLOYEE_SORTS).default('name'),
  direction: z.enum(['asc', 'desc']).default('asc'),
  // Capped, because the ticket's first line is that the response never contains the table.
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: cursorSchema.optional(),
});

const employeeSchema = z.strictObject({
  id: z.number(),
  employeeCode: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string(),
  gender: z.enum(GENDERS),
  countryCode: z.string(),
  departmentId: z.number(),
  jobLevelId: z.number(),
  hireDate: z.string(),
  terminationDate: z.string().nullable(),
  status: z.enum(['active', 'left']),
});

const listResponse = z.strictObject({
  employees: z.array(employeeSchema),
  nextCursor: z.string().nullable(),
});

export function registerEmployeeRoutes(app: App, prisma: PrismaClient): void {
  app.get(
    '/employees',
    { schema: { querystring: querySchema, response: { 200: listResponse } } },
    async (request) => {
      const query = request.query;
      const page = await listEmployees(prisma, {
        country: query.country,
        departmentId: query.department,
        jobLevelId: query.level,
        status: query.status,
        sort: query.sort,
        direction: query.direction,
        limit: query.limit,
        cursor: query.cursor ?? null,
      });

      return {
        employees: page.employees,
        nextCursor: page.nextCursor === null ? null : encodeCursor(page.nextCursor),
      };
    },
  );
}
