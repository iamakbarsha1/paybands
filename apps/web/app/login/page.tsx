'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button } from '../../components/ui/button';
import { Field, Input } from '../../components/ui/field';
import { api, ApiError } from '../../lib/api';
import type { SessionUser } from '../../lib/api-types';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      await api<SessionUser>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      router.push('/employees');
    } catch (thrown) {
      // The API answers a wrong password and an unknown address with the same words, and
      // this shows them unchanged. Saying "no such user" here would undo that.
      setError(
        thrown instanceof ApiError ? thrown.message : 'Could not reach the server. Try again.',
      );
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <h1 className="text-2xl font-semibold">paybands</h1>
      <p className="mt-1 text-sm text-muted-foreground">Sign in to see the pay data.</p>

      <form
        onSubmit={(event) => {
          void submit(event);
        }}
        className="mt-8 space-y-4"
        noValidate
      >
        <Field label="Email" htmlFor="email">
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </Field>

        <Field label="Password" htmlFor="password">
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </Field>

        {error !== null && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </main>
  );
}
