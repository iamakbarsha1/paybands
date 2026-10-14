'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { Button } from '../../../components/ui/button';
import type { EmployeePage, ReferenceData } from '../../../lib/api-types';
import { useApi } from '../../../lib/use-api';

const STATUSES = ['active', 'left', 'all'] as const;
const SORTS = [
  { value: 'name', label: 'Surname' },
  { value: 'hireDate', label: 'Hire date' },
  { value: 'id', label: 'Employee number' },
] as const;

export default function EmployeesPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
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
      <div>
        <h1 className="text-2xl font-semibold">Employees</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Twenty-five at a time, filtered and sorted by the server.
        </p>
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

      {page.state === 'loading' && (
        <p className="text-sm text-muted-foreground">Loading employees…</p>
      )}

      {page.state === 'error' && (
        <p role="alert" className="text-sm text-destructive">
          {page.message}
        </p>
      )}

      {page.state === 'ready' && page.data.employees.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No employee matches these filters. Widen one of them.
        </p>
      )}

      {page.state === 'ready' && page.data.employees.length > 0 && (
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
            <tbody>
              {page.data.employees.map((employee) => (
                <tr key={employee.id} className="border-b border-border/60">
                  <td className="py-2">{employee.employeeCode}</td>
                  <td className="py-2">
                    {employee.firstName} {employee.lastName}
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
            <Button variant="outline" size="sm" onClick={() => router.back()}>
              Back
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page.data.nextCursor === null}
              onClick={() => {
                if (page.data.nextCursor !== null) toPage(page.data.nextCursor);
              }}
            >
              Next
            </Button>
            <span className="text-sm text-muted-foreground">
              {page.data.employees.length} shown
              {page.data.nextCursor === null ? ', last page' : ''}
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
