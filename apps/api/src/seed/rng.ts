export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function int(rng: Rng, min: number, maxInclusive: number): number {
  return min + Math.floor(rng() * Math.max(0, maxInclusive - min + 1));
}

export function pick<T>(rng: Rng, values: readonly T[]): T {
  const value = values[int(rng, 0, values.length - 1)];
  if (value === undefined) {
    throw new RangeError('pick needs a non-empty array');
  }
  return value;
}

export function weighted<T>(rng: Rng, entries: readonly (readonly [T, number])[]): T {
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = rng() * total;
  for (const [value, weight] of entries) {
    roll -= weight;
    if (roll < 0) {
      return value;
    }
  }
  const last = entries.at(-1);
  if (last === undefined) {
    throw new RangeError('weighted needs a non-empty array');
  }
  return last[0];
}

const MS_PER_DAY = 86_400_000;

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * MS_PER_DAY);
}

export function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / MS_PER_DAY);
}

/** Half-open: the result is at least `from` and always before `to`. */
export function dateBetween(rng: Rng, from: Date, to: Date): Date {
  return addDays(from, int(rng, 0, daysBetween(from, to) - 1));
}
