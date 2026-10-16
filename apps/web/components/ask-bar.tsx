'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { api, ApiError } from '../lib/api';
import type { AskAnswer, AskQuery, Health } from '../lib/api-types';
import { useApi } from '../lib/use-api';
import { Button } from './ui/button';
import { Field, Input } from './ui/field';
import { Failure } from './ui/state';

/**
 * A question in English over the five reports. The server translates it and runs it; this
 * bar says what the question was understood to mean and opens the screen that answers it in
 * full (PB-D09).
 *
 * ponytail: the report screen fetches its rows again rather than this bar rendering the
 * `result` that came back beside the query — rendering it here would be a second copy of
 * five report layouts that could then disagree with the first. Render it inline the day a
 * question costs more than the page load it saves.
 */

type Asked =
  | { readonly state: 'idle' }
  | { readonly state: 'asking' }
  | { readonly state: 'declined'; readonly message: string }
  | { readonly state: 'answered'; readonly query: AskQuery };

const GROUP = { country: 'country', department: 'department', level: 'job level' } as const;

export function AskBar() {
  const health = useApi<Health>('/health');
  const [question, setQuestion] = useState('');
  const [asked, setAsked] = useState<Asked>({ state: 'idle' });

  async function ask(event: FormEvent): Promise<void> {
    event.preventDefault();
    setAsked({ state: 'asking' });

    try {
      const answer = await api<AskAnswer>('/ask', {
        method: 'POST',
        body: JSON.stringify({ question }),
      });
      setAsked({ state: 'answered', query: answer.query });
    } catch (thrown: unknown) {
      // A refused question (422) and a server without a key (503) both arrive with a
      // sentence written for this box, so both are shown rather than translated again.
      setAsked({
        state: 'declined',
        message:
          thrown instanceof ApiError ? thrown.message : 'Could not reach the server. Try again.',
      });
    }
  }

  // The flag belongs to the server: a feature it was started without is not on this page at
  // all, rather than a box that answers 503 to everyone who types in it.
  if (health.state !== 'ready' || !health.data.ask) return null;

  return (
    <form
      onSubmit={(event) => void ask(event)}
      className="space-y-3 rounded-[var(--radius)] border border-border p-4"
    >
      <Field label="Ask a question" htmlFor="question">
        <div className="flex gap-2">
          <Input
            id="question"
            name="question"
            autoComplete="off"
            placeholder="Which department has the widest pay gap?"
            value={question}
            onChange={(event) => {
              setQuestion(event.target.value);
            }}
          />
          <Button
            type="submit"
            className="shrink-0"
            disabled={question.trim() === '' || asked.state === 'asking'}
          >
            {asked.state === 'asking' ? 'Asking…' : 'Ask'}
          </Button>
        </div>
      </Field>

      {/* The disclosure is here rather than in a policy page nobody opens: this is the one
          box in the app whose contents leave for a third party (PB-074). */}
      <p className="text-xs text-muted-foreground">
        Your question is sent to Anthropic&rsquo;s Claude, which picks one of the five reports and
        its filters. No salary, name or row is sent with it, and the numbers are the reports&rsquo;
        own — the model chooses the question, never the arithmetic. Type nothing here you would not
        send to a third party.
      </p>

      {asked.state === 'declined' && <Failure>{asked.message}</Failure>}

      {asked.state === 'answered' && <Understood query={asked.query} />}
    </form>
  );
}

/** `role="status"` so the answer is read where it appears, under the box that was typed in. */
function Understood({ query }: { query: AskQuery }) {
  const report = reportFor(query);

  return (
    <p role="status" className="text-sm">
      Claude understood this as <span className="font-medium">{report.sentence}</span>.{' '}
      <Link href={report.href} className="underline">
        Open the report
      </Link>
    </p>
  );
}

/**
 * Every query names a report screen and the query string that screen already reads, so the
 * sentence and the link cannot describe different things. A switch rather than a table: a
 * sixth report added to `AskQuery` leaves this unable to return, and the compiler says so.
 */
function reportFor(query: AskQuery): { sentence: string; href: string } {
  switch (query.report) {
    case 'bands': {
      // Both filters are optional and the route takes them as they are: a two-letter code
      // and a positive integer, neither of which needs escaping.
      const filters = [
        query.country === undefined ? null : `country=${query.country}`,
        query.level === undefined ? null : `level=${String(query.level)}`,
      ].filter((filter) => filter !== null);

      const said = [
        'pay bands',
        query.country === undefined ? null : `in ${query.country}`,
        query.level === undefined ? null : `at level ${String(query.level)}`,
      ].filter((part) => part !== null);

      return {
        sentence: said.join(' '),
        href: filters.length === 0 ? '/reports/bands' : `/reports/bands?${filters.join('&')}`,
      };
    }
    case 'distribution':
      return {
        sentence: `salary distribution by ${GROUP[query.groupBy]}`,
        href: `/reports/distribution?groupBy=${query.groupBy}`,
      };
    case 'comp-ratio':
      return {
        sentence: `comp ratio by ${GROUP[query.groupBy]}`,
        href: `/reports/comp-ratio?groupBy=${query.groupBy}`,
      };
    case 'pay-gap':
      return {
        sentence: `the gender pay gap by ${GROUP[query.groupBy]}`,
        href: `/reports/pay-gap?groupBy=${query.groupBy}`,
      };
    case 'outliers':
      return { sentence: 'the people outside their band', href: '/reports/outliers' };
  }
}
