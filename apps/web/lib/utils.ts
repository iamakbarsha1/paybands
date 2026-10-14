import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** The shadcn helper: join class names, then let the later Tailwind class win. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
