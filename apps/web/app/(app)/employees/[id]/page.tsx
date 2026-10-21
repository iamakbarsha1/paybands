'use client';

import Link from 'next/link';
import { use, useState } from 'react';
import { EmployeeForm, type EmployeeFormValues } from '../../../../components/employee-form';
import { SalaryChangeForm } from '../../../../components/salary-change-form';
import { Button } from '../../../../components/ui/button';
import { Empty, Failure, Loading, Skeleton } from '../../../../components/ui/state';
import { api } from '../../../../lib/api';
import type { EmployeeDetail, ReferenceData } from '../../../../lib/api-types';
import { formatMoney, formatRatio } from '../../../../lib/money';
import { useApi } from '../../../../lib/use-api';
import { useRole } from '../../../../lib/use-role';

export default function EmployeeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  // A write on this screen changes what this screen shows: a new open record and a closed
  // one. Bumping the key is what asks the API again.
  const [saved, setSaved] = useState(0);
  const [form, setForm] = useState<'none' | 'edit' | 'salary'>('none');
  const detail = useApi<EmployeeDetail>(`/employees/${id}`, saved);
  const reference = useApi<ReferenceData>('/reference');
  const role = useRole();

  function afterWrite(): void {
    setForm('none');
    setSaved((count) => count + 1);
  }

  if (detail.state === 'loading') {
    // Shaped like the page it is standing in for: name, the three figures, the band and the
    // timeline, in their places, so nothing moves when the answer lands.
    return (
      <Loading label="Employee" className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-80" />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-40 w-full" />
      </Loading>
    );
  }

  if (detail.state === 'error') {
    return (
      <div className="space-y-4">
        <Failure>{detail.message}</Failure>
        <Link href="/employees" className="text-sm underline">
          Back to the list
        </Link>
      </div>
    );
  }

  const { employee, salaryHistory, currentSalary, band, compRatio, rangePenetration } = detail.data;

  return (
    <section className="space-y-8">
      <div>
        <Link href="/employees" className="text-sm text-muted-foreground underline">
          Employees
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">
          {employee.firstName} {employee.lastName}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {employee.employeeCode} · {employee.jobLevelName} · {employee.departmentName} ·{' '}
          {employee.countryCode} · hired {employee.hireDate}
          {employee.terminationDate !== null && ` · left ${employee.terminationDate}`}
        </p>
      </div>

      {/* An analyst is shown the person and refused the forms, which is what the API does
          with the same two writes. The buttons are absent rather than disabled: a disabled
          control invites a second click, where an absent one has already said no. */}
      {role === 'admin' && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={form === 'edit' ? 'primary' : 'outline'}
            size="sm"
            disabled={reference.state !== 'ready'}
            onClick={() => {
              setForm(form === 'edit' ? 'none' : 'edit');
            }}
          >
            Edit details
          </Button>
          <Button
            variant={form === 'salary' ? 'primary' : 'outline'}
            size="sm"
            disabled={reference.state !== 'ready'}
            onClick={() => {
              setForm(form === 'salary' ? 'none' : 'salary');
            }}
          >
            Record a salary change
          </Button>
          {reference.state === 'error' && (
            <Failure>{reference.message} The forms need the department and level lists.</Failure>
          )}
        </div>
      )}

      {reference.state === 'ready' && form === 'edit' && (
        <div className="rounded-[var(--radius)] border border-border p-4">
          <EmployeeForm
            reference={reference.data}
            initial={valuesOf(employee)}
            submitLabel="Save the changes"
            onCancel={() => {
              setForm('none');
            }}
            onSubmit={async (body) => {
              await api(`/employees/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
              afterWrite();
            }}
          />
        </div>
      )}

      {reference.state === 'ready' && form === 'salary' && (
        <div className="rounded-[var(--radius)] border border-border p-4">
          <SalaryChangeForm
            employeeId={employee.id}
            reference={reference.data}
            currentCurrency={currentSalary?.currencyCode ?? null}
            onSaved={afterWrite}
            onCancel={() => {
              setForm('none');
            }}
          />
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Figure label="Current salary">
          {currentSalary === null ? 'Nothing on record' : formatMoney(currentSalary)}
        </Figure>
        <Figure label="Comp ratio">{formatRatio(compRatio)}</Figure>
        <Figure label="Range penetration">{formatRatio(rangePenetration)}</Figure>
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Band</h2>
        {band === null ? (
          <Empty>
            No band covers {employee.jobLevelName} in {employee.countryCode}. There is nothing to
            measure this salary against, which is a gap in the band table rather than a problem with
            the person.
          </Empty>
        ) : (
          <>
            <dl className="flex gap-8 text-sm">
              <Pair term="Minimum" detail={formatMoney(band.min)} />
              <Pair term="Midpoint" detail={formatMoney(band.mid)} />
              <Pair term="Maximum" detail={formatMoney(band.max)} />
            </dl>
            {currentSalary !== null && rangePenetration !== null && (
              <BandBar penetration={rangePenetration} />
            )}
          </>
        )}
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Salary history</h2>
        {/* A column header with nothing under it reads as a broken page, so a joiner with no
            salary yet gets the sentence instead of the empty table. */}
        {salaryHistory.length === 0 ? (
          <Empty>No salary on record yet. Record a change to open the first one.</Empty>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-muted-foreground">
              <tr>
                <th className="py-2 font-medium">From</th>
                <th className="py-2 font-medium">To</th>
                <th className="py-2 font-medium">Amount</th>
                <th className="py-2 font-medium">Reason</th>
              </tr>
            </thead>
            <tbody>
              {salaryHistory.map((record) => (
                <tr key={record.id} className="border-b border-border/60">
                  <td className="py-2">{record.effectiveFrom}</td>
                  <td className="py-2">
                    {record.effectiveTo ?? <span className="font-medium">in force</span>}
                  </td>
                  <td className="py-2">{formatMoney(record)}</td>
                  <td className="py-2 text-muted-foreground">{record.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

/** The record as the form holds it: strings, with a null date read as an empty field. */
function valuesOf(employee: EmployeeDetail['employee']): EmployeeFormValues {
  return {
    employeeCode: employee.employeeCode,
    firstName: employee.firstName,
    lastName: employee.lastName,
    email: employee.email,
    gender: employee.gender,
    countryCode: employee.countryCode,
    departmentId: String(employee.departmentId),
    jobLevelId: String(employee.jobLevelId),
    hireDate: employee.hireDate,
    terminationDate: employee.terminationDate ?? '',
    managerId: employee.managerId === null ? '' : String(employee.managerId),
  };
}

function Figure({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[var(--radius)] border border-border p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold">{children}</p>
    </div>
  );
}

function Pair({ term, detail }: { term: string; detail: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{term}</dt>
      <dd className="font-medium">{detail}</dd>
    </div>
  );
}

/**
 * Where the salary sits between minimum and maximum. Penetration is deliberately not
 * clamped (`docs/glossary.md`), so someone paid outside their band shows at the end of the
 * bar with the number next to it saying how far outside.
 */
function BandBar({ penetration }: { penetration: number }) {
  const clamped = Math.min(Math.max(penetration, 0), 1);

  return (
    <div className="space-y-1">
      <div className="h-2 w-full rounded-full bg-muted" role="presentation">
        <div
          className="h-2 rounded-full bg-primary"
          style={{ width: `${String(clamped * 100)}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {penetration < 0 && 'Below the band minimum. '}
        {penetration > 1 && 'Above the band maximum. '}
        {formatRatio(penetration)} of the way from minimum to maximum.
      </p>
    </div>
  );
}
