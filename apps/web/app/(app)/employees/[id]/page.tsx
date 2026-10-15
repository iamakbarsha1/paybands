'use client';

import Link from 'next/link';
import { use } from 'react';
import type { EmployeeDetail } from '../../../../lib/api-types';
import { formatMoney, formatRatio } from '../../../../lib/money';
import { useApi } from '../../../../lib/use-api';

export default function EmployeeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const detail = useApi<EmployeeDetail>(`/employees/${id}`);

  if (detail.state === 'loading') {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  if (detail.state === 'error') {
    return (
      <div className="space-y-4">
        <p role="alert" className="text-sm text-destructive">
          {detail.message}
        </p>
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
          <p className="text-sm text-muted-foreground">
            No band covers {employee.jobLevelName} in {employee.countryCode}. There is nothing to
            measure this salary against, which is a gap in the band table rather than a problem with
            the person.
          </p>
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
      </div>
    </section>
  );
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
