import type { ReactNode } from 'react';
import { AppNav } from '../../components/app-nav';
import { SessionGate } from '../../components/session-gate';

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <SessionGate>
      <AppNav />
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </SessionGate>
  );
}
