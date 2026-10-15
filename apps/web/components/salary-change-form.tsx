'use client';

import { moneyFromMajorUnits, salaryChangeInput } from '@paybands/core';
import { useState, type FormEvent } from 'react';
import { api, ApiError } from '../lib/api';
import type { ReferenceData } from '../lib/api-types';
import { formatMoney } from '../lib/money';
import { Button } from './ui/button';
import { Failure } from './ui/state';
import { Field, Input } from './ui/field';

/**
 * A raise: a new record from a date, which closes the one it replaces. The amount is typed
 * the way a person says it — 96000, not 9600000 — and `moneyFromMajorUnits` moves the
 * decimal point, so the hundredfold mistake cannot be made by hand. What the record will
 * say is shown under the field before it is sent.
 *
 * The API's two refusals — a date at or before the open record, and a currency the timeline
 * does not use — are shown in its own words, because they say exactly what is wrong.
 */
export function SalaryChangeForm({
  employeeId,
  reference,
  currentCurrency,
  onSaved,
  onCancel,
}: {
  employeeId: number;
  reference: ReferenceData;
  /** The timeline's currency, which is the only one the API will accept after the first record. */
  currentCurrency: string | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [amount, setAmount] = useState('');
  const [currencyCode, setCurrencyCode] = useState(currentCurrency ?? 'USD');
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [reason, setReason] = useState<string>('merit');
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [refusal, setRefusal] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const preview = moneyFromMajorUnits(amount, currencyCode);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setErrors({});
    setRefusal(null);

    if (preview === null || preview.amount <= 0n) {
      setErrors({ amountMinor: 'A positive amount, like 96000 or 96000.50' });
      return;
    }

    const parsed = salaryChangeInput.safeParse({
      amountMinor: preview.amount.toString(),
      currencyCode,
      effectiveFrom,
      reason,
    });

    if (!parsed.success) {
      setErrors(
        Object.fromEntries(
          parsed.error.issues.map((issue) => [String(issue.path[0] ?? 'form'), issue.message]),
        ),
      );
      return;
    }

    setSaving(true);
    try {
      await api(`/employees/${String(employeeId)}/salary`, {
        method: 'POST',
        body: JSON.stringify(parsed.data),
      });
      onSaved();
    } catch (thrown: unknown) {
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
        <Field label="Amount" htmlFor="amount">
          <Input
            id="amount"
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            aria-invalid={errors['amountMinor'] !== undefined}
            placeholder="96000"
          />
          {errors['amountMinor'] === undefined ? (
            <p className="text-xs text-muted-foreground">
              {preview === null
                ? 'Digits, and at most the decimal places this currency has.'
                : `Recorded as ${formatMoney({ amountMinor: preview.amount.toString(), currencyCode: preview.currency })}`}
            </p>
          ) : (
            <p className="text-xs text-destructive">{errors['amountMinor']}</p>
          )}
        </Field>

        <Field label="Currency" htmlFor="currencyCode">
          <select
            id="currencyCode"
            value={currencyCode}
            onChange={(event) => setCurrencyCode(event.target.value)}
            className="h-10 w-full rounded-[var(--radius)] border border-border bg-background px-2 text-sm"
          >
            {reference.currencies.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Effective from" htmlFor="effectiveFrom">
          <Input
            id="effectiveFrom"
            type="date"
            value={effectiveFrom}
            onChange={(event) => setEffectiveFrom(event.target.value)}
            aria-invalid={errors['effectiveFrom'] !== undefined}
          />
          {errors['effectiveFrom'] !== undefined && (
            <p className="text-xs text-destructive">{errors['effectiveFrom']}</p>
          )}
        </Field>

        <Field label="Reason" htmlFor="reason">
          <select
            id="reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className="h-10 w-full rounded-[var(--radius)] border border-border bg-background px-2 text-sm"
          >
            {reference.salaryReasons.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {refusal !== null && <Failure>{refusal}</Failure>}

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Record the change'}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
