/**
 * The shape a write has to have, declared once because two layers enforce it: the API at
 * its boundary, and the browser before it sends anything (decision 52). zod is the only
 * dependency `packages/core` carries, and it validates data — it reaches no framework, no
 * network and no database, so the boundary decision 4 draws is intact.
 */

import { z } from 'zod';
import { GENDERS, isCurrencyCode, SALARY_REASONS } from './domain';

/** A calendar day, not a timestamp: the columns behind these are `date`. */
const day = z.iso.date();

export const employeeInput = z.strictObject({
  employeeCode: z.string().min(1).max(32),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.email(),
  gender: z.enum(GENDERS),
  hireDate: day,
  terminationDate: day.nullable().optional(),
  countryCode: z.string().length(2),
  departmentId: z.number().int().positive(),
  jobLevelId: z.number().int().positive(),
  managerId: z.number().int().positive().nullable().optional(),
});

// An edit that names no field is a mistake worth a 400, not a no-op that answers 200.
export const employeePatch = employeeInput
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, { message: 'name at least one field' });

export const salaryChangeInput = z.strictObject({
  // A string, for the same reason the response sends one: this is money in minor units.
  amountMinor: z.string().regex(/^[1-9]\d*$/u, 'minor units, a positive whole number'),
  currencyCode: z.string().refine(isCurrencyCode, 'unknown currency'),
  effectiveFrom: day,
  reason: z.enum(SALARY_REASONS),
});

export type EmployeeInput = z.infer<typeof employeeInput>;
export type EmployeePatch = z.infer<typeof employeePatch>;
export type SalaryChangeInput = z.infer<typeof salaryChangeInput>;
