'use client';

import { bandSpread, money } from '@paybands/core';
import Link from 'next/link';
import { Empty, Failure, Skeleton } from '../../../../components/ui/state';
import type { BandRow, BandsReport } from '../../../../lib/api-types';
import { formatMoney, formatRatio } from '../../../../lib/money';
import { useApi } from '../../../../lib/use-api';

/** Eight levels in six countries: the table is the whole band structure, so it never pages. */
const BANDS = 48;

export default function BandsReportPage() {
  const report = useApi<BandsReport>('/analytics/bands');

  return (
    <section className="space-y-6">
      <div>
        <Link href="/reports" className="text-sm text-muted-foreground underline">
          Reports
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">Pay bands</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          One band per level per country, in that country&rsquo;s currency. Spread is the width over
          the minimum, which is the one figure that compares across currencies.
        </p>
      </div>

      {report.state === 'error' && <Failure>{report.message}</Failure>}

      {report.state === 'ready' && report.data.bands.length === 0 && (
        <Empty>
          No bands are defined. The band table is seeded, so this means an empty database.
        </Empty>
      )}

      {(report.state === 'loading' ||
        (report.state === 'ready' && report.data.bands.length > 0)) && (
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border text-muted-foreground">
            <tr>
              <th className="py-2 font-medium">Level</th>
              <th className="py-2 font-medium">Country</th>
              <th className="py-2 font-medium">Minimum</th>
              <th className="py-2 font-medium">Midpoint</th>
              <th className="py-2 font-medium">Maximum</th>
              <th className="py-2 font-medium">Spread</th>
              <th className="py-2 font-medium">People</th>
            </tr>
          </thead>
          <tbody role="status" aria-busy={report.state === 'loading'} aria-label="Pay bands">
            {report.state === 'loading' &&
              Array.from({ length: BANDS }, (_, index) => (
                <tr key={index} className="border-b border-border/60">
                  {Array.from({ length: 7 }, (_, cell) => (
                    <td key={cell} className="py-2">
                      <Skeleton className="h-5 w-full max-w-24" />
                    </td>
                  ))}
                </tr>
              ))}
            {report.state === 'ready' &&
              report.data.bands.map((band) => (
                <tr
                  key={`${band.countryCode}-${String(band.jobLevelId)}`}
                  className="border-b border-border/60"
                >
                  <td className="py-2">{band.jobLevelName}</td>
                  <td className="py-2">{band.countryCode}</td>
                  <td className="py-2">{formatMoney(at(band, 'minMinor'))}</td>
                  <td className="py-2">{formatMoney(at(band, 'midMinor'))}</td>
                  <td className="py-2">{formatMoney(at(band, 'maxMinor'))}</td>
                  <td className="py-2">{formatRatio(spreadOf(band))}</td>
                  <td className="py-2">
                    {band.headcount === 0 ? (
                      <span className="text-muted-foreground">nobody</span>
                    ) : (
                      <Link
                        href={`/employees?country=${band.countryCode}&level=${String(band.jobLevelId)}`}
                        className="underline"
                      >
                        {band.headcount}
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

/** The row carries one currency for its three figures; this is what `formatMoney` reads. */
function at(band: BandRow, figure: 'minMinor' | 'midMinor' | 'maxMinor') {
  return { amountMinor: band[figure], currencyCode: band.currencyCode };
}

/**
 * A band with no width has no spread, and `bandSpread` says so by throwing. The row still
 * belongs in the table — its minimum and maximum are right there to be read — so the cell
 * reads as "—" rather than taking the screen down with it.
 */
function spreadOf(band: BandRow): number | null {
  try {
    return bandSpread({
      min: money(BigInt(band.minMinor), band.currencyCode),
      mid: money(BigInt(band.midMinor), band.currencyCode),
      max: money(BigInt(band.maxMinor), band.currencyCode),
    });
  } catch {
    return null;
  }
}
