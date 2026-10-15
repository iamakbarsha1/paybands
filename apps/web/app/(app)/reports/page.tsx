import Link from 'next/link';

/** All five exist now, so the list is five links and the "not built yet" branch is gone. */
const REPORTS = [
  { label: 'Pay bands and their occupancy', href: '/reports/bands' },
  { label: 'Salary distribution by country, department or level', href: '/reports/distribution' },
  { label: 'Comp ratio across the org', href: '/reports/comp-ratio' },
  { label: 'People outside their band', href: '/reports/outliers' },
  { label: 'Gender pay gap, with suppression stated', href: '/reports/pay-gap' },
] as const;

export default function ReportsPage() {
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Reports</h1>
      <p className="text-sm text-muted-foreground">
        Five screens over the analytics endpoints. Each one answers in the response&rsquo;s own
        words, including when it refuses to answer.
      </p>
      <ul className="list-disc space-y-1 pl-5 text-sm">
        {REPORTS.map((report) => (
          <li key={report.label}>
            <Link href={report.href} className="underline">
              {report.label}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
