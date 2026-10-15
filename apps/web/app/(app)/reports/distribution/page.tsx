'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { Button } from '../../../../components/ui/button';
import { Empty, Failure, Loading, Skeleton } from '../../../../components/ui/state';
import type { Distribution, DistributionGroup } from '../../../../lib/api-types';
import { formatMoney } from '../../../../lib/money';
import { useApi } from '../../../../lib/use-api';

/**
 * The same four numbers twice: a chart to compare slices at a glance and a table to read
 * them exactly. Both render the one response, so they cannot disagree (PB-061).
 */

const GROUPS = [
  { value: 'country', label: 'Country' },
  { value: 'department', label: 'Department' },
  { value: 'level', label: 'Job level' },
] as const;

const POINTS = [
  { key: 'p25', label: 'p25' },
  { key: 'p50', label: 'p50 — median' },
  { key: 'p75', label: 'p75' },
  { key: 'p90', label: 'p90' },
] as const;

export default function DistributionPage() {
  return (
    <Suspense
      fallback={
        <Loading label="Distribution" className="space-y-6">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-96 w-full" />
        </Loading>
      }
    >
      <Distribution />
    </Suspense>
  );
}

function Distribution() {
  const router = useRouter();
  const params = useSearchParams();
  const groupBy = GROUPS.find((group) => group.value === params.get('groupBy'))?.value ?? 'country';
  const report = useApi<Distribution>(`/analytics/distribution?groupBy=${groupBy}`);

  return (
    <section className="space-y-6">
      <div>
        <Link href="/reports" className="text-sm text-muted-foreground underline">
          Reports
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">Salary distribution</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Percentiles of current salary, every slice converted to USD at today&rsquo;s rate so the
          groups can be compared. p50 is the median.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {GROUPS.map((group) => (
          <Button
            key={group.value}
            size="sm"
            variant={group.value === groupBy ? 'primary' : 'outline'}
            onClick={() => {
              // The grouping is in the query string, so a slice is a link somebody can send.
              router.push(`/reports/distribution?groupBy=${group.value}`);
            }}
          >
            {group.label}
          </Button>
        ))}
      </div>

      {report.state === 'error' && <Failure>{report.message}</Failure>}

      {report.state === 'loading' && (
        <Loading label="Salary distribution" className="space-y-6">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-80 w-full" />
        </Loading>
      )}

      {report.state === 'ready' && report.data.groups.length === 0 && (
        <Empty>No slice has a salary on record, so there is nothing to compare.</Empty>
      )}

      {report.state === 'ready' && report.data.groups.length > 0 && (
        <>
          <Chart groups={report.data.groups} />
          <Table groups={report.data.groups} />
        </>
      )}
    </section>
  );
}

/**
 * One bar per slice, from p25 to p90, with the median marked. The widths are a fraction of
 * the widest p90 on the page — geometry rather than money: the figures themselves are never
 * computed here, only read from the same response the table prints.
 */
function Chart({ groups }: { groups: readonly DistributionGroup[] }) {
  const ceiling = Math.max(
    ...groups.map((group) => (group.percentiles === null ? 0 : Number(group.percentiles.p90))),
  );
  if (ceiling <= 0) return null;
  const across = (minor: string): number => (Number(minor) / ceiling) * 100;

  return (
    <div className="space-y-2">
      {groups.map((group) => (
        <div key={group.key} className="flex items-center gap-3 text-sm">
          <span className="w-40 shrink-0 truncate" title={group.name}>
            {group.name}
          </span>
          <div className="relative h-6 grow rounded-[var(--radius)] bg-muted">
            {group.percentiles !== null && (
              <>
                <div
                  className="absolute inset-y-0 rounded-[var(--radius)] bg-primary/30"
                  style={{
                    left: `${String(across(group.percentiles.p25))}%`,
                    width: `${String(across(group.percentiles.p90) - across(group.percentiles.p25))}%`,
                  }}
                />
                <div
                  className="absolute inset-y-0 w-0.5 bg-primary"
                  style={{ left: `${String(across(group.percentiles.p50))}%` }}
                  title={`median ${formatMoney({ amountMinor: group.percentiles.p50, currencyCode: 'USD' })}`}
                />
              </>
            )}
          </div>
          <span className="w-28 shrink-0 text-right text-muted-foreground">
            {group.percentiles === null
              ? 'no salaries'
              : formatMoney({ amountMinor: group.percentiles.p50, currencyCode: 'USD' })}
          </span>
        </div>
      ))}
    </div>
  );
}

function Table({ groups }: { groups: readonly DistributionGroup[] }) {
  return (
    <table className="w-full text-left text-sm">
      <thead className="border-b border-border text-muted-foreground">
        <tr>
          <th className="py-2 font-medium">Group</th>
          <th className="py-2 font-medium">People</th>
          {POINTS.map((point) => (
            <th key={point.key} className="py-2 font-medium">
              {point.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {groups.map((group) => {
          const points = group.percentiles;

          return (
            <tr key={group.key} className="border-b border-border/60">
              <td className="py-2">{group.name}</td>
              <td className="py-2">{group.headcount}</td>
              {points === null ? (
                <td className="py-2 text-muted-foreground" colSpan={POINTS.length}>
                  Nobody in this group has a salary on record
                </td>
              ) : (
                POINTS.map((point) => (
                  <td key={point.key} className="py-2">
                    {formatMoney({ amountMinor: points[point.key], currencyCode: 'USD' })}
                  </td>
                ))
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
