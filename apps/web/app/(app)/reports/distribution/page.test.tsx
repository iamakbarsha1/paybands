import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Distribution } from '../../../../lib/api-types';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('../../../../lib/use-api', () => ({ useApi: vi.fn() }));

const { useApi } = await import('../../../../lib/use-api');
const { default: DistributionPage } = await import('./page');

const report = vi.mocked(useApi);

const REPORT: Distribution = {
  groupBy: 'country',
  currency: 'USD',
  groups: [
    {
      key: 'GB',
      name: 'United Kingdom',
      headcount: 4,
      percentiles: { p25: '5000000', p50: '6000000', p75: '7000000', p90: '9000000' },
    },
    { key: 'JP', name: 'Japan', headcount: 1, percentiles: null },
  ],
};

/**
 * Four branches, because a screen that renders only the fourth is the one that breaks on the
 * day the API is slow, empty or down — and those are the days somebody is watching.
 */
describe('the distribution report', () => {
  beforeEach(() => {
    report.mockReset();
  });

  it('holds the shape of the page while the answer is coming', () => {
    report.mockReturnValue({ state: 'loading' });
    render(<DistributionPage />);

    expect(screen.getByRole('status', { name: 'Salary distribution' })).toBeDefined();
  });

  it("shows the API's own words when it fails", () => {
    report.mockReturnValue({ state: 'error', message: 'Could not reach the server. Try again.' });
    render(<DistributionPage />);

    expect(screen.getByRole('alert').textContent).toBe('Could not reach the server. Try again.');
  });

  // Never a blank space where a table was.
  it('says why there is nothing rather than showing nothing', () => {
    report.mockReturnValue({ state: 'ready', data: { ...REPORT, groups: [] } });
    render(<DistributionPage />);

    expect(screen.getByText(/nothing to compare/u)).toBeDefined();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('prints every group, including the one with no salaries', () => {
    report.mockReturnValue({ state: 'ready', data: REPORT });
    render(<DistributionPage />);

    const rows = screen.getAllByRole('row');
    // One header, two groups.
    expect(rows).toHaveLength(3);
    expect(screen.getAllByText('no salaries').length).toBeGreaterThan(0);
  });

  /**
   * The bars encode as width exactly what the table under them prints as figures. Announced,
   * they are the same report read twice, the second time as unlabelled divs — so they are
   * hidden, and the table is what a screen reader gets.
   */
  it('keeps the chart out of the accessibility tree, and the table in it', () => {
    report.mockReturnValue({ state: 'ready', data: REPORT });
    const { container } = render(<DistributionPage />);

    const hidden = container.querySelector('[aria-hidden="true"]');
    expect(hidden).not.toBeNull();
    expect(hidden?.textContent).toContain('United Kingdom');
    expect(screen.getByRole('table')).toBeDefined();
    // Still reachable, because the table is not hidden.
    expect(screen.getByRole('cell', { name: 'United Kingdom' })).toBeDefined();
  });
});
