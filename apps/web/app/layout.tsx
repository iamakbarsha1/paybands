import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AppNav } from '../components/app-nav';
import './globals.css';

export const metadata: Metadata = {
  title: 'paybands',
  description: 'Salary management and pay analytics',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <AppNav />
        <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
