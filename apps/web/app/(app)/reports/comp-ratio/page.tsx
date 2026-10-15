'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Button } from '../../../../components/ui/button';
import { Empty, Failure, Loading, Skeleton } from '../../../../components/ui/state';
import type { CompRatioBucket, CompRatioReport, CompRatioSummary } from '../../../../lib/api-types';
import { useApi } from '../../../../lib/use-api';

/**
 * The shape and the detail, from one response: a histogram of where the whole organisation
 * sits against its bands, and a table of the same counts per slice (PB-062).
 *
 * The bucket boundaries are drawn from the response rather than written here, because a
 * histogram whose boundaries are not on the page cannot be read.
 */

const GROUPS = [
  { value: 'country', label: 'Country' },
  { value: 'department', label: 'Department' },
  { value: 'level', label: 'Job level' },
] as const;

export default function CompRatioPage() {
  return (
    <Suspense
      fallback={
        <Loading label="Comp ratio" className="space-y-6">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-96 w-full" />
        </Loading>
      }
    >
      <CompRatio />
    </Suspense>
  );
}

function CompRatio() {
  const router = useRouter();
  const params = useSearchParams();
  const groupBy = GROUPS.find((group) => group.value === params.get('groupBy'))?.value ?? 'country';
  const report = useApi<CompRatioReport>(`/analytics/comp-ratio?groupBy=${groupBy}`);

  return (
    <section className="space-y-6">
      <div>
        <Link href="/reports" className="text-sm text-muted-foreground underline">
          Reports
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">Comp ratio</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Salary over the midpoint of the person&rsquo;s own band. Only people with a band have one,
          so every count here separates the measured from the unbanded rather than averaging them
          away.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {GROUPS.map((group) => (
          <Button
            key={group.value}
            size="sm"
            variant={group.value === groupBy ? 'primary' : 'outline'}
            onClick={() => {
              router.push(`/reports/comp-ratio?groupBy=${group.value}`);
            }}
          >
            {group.label}
          </Button>
        ))}
      </div>

      {report.state === 'error' && <Failure>{report.message}</Failure>}

      {report.state === 'loading' && (
        <Loading label="Comp ratio" className="space-y-6">
          <Skeleton className="h-56 w-full" />
          <Skeleton className="h-80 w-full" />
        </Loading>
      )}

      {report.state === 'ready' && report.data.overall.measured === 0 && (
        <Empty>Nobody has both a salary and a band, so there is no comp ratio to report yet.</Empty>
      )}

      {report.state === 'ready' && report.data.overall.measured > 0 && (
        <>
          <Histogram buckets={report.data.buckets} summary={report.data.overall} />
          <SliceTable report={report.data} />
        </>
      )}
    </section>
  );
}

/** `null` ends are the open buckets: everyone under the first boundary, everyone over the last. */
function labelOf(bucket: CompRatioBucket): string {
  if (bucket.from === null) return `under ${bucket.to?.toFixed(2) ?? ''}`;
  if (bucket.to === null) return `${bucket.from.toFixed(2)} and over`;

  return `${bucket.from.toFixed(2)} – ${bucket.to.toFixed(2)}`;
}

function Histogram({
  buckets,
  summary,
}: {
  buckets: readonly CompRatioBucket[];
  summary: CompRatioSummary;
}) {
  const tallest = Math.max(...summary.counts);

  return (
    <div className="space-y-3">
      <div className="flex h-56 items-end gap-2">
        {buckets.map((bucket, index) => {
          const count = summary.counts[index] ?? 0;

          return (
            <div key={labelOf(bucket)} className="flex grow flex-col items-center gap-1">
              <span className="text-xs text-muted-foreground">{count}</span>
              <div
                className="w-full rounded-t-[var(--radius)] bg-primary/40"
                // Height is geometry, not a figure: the count is printed above the bar.
                style={{ height: `${String(tallest === 0 ? 0 : (count / tallest) * 100)}%` }}
              />
              <span className="text-center text-xs">{labelOf(bucket)}</span>
            </div>
          );
        })}
      </div>
      <p className="text-sm text-muted-foreground">
        {summary.measured} people measured against a band; {summary.unbanded} have no band and are
        counted nowhere in the bars.
      </p>
    </div>
  );
}

type Row = CompRatioSummary & { readonly key: string; readonly name: string };
type SortKey = 'name' | 'headcount' | 'measured' | 'unbanded' | number;

function valueOf(row: Row, key: SortKey): number | string {
  if (typeof key === 'number') return row.counts[key] ?? 0;

  return key === 'name' ? row.name : row[key];
}

function SliceTable({ report }: { report: CompRatioReport }) {
  const [sort, setSort] = useState<{ key: SortKey; descending: boolean }>({
    key: 'measured',
    descending: true,
  });

  const rows = [...report.groups].sort((a, b) => {
    const left = valueOf(a, sort.key);
    const right = valueOf(b, sort.key);
    const order =
      typeof left === 'string' && typeof right === 'string'
        ? left.localeCompare(right)
        : Number(left) - Number(right);

    return sort.descending ? -order : order;
  });

  function header(key: SortKey, label: string) {
    const active = sort.key === key;

    return (
      // `aria-sort` belongs to the column header, not the control inside it.
      <th
        key={label}
        className="py-2 font-medium"
        aria-sort={active ? (sort.descending ? 'descending' : 'ascending') : 'none'}
      >
        <button
          type="button"
          className="underline-offset-2 hover:underline"
          onClick={() => {
            setSort((current) =>
              current.key === key
                ? { key, descending: !current.descending }
                : { key, descending: true },
            );
          }}
        >
          {label}
          {active && (sort.descending ? ' ▼' : ' ▲')}
        </button>
      </th>
    );
  }

  return (
    <table className="w-full text-left text-sm">
      <thead className="border-b border-border text-muted-foreground">
        <tr>
          {header('name', 'Group')}
          {header('headcount', 'People')}
          {header('measured', 'With a band')}
          {header('unbanded', 'No band')}
          {report.buckets.map((bucket, index) => header(index, labelOf(bucket)))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.key} className="border-b border-border/60">
            <td className="py-2">{row.name}</td>
            <td className="py-2">{row.headcount}</td>
            <td className="py-2">{row.measured}</td>
            <td className="py-2 text-muted-foreground">{row.unbanded}</td>
            {report.buckets.map((bucket, index) => (
              <td key={labelOf(bucket)} className="py-2">
                {row.counts[index] ?? 0}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
