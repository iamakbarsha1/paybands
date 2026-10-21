import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../lib/api';
import type { ReferenceData } from '../lib/api-types';
import { EmployeeForm, type EmployeeFormValues } from './employee-form';

const REFERENCE: ReferenceData = {
  currencies: ['USD'],
  genders: ['female', 'male', 'other', 'undisclosed'],
  salaryReasons: ['hire', 'merit', 'promotion', 'market'],
  countries: [{ code: 'GB', name: 'United Kingdom' }],
  departments: [{ id: 1, name: 'Engineering' }],
  jobLevels: [{ id: 2, name: 'L2' }],
};

const FILLED: EmployeeFormValues = {
  employeeCode: 'E-1',
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@paybands.example',
  gender: 'female',
  countryCode: 'GB',
  departmentId: '1',
  jobLevelId: '2',
  hireDate: '2024-03-01',
  terminationDate: '',
  managerId: '',
};

function form(overrides: Partial<Parameters<typeof EmployeeForm>[0]> = {}) {
  const onSubmit = vi.fn<(body: Record<string, unknown>) => Promise<void>>();
  onSubmit.mockResolvedValue(undefined);

  render(
    <EmployeeForm reference={REFERENCE} submitLabel="Save" onSubmit={onSubmit} {...overrides} />,
  );

  return { onSubmit };
}

describe('EmployeeForm', () => {
  it('refuses an empty joiner without asking the server', async () => {
    const { onSubmit } = form();

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('an employee number is required')).toBeDefined();
  });

  /**
   * The point of `aria-describedby`: a screen reader reaches the error through the field it
   * belongs to. Without it, `aria-invalid` says something is wrong and nothing says what —
   * a different failure from the one a sighted person gets.
   */
  it('points every invalid field at its own message, selects included', async () => {
    form();

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    const invalid = [...document.querySelectorAll<HTMLElement>('[aria-invalid="true"]')];
    expect(invalid.length).toBeGreaterThan(0);
    expect(invalid.some((control) => control.tagName === 'SELECT')).toBe(true);

    for (const control of invalid) {
      const described = control.getAttribute('aria-describedby');
      expect(described).toBe(`${control.id}-error`);
      expect(document.getElementById(described ?? '')?.textContent).toBeTruthy();
    }
  });

  it('sends only the field an edit changed', async () => {
    const { onSubmit } = form({ initial: FILLED });

    // `initial` makes it an edit, so one field has to change for there to be a patch.
    await userEvent.clear(screen.getByLabelText('First name'));
    await userEvent.type(screen.getByLabelText('First name'), 'Grace');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSubmit).toHaveBeenCalledWith({ firstName: 'Grace' });
  });

  // The API refuses a patch that names no field, and so does this form: the round trip is
  // spent on the answers only the server has.
  it('refuses an edit that changed nothing', async () => {
    const { onSubmit } = form({ initial: FILLED });

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain('name at least one field');
  });

  it("shows the server's own words when the browser was happy and it was not", async () => {
    const onSubmit = vi.fn<(body: Record<string, unknown>) => Promise<void>>();
    onSubmit.mockRejectedValue(new ApiError(409, 'that employee number is taken'));

    render(
      <EmployeeForm
        reference={REFERENCE}
        initial={FILLED}
        submitLabel="Save"
        onSubmit={onSubmit}
      />,
    );

    await userEvent.clear(screen.getByLabelText('First name'));
    await userEvent.type(screen.getByLabelText('First name'), 'Grace');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect((await screen.findByRole('alert')).textContent).toBe('that employee number is taken');
  });

  it('does not show a network failure its own message', async () => {
    const onSubmit = vi.fn<(body: Record<string, unknown>) => Promise<void>>();
    onSubmit.mockRejectedValue(new TypeError('Failed to fetch'));

    render(
      <EmployeeForm
        reference={REFERENCE}
        initial={FILLED}
        submitLabel="Save"
        onSubmit={onSubmit}
      />,
    );

    await userEvent.clear(screen.getByLabelText('First name'));
    await userEvent.type(screen.getByLabelText('First name'), 'Grace');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Could not reach the server. Try again.',
    );
  });
});
