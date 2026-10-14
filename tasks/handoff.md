# Handoff

Written at the end of the session that finished phase 4. Read this, then `board.md` for status and `todo.md` for build order.

## Where the build is

Phases 0 to 4 are complete. Phase 5 has one ticket done. 38 of 90 tickets, 134 tests green, typecheck and lint clean, and `origin/main` is level with local.

`packages/core` now holds the whole comp maths surface, all of it pure and framework-free:

| Export | Returns | Refuses |
|---|---|---|
| `money`, `addMoney`, `compareMoney`, `divideHalfAwayFromZero` | `Money` | a currency it does not know, a mismatched pair |
| `toUsd` | `Money` | no rate covering the date |
| `compRatio` | `number \| null` | mismatched currency, midpoint ≤ 0 |
| `rangePenetration` | `number \| null` | mismatched currency, width ≤ 0 |
| `percentiles` | `Percentile[] \| null` | a fractional or out-of-range point, a mixed-currency group |
| `outliers` | four lists | an inverted threshold |
| `payGap` | `PayGap` | a mixed-currency slice, `minGroupSize` < 1, a reference group with no pay |

Null always means a state the report has to render. A throw always means data that should not have reached the function. Decisions 38 and 41 carry the split.

## Next ticket: PB-042, the integration test harness

It is the gate on most of phase 5 and 6 — seven tickets name it as their blocker. It needs a real database, which is why the session stopped here rather than starting it.

What it needs before work can begin:

- A Neon branch for tests, separate from the development branch. `.env.example` already documents the two-URL shape (pooled for the app, direct for migrations — decision 20).
- The seed's own guard will refuse a database it did not write (decision 32), so a fresh test branch has to be migrated and seeded before the harness can assume content.

PB-036 left the pattern the endpoints follow: routes declare zod schemas, `buildApp` wires them through `setValidatorCompiler` and `setSerializerCompiler`, and query schemas are `z.strictObject` so a mistyped filter is a 400. `apps/api/src/app.ts` is the whole of it.

## One item only you can clear

PB-D03 is closed — 53 commits pushed to `origin/main` at the end of that session. Note for next time: `block-dangerous-git.sh` blocks `git push`, so the push always has to be run by a human, and the board entry stays open until it is.

**PB-D04 — six clarifying questions are still unanswered** (`docs/clarifications.md`). Each has a stated default and the build has proceeded on those defaults, so nothing is blocked; the risk is that a default turns out wrong late.

## Conventions this session had to learn the hard way

All four are written up in `lessons.md`, but these two bite immediately:

- A red-phase `.toThrow(TypeError)` passes while the function is still missing, because `x is not a function` is a `TypeError`. Match the message instead. Watch the passed count on a red run.
- A test written against code that already works has to be mutated before it is believed. Three tests this session needed that; each commit body records the mutation and what it turned red.

## Commit rhythm to keep

Four commits per ticket, in this order: `docs:` the decision entries, `test(core):` the red tests, `feat(core):` the implementation, `docs:` the board and todo moving together. Decisions are logged by `decision-critic` as they are made, never reconstructed. One concern per commit, checked against the staged file list rather than the intent.
