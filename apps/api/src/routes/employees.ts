import {
  compRatio,
  GENDERS,
  money,
  rangePenetration,
  SALARY_REASONS,
  type Money,
} from '@paybands/core';
import { z } from 'zod';
import type { PrismaClient } from '../../generated/prisma/client';
import type { App } from '../app';
import {
  EMPLOYEE_SORTS,
  EMPLOYEE_STATUSES,
  findEmployeeDetail,
  listEmployees,
  type EmployeeCursor,
  type MoneyRow,
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

const idParam = z.strictObject({ id: z.coerce.number().int().positive() });

/** Minor units as a string: JSON has no integer wide enough to be trusted with money. */
const moneySchema = z.strictObject({ amountMinor: z.string(), currencyCode: z.string() });

const detailResponse = z.strictObject({
  employee: employeeSchema.extend({
    managerId: z.number().nullable(),
    departmentName: z.string(),
    jobLevelName: z.string(),
  }),
  salaryHistory: z.array(
    moneySchema.extend({
      id: z.number(),
      effectiveFrom: z.string(),
      effectiveTo: z.string().nullable(),
      reason: z.enum(SALARY_REASONS),
    }),
  ),
  currentSalary: moneySchema.nullable(),
  band: z.strictObject({ min: moneySchema, mid: moneySchema, max: moneySchema }).nullable(),
  compRatio: z.number().nullable(),
  rangePenetration: z.number().nullable(),
});

const notFound = z.strictObject({ message: z.string() });

function onWire(row: MoneyRow): { amountMinor: string; currencyCode: string } {
  return { amountMinor: row.amountMinor.toString(), currencyCode: row.currencyCode };
}

function asMoney(row: MoneyRow): Money {
  return money(row.amountMinor, row.currencyCode);
}

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

  app.get(
    '/employees/:id',
    { schema: { params: idParam, response: { 200: detailResponse, 404: notFound } } },
    async (request, reply) => {
      const detail = await findEmployeeDetail(prisma, request.params.id);
      if (detail === null) {
        return reply.code(404).send({ message: `No employee with id ${request.params.id}` });
      }

      const salary = detail.currentSalary === null ? null : asMoney(detail.currentSalary);
      // `undefined` rather than null, because that is what core reads as "no band" (decision 38).
      const band =
        detail.band === null
          ? undefined
          : {
              min: asMoney(detail.band.min),
              mid: asMoney(detail.band.mid),
              max: asMoney(detail.band.max),
            };

      return reply.send({
        employee: detail.employee,
        salaryHistory: detail.salaryHistory.map((record) => ({ ...record, ...onWire(record) })),
        currentSalary: detail.currentSalary === null ? null : onWire(detail.currentSalary),
        band:
          detail.band === null
            ? null
            : {
                min: onWire(detail.band.min),
                mid: onWire(detail.band.mid),
                max: onWire(detail.band.max),
              },
        compRatio: salary === null ? null : compRatio(salary, band),
        rangePenetration: salary === null ? null : rangePenetration(salary, band),
      });
    },
  );
}
