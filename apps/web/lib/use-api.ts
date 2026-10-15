'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from './api';

export type Loaded<T> =
  | { readonly state: 'loading' }
  | { readonly state: 'error'; readonly message: string }
  | { readonly state: 'ready'; readonly data: T };

/**
 * One fetch, one of three answers. Screens render all three rather than treating loading
 * and empty as the same blank page (PB-059).
 *
 * `path` is the dependency: a screen that changes its filters changes its path, and the
 * stale answer from the previous one is dropped rather than raced.
 *
 * `reloadKey` is for the case the path cannot express: a write on this screen changes what
 * the same path answers. The screen bumps the number and gets the new answer.
 */
export function useApi<T>(path: string, reloadKey = 0): Loaded<T> {
  const [result, setResult] = useState<Loaded<T>>({ state: 'loading' });

  useEffect(() => {
    let live = true;
    setResult({ state: 'loading' });

    api<T>(path)
      .then((data) => {
        if (live) setResult({ state: 'ready', data });
      })
      .catch((thrown: unknown) => {
        if (!live) return;
        setResult({
          state: 'error',
          message:
            thrown instanceof ApiError ? thrown.message : 'Could not reach the server. Try again.',
        });
      });

    return () => {
      live = false;
    };
  }, [path, reloadKey]);

  return result;
}
