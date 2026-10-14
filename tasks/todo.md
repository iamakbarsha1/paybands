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
- [ ] Session cookie: httpOnly, secure, sameSite strict
- [ ] Every route except `/health` and `/auth/login` behind the guard
- [ ] Rate limit on login
- [ ] Tests: unauthenticated request is rejected on every protected route
- [ ] Commit: `feat(api): session auth`

> One role, no RBAC. One persona in the brief; a permissions matrix would serve a user that does not exist.

## Phase 8 — Web: employees

- [ ] Next.js 16 App Router, shadcn/ui + Tailwind
- [ ] Login page
- [ ] Employee list — server-side pagination, filters, sort. Never ship 10,000 rows to the browser.
- [ ] Employee detail — salary timeline, band position, comp ratio
- [ ] Add / edit employee, add salary change
- [ ] Loading and empty states that are not an afterthought
- [ ] Commit per screen

## Phase 9 — Web: reports

- [ ] Pay bands — band table, occupancy, where people sit
- [ ] Distribution — by country / department / level, with a chart
- [ ] Comp ratio — histogram + per-slice table
- [ ] Outliers — actionable list, links through to the employee
- [ ] Gender pay gap — mean and median, suppression shown explicitly as "not reported, group too small"
- [ ] Commit per report

## Phase 10 — Ask bar (LLM) — optional, feature-flagged

Strictly bounded. See [`docs/design-notes.md`](../docs/design-notes.md) §8.

- [ ] Natural language → **validated query object**, zod-parsed, rejected if it does not fit the schema
- [ ] The query object runs the same deterministic analytics code paths as the UI
- [ ] The model never computes a number, never sees a salary row, never sees a name
- [ ] Off without an API key — deployed demo works regardless
- [ ] Tests mock the model boundary; the translator is tested against fixed inputs
- [ ] Commit: `feat(web): natural language ask bar over existing reports`

> Kill switch: this phase deletes cleanly. Nothing in phases 1–9 imports it.

## Phase 11 — Performance

- [ ] Measure every analytics endpoint against the full 10k seed
- [ ] `EXPLAIN ANALYZE` on the slow ones, index or rewrite, measure again
- [ ] Record before/after in `docs/performance.md` — numbers, not adjectives
- [ ] Commit: `perf: index analytics hot paths` + `docs: performance notes`

## Phase 12 — Audits

Run the skills, fix what they find, commit the reports as artifacts.

- [ ] `attack-surface-audit` — secrets, auth, database, input, exposure. Every FAIL fixed or consciously accepted in writing.
- [ ] `legal-exposure-audit` — salary and gender data is personal data under GDPR; privacy notes belong in a product handling it
- [ ] `decision-critic` end-of-build sweep — rank every logged decision by cost-to-reverse
- [ ] `docs/security.md`, `docs/decisions/*.md` written from those reports
- [ ] Commit: `docs: security audit and decision log`

## Phase 13 — Ship

- [ ] Neon production branch, migrations applied, seed run
- [ ] API deployed (Render or Fly), health check green
- [ ] Web deployed on Vercel, pointed at the API
- [ ] CORS locked to the web origin, not `*`
- [ ] README: live URL, demo credentials, two-minute local setup
- [ ] `docs/ai-usage.md` — the prompts, the skills, and where AI output was rejected and why
- [ ] Demo video, 3–5 minutes, scripted in `docs/demo.md`
- [ ] Reply to the email with the repo link

---

## Review

An index, not a second copy. Each phase's outcome is recorded in its own section above, and the reasoning in [`docs/decisions/decision-log.md`](../docs/decisions/decision-log.md).

| Phase | Decisions | Worth knowing |
|---|---|---|
| 0–1 | 1–14 | Project references dropped; the framework-free boundary is an ESLint rule, not a convention |
| 2 | 15–21 | The partial unique index is hand-written into the migration, and verified by making the database reject a second open salary record |
| 3 | 22–32 | Adversarial review found five cross-field defects that twenty-one passing assertions missed |
| 4 | 33–41 | Decision 37 reversed before any code was written: scaling a ratio through integers is *less* precise than dividing two doubles. Three signatures depart from the sketch, each with its reason logged |
