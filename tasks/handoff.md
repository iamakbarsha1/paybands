# Handoff

Written at the end of the session that finished phase 8 and all of phase 9. Read this, then
`board.md` for status and `todo.md` for build order.

**Check this file against the repository before trusting it.** `git log --oneline -20` and
`git status` settle any disagreement; `board.md` is the next most reliable, because a ticket
moves there in the same commit as the code.

## Where the build is

67 of 90 tickets. 274 tests green, typecheck and lint clean, working tree clean. Phases 0 to
9 are complete: the API, the auth, the employee screens and all five reports.

- **Phase 8, web employees** — the shell, login, the list, the detail, the write screens, and
  loading / empty / error states behind all of them.
- **Phase 9, web reports** — pay bands, distribution, comp ratio, outliers, gender pay gap.
  Every one of them shows the refusals the endpoint makes rather than smoothing them away: a
  suppressed gap, an unbanded employee, a group with no salaries.

`origin/main` is still well behind local and `block-dangerous-git.sh` blocks `git push`, so a
human has to run it. **PB-D03 is closed on the board and the push has still not happened.**

## Next ticket: PB-065, natural language to a validated query object

Phase 10 is the ask bar, and `docs/design-notes.md` §8 bounds it: the model's only job is to
turn a sentence into a query object that zod either accepts or rejects, and the query object
runs the same deterministic code the screens run. It is feature-flagged off without an API
key (PB-068), and the model never sees a salary or a name (PB-067).

Phase 10 is marked optional in `todo.md`. Skipping it to phase 11 (performance) is a
defensible call: the brief warns against complexity for its own sake, and `PB-070` measures
the row fetch that decision 48 left open.

## What this session built, in the order it happened

| Ticket | What landed |
|---|---|
| PB-058 | Add / edit employee and record a salary change, with the forms parsing against the API's own schemas (decision 52) |
| PB-D08 | The CORS preflight allowed only `GET,HEAD,POST`, so every `PATCH` from the browser was refused |
| PB-059 | `components/ui/state.tsx` — `Skeleton`, `Loading`, `Empty`, `Failure` — and every screen using all three states |
| PB-060 | Pay bands screen, and `bandSpread` in `@paybands/core` |
| PB-061 | Distribution screen, chart and table over one response |
| PB-062 | Comp ratio screen, histogram plus a sortable per-slice table |
| PB-063 | Outliers screen, four lists, every row a link to the person |
| PB-064 | Gender pay gap screen, suppression printed with its threshold |

## The bug worth remembering

`PATCH /employees/:id` had passing integration tests and could not be called from a browser.
`@fastify/cors` defaults `Access-Control-Allow-Methods` to the browser's safelist, and every
test in the suite calls `app.inject`, which never sends a preflight. **An in-process request
cannot fail on the transport.** `cors.test.ts` now reads Fastify's route table and fails if a
method it serves is missing from the preflight. The lesson is in `lessons.md`.

## How to run it

```bash
docker compose up -d
export TEST_DATABASE_URL='postgresql://paybands:paybands@localhost:5433/paybands_test'
pnpm test

cd apps/api && pnpm dev     # 3001, reads apps/api/.env
cd apps/web && pnpm dev     # 3000
```

The demo login is `hr@paybands.example` / `paybands-demo-2026`. Docker Desktop takes a few
minutes from cold before `docker compose up -d` answers; it is working the whole time.

**The dev database has two employees this session created by hand** — E-9901 Ada Byron and
E-9902 Grace Hopper, ids 10002 and 10003 — from driving the write screens. Ada has two salary
records; Grace has none, which is what the empty-timeline state was checked against. A reseed
removes both.

## Conventions that held all session

- Per ticket: `test(...)` with red tests, `feat(...)` with the implementation and the
  mutations that proved the tests bite, `docs:` moving `board.md` and `todo.md` together, and
  a decision entry whenever a choice closed off an alternative.
- A web screen is proved in a browser, and the commit body says what was checked. Measured,
  where it can be: the list's `scrollHeight` holds at 1309px across loading and loaded, which
  is what "no layout shift" means in a number.
- No screen does arithmetic on minor units. Chart geometry is the one exception and says so
  in a comment at each site.

## Two things only a person can clear

- **PB-D04 — six clarifying questions are still unanswered** (`docs/clarifications.md`).
- **The push.** Everything from phase 6 onwards is local only.
