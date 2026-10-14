'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { api } from '../lib/api';
import { cn } from '../lib/utils';
import { Button } from './ui/button';

/** One declaration. A screen that is not here is not reachable, which is easier to notice. */
const NAV = [
  { href: '/employees', label: 'Employees' },
  { href: '/reports', label: 'Reports' },
] as const;

export function AppNav() {
  const pathname = usePathname();
  const router = useRouter();

  async function signOut(): Promise<void> {
    // The cookie is cleared by the API; a failure here still sends them to the login page,
    // because a browser that cannot reach the API has no session worth keeping on screen.
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    router.replace('/login');
  }

  return (
    <header className="border-b border-border">
      <nav className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-4">
        <Link href="/employees" className="text-base font-semibold">
          paybands
        </Link>

        <ul className="flex items-center gap-1">
          {NAV.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={pathname.startsWith(item.href) ? 'page' : undefined}
                className={cn(
                  'rounded-[var(--radius)] px-3 py-2 text-sm text-muted-foreground hover:bg-muted',
                  pathname.startsWith(item.href) && 'bg-muted text-foreground',
                )}
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>

        <Button variant="ghost" size="sm" className="ml-auto" onClick={() => void signOut()}>
          Sign out
        </Button>
      </nav>
    </header>
  );
}
