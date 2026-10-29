# paybands — implementation plan

Repo: `github.com/iamakbarsha1/paybands` (public, remote via `github.com-personal`)
Design decisions live in [`docs/design-notes.md`](../docs/design-notes.md). This file is the build order.
Per-ticket detail is in [`user-stories-PART1.md`](user-stories-PART1.md) and [`user-stories-PART2.md`](user-stories-PART2.md); ticket status is in [`board.md`](board.md). A checkbox here and a status there move in the same change.

Rules for every phase:

- **Tests first** on anything with logic. The JD names it as a non-negotiable, and the commit order is the evidence.
- **One concern per commit.** Commit history is graded; a 40-file "initial commit" throws that away.
- **Decisions get logged** to `docs/decisions/decision-log.md` by the `decision-critic` skill as they happen, not reconstructed at the end.

---

## Phase 0 — Requirements and repo

Docs land **before** the first line of product code. The commit order is itself part of the submission.

- [x] `git init`, remote `git@github.com-personal:iamakbarsha1/paybands.git`, branch `main`
- [x] `docs/requirements.md` — goal, scope, non-goals with reasoning
- [x] `docs/design-notes.md` — the planning doc, tightened, duplication removed
- [x] `docs/data-model.md` — ER diagram + the four modelling calls
- [x] `docs/glossary.md` — comp ratio, range penetration, midpoint, mean vs median gap
- [x] `README.md` — clone → install → seed → run → test
- [x] `.gitignore`, LICENSE, `.editorconfig`

## Phase 1 — Workspace skeleton

```
paybands/
├─ apps/api          Fastify 5 + TypeScript, Node 24
├─ apps/web          Next.js 16 App Router + React 19
├─ packages/core     pure comp maths + shared domain types, zero framework imports
├─ docs/
└─ .github/workflows/ci.yml
```

`packages/core` exists for one reason: the comp maths must be testable with no database, no HTTP, and no React, and the web app needs the same types the API returns. That is a shared-code reason, not scaffolding.

- [x] pnpm workspace, strict mode on. Project references dropped — core is consumed as source, which removes the ordering problem they solve ([decision 12](../docs/decisions/decision-log.md))
- [x] ESLint + Prettier, one root config. A `no-restricted-imports` rule makes the framework-free boundary enforced, not conventional
- [x] Vitest at the root, a project per package
- [x] CI: install → typecheck → lint → test → build, on every push

## Phase 2 — Schema

- [x] Neon Postgres project, connection string in `.env.example` (never a real one in git) — two URLs, pooled for the app and direct for migrations ([decision 20](../docs/decisions/decision-log.md))
- [x] Prisma schema: country, currency, fx_rate, department, job_level, employee, salary_record, pay_band, app_user
- [x] Money columns as `BigInt` minor units. No floats, no `Decimal` for storage.
- [x] Indexes: `salary_record(employee_id, effective_from)`, `employee(country_code, department_id, job_level_id)`, `pay_band(job_level_id, country_code)`
- [x] Partial unique index: one open salary record per employee (`effective_to IS NULL`) — hand-written into the migration, verified against the database ([decision 18](../docs/decisions/decision-log.md))
- [x] Migration committed, not just `db push`
- [x] Commit: `feat(db): schema and migrations`

## Phase 3 — Seed

- [x] Deterministic RNG with a fixed seed. Reseeding twice gives the same database — proved on the generator in CI, and by hand at the database level ([decision 24](../docs/decisions/decision-log.md))
- [x] 6 countries, 8 job levels, 10 departments, 48 pay bands (level × country)
- [x] 10,000 employees on an L2–L4-heavy pyramid: 900 / 2200 / 2600 / 2100 / 1200 / 600 / 300 / 100
- [x] 3–5 salary records each, effective-dated: hire → merit → promotion. 34,898 records, 84% of employees with three or more; the rest joined too recently, or left too soon, to have had that many reviews
- [x] **Planted outliers**: 40 below band min, 25 above band max, Sales carrying an 11.7% gender gap, Legal at 11 people too few to report. Counts are of *active* employees, which is not the same number as a count of rows ([decision 29](../docs/decisions/decision-log.md))
- [x] Seeded HR-manager login, argon2id with a fixed salt so the row survives a reseed ([decision 25](../docs/decisions/decision-log.md))
- [x] Batched inserts — 10k rows one at a time is a slow seed and a bad look
- [x] The seed refuses a database it did not write ([decision 32](../docs/decisions/decision-log.md)) — not in the original plan, added after review
- [x] Commit: `feat(db): seed script for 10k employees`, `test(db): seed is deterministic`

> The planted outliers matter. An outlier report that finds nothing because the data is uniformly random demos nothing.

Four adversarial reviewers found five cross-field defects that twenty-one passing assertions did not: outliers planted on leavers the reports filter out, 657 active employees reporting to someone who had left, and three reference tables whose validity windows did not cover the dates they had to serve. Each one was two correct halves in two different functions with nothing relating them. Decisions 29 to 32 record the fixes.

## Phase 4 — Comp maths (`packages/core`) — TDD

This is where the real logic is and where the tests earn their keep. Tests are committed before the implementation, each as its own commit.

- [x] `Money` — minor units, currency, add/compare, no float arithmetic anywhere
- [x] `toUsd(money, rateTable, onDate)` — effective-dated FX lookup
- [x] `compRatio(salary, band)` — salary ÷ midpoint. Returns a plain `number`; a missing band returns `null` rather than throwing, because the glossary says the employee still appears in the report ([decisions 37–38](../docs/decisions/decision-log.md))
- [x] `rangePenetration(salary, band)` — position in band, 0–1, unclamped outside it. No new decision: the glossary already settles both the no-clamp rule and the flat band
- [x] `percentiles(values, [25,50,75,90])` — linear interpolation between closest ranks, the method the glossary already named. Interpolates in `bigint` and rounds once, so the SQL and the TypeScript agree ([decision 39](../docs/decisions/decision-log.md))
- [x] `outliers(rows, threshold)` — below min, above max, comp ratio out of range, plus a fourth list for employees with no band. Takes rows already joined and filtered rather than the sketched `(employees, bands, threshold)` ([decision 40](../docs/decisions/decision-log.md)). The seed fixture agreement is asserted in `apps/api`, where the generator lives
- [x] `payGap(people, { minGroupSize })` — mean and median gap, **suppressed when either compared group is below the minimum**, not when the slice headcount is. Takes the slice with its genders so headcount and exclusions come from the same split ([decision 41](../docs/decisions/decision-log.md))
- [x] Edge cases, each a named test: empty group (`stats`, `gap`, `outliers`), single member (`stats`, `gap`), all-equal salaries (`stats`, `gap`), undisclosed gender (`gap`), employee with no band (`band` ×2, `outliers`), no rate on that date (`fx` ×2). `measures.test.ts` adds the one the list missed — that the three band measures agree with each other
- [x] Commit per function: `test(core): …` then `feat(core): …`

## Phase 5 — API: employees

- [x] Fastify 5, typed routes, zod schemas at the boundary. zod reaches Fastify through its own validator and serializer compilers rather than `fastify-type-provider-zod`, whose required peers pull in an OpenAPI toolchain ([decision 43](../docs/decisions/decision-log.md)). Query schemas are strict
- [x] `GET /employees` — keyset on (sort column, id), filters for country/department/level/status, sort on `name`, `hireDate` or `id` in either direction, limit capped at 100
- [x] `GET /employees/:id` — detail, ordered salary timeline, band position and comp ratio from `packages/core`; 404 for an unknown id
- [x] `POST /employees`, `PATCH /employees/:id` — 409 for a code or email somebody holds, 400 for a department, level or manager that does not exist, 404 for an edit to nobody
- [x] `POST /employees/:id/salary` — new effective-dated record, closes the previous one in a transaction; the partial unique index is the backstop and answers 409 to the loser of a race
- [x] Repository layer separate from route handlers; the client is constructed once in `src/db.ts` and an ESLint rule keeps Prisma out of handlers ([decision 47](../docs/decisions/decision-log.md))
- [x] Integration tests via `fastify.inject` against a test database — Postgres in a container, fifty-person fixture, migrations applied by the vitest global setup ([decisions 44–46](../docs/decisions/decision-log.md))
- [x] Commit per endpoint group

## Phase 6 — API: analytics

- [x] `GET /analytics/bands` — band table with occupancy
- [x] `GET /analytics/distribution` — p25/p50/p75/p90 + headcount, grouped by country | department | level
- [x] `GET /analytics/comp-ratio` — distribution overall and per slice
- [x] `GET /analytics/outliers`
- [x] `GET /analytics/pay-gap` — with suppression, and the suppression stated in the response rather than silently omitted
- [x] Aggregation in SQL where the database is better at it; `packages/core` keeps the maths that must be exact ([decision 48](../docs/decisions/decision-log.md))
- [x] Commit per report

## Phase 7 — Auth

- [x] Argon2id password hashing ([decision 49](../docs/decisions/decision-log.md))
- [x] Session cookie: httpOnly, secure, sameSite strict ([decision 50](../docs/decisions/decision-log.md))
- [x] Every route except `/health`, `/auth/login` and `/auth/logout` behind the guard
- [x] Rate limit on login — five per address per fifteen minutes, in memory ([decision 51](../docs/decisions/decision-log.md))
- [x] Tests: unauthenticated request is rejected on every protected route, enumerated from Fastify's own route table
- [x] Commit: `feat(api): session auth`

> One role, no RBAC. One persona in the brief; a permissions matrix would serve a user that does not exist.

## Phase 8 — Web: employees

- [x] Next.js 16 App Router, shadcn/ui + Tailwind, one layout with nav and one API client
- [x] Login page, with a session gate in front of the app and sign out in the nav
- [x] Employee list — server-side pagination, filters, sort, all of it in the query string. Never ship 10,000 rows to the browser.
- [x] Employee detail — salary timeline with the open record marked, band position, comp ratio
- [x] Add / edit employee, add salary change — the forms parse with the API's own schemas (decision 52)
- [x] Loading and empty states that are not an afterthought — skeletons shaped like the screen, measured for shift
- [x] Commit per screen

## Phase 9 — Web: reports

- [x] Pay bands — band table, occupancy, where people sit. Spread (`bandSpread`) is the column that compares across currencies
- [x] Distribution — by country / department / level, with a chart drawn from the same response the table prints
- [x] Comp ratio — histogram + per-slice table, sortable on any column including one bucket
- [x] Outliers — actionable list, links through to the employee; the unbanded kept as their own list
- [x] Gender pay gap — mean and median, suppression shown explicitly as "not reported, group too small"
- [x] Commit per report

## Phase 10 — Ask bar (LLM) — optional, feature-flagged

Strictly bounded. See [`docs/design-notes.md`](../docs/design-notes.md) §7.

- [x] Natural language → **validated query object**, zod-parsed, rejected if it does not fit the schema
- [x] The query object runs the same deterministic analytics code paths as the UI
- [x] The model never computes a number, never sees a salary row, never sees a name
- [x] Off without an API key — deployed demo works regardless
- [x] Tests mock the model boundary; the translator is tested against fixed inputs
- [x] Commit: `feat(web): natural language ask bar over existing reports` — the API half shipped as `PB-065` to `PB-069`; the screen itself was never given a ticket, which [`PB-D09`](board.md) records

> Kill switch: this phase deletes cleanly. Nothing in phases 1–9 imports it.

## Phase 11 — Performance

- [x] Measure every analytics endpoint against the full 10k seed
- [x] `EXPLAIN ANALYZE` on the slow ones, index or rewrite, measure again
- [x] Record before/after in `docs/performance.md` — numbers, not adjectives
- [x] Commit: `perf(api): analytics reports fetch their rows as one join` + `docs: performance notes` — no index was added, because every plan already used one

> The reports that fetch rows were 85–186 ms and are 38–55 ms. Postgres was answering in 18 of
> those 95 ms; the rest was Prisma compiling a nested `findMany` into a second statement with
> 9,226 bind parameters and building an object graph from it. Decision 57, and decision 48 now
> carries the number its **T** line said nobody had measured.

## Phase 12 — Audits

Run the skills, fix what they find, commit the reports as artifacts.

- [x] `attack-surface-audit` — secrets, auth, database, input, exposure. Every FAIL fixed or consciously accepted in writing.
- [x] `legal-exposure-audit` — salary and gender data is personal data under GDPR; privacy notes belong in a product handling it
- [x] `decision-critic` end-of-build sweep — rank every logged decision by cost-to-reverse
- [x] `docs/security.md`, `docs/decisions/*.md` written from those reports
- [x] Commit: `docs: security audit and decision log`

## Phase 13 — Ship

**101 of 103.** Two tickets are open and both need a person: the video recording and the
email. The three deployments went live on **2026-10-19** at
<https://paybands-flame.vercel.app>, against the API at
<https://paybands-api.onrender.com>.

[`docs/deploy.md`](../docs/deploy.md) is the runbook for `PB-077`, `PB-078` and `PB-079`, in
the order they have to happen and with the two variables that fail silently called out. It is
a checklist to execute rather than a set of decisions to make.

- [x] **`PB-077`** — Neon production branch `production` (`br-long-truth-a1putcqw`) off `main`, migrations applied against `DIRECT_URL`, seed run. The branch copies its parent, so it arrived holding dev's drift — `max(id)` 10003 against the 10000 the seed writes — and the seed refused it until `PAYBANDS_SEED_FORCE=1` truncated. Verified by query rather than by the seed's own summary: employee 10000, app_user 1, salary_record 34898
- [x] **`PB-078`** — API on Render free (`paybands-api`, Singapore, one instance), `/health` green on Render's own dashboard. `TRUST_PROXY=true` and `CROSS_SITE_COOKIE=true`, the second confirmed on the wire: the login cookie ships `Secure; SameSite=None`. Two things the runbook could not have known: `NODE_VERSION` is pinned to 24 because `engines.node` is an unbounded `>=24` that Render resolves to the newest release, and the build command needs `corepack enable` in front of it to get the pnpm the lockfile was written by
- [x] **`PB-079`** — Web on Vercel, `NEXT_PUBLIC_API_URL` pointed at Render and `WEB_ORIGIN` pointed back. The production alias is `paybands-flame`, not `paybands` — that name was taken, which is why `WEB_ORIGIN` can only be set after the web app exists. CORS checked both ways: 204 for the real origin, 401 for anything else
- [x] CORS locked to the web origin, not `*` — pulled forward in phase 8, since the browser cannot reach the API without it
- [x] **`PB-081`** — README: demo credentials and a two-minute local setup. The seed timing in it was measured (15.7s for 10,000 employees and 34,898 salary records) and the boot path is the one the browser smoke drives on every run. The live URL placeholder was filled in on 2026-10-19, along with a note that Render's free tier sleeps after 15 idle minutes and the first request back waits about a minute — otherwise the reviewer's first impression is a login screen that hangs
- [x] `docs/ai-usage.md` — the prompts, the skills, and where AI output was rejected and why
- [ ] **`PB-083`** — Demo video, 3–5 minutes. The script is written: [`docs/demo.md`](../docs/demo.md), minute by minute with what to leave out. Every beat was driven against the deployment on 2026-10-19 and two things came back: the gap report's Legal row reads 8, not the eleven the script said aloud, because the report excludes the three who have left; and the deployed API runs with an empty `ANTHROPIC_API_KEY`, so `/reports` draws no ask bar and the 3:00 beat cannot be recorded there at all. Both are now in the script, the second with the three options and their costs. What is left needs a person: a microphone, a screen recorder, and a choice about the key
- [ ] **`PB-084`** — Reply to the email with the repo link. Everything it carries is ready — <https://github.com/iamakbarsha1/paybands> is public, `main` is level with `origin/main` at `13d9843`, CI is green on it, and both live URLs answer. It blocks only on the video link
- [x] **`PB-085`** — [`docs/architecture.md`](../docs/architecture.md): system diagram, the boundaries and what enforces them, one analytics request traced hop by hop
- [x] **`PB-086`** — [`docs/api.md`](../docs/api.md): all sixteen routes, the one error shape, auth, limits, CORS

### Carried into phase 13, and closed here

Both were on the board as needing a person. Neither did.


- [x] **`PB-D04`** — seven clarifying questions went out and nothing came back. Six carried a default the build depended on, and [`docs/clarifications.md`](../docs/clarifications.md) now prices each one: what it bought and what being wrong would cost. Only multi-currency is a real one-way door. An answer arriving late is now a change with a known price
- [x] **`PB-D12`** — a fourth vitest project, `smoke`, on the bare `playwright` package rather than `@playwright/test`, so `pnpm test` still runs everything. Four cases: login reaching a session, the band report rendering money, the ask bar absent without a key, and a stubbed `/health` proving the absence check is not vacuous. Decision 62

### Closed in phase 13, without a deployment

- [x] **`PB-D13`** — `trustProxy` had no knob. Now `TRUST_PROXY`, read at the edge, with both behaviours held by tests. Decision 51's dangerous leg is fired and fixed; the multi-instance leg still needs a second process
- [x] **`PB-D14`** — decision 36's "about $50, one part in ten million" was never measured. It is **$25.86, one part in 31.7 million** against the shipped seed. The verdict stays WEAK, because WEAK was always the **D** line rather than the size of the bias
- [x] **`PB-D15`** — the session cookie was `SameSite=Strict` unconditionally, and the planned deployment is two registrable domains. A browser discards a Strict cookie arriving cross-site, so the login would have answered 200 and left every screen signed out, with nothing wrong in the log or the response. Now `CROSS_SITE_COOKIE`, read at the edge, with both values held by tests. Decision 63
- [x] **`PB-087`** — [`docs/testing.md`](../docs/testing.md) and [`docs/seed-design.md`](../docs/seed-design.md), the last two artifacts `design-notes.md` §5 listed and nothing had written. Writing the first found that §6's "Testing Library" was never installed
- [x] **`PB-088`** — [`docs/deploy.md`](../docs/deploy.md) and [`docs/demo.md`](../docs/demo.md). Writing the runbook is what found `PB-D15`

## Phase 14 — The backlog the board did not point at

A complete board is not an empty backlog. The board said 101 of 103 with only the video and the
submission left; the work below came out of the decision log's own revisit triggers, the
non-goals `security.md` wrote down, and one `ponytail:` marker in source. None of it was on the
board, and all of it was named somewhere by the project itself.

- [x] **`PB-D17`** — `AskQuery` was declared twice: the schema the API validates with, and a hand-written union in `apps/web/lib/api-types.ts` carrying the comment "stays hand-aligned". `ask-bar.tsx` switches on `report` and TypeScript proved that switch exhaustive — against the copy. A sixth report would have compiled. Moved to `packages/core/src/wire.ts` and inferred; falsified by adding a sixth member and watching `pnpm typecheck` fail at `ask-bar.tsx:123`. [Decision 64](../docs/decisions/decision-log.md)
- [x] **`PB-D22`** — the `Choice` control set `aria-invalid` on its `<select>` and never pointed at the error it was invalid because of, where the sibling `Text` control did both. Four of eleven fields. A screen-reader user got a different failure from a sighted one. Held by a test that fails when the attribute is removed
- [x] **`PB-D23`** — the distribution chart was `div`s with no role and no label, carrying as width exactly what the table under it prints as figures. `aria-hidden`, because announcing it is the same report read twice
- [x] **`PB-D24`** — decision 24's header said SOUND and two lines of its body still said the verdict was WEAK, left behind when `PB-D01` strengthened it
- [x] **`PB-D18`** — audit log of salary edits, closing `PB-D06`, which the board had marked out of scope. `salary_audit` records the actor, the row written and the amount it replaced, inside the same transaction that closes one salary record and opens the next — so there is no window in which a salary exists and the record of who set it does not. Nothing reads it yet, and that is stated rather than implied. [Decision 65](../docs/decisions/decision-log.md)
- [x] **`PB-D19`** — the subject's rights `security.md` named and did not have: `GET /employees/:id/export` answers with the byte-for-byte detail payload as an attachment, `DELETE /employees/:id` removes the person, their salary history and their audit trail in one transaction and detaches their reports. Retention is a stated period per table with no job behind it, because there is no scheduler here to put one in. [Decision 66](../docs/decisions/decision-log.md)
- [x] **`PB-D20`** — a second role. `admin` writes, `analyst` reads, enforced in the guard that already refuses a stranger and in the same `onRequest` hook, so the 403 lands before the body is parsed. `security.md` priced this as "a column rather than a policy bolted under the current one" and it was. What it does not settle: both roles still see every row, so row-level security still has nothing to filter on. [Decision 67](../docs/decisions/decision-log.md)
- [x] **`PB-D25`** — the live API slept. Render's free tier stops a service after fifteen idle minutes, and a cold start measured 42.7 seconds on 2026-10-29 — paid by whoever clicks the link first, on a login screen that explains nothing. `.github/workflows/keepalive.yml` calls `/health` every five minutes; five rather than fourteen because scheduled runs drift under load. What it costs is written into `deploy.md` rather than left to be discovered: the free tier meters 750 instance hours a month and a service that never sleeps burns about 730, so this holds only while the API is the only free service on the account
- [x] **`PB-D21`** — component tests. `apps/web` had no test file, which `design-notes.md` §6 promised and `testing.md` recorded as a discrepancy for six phases. A `web` vitest project in jsdom with the API stubbed, 23 tests over the branches the browser smoke cannot reach: loading, error and empty. [Decision 68](../docs/decisions/decision-log.md)

---

## Review

An index, not a second copy. Each phase's outcome is recorded in its own section above, and the reasoning in [`docs/decisions/decision-log.md`](../docs/decisions/decision-log.md).

| Phase | Decisions | Worth knowing |
|---|---|---|
| 0–1 | 1–14 | Project references dropped; the framework-free boundary is an ESLint rule, not a convention |
| 2 | 15–21 | The partial unique index is hand-written into the migration, and verified by making the database reject a second open salary record |
| 3 | 22–32 | Adversarial review found five cross-field defects that twenty-one passing assertions missed |
| 4 | 33–41 | Decision 37 reversed before any code was written: scaling a ratio through integers is *less* precise than dividing two doubles. Three signatures depart from the sketch, each with its reason logged |
| 5 | 42–47 | zod reaches Fastify through its own two compiler hooks rather than a library, so a handler cannot return a shape the schema denies. The test database is a local container that the suite skips itself without, and CI refuses to let it skip |
| 6 | 48 | One decision for six endpoints: SQL groups and filters, `packages/core` does the money arithmetic. Phase 11 changed what runs underneath it without a response shape moving, which is the containment the decision claimed |
| 7 | 49–51 | The guard turned every existing test into an auth test — seventy-one went to 401 in one commit, and the credential went into the harness rather than onto forty `inject` calls. Argon2id's parameters are held by a test rather than a flag |
| 8 | 52 | The browser validates with the API's own zod schemas, so a form and a route cannot disagree about a valid gender. The response types beside them are still hand-aligned, which `PB-D07` records |
| 9 | — | Five screens, no new decisions: every shape was settled in phase 6 and the screens render the API's own words, including the refusals. Three states per fetch rather than two (`PB-059`) |
| 10 | 53–56, 58 | The model is handed a question and a schema and never a row, and a lint rule proved unable to guarantee that — the handler reaches data through the module it exists to call. The bar answers with what it understood and a link, not with the rows |
| 11 | 57 | `EXPLAIN (ANALYZE, BUFFERS)` said the queries were fine and they were. The 95 ms was the ORM's nested read binding 9,226 keys into a second statement; one join took it to 45 |
| 12 | 59–60 | Two audits, three security findings fixed and one accepted in writing. All 60 decisions ranked by cost to reverse, and two WEAK entries flipped by their own falsifiers rather than by argument |
| 13 | 62–63 | Nothing is deployed, and everything that does not need a deployment is done. Five artifacts the brief or §5 names were written from the code rather than from the plan, and writing them found three things no test could: §6 credits server components with keeping the 10k rows off the client and every data-reading screen is a client component (the `limit` cap of 100 is what actually does it); §6 names Testing Library, which was never installed; and the deploy runbook named two vendor domains, which made the session cookie's `SameSite=Strict` a deployment that answers 200 and signs everyone out (`PB-D15`). The browser smoke `design-notes.md` has promised since phase 0 now exists, four cases, the fourth there to stop the third passing vacuously. The three remaining WEAK decisions were revisited and **none moved** — 36's bias measured at $25.86 against an estimated $50, 51's dangerous leg fixed and tested while its other leg still needs a second process, and 7 closed as unanswerable from inside the repository |
| 14 | 64–68 | The board was complete and the backlog was not. Five decisions from one sweep of the decision log's revisit triggers, `security.md`'s non-goals and an in-source `ponytail:` marker — none of them on the board. `AskQuery` was hand-copied across the package boundary, so the ask bar's exhaustive switch was exhaustive against the wrong union; `PB-D06` had been marked out of scope and was built; the two subject rights `security.md` named were written; a second role landed as one branch in the existing guard, which is where §3.3 said it would; and `apps/web` got the component tests §6 had promised since phase 0. Two of the five were falsified by reverting the fix and watching the check go red rather than by argument |
