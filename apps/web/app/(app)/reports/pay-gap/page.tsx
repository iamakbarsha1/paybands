'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { Button } from '../../../../components/ui/button';
import { Empty, Failure, Loading, Skeleton } from '../../../../components/ui/state';
import type { PayGap, PayGapReport } from '../../../../lib/api-types';
import { formatRatio } from '../../../../lib/money';
import { useApi } from '../../../../lib/use-api';

/**
 * Mean and median side by side, each with the two headcounts the comparison rests on, and a
 * suppressed group saying so in words (PB-064).
 *
 * A gap computed over three people is noise with a decimal point on it. The API withholds
 * those rather than publishing them small, and this screen prints the refusal and its
 * threshold instead of a blank cell — a blank reads as "no gap", which is a different claim.
 */

const GROUPS = [
  { value: 'country', label: 'Country' },
  { value: 'department', label: 'Department' },
  { value: 'level', label: 'Job level' },
] as const;

export default function PayGapPage() {
  return (
    <Suspense
      fallback={
        <Loading label="Gender pay gap" className="space-y-6">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-96 w-full" />
        </Loading>
      }
    >
      <Gap />
    </Suspense>
  );
}

function Gap() {
  const router = useRouter();
  const params = useSearchParams();
  const groupBy =
    GROUPS.find((group) => group.value === params.get('groupBy'))?.value ?? 'department';
  const report = useApi<PayGapReport>(`/analytics/pay-gap?groupBy=${groupBy}`);

  return (
    <section className="space-y-6">
      <div>
        <Link href="/reports" className="text-sm text-muted-foreground underline">
          Reports
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">Gender pay gap</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          How much lower female pay is than male pay, as a share of male pay, in USD. A positive
          figure means women are paid less. Mean and median are both reported because they disagree
          informatively.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {GROUPS.map((group) => (
          <Button
            key={group.value}
            size="sm"
            variant={group.value === groupBy ? 'primary' : 'outline'}
            onClick={() => {
              router.push(`/reports/pay-gap?groupBy=${group.value}`);
            }}
          >
            {group.label}
          </Button>
        ))}
      </div>

      {report.state === 'error' && <Failure>{report.message}</Failure>}

      {report.state === 'loading' && (
        <Loading label="Gender pay gap" className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-80 w-full" />
        </Loading>
      )}

      {report.state === 'ready' && report.data.groups.length === 0 && (
        <Empty>No slice has anyone to compare, so there is no gap to report.</Empty>
      )}

      {report.state === 'ready' && report.data.groups.length > 0 && (
        <>
          <div className="rounded-[var(--radius)] border border-border p-4">
            <h2 className="text-lg font-semibold">Everyone</h2>
            <Figures gap={report.data.overall} />
          </div>

          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-muted-foreground">
              <tr>
                <th className="py-2 font-medium">Group</th>
                <th className="py-2 font-medium">People</th>
                <th className="py-2 font-medium">Compared</th>
                <th className="py-2 font-medium">Mean gap</th>
                <th className="py-2 font-medium">Median gap</th>
              </tr>
            </thead>
            <tbody>
              {report.data.groups.map((group) => (
                <tr key={group.key} className="border-b border-border/60">
                  <td className="py-2">{group.name}</td>
                  <td className="py-2">{group.headcount}</td>
                  <td className="py-2 text-muted-foreground">
                    {group.compared.female} women, {group.compared.male} men
                    {group.excluded > 0 && `, ${String(group.excluded)} not compared`}
                  </td>
                  {group.suppressed ? (
                    <td className="py-2 text-muted-foreground" colSpan={2}>
                      Not reported — {group.reason ?? 'group too small'}. The floor is{' '}
                      {report.data.minGroupSize} in each group compared.
                    </td>
                  ) : (
                    <>
                      <td className="py-2">{formatRatio(group.meanGap)}</td>
                      <td className="py-2">{formatRatio(group.medianGap)}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>

          <p className="text-sm text-muted-foreground">
            &ldquo;Not compared&rdquo; is everyone whose gender is recorded as other or undisclosed:
            they are in the headcount and not in the two-way comparison, which is the only honest
            place to put them.
          </p>
        </>
      )}
    </section>
  );
}

function Figures({ gap }: { gap: PayGap }) {
  if (gap.suppressed) {
    return (
      <p className="mt-2 text-sm text-muted-foreground">
        Not reported — {gap.reason ?? 'group too small'}.
      </p>
    );
  }

  return (
    <dl className="mt-2 flex flex-wrap gap-8 text-sm">
      <div>
        <dt className="text-muted-foreground">Mean gap</dt>
        <dd className="text-2xl font-semibold">{formatRatio(gap.meanGap)}</dd>
      </div>
      <div>
        <dt className="text-muted-foreground">Median gap</dt>
        <dd className="text-2xl font-semibold">{formatRatio(gap.medianGap)}</dd>
      </div>
      <div>
        <dt className="text-muted-foreground">Compared</dt>
        <dd className="text-2xl font-semibold">
          {gap.compared.female} / {gap.compared.male}
        </dd>
      </div>
    </dl>
  );
}
