import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

/**
 * The three answers every screen that asks the API has to give: it is coming, there is
 * nothing, or it went wrong. They live together so a new screen cannot ship with only the
 * happy one (PB-059).
 *
 * A skeleton is shaped like the thing it is standing in for, not a spinner in the middle of
 * an empty page: the heading, the table header and the buttons stay where they will be, so
 * the page does not jump when the answer lands.
 */

/** A block that holds the space its content will take. Sized by the caller, in the caller's grid. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('animate-pulse rounded bg-muted', className)} />;
}

/**
 * Wraps a group of skeletons. `role="status"` is what a screen reader has instead of the
 * pulse, and `aria-busy` says the region is mid-answer rather than finished and empty.
 */
export function Loading({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div role="status" aria-busy aria-label={label} className={className}>
      {children}
    </div>
  );
}

/** Nothing to show, and why — never a blank space where a table was. */
export function Empty({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

/** The API's own words. `role="alert"` so it is read when it replaces a result. */
export function Failure({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="text-sm text-destructive">
      {children}
    </p>
  );
}
