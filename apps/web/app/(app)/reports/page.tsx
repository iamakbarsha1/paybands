import Link from 'next/link';

/** `href` is null until the screen exists, so the list never links to a page that is not there. */
const REPORTS = [
  { label: 'Pay bands and their occupancy', href: '/reports/bands' },
  { label: 'Salary distribution by country, department or level', href: '/reports/distribution' },
  { label: 'Comp ratio across the org', href: '/reports/comp-ratio' },
  { label: 'People outside their band', href: '/reports/outliers' },
  { label: 'Gender pay gap, with suppression stated', href: null },
] as const;

export default function ReportsPage() {
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Reports</h1>
      <p className="text-sm text-muted-foreground">
        Five screens over the analytics endpoints, landing one at a time in phase 9.
      </p>
      <ul className="list-disc space-y-1 pl-5 text-sm">
        {REPORTS.map((report) => (
          <li key={report.label}>
            {report.href === null ? (
              <span className="text-muted-foreground">{report.label} — not built yet</span>
            ) : (
              <Link href={report.href} className="underline">
                {report.label}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
