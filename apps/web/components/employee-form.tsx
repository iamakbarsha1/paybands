'use client';

import { employeeInput, employeePatch } from '@paybands/core';
import { useState, type FormEvent } from 'react';
import { ApiError } from '../lib/api';
import type { ReferenceData } from '../lib/api-types';
import { Button } from './ui/button';
import { Failure } from './ui/state';
import { Field, Input } from './ui/field';

/**
 * One form for a joiner and for an edit. The difference is what it sends: everything for a
 * joiner, and only the fields that changed for an edit — which is what makes the API's
 * "name at least one field" refusal mean something.
 *
 * It validates against `employeeInput` and `employeePatch` from `@paybands/core`, the same
 * two schemas the API validates with (decision 52), so the browser refuses what the server
 * would refuse and the round trip is spent on the answers only the server has.
 */

const FIELDS = [
  'employeeCode',
  'firstName',
  'lastName',
  'email',
  'gender',
  'countryCode',
  'departmentId',
  'jobLevelId',
  'hireDate',
  'terminationDate',
  'managerId',
] as const;

type FieldName = (typeof FIELDS)[number];
export type EmployeeFormValues = Record<FieldName, string>;

export const BLANK_EMPLOYEE: EmployeeFormValues = {
  employeeCode: '',
  firstName: '',
  lastName: '',
  email: '',
  gender: 'undisclosed',
  countryCode: '',
  departmentId: '',
  jobLevelId: '',
  hireDate: '',
  terminationDate: '',
  managerId: '',
};

/** An input holds a string. This is the one place they stop being strings. */
const TYPED: Record<FieldName, (raw: string) => unknown> = {
  employeeCode: (raw) => raw.trim(),
  firstName: (raw) => raw.trim(),
  lastName: (raw) => raw.trim(),
  email: (raw) => raw.trim(),
  gender: (raw) => raw,
  countryCode: (raw) => raw,
  departmentId: Number,
  jobLevelId: Number,
  hireDate: (raw) => raw,
  // Empty means "still here" and "no manager", which is a null the API takes, not an absence.
  terminationDate: (raw) => (raw === '' ? null : raw),
  managerId: (raw) => (raw === '' ? null : Number(raw)),
};

function bodyFrom(
  values: EmployeeFormValues,
  names: readonly FieldName[],
): Record<string, unknown> {
  return Object.fromEntries(names.map((name) => [name, TYPED[name](values[name])]));
}

export function EmployeeForm({
  reference,
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  reference: ReferenceData;
  /** Absent for a joiner. Present for an edit, and then only the differences are sent. */
  initial?: EmployeeFormValues;
  submitLabel: string;
  onSubmit: (body: Record<string, unknown>) => Promise<void>;
  onCancel?: () => void;
}) {
  const [values, setValues] = useState<EmployeeFormValues>(initial ?? BLANK_EMPLOYEE);
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [refusal, setRefusal] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function set(name: FieldName, value: string): void {
    setValues((current) => ({ ...current, [name]: value }));
  }

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setErrors({});
    setRefusal(null);

    const edited = FIELDS.filter((name) => initial === undefined || values[name] !== initial[name]);
    const parsed =
      initial === undefined
        ? employeeInput.safeParse(bodyFrom(values, FIELDS))
        : employeePatch.safeParse(bodyFrom(values, edited));

    if (!parsed.success) {
      setErrors(
        Object.fromEntries(
          parsed.error.issues.map((issue) => [String(issue.path[0] ?? 'form'), issue.message]),
        ),
      );
      // A refusal with no field to sit under — an edit that changed nothing is the one.
      setRefusal(parsed.error.issues.find((issue) => issue.path.length === 0)?.message ?? null);
      return;
    }

    setSaving(true);
    try {
      await onSubmit(parsed.data);
    } catch (thrown: unknown) {
      // The API's own words: it names the code or address somebody already holds, or the
      // row a department id does not match. Rewriting those loses the detail.
      setRefusal(
        thrown instanceof ApiError ? thrown.message : 'Could not reach the server. Try again.',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="space-y-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Text
          name="employeeCode"
          label="Employee number"
          values={values}
          errors={errors}
          set={set}
        />
        <Text name="email" label="Email" type="email" values={values} errors={errors} set={set} />
        <Text name="firstName" label="First name" values={values} errors={errors} set={set} />
        <Text name="lastName" label="Last name" values={values} errors={errors} set={set} />

        <Choice
          name="gender"
          label="Gender"
          values={values}
          errors={errors}
          set={set}
          options={reference.genders.map((gender) => ({ value: gender, label: gender }))}
        />
        <Choice
          name="countryCode"
          label="Country"
          values={values}
          errors={errors}
          set={set}
          options={reference.countries.map((row) => ({ value: row.code, label: row.name }))}
        />
        <Choice
          name="departmentId"
          label="Department"
          values={values}
          errors={errors}
          set={set}
          options={reference.departments.map((row) => ({
            value: String(row.id),
            label: row.name,
          }))}
        />
        <Choice
          name="jobLevelId"
          label="Job level"
          values={values}
          errors={errors}
          set={set}
          options={reference.jobLevels.map((row) => ({ value: String(row.id), label: row.name }))}
        />

        <Text
          name="hireDate"
          label="Hire date"
          type="date"
          values={values}
          errors={errors}
          set={set}
        />
        <Text
          name="terminationDate"
          label="Leaving date (blank if still here)"
          type="date"
          values={values}
          errors={errors}
          set={set}
        />
        <Text
          name="managerId"
          label="Manager's employee id (optional)"
          type="number"
          values={values}
          errors={errors}
          set={set}
        />
      </div>

      {refusal !== null && <Failure>{refusal}</Failure>}

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={saving}>
          {saving ? 'Saving…' : submitLabel}
        </Button>
        {onCancel !== undefined && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}

type ControlProps = {
  name: FieldName;
  label: string;
  values: EmployeeFormValues;
  errors: Partial<Record<string, string>>;
  set: (name: FieldName, value: string) => void;
};

function Text({
  name,
  label,
  type = 'text',
  values,
  errors,
  set,
}: ControlProps & { type?: string }) {
  const error = errors[name];

  return (
    <Field label={label} htmlFor={name}>
      <Input
        id={name}
        name={name}
        type={type}
        value={values[name]}
        onChange={(event) => set(name, event.target.value)}
        aria-invalid={error !== undefined}
        aria-describedby={error === undefined ? undefined : `${name}-error`}
      />
      <FieldError name={name} message={error} />
    </Field>
  );
}

function Choice({
  name,
  label,
  values,
  errors,
  set,
  options,
}: ControlProps & { options: readonly { value: string; label: string }[] }) {
  const error = errors[name];

  return (
    <Field label={label} htmlFor={name}>
      <select
        id={name}
        name={name}
        value={values[name]}
        onChange={(event) => set(name, event.target.value)}
        aria-invalid={error !== undefined}
        aria-describedby={error === undefined ? undefined : `${name}-error`}
        className="h-10 w-full rounded-[var(--radius)] border border-border bg-background px-2 text-sm"
      >
        <option value="">Choose…</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <FieldError name={name} message={error} />
    </Field>
  );
}

function FieldError({ name, message }: { name: string; message: string | undefined }) {
  if (message === undefined) return null;

  return (
    <p id={`${name}-error`} className="text-xs text-destructive">
      {message}
    </p>
  );
}
