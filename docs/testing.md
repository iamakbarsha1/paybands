# Test strategy

`design-notes.md` §5 has listed this document as planned since phase 0. It answers one
question: what is unit tested, what is integration tested, and why the maths gets the
heaviest coverage.

The short version is that the arithmetic is where a wrong answer is both most likely and
least visible. A broken route returns a 500 somebody notices. A comp ratio that is quietly
wrong returns a number that looks exactly like a right one, and it is the number the whole
product exists to produce.

## The five projects

`vitest.config.ts` declares five, so a run says which layer failed without opening the log.

| Project | Root | Files | Tests | Needs |
|---|---|---|---|---|
| `core` | `packages/core` | 9 | 150 | nothing |
| `api` | `apps/api` | 8 | 77 | nothing |
| `api-db` | `apps/api` | 22 | 156 | Postgres |
| `web` | `apps/web` | 4 | 23 | nothing |
| `smoke` | `apps/api` | 1 | 4 | Postgres and Chromium |

410 tests across 44 files. Between 71 and 227 seconds with a database and a browser, measured
over three runs on the same machine. The variance is almost all `next dev` compiling each
route on its first request, which is the price of the smoke not needing a prior `pnpm build`
(decision 62).

`pnpm test` runs all five. `pnpm vitest run --project core` runs one. On a clone with no
database, 250 of the 410 run and the rest skip themselves.

## Where the weight is, and why

150 of 410 tests are in `packages/core`, which holds no framework, no I/O and no database.
That is 37% of the suite aimed at 834 lines across ten files, against 4,291 lines in
`apps/api` and 2,750 in `apps/web` — source only, counted with `wc -l` over every `.ts`,
`.tsx` and `.css` outside `node_modules`, `.next` and the test files themselves. The smallest
layer carries the most tests by a wide margin, and the ratio is the strategy stated as a
number.

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
fixture loaded, the same rows every run. Everything the other 21 files assert rests on those
three facts, and when they are false the failures they produce point anywhere but at the
cause.

`auth-cross-site.db.test.ts` is the newest of them and the odd one out: it asserts a
deployment fact rather than a behaviour. The session cookie is `SameSite=Strict` by default
and `None` when the browser is on another site, and both values are pinned, because getting it
wrong produces a login that answers 200 and signs everyone out. It also asserts what replaces
the CSRF defence that `None` gives up, since `deploy.md` makes that claim in writing: a
form-encoded POST from a signed-in session is refused with 415 before any handler runs.

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
number and a flag; everything underneath is already held by the 406 tests above, and a browser
is the slowest place in this repository to re-check any of it.

## What is not tested, and why

**The component tests cover four files, not nine screens.** For six phases there were none at
all, and this section said so; `PB-D21` closed the gap the honest way round — by testing the
branch the smoke cannot reach rather than by re-walking the happy path in jsdom.

The `web` vitest project runs in jsdom with `lib/api` stubbed per file, so what is under test
is which of loading, error, empty and ready a screen renders, never a fetch. Twenty-three
tests over `use-api`, `EmployeeForm`, `AskBar` and the distribution report. Two of them were
falsified by reverting the fix they hold: removing `aria-describedby` from the `Choice`
control fails the form's accessibility test, and a sixth member added to `askQuery` fails
`pnpm typecheck` at `ask-bar.tsx:123`.

What is still untested is the other five report screens and the employee list and detail
pages. They branch the same four ways over the same hook, and the one screen that is covered
is the one with geometry of its own. The formatters are `formatMoney` and `formatRatio` in a
22-line file over `Intl.NumberFormat`, and the shapes every screen reads are inferred from
the API's own zod schemas, so a field the API stops sending fails `pnpm typecheck` rather
than a test (decision 61).

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

Without the first three lines, `pnpm test` runs 227 tests and skips 133, and says so.

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
