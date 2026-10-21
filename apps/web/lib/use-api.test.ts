import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from './api';
import type * as ApiModule from './api';
import { useApi } from './use-api';

vi.mock('./api', async () => {
  // Only `api` is replaced: `ApiError` stays the real class, so `instanceof` still decides
  // which message the hook shows.
  const actual = await vi.importActual<typeof ApiModule>('./api');
  return { ...actual, api: vi.fn() };
});

const { api } = await import('./api');
const fetched = vi.mocked(api);

describe('useApi', () => {
  beforeEach(() => {
    fetched.mockReset();
  });

  it('starts loading and ends ready', async () => {
    fetched.mockResolvedValue({ ok: true });

    const { result } = renderHook(() => useApi<{ ok: boolean }>('/thing'));
    expect(result.current.state).toBe('loading');

    await waitFor(() => {
      expect(result.current).toEqual({ state: 'ready', data: { ok: true } });
    });
  });

  it("reports the API's own words when it refuses", async () => {
    fetched.mockRejectedValue(new ApiError(400, 'that is not an email address'));

    const { result } = renderHook(() => useApi('/thing'));

    await waitFor(() => {
      expect(result.current).toEqual({
        state: 'error',
        message: 'that is not an email address',
      });
    });
  });

  // A `TypeError` from `fetch` carries "Failed to fetch", which is not a sentence to show
  // somebody. Anything that is not an `ApiError` has to become this app's own words.
  it('does not show a network failure its own message', async () => {
    fetched.mockRejectedValue(new TypeError('Failed to fetch'));

    const { result } = renderHook(() => useApi('/thing'));

    await waitFor(() => {
      expect(result.current).toEqual({
        state: 'error',
        message: 'Could not reach the server. Try again.',
      });
    });
  });

  it('drops the answer to a path it is no longer asking about', async () => {
    let land = (_: unknown): void => undefined;
    const slow = new Promise<unknown>((resolve) => {
      land = resolve;
    });
    fetched.mockReturnValueOnce(slow).mockResolvedValue({ which: 'second' });

    const { result, rerender } = renderHook(({ path }: { path: string }) => useApi(path), {
      initialProps: { path: '/first' },
    });

    rerender({ path: '/second' });
    await waitFor(() => {
      expect(result.current).toEqual({ state: 'ready', data: { which: 'second' } });
    });

    // The first request lands late. The screen is on another path, so it must not change.
    land({ which: 'first' });
    await Promise.resolve();
    expect(result.current).toEqual({ state: 'ready', data: { which: 'second' } });
  });
});
