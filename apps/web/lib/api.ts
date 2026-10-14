/**
 * One way to reach the API. Every call sends the session cookie and every non-2xx answer
 * becomes an `ApiError` carrying its status, so a screen can tell "signed out" from "broken"
 * without reading response bodies itself.
 */

const BASE = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** The one a screen acts on rather than reports: send them to the login page. */
  get signedOut(): boolean {
    return this.status === 401;
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined) headers.set('content-type', 'application/json');

  const response = await fetch(`${BASE}${path}`, {
    ...init,
    // The session is an HttpOnly cookie, so it travels on the request or not at all.
    credentials: 'include',
    headers,
  });

  if (!response.ok) {
    throw new ApiError(response.status, await messageOf(response));
  }

  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}

async function messageOf(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: unknown };
    return typeof body.message === 'string' ? body.message : response.statusText;
  } catch {
    // A body that is not JSON is a proxy or a crash, and its text is not for a user to read.
    return response.statusText;
  }
}
