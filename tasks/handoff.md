# Handoff

Written at the end of the session that built all of phase 10. Read this, then `board.md` for
status and `todo.md` for build order.

**Check this file against the repository before trusting it.** `git log --oneline -20` and
`git status` settle any disagreement; `board.md` is the next most reliable, because a ticket
moves there in the same commit as the code.

## Where the build is

72 of 90 tickets. 336 tests green, typecheck and lint clean, working tree clean. Phases 0 to
10 are complete: the API, the auth, the employee screens, all five reports, and the ask bar.

`origin/main` is 112 commits behind local and `block-dangerous-git.sh` blocks `git push`, so
a human has to run it. **PB-D03 is closed on the board and the push has still not happened.**

## Next ticket: PB-070, measure every analytics endpoint against the full seed

Phase 11 is performance, and `PB-070` measures the row fetch that decision 48 left open. It
has no dependency on anything phase 10 built.

## What this session built

| Ticket | What landed |
|---|---|
| PB-065 | `ask/query.ts` and `ask/translate.ts`. A sentence becomes a zod-validated query object or a stated refusal. The prompt renders its schema with `z.toJSONSchema` rather than carrying a second copy |
| PB-066 | The five analytics handler bodies became five exported functions, and `ask/run.ts` switches over them. Proved by equality: for every report, `run(prisma, query)` deep-equals the matching `GET /analytics/...` body |
| PB-067 | A lint boundary on `translate.ts`, and a db test that reads a real name and salary out of the seed and proves neither reaches a prompt |
| PB-068 | `POST /ask`, the Anthropic-backed adapter, and the key gate. `/health` carries an `ask` boolean so the browser knows whether to draw the bar |
| PB-069 | The adapter's own tests, and the two §7 claims that had nothing behind them anywhere |

Four things landed outside the tickets, in their own commits:

- `max_tokens` was 1024 and the cap covers the model's reasoning, which is on by default. A
  translation that reasoned past it returned partial JSON and the user read "the model did
  not answer with JSON", blaming the model for our ceiling. Now 4096 with a `stop_reason`
  guard.
- `ask/anthropic.ts` joined the lint boundary. `routes/ask.ts` deliberately did not — see the
  lesson below.
- `design-notes.md` §7 claimed nothing in phases 1 to 9 imports the ask bar. `app.ts` does
  now, so the section says what deleting the phase actually costs.
- Decision 53 gained a `Since:` pointer at 54, and decision 56 one at the `max_tokens` change.

## The lesson worth remembering

A `no-restricted-imports` rule on `routes/ask.ts` looked like the obvious guard against a
handler putting a salary row in a prompt. Mutating the handler to paste the outliers report
into the question leaked real surnames to the model using only `run` from `ask/run.ts` — the
module the handler exists to call, which no rule could ban. The rule would have stayed silent
through the exact leak it was written for. **An import rule constrains what a file can reach,
not what it does with what it already reaches.** Both this and the compile-blind red run are
in `lessons.md`.

## How to run it

```bash
docker compose up -d
export TEST_DATABASE_URL='postgresql://paybands:paybands@localhost:5433/paybands_test'
pnpm test

cd apps/api && pnpm dev     # 3001, reads apps/api/.env
cd apps/web && pnpm dev     # 3000
```

The demo login is `hr@paybands.example` / `paybands-demo-2026`.

**`ANTHROPIC_API_KEY` now matters, and nothing breaks without it.** Unset or empty, `POST
/ask` answers 503 with a reason and `/health` reports `ask: false`. Every other feature works.
No test calls the real API.

**The dev database still has two employees made by hand** — E-9901 Ada Byron and E-9902 Grace
Hopper, ids 10002 and 10003. A reseed removes both.

## Open, and only a person can clear them

- **The push.** Everything from phase 6 onwards is local only.
- **PB-D04** — six clarifying questions unanswered (`docs/clarifications.md`).
- **PB-D09** — phase 10 has no ticket for the web ask bar itself. The API side is complete and
  nothing in the browser calls it. `todo.md` names a `feat(web)` commit that no ticket covers.
- **PB-D11** — the Review table at the foot of `todo.md` stops at phase 4. Six phases of
  reasoning are in the decision log and indexed nowhere.
