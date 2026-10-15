'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { Button } from '../../../../components/ui/button';
import { Empty, Failure, Loading, Skeleton } from '../../../../components/ui/state';
import type { OutlierRow, OutliersReport } from '../../../../lib/api-types';
import { formatMoney, formatRatio } from '../../../../lib/money';
import { useApi } from '../../../../lib/use-api';

/**
 * The report that ends in a decision: every row is a person, and every person is a link to
 * the screen where their pay can be changed (PB-063).
 *
 * The fourth list is not an outlier at all. An employee with no band has no comp ratio to be
 * outside of — it is a gap in the band table, and mixing it into "people underpaid" would
 * turn a data problem into a pay problem.
 */

const LISTS = [
  {
    key: 'belowBand',
    label: 'Below the band minimum',
    hint: 'Paid under the floor of their own band.',
  },
  {
    key: 'aboveBand',
    label: 'Above the band maximum',
    hint: 'Paid over the ceiling of their own band.',
  },
  {
    key: 'compRatioOutOfRange',
    label: 'Comp ratio outside the range',
    hint: 'Inside the band, but far from its midpoint.',
  },
  { key: 'noBand', label: 'No band at all', hint: 'A gap in the band table, not a pay decision.' },
] as const;

type ListKey = (typeof LISTS)[number]['key'];

export default function OutliersPage() {
  return (
    <Suspense
      fallback={
        <Loading label="Outliers" className="space-y-6">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-96 w-full" />
        </Loading>
      }
    >
      <Outliers />
    </Suspense>
  );
}

function Outliers() {
  const router = useRouter();
  const params = useSearchParams();
  const report = useApi<OutliersReport>('/analytics/outliers');

  // No `show` is every list. A named one narrows to it, and the URL carries the choice.
  const shown = params.get('show');
  const visible = LISTS.filter((list) => shown === null || shown === list.key);

  function show(key: ListKey | null): void {
    router.push(key === null ? '/reports/outliers' : `/reports/outliers?show=${key}`);
  }

  return (
    <section className="space-y-6">
      <div>
        <Link href="/reports" className="text-sm text-muted-foreground underline">
          Reports
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">People outside their band</h1>
        {report.state === 'ready' && (
          <p className="mt-1 text-sm text-muted-foreground">
            A comp ratio counts as out of range below {report.data.threshold.min.toFixed(2)} or
            above {report.data.threshold.max.toFixed(2)} — the threshold the API applied, not one
            chosen here.
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant={shown === null ? 'primary' : 'outline'}
          onClick={() => {
            show(null);
          }}
        >
          Everything
        </Button>
        {LISTS.map((list) => (
          <Button
            key={list.key}
            size="sm"
            variant={shown === list.key ? 'primary' : 'outline'}
            onClick={() => {
              show(list.key);
            }}
          >
            {list.label}
            {report.state === 'ready' && ` (${String(report.data[list.key].length)})`}
          </Button>
        ))}
      </div>

      {report.state === 'error' && <Failure>{report.message}</Failure>}

      {report.state === 'loading' && (
        <Loading label="Outliers" className="space-y-4">
          <Skeleton className="h-6 w-64" />
          <Skeleton className="h-72 w-full" />
        </Loading>
      )}

      {report.state === 'ready' &&
        visible.map((list) => (
          <div key={list.key} className="space-y-3">
            <div>
              <h2 className="text-lg font-semibold">
                {list.label} ({report.data[list.key].length})
              </h2>
              <p className="text-sm text-muted-foreground">{list.hint}</p>
            </div>
            {report.data[list.key].length === 0 ? (
              <Empty>Nobody. This list being empty is the good outcome.</Empty>
            ) : (
              <People rows={report.data[list.key]} />
            )}
          </div>
        ))}
    </section>
  );
}

function People({ rows }: { rows: readonly OutlierRow[] }) {
  return (
    <table className="w-full text-left text-sm">
      <thead className="border-b border-border text-muted-foreground">
        <tr>
          <th className="py-2 font-medium">Number</th>
          <th className="py-2 font-medium">Name</th>
          <th className="py-2 font-medium">Country</th>
          <th className="py-2 font-medium">Department</th>
          <th className="py-2 font-medium">Level</th>
          <th className="py-2 font-medium">Salary</th>
          <th className="py-2 font-medium">Comp ratio</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.employeeId} className="border-b border-border/60">
            <td className="py-2">{row.employeeCode}</td>
            <td className="py-2">
              <Link href={`/employees/${String(row.employeeId)}`} className="underline">
                {row.firstName} {row.lastName}
              </Link>
            </td>
            <td className="py-2">{row.countryCode}</td>
            <td className="py-2">{row.departmentName}</td>
            <td className="py-2">{row.jobLevelName}</td>
            <td className="py-2">{formatMoney(row.salary)}</td>
            <td className="py-2">{formatRatio(row.compRatio)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
