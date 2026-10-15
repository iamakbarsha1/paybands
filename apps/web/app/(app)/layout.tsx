import type { ReactNode } from 'react';
import { AppNav } from '../../components/app-nav';
import { SessionGate } from '../../components/session-gate';

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    // The nav is drawn before the session check answers, so it does not drop in afterwards.
    // It holds no data — the gate decides what goes under it (PB-059).
    <>
      <AppNav />
      <main className="mx-auto max-w-6xl px-6 py-8">
        <SessionGate>{children}</SessionGate>
      </main>
    </>
  );
}
