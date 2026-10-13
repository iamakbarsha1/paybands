# Decision log

Decisions logged as they were made, not reconstructed afterwards. Each one argued against before being accepted.

**Verdicts** — **SOUND** (evidence supports it) · **WEAK** (defensible, but thinner than claimed or a cheaper option exists) · **WRONG** (evidence contradicts it) · **UNFOUNDED** (not judgable yet).

**Lenses (DOUBT)** — **D**oes it need to exist · **O**ne-way door · **U**ntested claim · **B**last radius · **T**rade given up.

---

### 1. Money is stored as integer minor units

**SOUND** · reversal: expensive, a column type on every salary and band row plus every read path · 2026-10-13 · schema design, before any migration

**Decision:** `amount_minor BIGINT`. Integer arithmetic throughout; formatting to a display string happens once, at the edge.

**Evidence:** `docs/data-model.md` §1 — the five reports all compose division over sums, and floating-point currency drifts under repeated division.

- **D** — Comp ratio and percentiles *are* the product. A figure a cent off destroys trust in the whole tool.
- **O** — A one-way door, decided at the right time: before the schema exists.
- **U** — Not a claim. Binary floating point cannot represent 0.1; that is arithmetic, not a benchmark.
- **B** — Every money column and every read path, which is why it is settled now rather than later.
- **T** — Raw rows are harder to read in a SQL client, and a `Money` type is needed to stop bare integers leaking around.

**Cheaper:** Postgres `NUMERIC` — exact, and honestly close. Rejected because it reaches JavaScript as a string or a lossy number and needs the same wrapper, so integers just make the wrapper simpler.
**Falsifier:** If every reported figure were a rounded whole-unit display value with no chained division, `NUMERIC` would be the lazier correct choice.

---

### 2. A standalone Fastify API, not Next.js route handlers

**SOUND** · reversal: moderate, the domain logic is framework-free but the deploy setup is not · 2026-10-13 · stack selection

**Decision:** `apps/api` as a Fastify 5 service, separate from `apps/web`.

**Evidence:** Role description: *"4+ years of experience in ReactJS, Node, TypeScript, LLMs and PostgreSQL"*. Brief: *"Language & Framework as per the role you've applied for"*. Node is named as its own item alongside React.

- **D** — Yes, but the honest reason is legibility, not architecture. Route handlers would also be Node; a separate service makes the backend reviewable without reading the frontend.
- **O** — No. The domain code has no framework imports; swapping the HTTP layer is a day.
- **U** — No performance claim. None would be true at this scale.
- **B** — A second deploy target and a CORS boundary. Both real, both small.
- **T** — Gives up single-deploy simplicity. For a take-home judged on backend craft, visible backend structure is worth one more deploy.

**Cheaper:** Next.js route handlers — one deploy, no CORS. It would genuinely work.
**Falsifier:** If the brief had named Next.js full-stack rather than listing Node separately, the cheaper option wins.

---

### 3. PostgreSQL, not the SQLite the brief names

**SOUND** · reversal: moderate, Prisma hides most of it but `BIGINT` handling and raw aggregation SQL differ · 2026-10-13 · stack selection

**Decision:** Neon Postgres via Prisma.

**Evidence:** Brief: *"Relational database of your choice, like SQLite"* — permitted, not required. The role description names PostgreSQL.

- **D** — Yes. SQLite on a free host needs a persistent volume, the most common way a deployed take-home is found dead a week later.
- **O** — Not really. Prisma keeps the switch cheap while the queries stay ordinary.
- **U** — No claim that Postgres is faster. At 50k rows neither database is the constraint.
- **B** — A hosted dependency and a connection string to manage.
- **T** — Gives up zero-setup local running. Mitigated by `docker compose up` and a documented one-command path.

**Cheaper:** SQLite as a committed file. Cheapest for local review, worst for a live URL.
**Falsifier:** Drop the deployment requirement and SQLite is right.

---

### 4. `packages/core` as a separate workspace package

**WEAK** · reversal: cheap, a folder move and an import path · 2026-10-13 · repo layout, before any code exists

**Decision:** Comp maths and shared domain types in their own package, framework-free, consumed by both apps.

**Evidence:** No code yet. Judged against `tasks/todo.md` phase 4, which lists seven pure functions with their own suite.

- **D** — Arguably not. `apps/api/src/domain/` with no framework imports would test identically; the package boundary buys enforcement of a rule one person could simply follow.
- **O** — Cheap to reverse; nothing external depends on the boundary.
- **U** — The soft spot. "The web app needs the same types" is an assumption until the web app is written.
- **B** — Adds a workspace package and a build-order edge. Small, not free.
- **T** — Gives up a flatter tree for a boundary that is currently aspirational.

**Cheaper:** `apps/api/src/domain/`, with the web app importing types through one generated API-contract file.
**Falsifier:** If by phase 9 the web app imports real functions from core — formatting, band-position maths for a chart — this upgrades to SOUND. If it only ever imports types, the package should collapse and this log should say so.

**Update, phase 1:** Still WEAK; one objection answered. The enforcement point no longer holds — `eslint.config.js` fails the build if anything in `packages/core` imports Fastify, Next, React, Prisma or an I/O builtin. The untested claim stands: both apps import *values* (`apps/web/app/page.tsx:1`, `apps/api/src/app.ts:2`), but they are enum tables, not the arithmetic the package exists for. The phase 9 test remains.

---

### 5. Effective-dated salary history, when no report needs it

**SOUND** · reversal: expensive in the other direction — that is the whole argument · 2026-10-13 · data model

**Decision:** Salary lives in `salary_record` rows with `effective_from` / `effective_to`. "Current salary" is derived, not stored.

**Evidence:** `docs/requirements.md` — all five reports read current salary only. So this is complexity ahead of demonstrated need, which normally fails the first lens.

- **D** — Not for the reports. It survives on asymmetry: one table and a date predicate now, versus rewriting the schema, the seed and every query later.
- **O** — The one-way door is the *flat* version. A history table can be ignored; a single `salary` column cannot be un-flattened without a migration.
- **U** — "An HR manager eventually asks what we paid her before the promotion" is a product judgment, not a measurement. Stated as such.
- **B** — Every read path grows a date predicate. Contained by making it one predicate used identically everywhere, not a flag that can drift.
- **T** — Gives up a simpler schema and seed. Held in check by keeping the UI surface to a timeline on the detail page.

**Cheaper:** One `current_salary_minor` column on `employee`. Smaller everywhere, sufficient for every report in scope.
**Falsifier:** If Incubyte answers question 4 with "current salary is enough", the cheaper option wins and this reverses while it is still one table.

---

### 6. Authentication yes, role system no

**SOUND** · reversal: cheap, the route guard is the single place that changes · 2026-10-13 · scope

**Decision:** Session login with hashed passwords and protected routes. No roles table, no permissions matrix.

**Evidence:** The brief names exactly one persona, and requires a deployed, publicly reachable app.

- **D** — Auth yes: 10,000 salaries on an open URL is a judgment failure whatever else the repo gets right. Roles no: there is no second user type to authorise differently.
- **O** — Neither direction is a one-way door.
- **U** — No claim beyond "the data is sensitive", which the dataset settles.
- **B** — Auth touches every route, which is why it is one guard registered once rather than a check per handler.
- **T** — Gives up an open demo link. Paid for with seeded credentials in the README.

**Cheaper:** No auth, open demo URL. Cheapest, and wrong for this dataset.
**Falsifier:** An employee-facing or manager-facing view makes RBAC necessary immediately.

---

### 7. An LLM ask bar, built last and feature-flagged

**WEAK** · reversal: cheap by construction, nothing in phases 1–9 imports it · 2026-10-13 · scope, after reading the role description

**Decision:** A natural-language input that translates a question into a zod-validated query object, which runs the same deterministic analytics the report pages use. The model never computes a number and never sees a salary row.

**Evidence:** Role description names LLMs. Brief: *"We are not looking for the most complex system, but for good engineering judgment."* The reports were already decided as the product.

- **D** — Honestly, no. The HR manager's job is done by the reports. This exists because the role description asks for LLM experience — a candidate's reason, not a user's. Recorded as such.
- **O** — No. Isolated behind a flag, deletable in one commit.
- **U** — "It demonstrates judgment about where a model belongs" is unverifiable until a reviewer reacts. It could as easily read as scope creep in a brief that warns against exactly that.
- **B** — An API key, a network dependency, a mocked boundary in the suite. All contained to phase 10.
- **T** — Gives up time that could go into the reports, the tests or the performance pass — the things actually being graded.

**Cheaper:** Skip it. Write a paragraph on why a language model should not be near money arithmetic, and spend the hours on test depth.
**Falsifier:** If phases 1–9 are not finished and polished, this phase should not start. That is the gate.

---

### 8. Public repository

**SOUND** · reversal: cheap, but anything pushed public should be assumed seen · 2026-10-13 · submission mechanics

**Decision:** `github.com/iamakbarsha1/paybands`, public.

**Evidence:** The brief asks for a repository link by email. A private repo needs the reviewer's handle and an invite round trip.

- **D** — Yes. Reviewer friction is the thing being removed.
- **O** — Reversible, with the usual caveat about anything already published.
- **U** — No claim made.
- **B** — Means no real secrets, ever. `.env` is gitignored, `.env.example` carries placeholders, and the phase 12 audit checks git history rather than just `HEAD`.
- **T** — The brief is Incubyte's document, so it stays out of the repo; `*.docx` is gitignored.

**Cheaper:** Private with an invite. Marginally safer, slower for the reviewer.
**Falsifier:** If Incubyte prefers submissions kept private, flip it and send an invite.

---

### 9. FX rates stored as integer micros, not a decimal column

**SOUND** · reversal: moderate, one column type and one conversion function, before any migration · 2026-10-13 · data model

**Decision:** `fx_rate.rate_to_usd_micros` as an integer of millionths, replacing the `decimal rate_to_usd` in the first-cut diagram. Conversion is `amount_minor × rate_micros / 1_000_000`, divided once at a documented rounding point.

**Evidence:** Decision 1 above — money is integer minor units precisely because chained division over floats drifts. A float rate multiplied into an integer amount re-introduces the float on the first multiply.

- **D** — Yes. One float left in the chain defeats the reason the rest of the chain is integers.
- **O** — Not yet; it becomes one the moment a migration is written. That is the argument for settling it now.
- **U** — No performance claim. Six digits of precision covers every pair in scope by orders of magnitude.
- **B** — The rate table, the seed, one conversion function. Nothing else reads a rate directly.
- **T** — Gives up a rate column that reads naturally in a SQL client, and forces the rounding point to be chosen explicitly rather than inherited. The second is really a benefit.

**Cheaper:** `NUMERIC(18,8)` for the rate. Exact in the database, but it arrives in JavaScript as a string and needs parsing into an integer anyway.
**Falsifier:** A currency pair needing more than six decimal places to round correctly at realistic magnitudes — which would grow the scale, not change the type.

---

### 10. `gender` is a NOT NULL enum with an explicit `undisclosed`

**SOUND** · reversal: cheap now, expensive after the seed exists — making it nullable later means auditing every consumer for a new `NULL` branch · 2026-10-13 · data model

**Decision:** Four values, no `NULL`. `undisclosed` and `other` count toward headcount and are excluded from the two-group gap comparison, with the excluded count in the response.

**Evidence:** `docs/requirements.md` — the gap report is one of five named deliverables, with suppression listed as a feature of it.

- **D** — Yes. `NULL` versus `undisclosed` is the difference between a person the query forgot and a person the query counted and set aside. In a report about counting people fairly, a silently dropped row is the worst available failure.
- **O** — Not in this direction. The opposite direction lets a `NULL` branch go unwritten in each consumer, and finding them later is an audit rather than a migration.
- **U** — No measured claim. "Real HR data has gaps" is handled by construction rather than by hope.
- **B** — Every gap-report path has to say what it does with `other` and `undisclosed`. That is the point.
- **T** — Adding a fifth value is a migration. Free text avoids that and makes the report ungroupable, which is worse.

**Cheaper:** Nullable `gender` with `COALESCE(gender, 'undisclosed')` at each read site. Identical results when every read site remembers.
**Falsifier:** Cut the gap report and the column carries no analytical weight; nullable free text would do.

---

### 11. Comp ratio is computed in local currency, never in normalised USD

**SOUND** · reversal: cheap in code, expensive in trust — the kind of error noticed only when a published number moves for no reason · 2026-10-13 · glossary, defining the band-position measures

**Decision:** Comp ratio and range penetration divide a local-currency salary by a local-currency band figure. USD normalisation is used only for cross-country *salary* comparison in the distribution report.

**Evidence:** `docs/data-model.md` §3 — bands are scoped to `(job_level, country)` and denominated in the country's currency.

- **D** — Yes. Converting both sides to USD gives an identical ratio today and a different one tomorrow, because the rate moved. A comp ratio that changes without the pay or the band changing is a bug that reads as a finding.
- **O** — Cheap to reverse as code. The expensive part is that the wrong version is self-consistent and plausible, so it survives review and is caught by a confused user instead.
- **U** — Not a measurement question. It follows from the rate cancelling only if both sides are converted on the same date, which no caching schedule guarantees.
- **B** — Constrains the analytics layer: band lookup returns the employee's own band, and the conversion helper must not be reachable from the comp-ratio path. Worth one test asserting the ratio is stable across rate changes.
- **T** — Gives up a single uniform "everything in USD" pipeline, which would be simpler to write and wrong.

**Cheaper:** Convert everything to USD once and compute all measures there. One code path instead of two, and it breaks the moment a rate is updated.
**Falsifier:** Global rather than per-country bands would leave no local band to divide by, making USD the only option.

---

### 12. TypeScript project references dropped; `packages/core` is consumed as source

**SOUND** · reversal: cheap, one `exports` field and two build configs · 2026-10-13 · phase 1 scaffolding, reversing the project-references line in `tasks/todo.md`

**Decision:** `packages/core` has no build step. `exports` points at `./src/index.ts`, and the consumers compile it — the API through tsup's `noExternal`, the web app through Next's `transpilePackages`.

**Evidence:** `packages/core/package.json:9`, `apps/api/tsup.config.ts:10`, `apps/web/next.config.ts:5`. Verified end to end: `node apps/api/dist/index.js` serves `/reference` with values defined in `packages/core/src/domain.ts`.

- **D** — No. Project references solve build *ordering* — making core's `.d.ts` files exist before a consumer typechecks. With no emitted artifact there is nothing to order.
- **O** — Cheap either way while core exports one module, and it is `private: true`, so no external consumer can be surprised.
- **U** — Verified, not assumed. `pnpm typecheck` runs three projects with no ordering constraint and no prior build, from a clean `node_modules`.
- **B** — One line of config in each consumer, and core cannot be published as-is. Saves `composite`, `declaration`, a `references` array per package, a `tsc -b` solution file, and the `noEmit`-versus-`composite` conflict a Next.js app in the solution would create.
- **T** — Gives up incremental cross-package builds, independent publishing, and declaration-emit validation of core's public type surface. The first two are unwanted; the third is a real gap, accepted because phase 4 is test-first on core and a build step between edit and test is friction TDD punishes daily.

**Cheaper:** None. The next-simplest option is the one dropped — strictly more configuration for an ordering guarantee no longer needed.
**Falsifier:** If core ever needs publishing, or a consumer appears that cannot compile TypeScript source, it needs a real build and the references come back.

---

### 13. TypeScript 6, not the TypeScript 7 the registry marks latest

**SOUND** · reversal: cheap, a version bump once the linter's peer range moves · 2026-10-13 · phase 1 toolchain

**Decision:** `typescript@^6.0.3` across the workspace, with `typescript-eslint@^8.71.2` providing type-aware linting.

**Evidence:** `typescript-eslint@8.71.2` declares `typescript: ">=4.8.4 <6.1.0"`. TypeScript 7.0.2 is outside it. `package.json:24`.

- **D** — Yes. The alternative is not "no decision", it is silently running an unsupported compiler under the linter.
- **O** — No. Nothing uses TypeScript 7 syntax, so the bump is one line when the peer range moves.
- **U** — Not a claim that 6 is better than 7. The claim is narrower and checkable: 7 is outside a declared peer range this repo depends on.
- **B** — None. Everything typechecks on 6.0.3 from a clean install.
- **T** — Gives up TypeScript 7's compiler speed, the headline reason to want it. At three small packages that typecheck in seconds, speed buys nothing and type-aware linting buys a lot — `no-floating-promises` in particular, in a codebase about to grow database transactions.

**Cheaper:** Take TypeScript 7 and drop to the non-type-checked lint config. Simpler, and it removes the rules that find defects rather than style.
**Falsifier:** When `typescript-eslint` widens its peer range to include 7, this reverses. Nothing else holds it.

---

### 14. Node 24, not the Node 22 the planning notes named

**SOUND** · reversal: cheap, one line in `.nvmrc` and one in `engines` · 2026-10-13 · phase 1 toolchain

**Decision:** `.nvmrc` pins `24`, `engines.node` is `>=24`, and CI reads the version from `.nvmrc` rather than hardcoding it.

**Evidence:** `.nvmrc`, `package.json:11`, `.github/workflows/ci.yml:22`. Next 16 requires `>=20.9.0`, so the floor is not what forces this.

- **D** — Yes, in that *some* version has to be pinned. The real alternative is leaving it unpinned, and then CI, the deploy host and a reviewer's machine each pick their own.
- **O** — No.
- **U** — No claim that 24 is faster. The claim is about support window: 24 is the LTS line with the longer remaining life, which matters for a repo cloned months from now.
- **B** — CI, the deploy target, and anyone cloning. Contained by one source of truth — CI reads `.nvmrc`, so the two cannot drift.
- **T** — Gives up Node 22 compatibility, which nothing needs, and gives up matching the newer version this was developed on. So the full CI sequence was replayed against Node 24 before the workflow was committed.

**Cheaper:** Leave it unpinned. Cheapest to write, and the standard way a take-home is found broken on someone else's machine.
**Falsifier:** If the chosen deploy host does not offer Node 24, the host wins.

---

### 15. Integer surrogate keys, with natural keys for country and currency

**SOUND** · reversal: expensive, a type change on every key and every foreign key · 2026-10-13 · phase 2 schema

**Decision:** `SERIAL` primary keys everywhere except `country` and `currency`, which are keyed on their ISO codes.

**Evidence:** `docs/data-model.md` ER block — `int id PK` on every table, `string code PK` on the two reference tables.

- **D** — Yes. Every table needs a key; the only question is which.
- **O** — The most expensive door in the schema, which is why it is settled before the first migration.
- **U** — No claim that integers are faster. The claim is narrower: ISO 3166 and ISO 4217 codes are stable, globally agreed identifiers, so a surrogate key beside them would be a second name for the same thing.
- **B** — Every foreign key and every API path parameter.
- **T** — Gives up UUIDs, so IDs are guessable and sequential. The dataset is behind a login with one role, and `GET /employees/4` leaking the headcount is not a threat this product has.

**Cheaper:** None — a key is mandatory. UUIDs are the alternative, not the cheaper one: wider rows, worse index locality, and unreadable in a seed script.
**Falsifier:** If employee IDs ever appear in a public URL, sequential keys become an enumeration hole and UUIDs win.

---

### 16. `app_user` has no foreign key to `employee`

**SOUND** · reversal: cheap in the direction that matters — a nullable FK is one migration; removing one after reports read it is not · 2026-10-13 · phase 2 schema

**Decision:** The login identity stays unlinked from the dataset it administers. Stated in a schema comment so it reads as a decision, not an omission.

**Evidence:** `docs/data-model.md:89`. `docs/requirements.md` names one persona and no roles; `apps/api/prisma/schema.prisma` carries the reasoning above `model AppUser`.

- **D** — The link is what would need to justify itself. Nothing in the brief asks who the logged-in user is in the data.
- **O** — No. Adding a nullable `employee_id` later costs one migration.
- **U** — No claim made.
- **B** — None today. The link would reach phase 7 auth and every report that then has to answer "is this row mine".
- **T** — Gives up "show me my own band position", a feature nobody asked for, and gives up an audit trail tying edits to a person — which the brief also does not ask for.

**Cheaper:** None. This is the cheaper option; the FK is the expensive one.
**Falsifier:** If a second role appears, or any report must behave differently for the viewer's own row, the link is required and this reverses.

---

### 17. Prisma 7.10.0, not the 8.0.0-rc the registry tags `latest`

**SOUND** · reversal: cheap, a version bump once 8 ships stable · 2026-10-13 · phase 2 schema

**Decision:** `prisma@^7.10.0`. The CLI only — no client generated until phase 3 needs one.

**Evidence:** `npm view prisma dist-tags` has `latest: 8.0.0-rc.22` and `prev: 7.10.0`, while `@prisma/client` latest is `7.10.0`. Taking `latest` would pair a release candidate CLI with a stable client.

- **D** — Yes. The alternative is not "no decision", it is silently running a release candidate.
- **O** — No. Schema syntax and migration SQL carry across the major version.
- **U** — Not a claim about 7 being better. The claim is checkable: 8.0.0-rc.22 is a candidate, and the client is not published at 8.
- **B** — One package in one workspace.
- **T** — Gives up whatever 8 improves. Nothing in this schema needs it.

**Cheaper:** None — the version has to be pinned either way.
**Falsifier:** When 8.0.0 ships stable with a matching client, this reverses.

---

### 18. The one-open-salary invariant is a hand-written partial unique index

**SOUND** · reversal: cheap to drop, expensive to recover from — the data it prevents is already wrong by the time anyone notices · 2026-10-13 · phase 2 schema

**Decision:** `CREATE UNIQUE INDEX one_open_salary_per_employee ON salary_record(employee_id) WHERE effective_to IS NULL`, written into the migration by hand because the Prisma schema has no syntax for a `WHERE` clause.

**Evidence:** `apps/api/prisma/migrations/20261013175431_init/migration.sql`. Verified twice against the database: `pg_indexes` reports the predicate, and a probe transaction that inserted a second open record was rejected with a unique violation. A second probe confirmed Prisma does not try to drop the index it cannot see — `migrate dev --create-only` against the unchanged schema produced an empty migration.

- **D** — Yes. Phase 5 closes one record and opens another in one transaction; a half-applied raise is exactly the bug this catches.
- **O** — No, dropping it is one line.
- **U** — Not assumed. Both the index and its enforcement were executed against the real database before this entry was written.
- **B** — Every salary write, which is the point. The hidden cost is that `schema.prisma` is no longer the whole truth, so the index is commented in both the schema and the migration.
- **T** — Gives up application-level checking, which cannot hold under concurrency, for a constraint that fails loudly at the point of the write.

**Cheaper:** Check for an open record in application code before inserting. Cheaper to write, and it loses the race against a second concurrent raise.
**Falsifier:** If an employee may ever hold two concurrent open salary records — a secondment, a dual contract — the invariant is wrong, not the implementation.

---

### 19. `salary_record.reason` is a Postgres enum, not free text

**SOUND** · reversal: cheap, `ALTER TABLE ... USING reason::text` · 2026-10-13 · phase 2 schema

**Decision:** `salary_reason` enum with `hire`, `merit`, `promotion`, `market`, matching the treatment `gender` already gets.

**Evidence:** `docs/data-model.md` names the four values in the ER block; `docs/data-model.md` §4 argues the same case for `gender`.

- **D** — Yes. The seed plants a hire → merit → promotion history, and the employee timeline reads the value back.
- **O** — No. Adding a fifth value is `ALTER TYPE ... ADD VALUE`, and leaving the enum is a cast.
- **U** — No claim.
- **B** — The seed and the timeline view.
- **T** — Gives up free text, so a new reason needs a migration. A free-text column makes the timeline ungroupable and admits `Merit` and `merit` as two reasons.

**Cheaper:** `TEXT` with a `CHECK` constraint. Equivalent safety, and the type is then invisible to the generated client.
**Falsifier:** If reasons become user-defined, the enum is wrong.

---

### 20. Migrations connect through the direct endpoint, the app through the pooled one

**SOUND** · reversal: cheap, one environment variable · 2026-10-13 · phase 2 schema

**Decision:** `prisma.config.ts` points the CLI at `DIRECT_URL`; `DATABASE_URL` stays pooled for the app. `.env` is gitignored, `.env.example` carries placeholders.

**Evidence:** Prisma 7.10's config type accepts `url` and `shadowDatabaseUrl` only — `directUrl` is a type error, which `tsc` caught once `prisma.config.ts` was added to the API's `include`. Migrations take advisory locks and build a shadow database, neither of which belongs on a pgbouncer connection.

- **D** — Yes. One URL for both works until a migration deadlocks behind the pooler.
- **O** — No.
- **U** — Honest limit: the pooled URL did apply the first migration before this was fixed. The separation is Neon's documented guidance, not a failure observed here.
- **B** — Two environment variables instead of one, in `.env.example` and on the deploy host.
- **T** — Gives up a single connection string, and with it the chance of a reader assuming one URL is enough.

**Cheaper:** One pooled URL for everything. It worked once; it is the setup that fails under a concurrent migration.
**Falsifier:** On a Postgres host with no pooler in front of it, the two URLs are the same string and this collapses.

---

### 21. Prisma lives in `apps/api`, not a `packages/db` workspace

**SOUND** · reversal: cheap, a directory move while there is one consumer · 2026-10-13 · phase 2 schema

**Decision:** `apps/api/prisma/` holds the schema and migrations; the generated client is gitignored.

**Evidence:** `packages/core` is barred from importing `@prisma/client` by `eslint.config.js`, and `apps/web` talks to the API over HTTP. That leaves one consumer.

- **D** — A `packages/db` boundary would exist to decouple two consumers. There is one.
- **O** — No.
- **U** — No claim.
- **B** — None. Phase 3's seed and phase 5's repository layer both live in the same package.
- **T** — Gives up a seam that would let a second service share the schema, which this build does not have.

**Cheaper:** None — this is the cheaper option.
**Falsifier:** If a second deployable needs the same tables, the package earns its keep.

---

### 22. The seed generates its own data, with no data-generation dependency

**SOUND** · reversal: cheap, the generator is one file behind one function · 2026-10-14 · phase 3 seed

**Decision:** A twelve-line `mulberry32` PRNG and per-country name tables written into the repo, instead of `@faker-js/faker` or `seedrandom`.

**Evidence:** The seed calls four generators — a float, an integer, a weighted pick and a name — against `@faker-js/faker`'s multi-megabyte locale payload.

- **D** — Yes. Reproducible data is the whole of phase 3.
- **O** — No. The RNG sits behind `rng.ts` and nothing outside it knows which algorithm runs.
- **U** — The determinism claim is tested rather than assumed: `apps/api/src/seed/generate.test.ts`.
- **B** — None. Avoiding a dependency is the point.
- **T** — Gives up faker's variety. Six country name tables repeat across 10,000 employees, so duplicate full names occur — as they do in a real company.

**Cheaper:** `faker` with `faker.seed(n)`, which is fewer lines here. Rejected because the guarantee would then live in a dependency's changelog instead of in this repo.
**Falsifier:** If the seed needed addresses, phone numbers and company names as well, hand-written tables stop being the cheaper option.

---

### 23. The seed assigns primary keys itself, then resets every sequence

**SOUND** · reversal: moderate, the ids are woven through every foreign key the generator emits · 2026-10-14 · phase 3 seed

**Decision:** `generate()` assigns `id` on every row. The writer truncates with `RESTART IDENTITY`, inserts the explicit ids, then `setval`s each sequence to `max(id)`.

**Evidence:** `employee.manager_id` and `salary_record.employee_id` point at rows the same run creates (`apps/api/prisma/schema.prisma:116`, `:132`), so the generator cannot emit them without knowing the ids. Postgres does not advance a sequence for an explicitly supplied id, so without `setval` the first `POST /employees` in phase 5 collides on id 1.

- **D** — Yes. Without explicit ids the generator has to round-trip every insert to learn the key it just created.
- **O** — Moderate. The ids are internal, but every foreign key in the generated output assumes them.
- **U** — Not assumed. The seed run reads `last_value` back off each sequence.
- **B** — Every seeded table, plus one `setval` each. It also fixes the insert order: employees are generated highest level first, so a manager's id is always lower than their report's and a chunked insert never references a row a later chunk creates.
- **T** — Gives up letting the database own key assignment, which is what the schema says it does.

**Cheaper:** Insert without ids and read them back. That is 10,000 round trips, or `RETURNING` over chunks plus a second pass to fill `manager_id`.
**Falsifier:** If ids were client-generated UUIDs, the sequence problem disappears and so does this entry.

---

### 24. Determinism is proved on the generator, not on the database

**WEAK** · reversal: cheap, a database-level check is additive · 2026-10-14 · phase 3 seed

**Decision:** The committed test calls `generate(SEED)` twice, deep-equals the two results, and asserts a SHA-256 of the canonical output against a constant. No database.

**Evidence:** `.github/workflows/ci.yml` has no database service and no secret, and the test-database harness is phase 5 work (`tasks/todo.md:89`).

- **D** — Yes. "Reseeding twice gives the same database" is a claim, and an untested claim is the thing this log exists to catch.
- **O** — Cheap. The database-level check is added, not swapped in.
- **U** — This is the weak part, and it is why the verdict is not SOUND. The test proves the generated rows are identical. It does not run the writer, so "the same database" rests on an argument rather than an assertion: the writer truncates, inserts explicit ids in a fixed order and sets each sequence, so its output is a function of the generator's.
- **B** — One test file. It runs in CI today, which the alternative does not.
- **T** — Gives up catching nondeterminism introduced by the writer rather than the generator.

Two assertions rather than one, because they fail on different things. The deep-equal catches nondeterminism inside a single process. The hash catches a generator whose output changed between versions, including the case the deep-equal cannot see: a `Date.now()` read once at module load, equal within a run and different tomorrow.

**Cheaper:** The deep-equal alone. Rejected for exactly that case.
**Falsifier:** A reseed that produces a different database while this test passes.

---

### 25. The seeded password hash uses a fixed argon2id salt

**SOUND** · reversal: cheap, one line, and only the demo account is affected · 2026-10-14 · phase 3 seed

**Decision:** The HR-manager account is hashed with argon2id against a constant salt, so `app_user` is byte-identical on every reseed.

**Evidence:** argon2id with a random salt writes a different `password_hash` on every run, which breaks the one guarantee phase 3 exists to provide (`tasks/todo.md:56`). The account is a demo login whose password ships in the README (`tasks/todo.md:168`).

- **D** — Yes. Without it the determinism test either fails or has to exclude a table, and an excluded table is a hole in the claim.
- **O** — Cheap. The constant is one line in the seed.
- **U** — No claim. The salt is fixed only for rows this script writes; phase 7 hashes real passwords with a random salt.
- **B** — One row, in one script, never in the application.
- **T** — Gives up per-row salt uniqueness on the seeded account. A fixed salt matters because one precomputed table then cracks many accounts. There is one account, and its password is printed in the README.

**Cheaper:** Hard-code a pre-computed hash string and skip the dependency here. Rejected because a hash constant cannot be read, cannot be rotated without an external tool, and phase 7 needs argon2 for verification regardless.
**Falsifier:** If seeded accounts ever become real user accounts, the fixed salt is wrong and the seed should stop creating logins at all.

---

### 26. The planted outliers are hard-coded, not drawn from the distribution

**SOUND** · reversal: cheap, the counts are constants · 2026-10-14 · phase 3 seed

**Decision:** Exact counts — 40 employees below their band minimum, 25 above the maximum — a named department carrying a fixed gender pay multiplier, and a named department with a headcount hard-coded small enough to be suppressed.

**Evidence:** `tasks/todo.md:65` — "An outlier report that finds nothing because the data is uniformly random demos nothing." A department's gender split drawn from a 44/52/2/2 distribution over 400 people lands within a point of the mean, so the gap report would have nothing to show.

- **D** — Yes. Phases 6 and 9 build an outlier report and a gap report, and both need something to find.
- **O** — Cheap.
- **U** — Not a claim about the data. It is the data.
- **B** — Phases 4 and 6 can assert exact numbers instead of ranges, which is the second reason to plant rather than hope.
- **T** — Gives up any pretence that the dataset is a sample of something. It is a fixture, and the suppressed department is a fixture twice over.

**Cheaper:** Widen the salary spread and let outliers fall out. Rejected because the count is then unknown, so no test can assert it.
**Falsifier:** If the seed were used to measure detection sensitivity rather than to demonstrate the reports, planted values would bias the result.

---

### 27. A terminated employee keeps an open salary record

**SOUND** · reversal: moderate, a backfill plus every join written against the invariant · 2026-10-14 · phase 3 seed

**Decision:** `termination_date` marks a leaver and the final `salary_record` keeps `effective_to = NULL` regardless. Every employee has exactly one open record.

**Evidence:** The partial unique index permits zero or one open record per employee, so closing the last record on termination is legal (`apps/api/prisma/migrations/20261013175431_init/migration.sql`). Rejected anyway: a report joining the current salary row would then drop every leaver silently, which is the failure `gender` being non-null exists to prevent (`docs/data-model.md` §4).

- **D** — Yes. It is the invariant every current-salary join relies on, and it is cheaper to state once than to defend at each join.
- **O** — Moderate. Changing it later means a backfill and a revisit of every query written against it.
- **U** — No claim.
- **B** — Every analytics query. They exclude leavers on `termination_date`, never on the absence of a salary row.
- **T** — Gives up reading an open record as "currently being paid". It means the last record in force, and the employee row says whether they are still here.

**Cheaper:** Close the last record on the termination date. One line, reads more naturally, and makes a left join the only safe way to read a salary.
**Falsifier:** If a report ever needs payroll liability rather than headcount compensation, "open" has to mean "still paying" and this is wrong.

---

### 28. The seed truncates and re-inserts with no wrapping transaction

**SOUND** · reversal: cheap, one `$transaction` call · 2026-10-14 · phase 3 seed

**Decision:** `TRUNCATE ... RESTART IDENTITY CASCADE`, then batched `createMany`, with no enclosing transaction.

**Evidence:** The run writes roughly 48,000 rows across eight tables. A failed run leaves a partial database, and the next run's `TRUNCATE` erases it, so re-running is the recovery.

- **D** — The transaction would exist to protect against a partial seed. A partial seed is fixed by running the seed again.
- **O** — Cheap.
- **U** — Honest limit: the pooler-timeout argument below is Neon's documented behaviour, not something measured here.
- **B** — None. The seed is a development command, and phase 13 runs it once against a fresh branch.
- **T** — Gives up atomicity. A seed interrupted halfway leaves the database inconsistent until it is re-run.

**Cheaper:** None — this is the cheaper option. Wrapping twenty-five statements in a transaction through a connection pooler adds an idle-in-transaction window and a timeout to tune.
**Falsifier:** If the seed were ever run against a database serving traffic, the gap between the truncate and the last insert is a visibly empty database and the transaction earns its place.
