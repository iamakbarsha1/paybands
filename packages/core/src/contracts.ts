/**
 * The shape a write has to have, declared once because two layers enforce it: the API at
 * its boundary, and the browser before it sends anything (decision 52). zod is the only
 * dependency `packages/core` carries, and it validates data — it reaches no framework, no
 * network and no database, so the boundary decision 4 draws is intact.
 */

import { z } from 'zod';
import { GENDERS, isCurrencyCode, SALARY_REASONS } from './domain';

/** A calendar day, not a timestamp: the columns behind these are `date`. */
const day = z.iso.date('a date like 2026-11-02');

/**
 * The messages are written for the person filling the form in, because that is who reads
 * them now: the browser shows them under the field, and the API sends the same words back
 * to anyone posting by hand.
 */
export const employeeInput = z.strictObject({
  employeeCode: z
    .string()
    .min(1, 'an employee number is required')
    .max(32, 'at most 32 characters'),
  firstName: z.string().min(1, 'a first name is required'),
  lastName: z.string().min(1, 'a last name is required'),
  email: z.email('that is not an email address'),
  gender: z.enum(GENDERS),
  hireDate: day,
  terminationDate: day.nullable().optional(),
  countryCode: z.string().length(2, 'choose a country'),
  departmentId: z.number().int().positive('choose a department'),
  jobLevelId: z.number().int().positive('choose a job level'),
  managerId: z
    .number()
    .int()
    .positive('a manager is an employee id, or leave it empty')
    .nullable()
    .optional(),
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
