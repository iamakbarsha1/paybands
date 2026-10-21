'use client';

import type { Role, SessionUser } from './api-types';
import { useApi } from './use-api';

/**
 * What this session may do, for screens deciding whether to offer a write at all.
 *
 * It decides nothing: the API enforces the same role on every write it serves, and a screen
 * that drew the button anyway gets a 403. This is only so an analyst is not offered a form
 * that fills in and then fails.
 *
 * `admin` while the answer is still coming, because the alternative flashes the read-only
 * page at the administrator who is about to be allowed everything. The write is still
 * refused if the guess is wrong.
 */
export function useRole(): Role {
  const session = useApi<SessionUser>('/auth/me');
  return session.state === 'ready' ? session.data.user.role : 'admin';
}
