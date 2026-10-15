import Anthropic from '@anthropic-ai/sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { anthropicComplete, completeWith } from './anthropic';

/** Recognisable enough that a substring check for it means something. */
const KEY = 'sk-ant-notarealkey-0123456789';

const text = (value: string): Anthropic.TextBlock => ({ type: 'text', text: value, citations: null });

/** Reasoning is on at this effort, so a block that is not text is the ordinary case. */
const thinking: Anthropic.ThinkingBlock = {
  type: 'thinking',
  thinking: 'which report answers this',
  signature: 'signed',
};

/**
 * A response as the SDK hands one over. The adapter reads `stop_reason` and `content`; the
 * rest of `Message` is the SDK's required shape and nothing here depends on it.
 */
function reply(stopReason: Anthropic.StopReason, content: Anthropic.ContentBlock[]): Anthropic.Message {
  return { stop_reason: stopReason, content } as Anthropic.Message;
}

/** A model that answers with the same response whatever it is sent. */
const answering = (message: Anthropic.Message) => () => Promise.resolve(message);

/** What the adapter threw. Returning normally is the failure, and says what it returned. */
async function rejectionFrom(complete: ReturnType<typeof completeWith>): Promise<Error> {
  let answer: string | null;
  try {
    answer = await complete('turn this into a query');
  } catch (error) {
    return error as Error;
  }
  throw new Error(`the adapter returned ${JSON.stringify(answer)} instead of throwing`);
}

/** The same, for a model that fails by throwing the given value. */
const rejectionFor = (thrown: unknown): Promise<Error> =>
  rejectionFrom(completeWith(() => Promise.reject(thrown)));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the model adapter', () => {
  it('reads the text of a single block', async () => {
    const complete = completeWith(answering(reply('end_turn', [text('{"report":"outliers"}')])));

    await expect(complete('turn this into a query')).resolves.toBe('{"report":"outliers"}');
  });

  it('joins the text blocks and steps over one that is not text', async () => {
    const complete = completeWith(
      answering(reply('end_turn', [text('{"report":'), thinking, text('"outliers"}')])),
    );

    await expect(complete('turn this into a query')).resolves.toBe('{"report":"outliers"}');
  });

  it('answers nothing when no block is text', async () => {
    const complete = completeWith(answering(reply('end_turn', [thinking])));

    await expect(complete('turn this into a query')).resolves.toBeNull();
  });

  it('answers nothing on a refusal, without reading the content', async () => {
    let read = false;
    const refused = {
      stop_reason: 'refusal',
      get content() {
        read = true;
        return [text('{"report":"outliers"}')];
      },
    } as unknown as Anthropic.Message;

    const complete = completeWith(answering(refused));

    await expect(complete('turn this into a query')).resolves.toBeNull();
    // A model that declines has no content worth reading, and reading it is how a refusal
    // turns into "did not answer with JSON" two files away.
    expect(read).toBe(false);
  });

  it('answers nothing when the answer was cut off at the ceiling', async () => {
    const complete = completeWith(answering(reply('max_tokens', [text('{"report":')])));

    // Not the partial object. `translate` would refuse that with "did not answer with JSON",
    // which blames the model for a ceiling this file set.
    await expect(complete('turn this into a query')).resolves.toBeNull();
  });

  it('says a rejected key is a rejected key', async () => {
    const thrown = new Anthropic.AuthenticationError(401, undefined, 'unauthorized', new Headers());

    const error = await rejectionFor(thrown);

    expect(error.message).toBe('the model API rejected the key this server was started with');
    expect(error.cause).toBe(thrown);
  });

  it('says a throttled key is a throttled key', async () => {
    const thrown = new Anthropic.RateLimitError(429, undefined, 'slow down', new Headers());

    const error = await rejectionFor(thrown);

    expect(error.message).toBe('the model API is rate limiting this key');
    expect(error.cause).toBe(thrown);
  });

  it('carries the status of any other answer from the API', async () => {
    const thrown = new Anthropic.APIError(503, undefined, 'overloaded', new Headers());

    const error = await rejectionFor(thrown);

    expect(error.message).toBe('the model API answered 503');
    expect(error.cause).toBe(thrown);
  });

  it('has a sentence for a failure that is not the API answering', async () => {
    const thrown = new Error('getaddrinfo ENOTFOUND api.anthropic.com');

    const error = await rejectionFor(thrown);

    expect(error.message).toBe('the model call failed');
    expect(error.cause).toBe(thrown);
  });

  it('keeps the key out of what it throws, even when the API echoes it back', async () => {
    const thrown = new Anthropic.AuthenticationError(
      401,
      { message: `invalid x-api-key: ${KEY}` },
      undefined,
      new Headers(),
    );

    const error = await rejectionFor(thrown);

    // The sentence is this module's own. The SDK's error travels on `cause`, where the route
    // logs it and no response body renders it.
    expect(error.message).not.toContain(KEY);
    expect(error.cause).toBe(thrown);
  });

  it('asks claude-opus-5 for a low-effort answer under a ceiling', async () => {
    let sent: Anthropic.MessageCreateParamsNonStreaming | undefined;
    const complete = completeWith((params) => {
      sent = params;
      return Promise.resolve(reply('end_turn', [text('{"report":"outliers"}')]));
    });

    await complete('turn this into a query');

    // Pinned literals. The model id dates a price, the effort is the lever that lowers it and
    // the ceiling is what the truncation guard above exists for: changing any of the three is
    // a deliberate edit here as well as there.
    expect(sent?.model).toBe('claude-opus-5');
    expect(sent?.max_tokens).toBe(4096);
    expect(sent?.output_config).toEqual({ effort: 'low' });
    expect(sent?.messages).toEqual([{ role: 'user', content: 'turn this into a query' }]);
  });
});

describe('the model adapter built from a key', () => {
  it('sends the key it was built with and keeps it out of what it throws', async () => {
    const keys: (string | null)[] = [];
    vi.stubGlobal('fetch', (_url: unknown, init: RequestInit) => {
      keys.push(new Headers(init.headers).get('x-api-key'));
      return Promise.resolve(
        new Response(JSON.stringify({ type: 'error', error: { type: 'authentication_error' } }), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        }),
      );
    });

    const error = await rejectionFrom(anthropicComplete(KEY));

    // The key reaching the request is what makes the second assertion about this adapter
    // rather than about some other call that happened to fail.
    expect(keys).toEqual([KEY]);
    expect(error.message).toBe('the model API rejected the key this server was started with');
  });
});
