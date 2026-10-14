# paybands — user stories, part 1 (phases 0–6)

Part 2 covers phases 7–13, carried debt, and the explicit non-goals: [`user-stories-PART2.md`](user-stories-PART2.md).
Status for every ticket lives in [`board.md`](board.md), not here. This file holds the detail; the board holds the state.

One persona throughout: **the HR manager at ACME**. Where a story serves the build rather than the user, it says so and names who it serves (reviewer, future maintainer, CI).

Ticket format: `PB-nnn` for planned work, `PB-Dnn` for debt and missed items. `Depends` lists ticket IDs that must land first.

---

## Phase 0 — Requirements and repo

### PB-001 — Requirements written before any product code

As a reviewer, I want the scope recorded before the build starts, so that what is in and out reads as a decision rather than as drift.
**Acceptance**

- `docs/requirements.md` states goal, user, in-scope data and reports, and non-goals with one reason each
- Committed before the first product-code commit
  **Phase** 0 · **Depends** — · **Evidence** `docs/requirements.md`

### PB-002 — Design notes separated from the plan

As a reviewer, I want the reasoning in one file and the build order in another, so that neither has to be read to follow the other.
**Acceptance**

- `docs/design-notes.md` covers scope calls, data model, stack, LLM boundary, quality gates
- No duplicated paragraphs between design notes and `tasks/todo.md`
  **Phase** 0 · **Depends** PB-001 · **Evidence** `docs/design-notes.md`

### PB-003 — Data model documented with its four modelling calls

As a future maintainer, I want the ER diagram and the reasons behind the contested columns, so that the schema can be changed without rediscovering why it is shaped this way.
**Acceptance**

- `docs/data-model.md` carries the ER diagram and the four calls (minor units, effective dating, band per level × country, gender enum)
  **Phase** 0 · **Depends** PB-001 · **Evidence** `docs/data-model.md`

### PB-004 — Glossary of comp terms

As the HR manager, I want comp ratio, range penetration, midpoint and mean-vs-median gap defined once, so that a number on screen means the same thing as the number in the tests.
**Acceptance**

- `docs/glossary.md` defines each term with its formula
- Report UI and API docs use these names unchanged
  **Phase** 0 · **Depends** — · **Evidence** `docs/glossary.md`

### PB-005 — Clone to running in under two minutes

As a reviewer, I want one path from clone to a running app, so that evaluating the project does not start with debugging it.
**Acceptance**

- README covers clone → install → env → migrate → seed → run → test
- Commands work on a clean checkout with Node per `.nvmrc`
  **Phase** 0 · **Depends** — · **Evidence** `README.md`

### PB-006 — Repo hygiene files

As a maintainer, I want ignore rules, licence and editor config present from the start, so that no generated file or secret reaches a commit by accident.
**Acceptance**

- `.gitignore` excludes `node_modules`, build output, `.env`
- LICENSE and `.editorconfig` committed
  **Phase** 0 · **Depends** — · **Evidence** `.gitignore`, `LICENSE`, `.editorconfig`

### PB-007 — Clarifying questions sent with defaults

As the builder, I want each open question to carry a stated default, so that no unanswered question blocks the build.
**Acceptance**

- Six questions recorded with the default taken for each
- Answers table updated if replies arrive
  **Phase** 0 · **Depends** PB-001 · **Evidence** `docs/clarifications.md` (see PB-D04)

---

## Phase 1 — Workspace skeleton

### PB-008 — pnpm workspace with strict TypeScript

As a maintainer, I want three packages under one strict-mode workspace, so that the API, the web app and the comp maths share types without a publish step.
**Acceptance**

- `apps/api`, `apps/web`, `packages/core` resolve across the workspace
- `strict` on; project references deliberately dropped (decision 12), with the drop recorded in the plan
  **Phase** 1 · **Depends** PB-006 · **Evidence** `pnpm-workspace.yaml`, `tsconfig.base.json`

### PB-009 — The framework-free boundary is enforced, not conventional

As a maintainer, I want a lint rule to reject framework imports inside `packages/core`, so that the comp maths stays testable with no database, HTTP or React.
**Acceptance**

- `no-restricted-imports` fails the build when `packages/core` imports Fastify, Prisma, Next or React
- One root ESLint + Prettier config, no per-package forks
  **Phase** 1 · **Depends** PB-008 · **Evidence** `eslint.config.js`

### PB-010 — One test runner, a project per package

As the builder, I want Vitest configured once at the root, so that `pnpm test` runs everything and CI has a single entry point.
**Acceptance**

- Root `vitest.config.ts` defines a project per package
- Tests run with no database for `packages/core`
  **Phase** 1 · **Depends** PB-008 · **Evidence** `vitest.config.ts`

### PB-011 — CI gate on every push

As a reviewer, I want install → typecheck → lint → test → build on every push, so that a green history means something.
**Acceptance**

- Workflow runs the five steps in order and fails the push on any one
- Runs on the Node version in `.nvmrc`
  **Phase** 1 · **Depends** PB-009, PB-010 · **Evidence** `.github/workflows/ci.yml`

---

## Phase 2 — Schema

### PB-012 — Neon project with pooled and direct URLs

As a maintainer, I want the app and the migrations on different endpoints, so that a migration does not run through the pooler (decision 20).
**Acceptance**

- `.env.example` documents both URLs, neither holding a real credential
- Prisma uses the direct URL for migrations, pooled for runtime
  **Phase** 2 · **Depends** PB-008 · **Evidence** `.env.example`

### PB-013 — Schema for the nine tables

As the HR manager, I want employees, salaries, bands and the reference tables modelled, so that the data the spreadsheet held has a place to live.
**Acceptance**

- `country`, `currency`, `fx_rate`, `department`, `job_level`, `employee`, `salary_record`, `pay_band`, `app_user`
- Integer surrogate keys, natural keys for country and currency (decision 15)
- `app_user` carries no foreign key to `employee` (decision 16)
  **Phase** 2 · **Depends** PB-012 · **Evidence** `apps/api/prisma/schema.prisma`

### PB-014 — Money stored as integer minor units

As the HR manager, I want no floating point anywhere near a salary, so that totals and gaps are exact rather than nearly right.
**Acceptance**

- Money columns are `BigInt` minor units; no `Float`, no `Decimal` for storage
- FX rates stored as integer micros (decision 9)
  **Phase** 2 · **Depends** PB-013 · **Evidence** decision 1, decision 9

### PB-015 — Indexes for the query shapes the reports use

As the HR manager, I want the analytics queries to stay fast at 10,000 employees, so that the reports beat the spreadsheet they replace.
**Acceptance**

- `salary_record(employee_id, effective_from)`, `employee(country_code, department_id, job_level_id)`, `pay_band(job_level_id, country_code)`
- Index choices revisited with measurements in phase 11 (PB-071)
  **Phase** 2 · **Depends** PB-013 · **Evidence** migration SQL

### PB-016 — One open salary record per employee, enforced by the database

As the HR manager, I want a second open salary record to be impossible, so that "current salary" is never ambiguous.
**Acceptance**

- Partial unique index on `effective_to IS NULL`, hand-written into the migration (decision 18)
- Verified by making the database reject a second open record
  **Phase** 2 · **Depends** PB-013 · **Evidence** migration SQL, decision 18

### PB-017 — Migrations committed, not pushed

As a maintainer, I want the schema to arrive as reviewable migration files, so that the database history is in git rather than in someone's shell.
**Acceptance**

- Migration directory committed; no reliance on `db push`
- Commit: `feat(db): schema and migrations`
  **Phase** 2 · **Depends** PB-013 · **Evidence** `apps/api/prisma/migrations/`

---

## Phase 3 — Seed

### PB-018 — Deterministic generator

As a reviewer, I want two reseeds to produce the same database, so that any number quoted about the dataset can be reproduced.
**Acceptance**

- Fixed-seed RNG; the generator asserts determinism in CI (decision 24)
- Seed assigns primary keys itself and resets every sequence afterwards (decision 23)
  **Phase** 3 · **Depends** PB-017 · **Evidence** decision 23, decision 24, and PB-D01 for the database-level gap

### PB-019 — Reference data that covers the dates it serves

As the HR manager, I want countries, levels, departments and 48 bands present, so that every employee resolves to a band and a currency.
**Acceptance**

- 6 countries, 8 job levels, 10 departments, 48 pay bands (level × country)
- Every reference row is valid from before the earliest row it must serve (decision 30)
  **Phase** 3 · **Depends** PB-018 · **Evidence** decision 30

### PB-020 — 10,000 employees on a realistic pyramid

As the HR manager, I want a headcount distribution that looks like a real org, so that the reports show something worth reading.
**Acceptance**

- 900 / 2200 / 2600 / 2100 / 1200 / 600 / 300 / 100 across L1–L8
- Managers are drawn so that no active employee reports to someone who has left
- Hire-date skew computed with `sqrt` (decision 31)
  **Phase** 3 · **Depends** PB-019 · **Evidence** decision 31

### PB-021 — Effective-dated salary histories

As the HR manager, I want each employee to carry a believable salary timeline, so that the detail page has history to show.
**Acceptance**

- 3–5 records each where tenure allows; 34,898 records total, 84% with three or more
- No salary record dated after a termination
- A terminated employee keeps an open record (decision 27)
  **Phase** 3 · **Depends** PB-020 · **Evidence** decision 27

### PB-022 — Planted outliers defined over active employees

As the HR manager, I want the outlier and gap reports to have true findings waiting, so that a working report is distinguishable from an empty one.
**Acceptance**

- 40 below band min, 25 above band max, Sales at an 11.7% gender gap, Legal at 11 people
- Counts are of employees the reports can see, not of rows (decision 29)
- Outliers are hard-coded rather than drawn from the distribution (decision 26)
  **Phase** 3 · **Depends** PB-021 · **Evidence** decision 26, decision 29; gap in PB-D02

### PB-023 — Seeded HR login that survives a reseed

As the HR manager, I want working demo credentials after every seed, so that the deployed app can be opened by a reviewer.
**Acceptance**

- argon2id with a fixed salt so the hash is stable across reseeds (decision 25)
- Credentials documented in the README for the demo only
  **Phase** 3 · **Depends** PB-018 · **Evidence** decision 25

### PB-024 — Batched inserts

As the builder, I want the seed to insert in batches, so that seeding 10,000 employees is not a minutes-long wait.
**Acceptance**

- No row-at-a-time insert loop for the bulk tables
  **Phase** 3 · **Depends** PB-018 · **Evidence** seed script

### PB-025 — The seed refuses a database it did not write

As a maintainer, I want the seed to stop before truncating unknown data, so that pointing it at the wrong database costs nothing.
**Acceptance**

- Gates on content, not on the connection string (decision 32)
- Refuses with nothing truncated; an explicit override proceeds
- Verified end to end against a probe row
  **Phase** 3 · **Depends** PB-018 · **Evidence** decision 32

### PB-026 — Determinism proved in CI

As a reviewer, I want the determinism claim to be a test, so that it is not an argument in a document.
**Acceptance**

- `test(db): seed is deterministic` runs on the generator in CI
- The database-level half remains open as PB-D01
  **Phase** 3 · **Depends** PB-018 · **Evidence** decision 24

### PB-027 — Cross-field invariants asserted, not just counts

As a reviewer, I want the seed tested on relationships between fields, so that two correct halves with nothing relating them cannot pass.
**Acceptance**

- For every field that ends something, no activity after it
- Every child row falls inside its parent's validity window
- Every date pair ordered
  **Phase** 3 · **Depends** PB-021 · **Evidence** `tasks/lessons.md`, decisions 29–32

---

## Phase 4 — Comp maths in `packages/core` (test-first)

Every ticket here is two commits: `test(core): …` then `feat(core): …`. The test commit lands first; the history is the evidence.

### PB-028 — `Money`

As the HR manager, I want money arithmetic that cannot drift, so that a total of 10,000 salaries is exact.
**Acceptance**

- Minor units plus currency; add and compare reject mixed currencies
- No float arithmetic in any code path
- Named tests: zero, negative, large value near the 64-bit edge, mixed-currency rejection
  **Phase** 4 · **Depends** PB-010 · **Evidence** —

### PB-029 — `toUsd(money, rateTable, onDate)`

As the HR manager, I want salaries comparable across six countries, so that an INR salary and a GBP salary sit on the same axis.
**Acceptance**

- Effective-dated lookup picks the rate open on `onDate`
- Named tests: rate boundary on the exact effective date, date before any rate, currency absent from the table, same-currency identity
  **Phase** 4 · **Depends** PB-028 · **Evidence** —

### PB-030 — `compRatio(salary, band)`

As the HR manager, I want pay expressed against band midpoint, so that "paid fairly for the level" is a number.
**Acceptance**

- Salary ÷ midpoint, computed in local currency, never in normalised USD (decision 11)
- Named tests: salary at midpoint returns 1, employee with no band, midpoint of zero rejected
  **Phase** 4 · **Depends** PB-028 · **Evidence** decision 11

### PB-031 — `rangePenetration(salary, band)`

As the HR manager, I want position within the band as 0–1, so that I can see who is near the floor or the ceiling.
**Acceptance**

- `(salary − min) / (max − min)`, one documented convention for values outside the band
- Named tests: at min, at max, below min, above max, zero-width band
  **Phase** 4 · **Depends** PB-030 · **Evidence** —

### PB-032 — `percentiles(values, [25,50,75,90])`

As the HR manager, I want p25/p50/p75/p90 for any slice, so that distribution is readable without exporting to a spreadsheet.
**Acceptance**

- One interpolation method, named in the glossary and in the function doc
- Named tests: empty input, single value, two values, all-equal values, even and odd counts, unsorted input
  **Phase** 4 · **Depends** PB-028 · **Evidence** —

### PB-033 — `outliers(employees, bands, threshold)`

As the HR manager, I want the people outside their band surfaced, so that I can act on specific cases rather than on averages.
**Acceptance**

- Three categories: below min, above max, comp ratio outside threshold
- Operates on the employees a report can see, matching the seed's planted definition (decision 29)
- Against the seed fixture: 40 below min, 25 above max
- Named tests: employee with no band, exactly at min and at max, threshold boundary, empty input
  **Phase** 4 · **Depends** PB-030, PB-031 · **Evidence** —

### PB-034 — `payGap(groupA, groupB, { minGroupSize })`

As the HR manager, I want mean and median gap with small groups suppressed, so that a gap computed over three people never reaches a decision.
**Acceptance**

- Returns mean gap, median gap, and a suppression state — never a silent omission
- Suppressed below `minGroupSize`; the suppression is part of the return value
- Against the seed fixture: Sales at 11.7%, Legal suppressed at 11 people
- Named tests: empty group, single member, all-equal salaries, undisclosed gender excluded from both groups, group exactly at the threshold
  **Phase** 4 · **Depends** PB-029, PB-032 · **Evidence** —

### PB-035 — Edge-case coverage is named, not incidental

As a reviewer, I want each edge case to be its own named test, so that the coverage can be read from the test list.
**Acceptance**

- Every edge case listed in the plan appears as a named test under the function it belongs to
- Tests assert relationships, not values the implementation was written to emit (`tasks/lessons.md`)
  **Phase** 4 · **Depends** PB-028…PB-034 · **Evidence** —

---

## Phase 5 — API: employees

### PB-036 — Fastify app with zod at the boundary

As a maintainer, I want request and response shapes validated at the edge, so that handlers can assume typed input.
**Acceptance**

- Fastify 5, typed routes, zod schemas on every request and response
- Unknown fields rejected rather than silently dropped
  **Phase** 5 · **Depends** PB-011 · **Evidence** —

### PB-037 — `GET /employees`

As the HR manager, I want a paginated, filterable, sortable list, so that I can find a person among 10,000 without scrolling.
**Acceptance**

- Keyset pagination; filters for country, department, level, status; sort on a documented set of columns
- Response never contains the full table
- Tests cover an empty page, the last page, and an invalid cursor
  **Phase** 5 · **Depends** PB-036, PB-042 · **Evidence** —

### PB-038 — `GET /employees/:id`

As the HR manager, I want one employee with their salary timeline, so that I can see how their pay reached its current number.
**Acceptance**

- Detail plus ordered salary records, with band position and comp ratio from `packages/core`
- 404 for an unknown id
  **Phase** 5 · **Depends** PB-037, PB-030 · **Evidence** —

### PB-039 — Create and edit an employee

As the HR manager, I want to add a joiner and correct a record, so that the system holds the data the spreadsheet did.
**Acceptance**

- `POST /employees`, `PATCH /employees/:id`, validated at the boundary
- Tests cover a duplicate employee code and an unknown department or level
  **Phase** 5 · **Depends** PB-036 · **Evidence** —

### PB-040 — Record a salary change

As the HR manager, I want a raise to open a new record and close the old one atomically, so that history is never overwritten and never doubled.
**Acceptance**

- `POST /employees/:id/salary` closes the open record and opens the new one in one transaction
- The partial unique index (PB-016) is the backstop; a concurrent second call fails rather than corrupts
- Tests cover a backdated effective date and a concurrent double-post
  **Phase** 5 · **Depends** PB-039, PB-016 · **Evidence** —

### PB-041 — Repository layer separate from handlers

As a maintainer, I want data access behind a repository, so that handlers stay thin and the queries are testable on their own.
**Acceptance**

- No Prisma client calls inside route handlers
  **Phase** 5 · **Depends** PB-036 · **Evidence** —

### PB-042 — Integration test harness against a real database

As a reviewer, I want API tests to run against Postgres rather than a mock, so that the SQL is covered too.
**Acceptance**

- `fastify.inject` against a test database, seeded and reset per run
- This harness is where PB-D01 gets its database-level determinism assertion
  **Phase** 5 · **Depends** PB-036, PB-026 · **Evidence** —

---

## Phase 6 — API: analytics

### PB-043 — `GET /analytics/bands`

As the HR manager, I want the band table with occupancy, so that I can see which bands are crowded and which are empty.
**Acceptance**

- Band min/midpoint/max per level × country with headcount
- Tests cover a band with no occupants
  **Phase** 6 · **Depends** PB-042 · **Evidence** —

### PB-044 — `GET /analytics/distribution`

As the HR manager, I want headcount and p25/p50/p75/p90 grouped by country, department or level, so that I can compare slices.
**Acceptance**

- Grouping is a parameter with a fixed allowed set
- Percentile method matches `packages/core` (PB-032); a slice computed both ways returns the same number
  **Phase** 6 · **Depends** PB-032, PB-042 · **Evidence** —

### PB-045 — `GET /analytics/comp-ratio`

As the HR manager, I want comp-ratio distribution overall and per slice, so that I can see where pay sits against midpoint across the org.
**Acceptance**

- Computed in local currency (decision 11)
- Tests cover a slice where every employee lacks a band
  **Phase** 6 · **Depends** PB-030, PB-042 · **Evidence** —

### PB-046 — `GET /analytics/outliers`

As the HR manager, I want the outlier list as an endpoint, so that the UI shows names I can act on.
**Acceptance**

- Returns the three categories from PB-033 with enough fields to link to the employee
- Against the seed: 40 below min, 25 above max
  **Phase** 6 · **Depends** PB-033, PB-042 · **Evidence** —

### PB-047 — `GET /analytics/pay-gap`

As the HR manager, I want the gap reported with suppression stated, so that a missing number is visibly a decision and not a bug.
**Acceptance**

- Suppressed groups return an explicit "not reported, group too small" state with the headcount threshold
- Against the seed: Sales at 11.7%, Legal suppressed
  **Phase** 6 · **Depends** PB-034, PB-042 · **Evidence** —

### PB-048 — Aggregation split stated and held

As a maintainer, I want the rule for what runs in SQL and what runs in `packages/core` written down, so that the same number is not computed two different ways.
**Acceptance**

- Grouping and counting in SQL; exact money arithmetic and percentiles in `packages/core`
- A test compares one slice computed both ways
  **Phase** 6 · **Depends** PB-044 · **Evidence** —

---

Continues in [`user-stories-PART2.md`](user-stories-PART2.md): auth, web, ask bar, performance, audits, ship, carried debt, and what is deliberately not being built.
