import { z } from 'zod';
import type { PrismaClient } from '../../generated/prisma/client';
import type { App } from '../app';
import { ASK_QUESTIONS, ASK_WINDOW_MS, createLimiter, limitHook } from '../auth/rate-limit';
import { readSession } from '../auth/session';
import { askQuery } from '../ask/query';
import { run } from '../ask/run';
import { translate, type Complete, type Translation } from '../ask/translate';

const askBody = z.strictObject({ question: z.string().min(1) });

/**
 * The query travels beside the numbers because the screen has to show what the question was
 * understood to mean. `result` is whatever report the query named, and each of the five
 * already carries a schema on its own route; checking it here for being JSON catches a
 * report handing back a bigint without restating a union that goes stale the day a report
 * gains a field.
 */
const askResponse = z.strictObject({ query: askQuery, result: z.json() });

/** Both ways this route declines, each with a sentence the ask bar can render. */
const declined = z.strictObject({ message: z.string() });

/** Fixed bodies, so there is no value from the key's side of the call to put in one. */
const OFF = 'The ask bar is off: this server was started without ANTHROPIC_API_KEY.';
const UNREACHABLE = 'The model could not be reached.';

/**
 * `complete` is `null` on a server started without a key. The route is registered either
 * way: a feature that is off answers with a reason on it rather than a 404 that reads like
 * a routing mistake.
 */
export function registerAskRoutes(app: App, prisma: PrismaClient, complete: Complete | null): void {
  const take = createLimiter(ASK_QUESTIONS, ASK_WINDOW_MS);

  app.post(
    '/ask',
    {
      // Counted per session rather than per address, because the guard has already proved
      // there is one and because the thing being spent here is a key, not a password. The
      // address is the fallback for a request that reached this hook without one, which the
      // guard does not allow and this file does not rely on.
      onRequest: limitHook(
        take,
        (request) => String(readSession(request) ?? request.ip),
        (seconds) => `Too many questions. Try again in ${String(seconds)} seconds.`,
      ),
      schema: { body: askBody, response: { 200: askResponse, 422: declined, 503: declined } },
    },
    async (request, reply) => {
      if (complete === null) return reply.code(503).send({ message: OFF });

      let translation: Translation;
      try {
        translation = await translate(request.body.question, complete);
      } catch (error) {
        // `translate` throws nothing of its own, so anything here is the model boundary
        // failing. The reason is logged and the caller is told to try again, which is true.
        request.log.error({ err: error }, 'the model could not be reached');
        return reply.code(503).send({ message: UNREACHABLE });
      }

      // A question these reports cannot answer is a stated outcome, not a server fault.
      if (!translation.accepted) return reply.code(422).send({ message: translation.reason });

      // The query, never the question: an answer somebody disputes can be re-run from this
      // line, and the part that could name a person stays out of the log (PB-074).
      request.log.info({ query: translation.query }, 'a question became a query');

      return reply.send({
        query: translation.query,
        result: await run(prisma, translation.query),
      });
    },
  );
}
