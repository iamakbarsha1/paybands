import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as ApiModule from '../lib/api';
import type { Health } from '../lib/api-types';

vi.mock('../lib/api', async () => {
  // Only `api` is replaced: `ApiError` stays the real class, so `instanceof` still decides
  // whether the bar shows the server's sentence or its own.
  const actual = await vi.importActual<typeof ApiModule>('../lib/api');
  return { ...actual, api: vi.fn() };
});
vi.mock('../lib/use-api', () => ({ useApi: vi.fn() }));

const { api, ApiError } = await import('../lib/api');
const { useApi } = await import('../lib/use-api');
const { AskBar } = await import('./ask-bar');

const asked = vi.mocked(api);
const health = vi.mocked(useApi);

function serverSays(ask: boolean): void {
  health.mockReturnValue({ state: 'ready', data: { status: 'ok', ask } satisfies Health });
}

async function ask(question = 'which department pays most'): Promise<void> {
  await userEvent.type(screen.getByLabelText('Ask a question'), question);
  await userEvent.click(screen.getByRole('button', { name: 'Ask' }));
}

describe('AskBar', () => {
  beforeEach(() => {
    asked.mockReset();
    health.mockReset();
  });

  // The flag belongs to the server. A box that answers 503 to everyone who types in it is
  // worse than no box.
  it('is not on the page at all when the server has no key', () => {
    serverSays(false);
    const { container } = render(<AskBar />);
    expect(container.firstChild).toBeNull();
  });

  it('is not on the page while the server is still being asked', () => {
    health.mockReturnValue({ state: 'loading' });
    const { container } = render(<AskBar />);
    expect(container.firstChild).toBeNull();
  });

  it('says what the question was understood as, and links to the report that answers it', async () => {
    serverSays(true);
    asked.mockResolvedValue({ query: { report: 'pay-gap', groupBy: 'department' }, result: {} });

    render(<AskBar />);
    await ask();

    const said = await screen.findByRole('status');
    expect(said.textContent).toContain('the gender pay gap by department');
    expect(screen.getByRole('link', { name: 'Open the report' }).getAttribute('href')).toBe(
      '/reports/pay-gap?groupBy=department',
    );
  });

  it('carries both band filters into the link when the query names them', async () => {
    serverSays(true);
    asked.mockResolvedValue({
      query: { report: 'bands', country: 'GB', level: 3 },
      result: {},
    });

    render(<AskBar />);
    await ask();

    expect(
      (await screen.findByRole('link', { name: 'Open the report' })).getAttribute('href'),
    ).toBe('/reports/bands?country=GB&level=3');
  });

  // A refused question (422) and a server without a key (503) both arrive with a sentence
  // written for this box. Rewriting either loses the reason.
  it("shows the server's own refusal", async () => {
    serverSays(true);
    asked.mockRejectedValue(new ApiError(422, 'These reports cannot answer that.'));

    render(<AskBar />);
    await ask();

    expect((await screen.findByRole('alert')).textContent).toBe(
      'These reports cannot answer that.',
    );
  });

  it('does not show a network failure its own message', async () => {
    serverSays(true);
    asked.mockRejectedValue(new TypeError('Failed to fetch'));

    render(<AskBar />);
    await ask();

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Could not reach the server. Try again.',
    );
  });

  it('says the question leaves for a third party, above the box', () => {
    serverSays(true);
    render(<AskBar />);
    expect(screen.getByText(/sent to Anthropic/u)).toBeDefined();
  });

  it('will not send an empty question', () => {
    serverSays(true);
    render(<AskBar />);
    expect(screen.getByRole('button', { name: 'Ask' }).hasAttribute('disabled')).toBe(true);
  });
});
