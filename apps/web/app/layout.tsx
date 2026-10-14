import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'paybands',
  description: 'Salary management and pay analytics',
};

/** Chrome lives in the `(app)` group, so the login page does not get a nav to nowhere. */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
