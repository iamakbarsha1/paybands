# paybands — implementation plan

Repo: `github.com/iamakbarsha1/paybands` (public, remote via `github.com-personal`)
Design decisions live in [`docs/design-notes.md`](../docs/design-notes.md). This file is the build order.

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
- [ ] `README.md` — clone → install → seed → run → test _(install/run/test done; seed in phase 3)_
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

- [ ] Neon Postgres project, connection string in `.env.example` (never a real one in git)
- [ ] Prisma schema: country, currency, fx_rate, department, job_level, employee, salary_record, pay_band, app_user
- [ ] Money columns as `BigInt` minor units. No floats, no `Decimal` for storage.
- [ ] Indexes: `salary_record(employee_id, effective_from)`, `employee(country_code, department_id, job_level_id)`, `pay_band(job_level_id, country_code)`
- [ ] Partial unique index: one open salary record per employee (`effective_to IS NULL`)
- [ ] Migration committed, not just `db push`
- [ ] Commit: `feat(db): schema and migrations`

## Phase 3 — Seed

- [ ] Deterministic RNG with a fixed seed. Reseeding twice gives the same database.
- [ ] 6 countries, 8 job levels, 10 departments, pay bands per level × country
- [ ] 10,000 employees with a realistic pyramid — most at L2–L4, few at L7–L8
- [ ] 3–5 salary records each, effective-dated: hire → merit → promotion
- [ ] **Planted outliers**: ~40 below band min, ~25 above band max, one department with a real gender gap, one department with a gap over too few people to report
- [ ] Seeded HR-manager login
- [ ] Batched inserts — 10k rows one at a time is a slow seed and a bad look
- [ ] Commit: `feat(db): seed script for 10k employees`, `test(db): seed is deterministic`

> The planted outliers matter. An outlier report that finds nothing because the data is uniformly random demos nothing.

## Phase 4 — Comp maths (`packages/core`) — TDD

This is where the real logic is and where the tests earn their keep. Tests are committed before the implementation, each as its own commit.

- [ ] `Money` — minor units, currency, add/compare, no float arithmetic anywhere
- [ ] `toUsd(money, rateTable, onDate)` — effective-dated FX lookup
- [ ] `compRatio(salary, band)` — salary ÷ midpoint
- [ ] `rangePenetration(salary, band)` — position in band, 0–1
- [ ] `percentiles(values, [25,50,75,90])` — one documented interpolation method, tested at the edges
- [ ] `outliers(employees, bands, threshold)` — below min, above max, comp ratio out of range
- [ ] `payGap(groupA, groupB, { minGroupSize })` — mean and median gap, **suppressed below minimum headcount**
- [ ] Edge cases, each a named test: empty group, single member, all-equal salaries, undisclosed gender, employee with no band, salary in a currency with no rate on that date
- [ ] Commit per function: `test(core): …` then `feat(core): …`

## Phase 5 — API: employees

- [ ] Fastify 5, typed routes, zod schemas at the boundary
- [ ] `GET /employees` — keyset pagination, filter by country/department/level/status, sort
- [ ] `GET /employees/:id` — detail + salary timeline
- [ ] `POST /employees`, `PATCH /employees/:id`
- [ ] `POST /employees/:id/salary` — new effective-dated record, closes the previous one in a transaction
- [ ] Repository layer separate from route handlers; handlers stay thin
- [ ] Integration tests via `fastify.inject` against a test database
- [ ] Commit per endpoint group

## Phase 6 — API: analytics

- [ ] `GET /analytics/bands` — band table with occupancy
- [ ] `GET /analytics/distribution` — p25/p50/p75/p90 + headcount, grouped by country | department | level
- [ ] `GET /analytics/comp-ratio` — distribution overall and per slice
- [ ] `GET /analytics/outliers`
- [ ] `GET /analytics/pay-gap` — with suppression, and the suppression stated in the response rather than silently omitted
- [ ] Aggregation in SQL where the database is better at it; `packages/core` keeps the maths that must be exact
- [ ] Commit per report

## Phase 7 — Auth

- [ ] Argon2id password hashing
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

_Filled in as phases complete._
