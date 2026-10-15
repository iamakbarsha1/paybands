'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { Button, button } from '../../../components/ui/button';
import { Empty, Failure, Loading, Skeleton } from '../../../components/ui/state';
import type { EmployeePage, ReferenceData } from '../../../lib/api-types';
import { useApi } from '../../../lib/use-api';

/** What the API pages at (PB-037), which is how tall an unknown page is assumed to be. */
const PAGE_SIZE = 25;
const STATUSES = ['active', 'left', 'all'] as const;
const SORTS = [
  { value: 'name', label: 'Surname' },
  { value: 'hireDate', label: 'Hire date' },
  { value: 'id', label: 'Employee number' },
] as const;

export default function EmployeesPage() {
  return (
    <Suspense
      fallback={
        <Loading label="Employees" className="space-y-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-96 w-full" />
        </Loading>
      }
    >
      <EmployeeList />
    </Suspense>
  );
}

function EmployeeList() {
  const router = useRouter();
  const params = useSearchParams();

  // The query string is the state. A reload, a bookmark and the back button all land on
  // the same page of the same filter, and the server does the paging (PB-037).
  const query = new URLSearchParams(params.toString());
  const page = useApi<EmployeePage>(`/employees?${query.toString()}`);
  const reference = useApi<ReferenceData>('/reference');

  // How many placeholder rows to draw while the next page loads: as many as the last page
  // held, so paging through a filter that returns four rows does not flash twenty-five.
  const [rows, setRows] = useState(PAGE_SIZE);
  useEffect(() => {
    if (page.state === 'ready' && page.data.employees.length > 0) {
      setRows(page.data.employees.length);
    }
  }, [page]);

  function set(key: string, value: string): void {
    const next = new URLSearchParams(params.toString());
    if (value === '') next.delete(key);
    else next.set(key, value);
    // Any change of filter invalidates the cursor: it points into the old ordering.
    next.delete('cursor');
    router.push(`/employees?${next.toString()}`);
  }

  function toPage(cursor: string): void {
    const next = new URLSearchParams(params.toString());
    next.set('cursor', cursor);
    router.push(`/employees?${next.toString()}`);
  }

  const names = {
    department: new Map(
      reference.state === 'ready'
        ? reference.data.departments.map((row) => [row.id, row.name])
        : [],
    ),
    level: new Map(
      reference.state === 'ready' ? reference.data.jobLevels.map((row) => [row.id, row.name]) : [],
    ),
  };

  return (
    <section className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Employees</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Twenty-five at a time, filtered and sorted by the server.
          </p>
        </div>
        <Link href="/employees/new" className={button({ size: 'sm' })}>
          Add an employee
        </Link>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <Select
          label="Country"
          value={params.get('country') ?? ''}
          onChange={(value) => set('country', value)}
          options={
            reference.state === 'ready'
              ? reference.data.countries.map((row) => ({ value: row.code, label: row.name }))
              : []
          }
        />
        <Select
          label="Department"
          value={params.get('department') ?? ''}
          onChange={(value) => set('department', value)}
          options={
            reference.state === 'ready'
              ? reference.data.departments.map((row) => ({
                  value: String(row.id),
                  label: row.name,
                }))
              : []
          }
        />
        <Select
          label="Level"
          value={params.get('level') ?? ''}
          onChange={(value) => set('level', value)}
          options={
            reference.state === 'ready'
              ? reference.data.jobLevels.map((row) => ({ value: String(row.id), label: row.name }))
              : []
          }
        />
        <Select
          label="Status"
          value={params.get('status') ?? 'active'}
          onChange={(value) => set('status', value)}
          options={STATUSES.map((status) => ({ value: status, label: status }))}
          includeAny={false}
        />
        <Select
          label="Sort by"
          value={params.get('sort') ?? 'name'}
          onChange={(value) => set('sort', value)}
          options={SORTS.map((sort) => ({ value: sort.value, label: sort.label }))}
          includeAny={false}
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => set('direction', params.get('direction') === 'desc' ? 'asc' : 'desc')}
        >
          {params.get('direction') === 'desc' ? 'Descending' : 'Ascending'}
        </Button>
      </div>

      {page.state === 'error' && <Failure>{page.message}</Failure>}

      {page.state === 'ready' && page.data.employees.length === 0 && (
        <Empty>No employee matches these filters. Widen one of them.</Empty>
      )}

      {/* The table is drawn while the answer is coming and once it has rows, and not for a
          filter that matched nothing: a header over an empty body reads as a broken page. */}
      {(page.state === 'loading' || (page.state === 'ready' && page.data.employees.length > 0)) && (
        <>
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-muted-foreground">
              <tr>
                <th className="py-2 font-medium">Number</th>
                <th className="py-2 font-medium">Name</th>
                <th className="py-2 font-medium">Country</th>
                <th className="py-2 font-medium">Department</th>
                <th className="py-2 font-medium">Level</th>
                <th className="py-2 font-medium">Hired</th>
                <th className="py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody role="status" aria-busy={page.state === 'loading'} aria-label="Employees">
              {page.state === 'loading' &&
                Array.from({ length: rows }, (_, index) => (
                  <tr key={index} className="border-b border-border/60">
                    {Array.from({ length: 7 }, (_, cell) => (
                      <td key={cell} className="py-2">
                        {/* `h-5` is `text-sm`'s line box: a shorter bar makes the row — and
                            every row under it — move when the text arrives. */}
                        <Skeleton className="h-5 w-full max-w-28" />
                      </td>
                    ))}
                  </tr>
                ))}
              {page.state === 'ready' &&
                page.data.employees.map((employee) => (
                  <tr key={employee.id} className="border-b border-border/60">
                    <td className="py-2">{employee.employeeCode}</td>
                    <td className="py-2">
                      <Link href={`/employees/${String(employee.id)}`} className="underline">
                        {employee.firstName} {employee.lastName}
                      </Link>
                    </td>
                    <td className="py-2">{employee.countryCode}</td>
                    <td className="py-2">
                      {names.department.get(employee.departmentId) ?? employee.departmentId}
                    </td>
                    <td className="py-2">
                      {names.level.get(employee.jobLevelId) ?? employee.jobLevelId}
                    </td>
                    <td className="py-2">{employee.hireDate}</td>
                    <td className="py-2 text-muted-foreground">{employee.status}</td>
                  </tr>
                ))}
            </tbody>
          </table>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page.state === 'loading'}
              onClick={() => router.back()}
            >
              Back
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page.state === 'loading' || page.data.nextCursor === null}
              onClick={() => {
                if (page.state === 'ready' && page.data.nextCursor !== null)
                  toPage(page.data.nextCursor);
              }}
            >
              Next
            </Button>
            <span className="text-sm text-muted-foreground">
              {page.state === 'loading'
                ? 'Counting…'
                : `${String(page.data.employees.length)} shown${page.data.nextCursor === null ? ', last page' : ''}`}
            </span>
          </div>
        </>
      )}
    </section>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
  includeAny = true,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly { value: string; label: string }[];
  includeAny?: boolean;
}) {
  const id = `filter-${label.toLowerCase().replace(/\s+/gu, '-')}`;

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-xs font-medium text-muted-foreground">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 rounded-[var(--radius)] border border-border bg-background px-2 text-sm"
      >
        {includeAny && <option value="">Any</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
