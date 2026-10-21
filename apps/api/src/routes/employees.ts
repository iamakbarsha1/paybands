import {
  compRatio,
  employeeDetail as detailResponse,
  employeeInput,
  employeeListItem as employeeSchema,
  employeePage as listResponse,
  employeePatch,
  money,
  rangePenetration,
  salaryChangeInput,
  salaryRecordWire as salaryRecordResponse,
  type Money,
  type MoneyWire,
} from '@paybands/core';
import { z } from 'zod';
import type { PrismaClient } from '../../generated/prisma/client';
import type { App } from '../app';
import { readSession } from '../auth/session';
import {
  createEmployee,
  EMPLOYEE_SORTS,
  EMPLOYEE_STATUSES,
  eraseEmployee,
  findEmployeeDetail,
  listEmployees,
  recordSalaryChange,
  updateEmployee,
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

const idParam = z.strictObject({ id: z.coerce.number().int().positive() });

/** Minor units as a string: JSON has no integer wide enough to be trusted with money. */
const notFound = z.strictObject({ message: z.string() });

/**
 * Loose, because a 400 can come from this code or from Fastify's own validation error, whose
 * body carries `statusCode` and `error` too. A strict schema here turns a 400 into a 500.
 */
const badRequest = z.looseObject({ message: z.string() });

/** Each state a write can fail in, with the status the client should read. */
const WRITE_FAILURE_STATUS = {
  duplicate: 409,
  'unknown-reference': 400,
  'not-found': 404,
  'out-of-order': 400,
  'currency-mismatch': 400,
} as const;

function onWire(row: MoneyRow): MoneyWire {
  return { amountMinor: row.amountMinor.toString(), currencyCode: row.currencyCode };
}

function asMoney(row: MoneyRow): Money {
  return money(row.amountMinor, row.currencyCode);
}

/**
 * The detail payload, built once because two routes answer with it: the screen reads it and
 * the subject-rights export saves it. Null is "no such employee".
 */
async function detailOnWire(
  prisma: PrismaClient,
  id: number,
): Promise<z.infer<typeof detailResponse> | null> {
  const detail = await findEmployeeDetail(prisma, id);
  if (detail === null) return null;

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

  return {
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
  };
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
      const detail = await detailOnWire(prisma, request.params.id);
      if (detail === null) {
        return reply.code(404).send({ message: `No employee with id ${request.params.id}` });
      }

      return reply.send(detail);
    },
  );

  /**
   * The subject's right of access: everything held about one person, as a file.
   *
   * Byte-for-byte the payload `GET /employees/:id` already answers with, because an export
   * that assembles its own shape is a second description of the same person that can disagree
   * with the first. The only difference is the header that makes a browser save it
   * (`docs/security.md`).
   */
  app.get(
    '/employees/:id/export',
    { schema: { params: idParam, response: { 200: detailResponse, 404: notFound } } },
    async (request, reply) => {
      const detail = await detailOnWire(prisma, request.params.id);
      if (detail === null) {
        return reply.code(404).send({ message: `No employee with id ${request.params.id}` });
      }

      return reply
        .header(
          'content-disposition',
          `attachment; filename="employee-${detail.employee.employeeCode}.json"`,
        )
        .send(detail);
    },
  );

  /**
   * The subject's right to erasure. Admin-only like every other write, and 204 rather than a
   * body: there is nothing left to describe.
   */
  app.delete(
    '/employees/:id',
    { schema: { params: idParam, response: { 204: z.null(), 404: notFound } } },
    async (request, reply) => {
      const erased = await eraseEmployee(prisma, request.params.id);
      return erased
        ? reply.code(204).send(null)
        : reply.code(404).send({ message: `No employee with id ${request.params.id}` });
    },
  );

  app.post(
    '/employees',
    {
      schema: {
        body: employeeInput,
        response: { 201: employeeSchema, 400: badRequest, 404: notFound, 409: notFound },
      },
    },
    async (request, reply) => {
      const written = await createEmployee(prisma, request.body);
      return written.ok
        ? reply.code(201).send(written.employee)
        : reply.code(WRITE_FAILURE_STATUS[written.reason]).send({ message: written.detail });
    },
  );

  app.patch(
    '/employees/:id',
    {
      schema: {
        params: idParam,
        body: employeePatch,
        response: { 200: employeeSchema, 400: badRequest, 404: notFound, 409: notFound },
      },
    },
    async (request, reply) => {
      const written = await updateEmployee(prisma, request.params.id, request.body);
      return written.ok
        ? reply.send(written.employee)
        : reply.code(WRITE_FAILURE_STATUS[written.reason]).send({ message: written.detail });
    },
  );

  app.post(
    '/employees/:id/salary',
    {
      schema: {
        params: idParam,
        body: salaryChangeInput,
        response: {
          201: salaryRecordResponse,
          400: badRequest,
          401: notFound,
          404: notFound,
          409: notFound,
        },
      },
    },
    async (request, reply) => {
      // The guard refuses this route without a session, so there is one. The audit row has a
      // non-null actor column precisely so this cannot be reached with nobody to name.
      const session = readSession(request);
      if (session === null) return reply.code(401).send({ message: 'Sign in first' });

      const written = await recordSalaryChange(
        prisma,
        request.params.id,
        {
          amountMinor: BigInt(request.body.amountMinor),
          currencyCode: request.body.currencyCode,
          effectiveFrom: request.body.effectiveFrom,
          reason: request.body.reason,
        },
        session.userId,
      );

      return written.ok
        ? reply.code(201).send({ ...written.record, ...onWire(written.record) })
        : reply.code(WRITE_FAILURE_STATUS[written.reason]).send({ message: written.detail });
    },
  );
}
