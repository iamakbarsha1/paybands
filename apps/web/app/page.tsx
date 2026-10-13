import { CURRENCY_CODES } from '@paybands/core';

export default function HomePage() {
  return (
    <main>
      <h1>paybands</h1>
      <p>Salary management and pay analytics. The UI lands in phase 8.</p>
      <p>Currencies in scope: {CURRENCY_CODES.join(', ')}</p>
    </main>
  );
}
