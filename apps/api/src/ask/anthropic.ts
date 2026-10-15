import Anthropic from '@anthropic-ai/sdk';
import type { Complete } from './translate';

/**
 * The `Complete` a server runs with when it was given a key. Built where the app is composed
 * and handed in, so nothing from here down reads the environment and every test drives the
 * real registration with a fake instead.
 */
export function anthropicComplete(apiKey: string): Complete {
  const client = new Anthropic({ apiKey });

  return async (prompt) => {
    let response: Anthropic.Message;
    try {
      response = await client.messages.create({
        model: 'claude-opus-5',
        // The answer is one small JSON object, with nothing to say around it.
        max_tokens: 1024,
        // Turning a question into a query is the simplest thing this model is ever asked to
        // do. Low effort is the lever that costs less; disabling thinking is not, because on
        // this model it can put a tool call into visible text and leak tags into the answer.
        output_config: { effort: 'low' },
        messages: [{ role: 'user', content: prompt }],
      });
    } catch (error) {
      throw new Error(reasonFor(error), { cause: error });
    }

    // Read before the content, because a model that declines has no content worth reading.
    // `translate` already has a refusal for an answer that is not there.
    if (response.stop_reason === 'refusal') return null;

    // `content` is a discriminated union and text is the only kind this call asks for.
    const text = response.content
      .flatMap((block) => (block.type === 'text' ? [block.text] : []))
      .join('');

    return text === '' ? null : text;
  };
}

/**
 * The SDK's own classes, most specific first, never a match on a message. A rejected key, a
 * throttled one and everything else are three different things for whoever reads the log,
 * and the sentence is this module's so the line stays the same as the SDK's wording moves.
 * The cause keeps the SDK's detail; neither carries the key, which it does not echo.
 */
function reasonFor(error: unknown): string {
  if (error instanceof Anthropic.AuthenticationError) {
    return 'the model API rejected the key this server was started with';
  }
  if (error instanceof Anthropic.RateLimitError) return 'the model API is rate limiting this key';
  if (error instanceof Anthropic.APIError) return `the model API answered ${String(error.status)}`;
  return 'the model call failed';
}
