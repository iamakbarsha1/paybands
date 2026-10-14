const REPORTS = [
  'Pay bands and their occupancy',
  'Salary distribution by country, department or level',
  'Comp ratio across the org',
  'People outside their band',
  'Gender pay gap, with suppression stated',
] as const;

export default function ReportsPage() {
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Reports</h1>
      <p className="text-sm text-muted-foreground">
        Five screens over the analytics endpoints, landing in phase 9.
      </p>
      <ul className="list-disc space-y-1 pl-5 text-sm">
        {REPORTS.map((report) => (
          <li key={report}>{report}</li>
        ))}
      </ul>
    </section>
  );
}
