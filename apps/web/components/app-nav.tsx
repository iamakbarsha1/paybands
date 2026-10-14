'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '../lib/utils';

/** One declaration. A screen that is not here is not reachable, which is easier to notice. */
const NAV = [
  { href: '/employees', label: 'Employees' },
  { href: '/reports', label: 'Reports' },
] as const;

export function AppNav() {
  const pathname = usePathname();

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
      </nav>
    </header>
  );
}
