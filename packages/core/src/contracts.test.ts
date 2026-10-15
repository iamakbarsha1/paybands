import { describe, expect, it } from 'vitest';
import { employeeInput, employeePatch, salaryChangeInput } from './index';

const joiner = {
  employeeCode: 'E-10001',
  firstName: 'Mira',
  lastName: 'Okonkwo',
  email: 'mira.okonkwo@paybands.example',
  gender: 'female',
  hireDate: '2026-11-02',
  countryCode: 'GB',
  departmentId: 3,
  jobLevelId: 4,
};

describe('employeeInput', () => {
  it('accepts a joiner with every required field', () => {
    expect(employeeInput.safeParse(joiner).success).toBe(true);
  });

  it('accepts a termination date, and a null one for somebody still here', () => {
    expect(employeeInput.safeParse({ ...joiner, terminationDate: '2027-04-01' }).success).toBe(
      true,
    );
    expect(employeeInput.safeParse({ ...joiner, terminationDate: null }).success).toBe(true);
  });

  it('refuses an address that is not one', () => {
    expect(employeeInput.safeParse({ ...joiner, email: 'mira at paybands' }).success).toBe(false);
  });

  it('refuses a country that is not a two-letter code', () => {
    expect(employeeInput.safeParse({ ...joiner, countryCode: 'GBR' }).success).toBe(false);
  });

  it('refuses an employee code that is empty or longer than the column', () => {
    expect(employeeInput.safeParse({ ...joiner, employeeCode: '' }).success).toBe(false);
    expect(employeeInput.safeParse({ ...joiner, employeeCode: 'E'.repeat(33) }).success).toBe(
      false,
    );
  });

  it('refuses a gender outside the four the domain records', () => {
    expect(employeeInput.safeParse({ ...joiner, gender: 'f' }).success).toBe(false);
  });

  it('refuses a hire date written the way a person writes one', () => {
    expect(employeeInput.safeParse({ ...joiner, hireDate: '02/11/2026' }).success).toBe(false);
  });

  it('refuses a field nobody declared rather than dropping it on the way to the database', () => {
    expect(employeeInput.safeParse({ ...joiner, salary: '96000' }).success).toBe(false);
  });

  it('refuses a department or level id that cannot be a row', () => {
    expect(employeeInput.safeParse({ ...joiner, departmentId: 0 }).success).toBe(false);
    expect(employeeInput.safeParse({ ...joiner, jobLevelId: -4 }).success).toBe(false);
  });
});

describe('employeePatch', () => {
  it('accepts one field on its own', () => {
    expect(employeePatch.safeParse({ jobLevelId: 5 }).success).toBe(true);
  });

  it('refuses an edit that names no field, which is a mistake rather than a no-op', () => {
    const refusal = employeePatch.safeParse({});
    expect(refusal.success).toBe(false);
    expect(refusal.error?.issues[0]?.message).toBe('name at least one field');
  });

  it('still refuses a bad value in the one field it names', () => {
    expect(employeePatch.safeParse({ email: 'not-an-address' }).success).toBe(false);
  });

  it('refuses a field nobody declared', () => {
    expect(employeePatch.safeParse({ salary: '96000' }).success).toBe(false);
  });
});

describe('salaryChangeInput', () => {
  const raise = {
    amountMinor: '9600000',
    currencyCode: 'USD',
    effectiveFrom: '2027-01-01',
    reason: 'merit',
  };

  it('accepts minor units as a positive whole number in a string', () => {
    expect(salaryChangeInput.safeParse(raise).success).toBe(true);
  });

  it('refuses zero and anything below it', () => {
    expect(salaryChangeInput.safeParse({ ...raise, amountMinor: '0' }).success).toBe(false);
    expect(salaryChangeInput.safeParse({ ...raise, amountMinor: '-9600000' }).success).toBe(false);
  });

  it('refuses minor units with a decimal point, which means the major units arrived instead', () => {
    expect(salaryChangeInput.safeParse({ ...raise, amountMinor: '96000.00' }).success).toBe(false);
  });

  it('refuses a currency the domain does not carry', () => {
    expect(salaryChangeInput.safeParse({ ...raise, currencyCode: 'XYZ' }).success).toBe(false);
  });

  it('refuses a date that is not a calendar day', () => {
    expect(salaryChangeInput.safeParse({ ...raise, effectiveFrom: '2027-01' }).success).toBe(false);
  });

  it('refuses a reason outside the four a record can carry', () => {
    expect(salaryChangeInput.safeParse({ ...raise, reason: 'raise' }).success).toBe(false);
  });

  it('names the unit in the message, because a 400 on this field is usually a factor of a hundred', () => {
    const refusal = salaryChangeInput.safeParse({ ...raise, amountMinor: '96000.00' });
    expect(refusal.error?.issues[0]?.message).toBe('minor units, a positive whole number');
  });
});
