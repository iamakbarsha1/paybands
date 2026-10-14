import type { Gender } from '@paybands/core';
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
