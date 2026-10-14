import { describe, expect, it } from 'vitest';
import { money, payGap, type Gender, type GenderedSalary } from './index';

function person(gender: Gender, amount: bigint): GenderedSalary {
  return { gender, salary: money(amount, 'GBP') };
}

/** `n` people of one gender, all on the same salary. */
function group(gender: Gender, count: number, amount: bigint): GenderedSalary[] {
  return Array.from({ length: count }, () => person(gender, amount));
}

const MIN_FIVE = { minGroupSize: 5 };

describe('payGap', () => {
  it('reports the mean gap as a share of the higher-paid reference group', () => {
    // Men on £100,000, women on £88,000: a gap of 12%.
    const slice = [...group('male', 5, 10_000_000n), ...group('female', 5, 8_800_000n)];
    expect(payGap(slice, MIN_FIVE).meanGap).toBeCloseTo(0.12, 12);
  });

  it('reports the median gap alongside the mean, not instead of it', () => {
    const slice = [...group('male', 5, 10_000_000n), ...group('female', 5, 8_800_000n)];
    const found = payGap(slice, MIN_FIVE);
    expect(found.medianGap).toBeCloseTo(0.12, 12);
    expect(found.meanGap).not.toBeNull();
  });

  it('returns a zero gap when both groups are paid the same', () => {
    const slice = [...group('male', 6, 7_000_000n), ...group('female', 6, 7_000_000n)];
    const found = payGap(slice, MIN_FIVE);
    expect(found.meanGap).toBe(0);
    expect(found.medianGap).toBe(0);
  });

  it('goes negative when the comparison group is paid more', () => {
    const slice = [...group('male', 5, 8_800_000n), ...group('female', 5, 10_000_000n)];
    expect(payGap(slice, MIN_FIVE).meanGap).toBeLessThan(0);
  });

  it('separates the mean from the median when one salary is extreme', () => {
    const men = [...group('male', 5, 5_000_000n), person('male', 100_000_000n)];
    const women = group('female', 6, 5_000_000n);
    const found = payGap([...men, ...women], MIN_FIVE);
    expect(found.medianGap).toBe(0);
    expect(found.meanGap).toBeGreaterThan(0.5);
  });
});

describe('payGap headcount', () => {
  it('counts other and undisclosed toward headcount but excludes them from the comparison', () => {
    const slice = [
      ...group('male', 5, 10_000_000n),
      ...group('female', 5, 10_000_000n),
      person('other', 9_000_000n),
      person('undisclosed', 1_000_000n),
    ];
    const found = payGap(slice, MIN_FIVE);
    expect(found.headcount).toBe(12);
    expect(found.excluded).toBe(2);
    expect(found.compared).toEqual({ male: 5, female: 5 });
    // The excluded pair are nowhere near the comparison, so they cannot move it.
    expect(found.meanGap).toBe(0);
  });
});

describe('payGap suppression', () => {
  it('suppresses a group one member below the minimum, and says why', () => {
    const slice = [...group('male', 8, 10_000_000n), ...group('female', 4, 8_000_000n)];
    const found = payGap(slice, MIN_FIVE);
    expect(found.suppressed).toBe(true);
    expect(found.meanGap).toBeNull();
    expect(found.medianGap).toBeNull();
    expect(found.reason).toMatch(/5/);
  });

  it('reports a group sitting exactly on the minimum', () => {
    const slice = [...group('male', 5, 10_000_000n), ...group('female', 5, 8_000_000n)];
    const found = payGap(slice, MIN_FIVE);
    expect(found.suppressed).toBe(false);
    expect(found.reason).toBeNull();
    expect(found.meanGap).not.toBeNull();
  });

  it('suppresses Legal rather than publishing a gap over three women', () => {
    // apps/api/src/seed/reference.ts:125 — 8 male, 3 female, 11 in the department.
    const legal = [...group('male', 8, 9_000_000n), ...group('female', 3, 7_000_000n)];
    const found = payGap(legal, MIN_FIVE);
    expect(found.headcount).toBe(11);
    expect(found.suppressed).toBe(true);
    expect(found.meanGap).toBeNull();
  });

  it('suppresses an empty slice rather than returning a zero gap', () => {
    const found = payGap([], MIN_FIVE);
    expect(found.suppressed).toBe(true);
    expect(found.headcount).toBe(0);
    expect(found.meanGap).toBeNull();
  });

  it('suppresses a slice holding a single person', () => {
    expect(payGap([person('female', 6_000_000n)], MIN_FIVE).suppressed).toBe(true);
  });

  it('suppresses when one gender is absent entirely', () => {
    const found = payGap(group('male', 40, 10_000_000n), MIN_FIVE);
    expect(found.suppressed).toBe(true);
    expect(found.compared).toEqual({ male: 40, female: 0 });
  });

  it('still reports headcount and exclusions while suppressed', () => {
    const slice = [...group('male', 8, 9_000_000n), person('undisclosed', 7_000_000n)];
    const found = payGap(slice, MIN_FIVE);
    expect(found.suppressed).toBe(true);
    expect(found.headcount).toBe(9);
    expect(found.excluded).toBe(1);
  });
});

describe('payGap refusals', () => {
  it('refuses a slice mixing currencies, which needs normalising first', () => {
    const slice = [
      ...group('male', 5, 10_000_000n),
      ...group('female', 4, 8_000_000n),
      { gender: 'female' as Gender, salary: money(8_000_000n, 'USD') },
    ];
    expect(() => payGap(slice, MIN_FIVE)).toThrow(/Cannot combine .* without an FX rate/);
  });

  it('throws on a minimum group size below one', () => {
    const slice = [...group('male', 5, 10_000_000n), ...group('female', 5, 8_000_000n)];
    expect(() => payGap(slice, { minGroupSize: 0 })).toThrow(RangeError);
  });

  it('throws when the reference group has no pay to divide by', () => {
    const slice = [...group('male', 5, 0n), ...group('female', 5, 0n)];
    expect(() => payGap(slice, MIN_FIVE)).toThrow(RangeError);
  });
});
