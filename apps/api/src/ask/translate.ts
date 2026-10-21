import { z } from 'zod';
import { askQuery, type AskQuery } from '@paybands/core';

/**
 * The whole of what this module asks a language model to do: take the rendered prompt and
 * return its raw text, or null when it produced no text at all. The implementation arrives
 * in `PB-068`; nothing here reads a key or makes a call, which is what keeps the suite fast
 * and the model out of the arithmetic.
 */
export type Complete = (prompt: string) => Promise<string | null>;

/**
 * Accepted or refused, never thrown. A question the reports cannot answer is an ordinary
 * outcome with a reason on it, not an error — rejected rather than retried into submission
 * (`docs/design-notes.md` §7).
 */
export type Translation =
  | { readonly accepted: true; readonly query: AskQuery }
  | { readonly accepted: false; readonly reason: string };

const REPORTS = askQuery.options.map((member) => member.shape.report.value).join(', ');

/**
 * Rendered from `askQuery` rather than written out here. A prompt holding its own copy of
 * the shape stops matching the parser the first time a report gains a parameter, and the
 * drift shows up as a refusal nobody can explain.
 */
const SCHEMA = JSON.stringify(z.toJSONSchema(askQuery));

function promptFor(question: string): string {
  return [
    `Turn the question into a query against one of these reports: ${REPORTS}.`,
    'Answer with one JSON object and nothing else: no prose, no code fence.',
    'The object must match this JSON Schema:',
    SCHEMA,
    `Question: ${question}`,
  ].join('\n\n');
}

export async function translate(question: string, complete: Complete): Promise<Translation> {
  const answer = await complete(promptFor(question));
  if (answer === null || answer.trim() === '') {
    return { accepted: false, reason: 'The model returned no answer to read.' };
  }

  let json: unknown;
  try {
    json = JSON.parse(answer);
  } catch {
    return { accepted: false, reason: 'The model did not answer with JSON.' };
  }

  const parsed = askQuery.safeParse(json);
  if (!parsed.success) {
    return {
      accepted: false,
      reason: `The answer is not a query these reports take. ${z.prettifyError(parsed.error)}`,
    };
  }

  return { accepted: true, query: parsed.data };
}
