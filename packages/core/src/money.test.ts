import { describe, expect, it } from 'vitest';
import { addMoney, compareMoney, money, moneyFromMajorUnits } from './index';

describe('money', () => {
  it('carries an amount in minor units and a currency', () => {
    const salary = money(8500000n, 'INR');
    expect(salary.amount).toBe(8500000n);
    expect(salary.currency).toBe('INR');
  });

  it('accepts zero', () => {
    expect(money(0n, 'USD').amount).toBe(0n);
  });

  it('accepts a negative amount, which a gap or a correction can produce', () => {
    expect(money(-2500n, 'USD').amount).toBe(-2500n);
  });

  it('rejects an unknown currency rather than carrying it as data', () => {
    expect(() => money(100n, 'XYZ')).toThrow(RangeError);
  });

  it('holds a currency with no minor unit without assuming two decimal places', () => {
    expect(money(4500000n, 'JPY').currency).toBe('JPY');
  });
});

describe('addMoney', () => {
  it('adds two amounts in the same currency', () => {
    expect(addMoney(money(120050n, 'GBP'), money(9950n, 'GBP'))).toEqual(money(130000n, 'GBP'));
  });

  it('is exact above Number.MAX_SAFE_INTEGER, where a float would round', () => {
    const beyondFloat = BigInt(Number.MAX_SAFE_INTEGER) + 1n;
    const sum = addMoney(money(beyondFloat, 'USD'), money(1n, 'USD'));
    expect(sum.amount).toBe(9007199254740993n);
    expect(sum.amount).not.toBe(BigInt(Number(sum.amount)));
  });

  it('refuses to add two currencies, which would produce a number that means nothing', () => {
    expect(() => addMoney(money(100n, 'USD'), money(100n, 'GBP'))).toThrow(TypeError);
  });

  it('leaves both operands unchanged', () => {
    const a = money(100n, 'USD');
    const b = money(250n, 'USD');
    addMoney(a, b);
    expect(a.amount).toBe(100n);
    expect(b.amount).toBe(250n);
  });
});

describe('compareMoney', () => {
  it('returns a negative number when the first amount is smaller', () => {
    expect(compareMoney(money(100n, 'USD'), money(250n, 'USD'))).toBeLessThan(0);
  });

  it('returns a positive number when the first amount is larger', () => {
    expect(compareMoney(money(250n, 'USD'), money(100n, 'USD'))).toBeGreaterThan(0);
  });

  it('returns zero for equal amounts', () => {
    expect(compareMoney(money(100n, 'USD'), money(100n, 'USD'))).toBe(0);
  });

  it('orders amounts above Number.MAX_SAFE_INTEGER correctly', () => {
    const big = BigInt(Number.MAX_SAFE_INTEGER) + 1n;
    expect(compareMoney(money(big, 'USD'), money(big + 1n, 'USD'))).toBeLessThan(0);
  });

  it('sorts a list without a float ever touching the amounts', () => {
    const amounts = [money(300n, 'EUR'), money(100n, 'EUR'), money(200n, 'EUR')];
    const sorted = [...amounts].sort(compareMoney).map((m) => m.amount);
    expect(sorted).toEqual([100n, 200n, 300n]);
  });

  it('refuses to compare two currencies, which has no answer without a rate', () => {
    expect(() => compareMoney(money(100n, 'USD'), money(100n, 'GBP'))).toThrow(TypeError);
  });
});

describe('moneyFromMajorUnits', () => {
  it('reads the amount a person types into the minor units the database holds', () => {
    expect(moneyFromMajorUnits('96000', 'USD')).toEqual(money(9600000n, 'USD'));
  });

  it('reads the decimal places the currency has', () => {
    expect(moneyFromMajorUnits('96000.50', 'USD')?.amount).toBe(9600050n);
  });

  it('pads a short decimal part rather than reading it as the whole minor unit', () => {
    expect(moneyFromMajorUnits('96000.5', 'USD')?.amount).toBe(9600050n);
  });

  it('takes a currency with no minor unit at face value', () => {
    expect(moneyFromMajorUnits('1234', 'JPY')?.amount).toBe(1234n);
  });

  it('refuses a decimal part on a currency that has none', () => {
    expect(moneyFromMajorUnits('1234.5', 'JPY')).toBeNull();
  });

  it('refuses more precision than the currency carries', () => {
    expect(moneyFromMajorUnits('96000.555', 'USD')).toBeNull();
  });

  it('refuses a grouped number, because the separators mean opposite things in two places', () => {
    expect(moneyFromMajorUnits('96,000', 'USD')).toBeNull();
    expect(moneyFromMajorUnits('96.000,50', 'EUR')).toBeNull();
  });

  it('refuses a negative amount, sign and all', () => {
    expect(moneyFromMajorUnits('-96000', 'USD')).toBeNull();
  });

  it('refuses text, an empty string and a point with nothing after it', () => {
    expect(moneyFromMajorUnits('', 'USD')).toBeNull();
    expect(moneyFromMajorUnits('ninety six thousand', 'USD')).toBeNull();
    expect(moneyFromMajorUnits('96000.', 'USD')).toBeNull();
    expect(moneyFromMajorUnits('.50', 'USD')).toBeNull();
  });

  it('reads zero, and leaves what a zero salary means to the caller', () => {
    expect(moneyFromMajorUnits('0', 'USD')?.amount).toBe(0n);
  });

  it('ignores the whitespace a paste brings with it', () => {
    expect(moneyFromMajorUnits('  96000  ', 'USD')?.amount).toBe(9600000n);
  });

  it('refuses an unknown currency rather than guessing how many minor units it has', () => {
    expect(moneyFromMajorUnits('96000', 'XYZ')).toBeNull();
  });

  it('is exact past Number.MAX_SAFE_INTEGER, which is the reason it parses rather than multiplies', () => {
    expect(moneyFromMajorUnits('90071992547409.91', 'USD')?.amount).toBe(9007199254740991n);
  });
});
