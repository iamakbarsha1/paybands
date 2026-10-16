# Handoff

Written at the end of the session that built phase 11. Read this, then `board.md` for status
and `todo.md` for build order.

**Check this file against the repository before trusting it.** `git log --oneline -20` and
`git status` settle any disagreement; `board.md` is the next most reliable, because a ticket
moves there in the same commit as the code.

## Where the build is

75 of 90 tickets. 337 tests green, typecheck and lint clean, working tree clean. Phases 0 to
11 are complete: the API, the auth, the employee screens, all five reports, the ask bar, and
the performance numbers behind them.

`origin/main` is further behind than it was and `block-dangerous-git.sh` blocks `git push`, so
a human has to run it. **PB-D03 is closed on the board and the push has still not happened.**

## Next ticket: PB-073, the attack surface audit

Phase 12 is the audits, and nothing in it depends on phase 11. `PB-D09` — the web ask bar —
is still the cheapest thing between the build and a demo, and is still unticketed work rather
than a phase: the API answers `POST /ask` and no screen calls it.

## What this session built

| Ticket | What landed |
|---|---|
| PB-070 | `apps/api/src/perf/measure.ts`: every analytics report timed against the full 10,000-row seed, at three layers — the repository call, the report function, the HTTP request |
| PB-071 | One `$queryRaw` join in place of the nested `findMany` the four analytics repositories used. The reports that fetch rows went from 85–186 ms to 38–55 ms |
| PB-072 | `docs/performance.md`: the method, the before table, the plans, the change, the after table, and what the numbers do not cover |

The measurement ran against a separate `paybands_perf` database in the same container, seeded
once with the shipped seed and left alone between the two runs, so the only difference between
before and after is the commit. `docs/performance.md` has the commands.

Decision 57 records the change. Decision 48 gained a `Since:` pointer, because its **T** line
said nobody had measured what fetching whole rows costs, and now someone has.

## The lesson worth remembering

`EXPLAIN (ANALYZE, BUFFERS)` said the queries were fine, and they were: the right indexes, 18
ms of planning and execution for a request that took 95. A query plan is measured at the
narrowest boundary in the stack — it stops before the rows are sent and long before they are
objects. Postgres' own statement log put 43 ms on the same two statements because a logged
duration includes delivering the result set, and a timer around the repository call put 95
because Prisma was building a nested object per employee.

The second half: Prisma compiles a nested read into two statements, and the second one binds
every key the first one returned — `WHERE employee_id IN ($1…$9226)`. Parse and bind cost 18
ms there, which the plan reports as planning time and no index reduces. Both lessons are in
`lessons.md`.

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

**There is a third database now.** `paybands_perf` in the test container holds the full seed,
survives `pnpm test`, and exists so a measurement is never taken against half a dataset.
`docker compose down` removes it with the container; `docs/performance.md` rebuilds it in four
commands.

## Open, and only a person can clear them

- **The push.** Everything from phase 6 onwards is local only.
- **PB-D04** — six clarifying questions unanswered (`docs/clarifications.md`).
- **PB-D09** — phase 10 has no ticket for the web ask bar itself. The API side is complete and
  nothing in the browser calls it. `todo.md` names a `feat(web)` commit that no ticket covers.
- **PB-D11** — the Review table at the foot of `todo.md` stops at phase 4. Seven phases of
  reasoning are in the decision log and indexed nowhere.
