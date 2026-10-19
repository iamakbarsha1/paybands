# Test strategy

`design-notes.md` §5 has listed this document as planned since phase 0. It answers one
question: what is unit tested, what is integration tested, and why the maths gets the
heaviest coverage.

The short version is that the arithmetic is where a wrong answer is both most likely and
least visible. A broken route returns a 500 somebody notices. A comp ratio that is quietly
wrong returns a number that looks exactly like a right one, and it is the number the whole
product exists to produce.

## The four projects

`vitest.config.ts` declares four, so a run says which layer failed without opening the log.

| Project | Root | Files | Tests | Needs |
|---|---|---|---|---|
| `core` | `packages/core` | 9 | 150 | nothing |
| `api` | `apps/api` | 8 | 77 | nothing |
| `api-db` | `apps/api` | 18 | 124 | Postgres |
| `smoke` | `apps/api` | 1 | 4 | Postgres and Chromium |

355 tests across 36 files. 71 seconds with a database and a browser, of which the smoke is 26.

`pnpm test` runs all four. `pnpm vitest run --project core` runs one.

## Where the weight is, and why

150 of 355 tests are in `packages/core`, which holds no framework, no I/O and no database.
That is 42% of the suite aimed at 781 lines across ten files, against 4,219 lines in
`apps/api` and 3,967 in `apps/web`. The smallest layer carries the most tests by a wide
margin, and the ratio is the strategy stated as a number.

The reason is a property of the domain rather than a preference. Every other layer fails
loudly. A route with a bad schema is a 400 in a test that reads it. A query that joins wrong
returns the wrong row count. But `percentile`, `compRatio`, `payGap` and `toUsd` all return a
plausible number for every input, correct or not, and a plausible wrong number survives review,
survives a screenshot, and survives a demo.

So `packages/core` is tested against the definitions rather than against itself.

| File | Tests | What it holds |
|---|---|---|
| `money.test.ts` | 28 | `money`, `addMoney`, `compareMoney`, construction from major units |
| `band.test.ts` | 25 | `compRatio` and `rangePenetration`, each with its refusals |
| `contracts.test.ts` | 20 | The zod contracts for employee and salary-change input |
| `stats.test.ts` | 18 | `percentiles`, its rounding, and what it refuses |
| `gap.test.ts` | 16 | `payGap`, its headcount handling, and its suppression floor |
| `outliers.test.ts` | 15 | `outliers` and the comp-ratio threshold |
| `fx.test.ts` | 15 | `toUsd` and its rounding |
| `domain.test.ts` | 7 | `minorUnitsFor`, `isCurrencyCode`, the gender and reason lists |
| `measures.test.ts` | 6 | That the band measures agree with each other |

`measures.test.ts` is the one worth naming. The other eight files check a function against what
its definition says. That one checks two functions against each other: a comp ratio of 1.0 and a
range penetration of 50% describe the same salary, and a change that moves one without the other
fails there rather than on a screen.

Money is `bigint` minor units everywhere, and the one place a number becomes a float is
`toUsd`. `fx-rounding.test.ts` in the API measures what that costs across the whole shipped
seed: $25.86 on a payroll of $818,621,426.23, which is one part in 31.7 million. Decision 36
estimated about $50 and nobody had run it.

## The boundary, in tests rather than in prose

Three ESLint rules hold the boundaries `architecture.md` describes, and tests hold what a lint
rule cannot see.

- `packages/core` may not import a framework, a database or `node:fs`. That is a lint rule.
- A route may not import the Prisma client except as a type. Also a lint rule.
- The model is handed a question and a schema and never a row. A lint rule was tried and could
  not guarantee it, because the ask handler reaches data through the module it exists to call.
  `apps/api/src/ask/boundary.db.test.ts` is what guarantees it instead, in 4 tests.

## What integration means here

`*.db.test.ts` runs against real Postgres, in a container locally and a service container in
CI. Not a mock and not a cloud branch, because the SQL under test is the SQL that ships
(decision 44).

They share one database and one set of fixture rows, so they take turns:
`fileParallelism: false`. The suite is single-instance by design, which is also why the
multi-instance leg of decision 51 is still open — proving it needs a second process, and
there isn't one.

Every file starts from `resetAndSeed`, which truncates and reloads the same 50 rows. The
fixture is 50 people rather than the shipped 10,000 because the seed is too slow to reload
between files, and because shrinking the seed by a parameter would move the RNG stream the
seed's own hash test pins (decision 45). The reference tables are imported from the seed
rather than retyped, so only the population differs. `seed-design.md` has the planted rows.

`harness.db.test.ts` is the harness proving itself, in 7 tests: migrations applied, the
fixture loaded, the same rows every run. Everything the other 17 files assert rests on those
three facts, and when they are false the failures they produce point anywhere but at the
cause.

Without `TEST_DATABASE_URL` these skip, so `pnpm test` is green on a fresh clone with no
Docker. With `CI` set the global setup throws instead, because a skipped integration suite and
a passing one look identical in a green build (decision 46).

## The browser smoke

One Playwright smoke, four cases, on the bare `playwright` package rather than
`@playwright/test` — so `pnpm test` still runs everything and there is no second runner to
keep true. It seeds the fixture, starts the API and `next dev` against it, and drives Chromium
at the pair. Decision 62 carries the trade.

| Case | What it would catch |
|---|---|
| Login reaches `/employees` with the nav drawn | A cookie that is set but not sent, or a session gate that admits nobody |
| The band report renders 47 rows with a currency symbol | A screen stuck on its skeleton, or money that never reaches `formatMoney` |
| The ask bar is absent on a keyless server | A feature flag read at build time rather than from `/health` |
| The same locator finds the bar when `/health` is stubbed to `ask: true` | The case above passing vacuously |

The fourth case is the point. An absence passes against a broken locator, a crashed page and a
feature that was never built, so the suite also has to show the locator finding something. It
was falsified by giving the spawned server a key: the third case fails on its health assertion
and the fourth still passes.

Four cases and not forty. The seams between a browser and a server are a cookie, a rendered
number and a flag; everything underneath is already held by the 351 tests above, and a browser
is the slowest place in this repository to re-check any of it.

## What is not tested, and why

**There are no component tests.** `design-notes.md` §6 lists "Vitest + Testing Library + one
Playwright smoke" in the stack table. Testing Library was never installed, and `apps/web` has
no test file of its own. The smoke is the only thing in the repository that executes code in
`apps/web`.

This is recorded rather than quietly corrected, in the same way `architecture.md` recorded §6's
claim about server components. The honest position is that the screens are thin: they fetch,
they branch on three states, and they hand numbers to two formatters. The branching is visible
in the smoke, the formatters are `formatMoney` and `formatRatio` in a 22-line file over
`Intl.NumberFormat`, and the shapes they read are inferred from the API's own zod schemas, so a
field the API stops sending fails `pnpm typecheck` rather than a test (decision 61). What is
genuinely untested is the rendering of a screen's error and empty branches, which the smoke
reaches none of.

**There are no performance regressions in CI.** `performance.md` is a measurement taken by
hand against a separate database, not a gate. A timing assertion against a container on a
shared runner fails for reasons that are not the code.

**There is no load test, no contract test against a consumer, and no accessibility suite.**
One consumer, one deployment, no second client to break.

## Running them

```bash
docker compose up -d
export TEST_DATABASE_URL='postgresql://paybands:paybands@localhost:5433/paybands_test'
pnpm exec playwright install chromium   # once, for the smoke
pnpm test
```

Without the first three lines, `pnpm test` runs 227 tests and skips the rest, and says so.

## The thing that was actually found

Phase 3 is the argument for all of the above. The seed generator was green on twenty-one
passing assertions. Four adversarial reviewers then found five cross-field defects: outliers
planted on leavers that every report filters out, 657 active employees reporting to a manager
who had left, and three reference tables whose validity windows did not cover the dates they
had to serve.

Each one was two correct halves in two different functions with nothing in the suite relating
them. That is the failure mode a test count does not protect against, and it is why
`measures.test.ts` and `boundary.db.test.ts` exist: both assert a relationship rather than a
value. Decisions 29 to 32 record the fixes.
