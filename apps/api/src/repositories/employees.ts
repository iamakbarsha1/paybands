import { isCurrencyCode, type CurrencyCode, type Gender, type SalaryReason } from '@paybands/core';
import type { Prisma, PrismaClient } from '../../generated/prisma/client';

/** Sorting is a closed set, because every column named here has to stay keyset-safe. */
export const EMPLOYEE_SORTS = ['name', 'hireDate', 'id'] as const;
export type EmployeeSort = (typeof EMPLOYEE_SORTS)[number];

export const EMPLOYEE_STATUSES = ['active', 'left', 'all'] as const;
export type EmployeeStatusFilter = (typeof EMPLOYEE_STATUSES)[number];

export type SortDirection = 'asc' | 'desc';

/** The last row of the previous page: the sort value, then the id that breaks its ties. */
export interface EmployeeCursor {
  readonly value: string;
  readonly id: number;
}

export interface ListEmployeesQuery {
  readonly country?: string | undefined;
  readonly departmentId?: number | undefined;
  readonly jobLevelId?: number | undefined;
  readonly status: EmployeeStatusFilter;
  readonly sort: EmployeeSort;
  readonly direction: SortDirection;
  readonly limit: number;
  readonly cursor: EmployeeCursor | null;
}

export interface EmployeeListRow {
  readonly id: number;
  readonly employeeCode: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  readonly gender: Gender;
  readonly countryCode: string;
  readonly departmentId: number;
  readonly jobLevelId: number;
  readonly hireDate: string;
  readonly terminationDate: string | null;
  readonly status: 'active' | 'left';
}

export interface EmployeePage {
  readonly employees: EmployeeListRow[];
  readonly nextCursor: EmployeeCursor | null;
}

const SORT_COLUMN: Record<EmployeeSort, 'lastName' | 'hireDate' | 'id'> = {
  name: 'lastName',
  hireDate: 'hireDate',
  id: 'id',
};

/**
 * Keyset rather than offset: the page after the one you read, not the page at a row number
 * that shifts when someone is hired. One row past the limit is fetched to learn whether a
 * next page exists without counting the table.
 */
export async function listEmployees(
  prisma: PrismaClient,
  query: ListEmployeesQuery,
): Promise<EmployeePage> {
  const where: Prisma.EmployeeWhereInput = {
    ...(query.country === undefined ? {} : { countryCode: query.country }),
    ...(query.departmentId === undefined ? {} : { departmentId: query.departmentId }),
    ...(query.jobLevelId === undefined ? {} : { jobLevelId: query.jobLevelId }),
    ...statusFilter(query.status),
    ...afterCursor(query),
  };

  const column = SORT_COLUMN[query.sort];
  const rows = await prisma.employee.findMany({
    where,
    orderBy:
      column === 'id'
        ? [{ id: query.direction }]
        : [{ [column]: query.direction }, { id: query.direction }],
    take: query.limit + 1,
  });

  const page = rows.slice(0, query.limit);
  const last = page.at(-1);
  const hasMore = rows.length > query.limit;

  return {
    employees: page.map(toListRow),
    nextCursor:
      hasMore && last !== undefined ? { value: sortValue(last, query.sort), id: last.id } : null,
  };
}

function statusFilter(status: EmployeeStatusFilter): Prisma.EmployeeWhereInput {
  if (status === 'all') return {};
  return { terminationDate: status === 'active' ? null : { not: null } };
}

/**
 * `(sort value, id) > (cursor value, cursor id)` written as the two cases Prisma can express.
 * The id half is what makes the comparison total: two people can share a surname or a hire date.
 */
function afterCursor({ cursor, sort, direction }: ListEmployeesQuery): Prisma.EmployeeWhereInput {
  if (cursor === null) return {};

  const after = direction === 'asc' ? 'gt' : 'lt';
  if (sort === 'id') return { id: { [after]: cursor.id } };

  const column = SORT_COLUMN[sort];
  const value: string | Date = sort === 'hireDate' ? new Date(cursor.value) : cursor.value;

  return {
    OR: [{ [column]: { [after]: value } }, { [column]: value, id: { [after]: cursor.id } }],
  };
}

function sortValue(
  row: { lastName: string; hireDate: Date; id: number },
  sort: EmployeeSort,
): string {
  if (sort === 'name') return row.lastName;
  if (sort === 'hireDate') return day(row.hireDate);
  return String(row.id);
}

function toListRow(row: {
  id: number;
  employeeCode: string;
  firstName: string;
  lastName: string;
  email: string;
  gender: Gender;
  countryCode: string;
  departmentId: number;
  jobLevelId: number;
  hireDate: Date;
  terminationDate: Date | null;
}): EmployeeListRow {
  return {
    id: row.id,
    employeeCode: row.employeeCode,
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
    gender: row.gender,
    countryCode: row.countryCode,
    departmentId: row.departmentId,
    jobLevelId: row.jobLevelId,
    hireDate: day(row.hireDate),
    terminationDate: row.terminationDate === null ? null : day(row.terminationDate),
    status: row.terminationDate === null ? 'active' : 'left',
  };
}

/** The column is a `date`, so the time half is noise the wire does not need. */
function day(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export interface MoneyRow {
  readonly amountMinor: bigint;
  readonly currencyCode: CurrencyCode;
}

/**
 * `currency_code` is a foreign key to the six rows the seed writes, so a seventh is a
 * migration nobody told the arithmetic about — and `minorUnitsFor` has no scale for it.
 * Converted where the row is read, so everything above holds a `CurrencyCode` rather than a
 * string that happens to be one (`PB-D07`).
 */
export function asCurrency(value: string): CurrencyCode {
  if (!isCurrencyCode(value)) throw new RangeError(`a money column holds currency ${value}`);
  return value;
}

export interface SalaryRecordDetail extends MoneyRow {
  readonly id: number;
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
  readonly reason: SalaryReason;
}

export interface EmployeeDetail {
  readonly employee: EmployeeListRow & {
    readonly managerId: number | null;
    readonly departmentName: string;
    readonly jobLevelName: string;
  };
  readonly salaryHistory: SalaryRecordDetail[];
  readonly currentSalary: MoneyRow | null;
  readonly band: { readonly min: MoneyRow; readonly mid: MoneyRow; readonly max: MoneyRow } | null;
}

/**
 * The person, their pay in order, and the band they are measured against. Null is "no such
 * employee"; a null band is an employee the band table does not cover, which the report still
 * has to show (decision 38).
 */
export async function findEmployeeDetail(
  prisma: PrismaClient,
  id: number,
): Promise<EmployeeDetail | null> {
  const row = await prisma.employee.findUnique({
    where: { id },
    include: {
      department: true,
      jobLevel: true,
      salaryRecords: { orderBy: [{ effectiveFrom: 'asc' }, { id: 'asc' }] },
    },
  });
  if (row === null) return null;

  const band = await prisma.payBand.findFirst({
    where: { jobLevelId: row.jobLevelId, countryCode: row.countryCode, effectiveTo: null },
    orderBy: { effectiveFrom: 'desc' },
  });

  const salaryHistory = row.salaryRecords.map((record) => ({
    id: record.id,
    amountMinor: record.amountMinor,
    currencyCode: asCurrency(record.currencyCode),
    effectiveFrom: day(record.effectiveFrom),
    effectiveTo: record.effectiveTo === null ? null : day(record.effectiveTo),
    reason: record.reason,
  }));
  const open = row.salaryRecords.find((record) => record.effectiveTo === null);

  return {
    employee: {
      ...toListRow(row),
      managerId: row.managerId,
      departmentName: row.department.name,
      jobLevelName: row.jobLevel.name,
    },
    salaryHistory,
    currentSalary:
      open === undefined
        ? null
        : { amountMinor: open.amountMinor, currencyCode: asCurrency(open.currencyCode) },
    band:
      band === null
        ? null
        : {
            min: { amountMinor: band.minMinor, currencyCode: asCurrency(band.currencyCode) },
            mid: { amountMinor: band.midMinor, currencyCode: asCurrency(band.currencyCode) },
            max: { amountMinor: band.maxMinor, currencyCode: asCurrency(band.currencyCode) },
          },
  };
}

export interface EmployeeInput {
  readonly employeeCode: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  readonly gender: Gender;
  readonly hireDate: string;
  readonly terminationDate?: string | null | undefined;
  readonly countryCode: string;
  readonly departmentId: number;
  readonly jobLevelId: number;
  readonly managerId?: number | null | undefined;
}

/** `Partial` alone drops the explicit `undefined` that `exactOptionalPropertyTypes` wants. */
export type EmployeePatch = { readonly [K in keyof EmployeeInput]?: EmployeeInput[K] | undefined };

/**
 * A write either lands or hits one of three states the client can act on: a value somebody
 * else holds, a reference to a row that is not there, or an employee that is not there.
 * Returned rather than thrown, so the Prisma error codes stay inside this file.
 */
export interface WriteFailure {
  readonly ok: false;
  readonly reason: 'duplicate' | 'unknown-reference' | 'not-found';
  readonly detail: string;
}

export type EmployeeWriteResult =
  { readonly ok: true; readonly employee: EmployeeListRow } | WriteFailure;

export async function createEmployee(
  prisma: PrismaClient,
  input: EmployeeInput,
): Promise<EmployeeWriteResult> {
  try {
    // The route's schema is what guarantees every required column is present; the shared
    // column builder, which also serves patches, cannot express that.
    const data = toColumns(input) as Prisma.EmployeeUncheckedCreateInput;
    const row = await prisma.employee.create({ data });
    return { ok: true, employee: toListRow(row) };
  } catch (error) {
    return failure(error);
  }
}

export async function updateEmployee(
  prisma: PrismaClient,
  id: number,
  patch: EmployeePatch,
): Promise<EmployeeWriteResult> {
  try {
    const row = await prisma.employee.update({ where: { id }, data: toColumns(patch) });
    return { ok: true, employee: toListRow(row) };
  } catch (error) {
    return failure(error);
  }
}

/** Only the keys that were sent: a patch that omits a field must not null it. */
function toColumns(input: EmployeePatch): Prisma.EmployeeUncheckedUpdateInput {
  return {
    ...(input.employeeCode === undefined ? {} : { employeeCode: input.employeeCode }),
    ...(input.firstName === undefined ? {} : { firstName: input.firstName }),
    ...(input.lastName === undefined ? {} : { lastName: input.lastName }),
    ...(input.email === undefined ? {} : { email: input.email }),
    ...(input.gender === undefined ? {} : { gender: input.gender }),
    ...(input.hireDate === undefined ? {} : { hireDate: midnight(input.hireDate) }),
    ...(input.terminationDate === undefined
      ? {}
      : {
          terminationDate: input.terminationDate === null ? null : midnight(input.terminationDate),
        }),
    ...(input.countryCode === undefined ? {} : { countryCode: input.countryCode }),
    ...(input.departmentId === undefined ? {} : { departmentId: input.departmentId }),
    ...(input.jobLevelId === undefined ? {} : { jobLevelId: input.jobLevelId }),
    ...(input.managerId === undefined ? {} : { managerId: input.managerId }),
  };
}

/** The column is a `date`; a local-time parse would shift it a day for half the world. */
function midnight(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

function failure(error: unknown): WriteFailure {
  const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : null;

  if (code === 'P2002') {
    return { ok: false, reason: 'duplicate', detail: `${fieldsIn(error)} already taken` };
  }
  if (code === 'P2003') {
    return {
      ok: false,
      reason: 'unknown-reference',
      detail: `${fieldsIn(error)} names a row that does not exist`,
    };
  }
  if (code === 'P2025') {
    return { ok: false, reason: 'not-found', detail: 'no such employee' };
  }
  throw error;
}

/** Prisma names the constraint's columns in `meta`; the message is for the client, so it matters. */
function fieldsIn(error: unknown): string {
  const meta =
    typeof error === 'object' && error !== null && 'meta' in error
      ? (error.meta as { target?: unknown; field_name?: unknown } | null)
      : null;
  const target = meta?.target ?? meta?.field_name;

  if (Array.isArray(target)) return target.join(', ');
  if (typeof target === 'string') return target;
  return 'a field';
}

export interface SalaryChangeInput {
  readonly amountMinor: bigint;
  readonly currencyCode: CurrencyCode;
  readonly effectiveFrom: string;
  readonly reason: SalaryReason;
}

export type SalaryChangeResult =
  | { readonly ok: true; readonly record: SalaryRecordDetail }
  | {
      readonly ok: false;
      readonly reason:
        'duplicate' | 'unknown-reference' | 'not-found' | 'out-of-order' | 'currency-mismatch';
      readonly detail: string;
    };

/**
 * Closing the open record and opening the next one is one transaction, because a history with
 * two open records — or none — is worse than a failed raise. The partial unique index is the
 * backstop underneath it (decision 18): two of these landing together, the loser hits P2002.
 *
 * The audit row is written inside that same transaction rather than after it, so there is no
 * window in which a salary exists and the record of who set it does not. That is the whole
 * claim this table makes, and committing it separately would be the one way to break it.
 */
export async function recordSalaryChange(
  prisma: PrismaClient,
  employeeId: number,
  input: SalaryChangeInput,
  actorUserId: number,
): Promise<SalaryChangeResult> {
  const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (employee === null) return { ok: false, reason: 'not-found', detail: 'no such employee' };

  const open = await prisma.salaryRecord.findFirst({ where: { employeeId, effectiveTo: null } });
  const effectiveFrom = midnight(input.effectiveFrom);

  if (open !== null) {
    if (effectiveFrom <= open.effectiveFrom) {
      return {
        ok: false,
        reason: 'out-of-order',
        detail: `the open record starts ${day(open.effectiveFrom)}; a new one has to start after it`,
      };
    }
    if (open.currencyCode !== input.currencyCode) {
      return {
        ok: false,
        reason: 'currency-mismatch',
        detail: `this timeline is in ${open.currencyCode}, not ${input.currencyCode}`,
      };
    }
  }

  try {
    // Interactive rather than an array of writes, because the audit row names the salary row
    // this change created and that id does not exist until the create has run.
    const created = await prisma.$transaction(async (tx) => {
      if (open !== null) {
        await tx.salaryRecord.update({
          where: { id: open.id },
          data: { effectiveTo: effectiveFrom },
        });
      }

      const record = await tx.salaryRecord.create({
        data: {
          employeeId,
          amountMinor: input.amountMinor,
          currencyCode: input.currencyCode,
          effectiveFrom,
          effectiveTo: null,
          reason: input.reason,
        },
      });

      await tx.salaryAudit.create({
        data: {
          actorUserId,
          employeeId,
          salaryRecordId: record.id,
          amountMinor: record.amountMinor,
          currencyCode: record.currencyCode,
          effectiveFrom: record.effectiveFrom,
          reason: record.reason,
          // The record this one closed, which is what "what did it change from" means here.
          previousAmountMinor: open?.amountMinor ?? null,
          previousCurrencyCode: open?.currencyCode ?? null,
        },
      });

      return record;
    });

    return {
      ok: true,
      record: {
        id: created.id,
        amountMinor: created.amountMinor,
        currencyCode: asCurrency(created.currencyCode),
        effectiveFrom: day(created.effectiveFrom),
        effectiveTo: created.effectiveTo === null ? null : day(created.effectiveTo),
        reason: created.reason,
      },
    };
  } catch (error) {
    const failed = failure(error);
    // Only one unique constraint can fire here, and naming it beats echoing a column list.
    return failed.reason === 'duplicate'
      ? {
          ok: false,
          reason: 'duplicate',
          detail: 'another raise opened a record for this employee first',
        }
      : failed;
  }
}

/**
 * Erasure: the person and everything written about them, in one transaction.
 *
 * Three tables, in the order the foreign keys allow — audit rows and salary rows both point
 * at the employee, so both go before the employee does. One transaction because a half-erased
 * subject is the failure this answers a request to avoid: salary history with no person
 * attached is still their salary history.
 *
 * The audit rows go too. They exist to say who changed a salary, and keeping them after the
 * subject has asked to be removed would keep the thing being audited — their pay — on file
 * under a different table name (`docs/security.md`).
 */
export async function eraseEmployee(prisma: PrismaClient, id: number): Promise<boolean> {
  const employee = await prisma.employee.findUnique({ where: { id }, select: { id: true } });
  if (employee === null) return false;

  // A manager's reports would orphan a foreign key, so they are detached rather than deleted:
  // erasing one person is not a reason to erase the people who reported to them.
  await prisma.$transaction(async (tx) => {
    await tx.employee.updateMany({ where: { managerId: id }, data: { managerId: null } });
    await tx.salaryAudit.deleteMany({ where: { employeeId: id } });
    await tx.salaryRecord.deleteMany({ where: { employeeId: id } });
    await tx.employee.delete({ where: { id } });
  });

  return true;
}
