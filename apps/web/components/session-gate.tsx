'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { api, ApiError } from '../lib/api';
import type { SessionUser } from '../lib/api-types';

/**
 * Asks the API who we are before drawing anything behind the nav, and sends a stranger to
 * the login page. One check in the layout rather than the same branch in every screen —
 * the API refuses them all anyway (PB-051), this only decides what the person sees.
 */
export function SessionGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<'checking' | 'in'>('checking');

  useEffect(() => {
    let live = true;

    api<SessionUser>('/auth/me')
      .then(() => {
        if (live) setState('in');
      })
      .catch((thrown: unknown) => {
        if (!live) return;
        if (thrown instanceof ApiError && thrown.signedOut) router.replace('/login');
        // Anything else is the API being down, which the screens report in their own words.
        else setState('in');
      });

    return () => {
      live = false;
    };
  }, [router]);

  if (state === 'checking') {
    return <p className="px-6 py-8 text-sm text-muted-foreground">Checking your session…</p>;
  }

  return <>{children}</>;
}
