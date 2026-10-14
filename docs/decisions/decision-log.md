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

**Run by hand, 2026-10-14:** three consecutive seeds, with an `md5(string_agg(row::text ORDER BY id))` taken over `employee`, `salary_record`, `pay_band` and `app_user` between runs. All four digests identical, and `employee_id_seq` and `salary_record_id_seq` both back at their row counts. That is the argument executed rather than asserted, including the fixed argon2 salt holding `app_user` steady. The verdict stays WEAK because this ran on a laptop against one database and CI still cannot.

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

**Amended by decision 29:** 40 and 25 are counts of *active* employees. As first written the outliers were drawn without regard to `termination_date`, so the reports saw 37 and 23 while this entry said 40 and 25.

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

---

### 29. The seed's planted properties are defined over active employees, not over row counts

**SOUND** · reversal: cheap now, expensive once a report asserts a number · 2026-10-14 · phase 3 seed, after adversarial review

**Decision:** Outliers are planted only on employees with no `termination_date`, and an employee's manager must also be active. The counts decisions 26 and 27 promise are counts the reports will actually return.

**Evidence:** Decisions 26 and 27 were each implemented correctly and were jointly broken. Measured against the seeded database before the fix: 40 employees below their band minimum and 25 above, but **37 and 23 among active employees**. Separately, 711 employees reported to a leaver, 657 of them still active, and 152 to someone who left before they were hired. Two independent reviewers found the first; both found the second.

- **D** — Yes. Decision 26's entire stated benefit is that phases 4 and 6 can assert exact numbers, and the number the report returns was not the number in the log.
- **O** — Cheap today, because no report exists yet. The moment phase 6 asserts whatever the report happens to return, the wrong number is frozen into a test and the fixture is the thing that has to change.
- **U** — Not a claim. Both figures were read out of the database.
- **B** — Two filters in the generator, and every count in phases 4, 6 and 9.
- **T** — Gives up the simpler reading that a planted count is a count of rows. It is a count of rows a report can see, which is a different number whenever a filter stands between the two.

**Cheaper:** Record both numbers, 40 total and 37 active, and let each consumer pick. Rejected because a fixture with two counts for one property invites the reader to assert the wrong one, which is the failure this entry exists to close.
**Falsifier:** If a report is ever written that deliberately includes leavers, its counts will not match these and the fixture needs a second planted set rather than a redefinition.

---

### 30. A reference table is dated from before the earliest row it has to serve

**SOUND** · reversal: cheap, two constants · 2026-10-14 · phase 3 seed, after adversarial review

**Decision:** `fx_rate` and `pay_band` both take their earliest `effective_from` from `HIRE_FROM`, the same constant that bounds the generated salary history.

**Evidence:** Measured before the fix: 975 salary records had no FX rate in force on their own `effective_from`, and 18,062 had no pay band — **845 of those being current records**. `docs/data-model.md` §2 instructs every reader to resolve a row with `effective_from <= $date AND (effective_to IS NULL OR effective_to > $date)`. Applying that documented predicate to `pay_band` in phase 6 would have dropped 845 current employees out of the comp-ratio report and returned no error. All four reviewers found an instance of this; none found all three.

- **D** — Yes. The document tells the next person to use a predicate that silently returns nothing.
- **O** — Cheap. Two constants.
- **U** — Not a claim. Both gaps were counted in SQL.
- **B** — Every point-in-time lookup in phases 4, 6 and 11, and it removes a whole class of empty result that would have been debugged as a query bug.
- **T** — Gives up the tidiness of a band dated from the FX period it was priced in. There is one band generation, so the alternative was a band that exists for a quarter of the history it is compared against.

**Cheaper:** Leave it and let each report use `effective_to IS NULL` instead of the as-of predicate. That works today and contradicts the document, which is worse than a wrong constant.
**Falsifier:** If pay bands ever get a second generation with real historical values, the earliest one is dated by its own data and this collapses into that.

---

### 31. The hire-date skew is computed with `sqrt`, not `Math.pow`

**SOUND** · reversal: cheap, one expression · 2026-10-14 · phase 3 seed, after adversarial review

**Decision:** `x ** 0.75` is written `Math.sqrt(Math.sqrt(x * x * x))`.

**Evidence:** Every other number driving the generator is exact: `mulberry32` is integer-only, money is `BigInt`, and the draw helpers floor an exact product. `Math.pow` with a fractional exponent was the sole exception, and ECMA-262 does not require it to be bit-identical between engine versions. `Math.sqrt` is the one case every engine takes from the hardware IEEE 754 instruction.

- **D** — Yes, because decision 24 sells byte-identical output on every machine and this was the only operation that could break it.
- **O** — Cheap.
- **U** — Honest limit: no drift was observed. `.nvmrc` pins one Node version, so the hazard is latent rather than demonstrated. The reviewer who raised it said so.
- **B** — One expression.
- **T** — Gives up the clearer `** 0.75`, which is why the line carries a comment.

**Cheaper:** A comment recording the assumption and nothing else. Rejected because decision 24 claims a guarantee, and a comment saying the guarantee might not hold is not a guarantee.
**Falsifier:** If the committed hash ever holds across two engine versions that disagree on `Math.pow`, the substitution bought nothing.

---

### 32. The seed refuses a database it did not write, and gates on content rather than on the connection string

**SOUND** · reversal: cheap, one query and one environment variable · 2026-10-14 · phase 3 seed, after adversarial review

**Decision:** Before the truncate, the writer reads `max(id)` from `employee`. No table or no rows means a fresh branch and it proceeds. `EMPLOYEE_COUNT` means the database is this seed's own output and it proceeds. Any other value is refused, printed, and overridable with `PAYBANDS_SEED_FORCE=1`.

**Evidence:** `index.ts` reads one environment variable and nine lines later issues `TRUNCATE ... RESTART IDENTITY CASCADE` across all nine tables. Nothing distinguishes `apps/api/.env` from a file holding a real connection string, and phase 13 puts a production Neon branch into exactly that position. Decision 28's own falsifier names this case.

- **D** — Yes. The operation is irreversible, has no transaction by decision 28, and phase 13 creates the second database that makes the mistake possible.
- **O** — Cheap. One query and one variable.
- **U** — The cost claim is reasoned, not measured: one scalar `SELECT` against a run that already spends about twenty seconds writing 48,000 rows.
- **B** — One function in the writer. It must tolerate a missing table, because `max(id)` on an absent relation raises `42P01` rather than returning `NULL`, and a branch with no migrations applied is the case the guard exists to wave through.
- **T** — Gives up the certainty that the seed always runs. It can now refuse, and the refusal has to carry the reason and the override or it becomes a mystery.

The test for proportionality is that the guard never speaks during ordinary work. Both normal paths, a first seed on a fresh branch and a reseed, pass silently. The accident it is built for is not someone pointing the seed at a company's HR database. It is phase 5 shipping `POST /employees`, production taking one write, and someone reseeding: `max(id)` becomes 10001 and the guard fires. Decision 23 already names that row as the reason `setval` exists.

Blind spot, stated rather than discovered later: a production branch holding only this seed's output is truncated and refilled. That is deliberate, because refilling it reproduces a byte-identical database.

**Cheaper:** A separate `SEED_DATABASE_URL` that the writer reads instead of `DATABASE_URL`. Rejected because its failure mode is "the seed does not run", which people fix by copying `DATABASE_URL` into it, and a guard that trains you to defeat it is worse than none. A database-name check cannot work either: both Neon URLs end in `/paybands`, and a branch is identified by its endpoint host.
**Falsifier:** If `EMPLOYEE_COUNT` is ever changed, a legitimate reseed of the previous dataset is refused once. If that friction recurs, gate on a marker row rather than a count.

---

### 33. Conversion carries a minor-unit scale factor, because the rate is quoted between major units

**SOUND** · reversal: cheap today, expensive the moment a USD report ships — a 100× error in one country's salaries is a number nobody checks twice · 2026-10-14 · phase 4, `toUsd`

**Decision:** `toUsd` is `amountMinor × rateMicros × 10^(2 − sourceMinorUnits) / 1_000_000`, not the `amountMinor × rateMicros / 1_000_000` that decision 9 and the schema comment state. The scale factor corrects for a source currency whose minor unit is not USD's.

**Evidence:** `apps/api/prisma/schema.prisma:66` defines the rate as "one unit of this currency in USD millionths" and gives the two-term formula. `apps/api/src/seed/reference.ts:86` sets JPY at `8_300` micros — $0.0083 per yen, a rate between *major* units, consistent with GBP at `1_380_000`. But `packages/core/src/domain.ts:21` gives JPY zero minor units. ¥4,500,000 is `amountMinor = 4_500_000`; the two-term formula returns `37_350`, read as $373.50. The true value is $37,350. The error is exactly 10², the gap between JPY's scale and USD's, and it lands on every employee in Japan — a seeded country (`reference.ts:76`).

The seed settles the question rather than leaving it to interpretation: `buildPayBands` at `reference.ts:223` multiplies by `localScale = 10 ** minorUnits` before dividing by the rate, with a comment at `reference.ts:225` working through why the basis-point and USD-minor scales cancel. Band amounts for Japan are therefore plain yen — the L1 band midpoint lands at ¥6,800,000, which is $45,560 at `6_700` micros and $455.60 under the two-term formula. The seed applies the scale factor; `toUsd` has to apply its inverse or disagree with the data it reads.

- **D** — Yes. Two of the five reports compare across countries, and decision 11 keeps comp ratio in local currency precisely so USD conversion is confined to the reports that need it. Those reports are the ones that would be wrong.
- **O** — The formula is one function in one package with no callers yet, so changing it is free today. It becomes a one-way door the moment a distribution report is published and someone remembers last quarter's Japan number.
- **U** — Not a claim, an arithmetic identity: a rate quoted major-to-major applied to minor units is only correct when both scales match. Five of the six seeded currencies have two decimals, which is why the defect hides — a fixture without JPY cannot catch it.
- **B** — `toUsd` and its tests. Decision 9's entry and the schema comment both carry the incomplete formula and are corrected by this entry rather than edited, since the log records what was decided when.
- **T** — Gives up the two-term formula that reads cleanly in the schema comment. In exchange the function has to know each currency's scale, which it already can: `minorUnitsFor` has been in `domain.ts:33` since phase 1.

The class of defect is the one `tasks/lessons.md` names: two correct halves in two different files with nothing relating them. The rate table is correct. The minor-unit table is correct. Nothing asserted that the two agree on what "one unit" means. The test that catches it is JPY → USD, by name.

**Cheaper:** Store the rate minor-to-minor instead, making the two-term formula right. Rejected because `JPY 8_300` then has to become `83`, which no longer reads as an exchange rate to anyone looking at the table, and the scale knowledge moves from one function into the seed, the migration and every future rate update.
**Falsifier:** Drop JPY — or any currency whose minor unit is not 2 — from the model and the scale factor is dead code that always evaluates to 1.

---

### 34. A missing rate on the date throws, rather than returning a typed "no rate"

**SOUND** · reversal: cheap now at zero call sites, expensive once six analytics paths each branch on it · 2026-10-14 · phase 4, `toUsd`

**Decision:** `toUsd` throws when the rate table has no row covering `onDate` for that currency. It does not return `null`, and it does not fall back to a neighbouring period.

**Evidence:** Decision 30 dates every reference table from before the earliest row it serves: `reference.ts:96` opens period one at `HIRE_FROM`, `reference.ts:56` puts that at 2014-01-01, and every salary record is dated at or after its employee's hire date. Period two is open-ended (`effectiveTo: null`, `reference.ts:104`). For the seeded dataset the uncovered case is unreachable; reaching it means the caller invented a date or the rate table was not loaded.

- **D** — Yes. A conversion with no rate has no answer, and the alternative to saying so is inventing one.
- **O** — Cheap today: zero call sites exist. The door closes in phase 6, where six endpoints would each need a branch. That is the argument for settling it now rather than when the first report is written.
- **U** — The claim "unreachable in the seeded data" is checkable, not assumed: period one starts at the hire-date floor and period two never ends. It is not yet asserted; the phase 6 report tests are where a missing-rate exclusion count would show up if the claim is false.
- **B** — Every analytics path that converts. Throwing keeps that one behaviour rather than N branches, which is the point: the leaver defect in phase 3 happened because a filter applied in one place was forgotten in another.
- **T** — Gives up partial results. A report cannot say "9,998 of 10,000 converted"; it fails whole. That ceiling belongs to the API layer, not to a pure function — if a partial answer is ever wanted, phase 6 catches and counts, and `toUsd` keeps its contract.

**Cheaper:** Return `Money | null` and let each caller decide. Rejected on the evidence above: the same shape as a nullable `gender`, which decision 10 refused for the same reason — a row quietly dropped in a report about counting people is the worst available failure.
**Falsifier:** An import path for employee data outside the seed's date range, which is a non-goal today (`docs/requirements.md`). Add one and the uncovered case becomes a user-facing state that needs a value, not an exception.

---

### 35. Rate windows are half-open, `[effectiveFrom, effectiveTo)`

**SOUND** · reversal: expensive — the convention is already baked into committed seed data · 2026-10-14 · phase 4, `toUsd`

**Decision:** A rate row covers `effectiveFrom <= date < effectiveTo`, with a null `effectiveTo` meaning open-ended. The boundary date belongs to the later period.

**Evidence:** `reference.ts:89-107` writes two rows per currency where period one's `effectiveTo` and period two's `effectiveFrom` are the same value, `FX_PERIOD_TWO_FROM` at `reference.ts:52`. A closed-closed lookup matches both rows on 2024-01-01 and returns whichever the scan reaches first, which makes a converted salary depend on row order in a system whose whole seed is deterministic by decision 24.

- **D** — Yes. Two adjacent periods sharing a boundary date is the normal shape of a rate table, and something has to say which one owns the boundary.
- **O** — Expensive, and already decided by data rather than by code: 12 committed rate rows and 48 pay-band rows use the shared-boundary shape. Choosing closed-closed now would mean rewriting the seed and reseeding.
- **U** — No performance or precision claim. The claim is about determinism, and the failure it prevents is observable: one date, two matching rows.
- **B** — `toUsd` today. The same convention has to hold for `pay_band` validity windows (`schema.prisma`, same `effectiveFrom`/`effectiveTo` pair) and for `salary_record`, so it is a house rule rather than one function's detail.
- **T** — Gives up nothing except the intuition that `effectiveTo` is the last day the rate applied. It is not; it is the first day it did not. The glossary is where that goes.

**Cheaper:** None. The alternative is not cheaper, it is a different convention with the same cost, plus a reseed.
**Falsifier:** A rate table where periods are written with a gap (one period ending 2023-12-31, the next starting 2024-01-01). Then either convention works, and the choice is free — but the committed seed does not do that.

---

### 36. Rounded half away from zero at the single division, not truncated

**WEAK** · reversal: cheap, one line in one function · 2026-10-14 · phase 4, `toUsd`

**Decision:** The division by 1,000,000 rounds to the nearest minor unit, ties away from zero, and is the only division in the conversion. BigInt's native `/` truncates toward zero; that is explicitly not used.

**Evidence:** `schema.prisma:68` already promises the conversion is "divided once at a documented rounding point". This is the entry that documents it. `packages/core/src/money.ts` allows negative amounts, so the mode has to be defined for them too.

- **D** — Yes, in the sense that a rounding mode is not optional: the division happens and something decides the last unit. No, in the sense that the *choice* between modes is near-free either way, which is why this entry is WEAK rather than SOUND.
- **O** — Cheap. One expression, one function, no stored value.
- **U** — This is the thin part, stated plainly. Truncation biases every conversion downward by up to one minor unit, averaging half a unit. Across 10,000 employees that is about $50 against a seeded payroll in the hundreds of millions — roughly one part in ten million, which moves no percentile, no comp ratio and no gap percentage. The bias is real and immaterial. The honest reason for half-away-from-zero is not the bias: it is that "rounded to the nearest cent" is explainable to the HR manager reading the report, and that truncation toward zero is asymmetric across the sign, rounding a negative delta up and a positive one down.
- **B** — One function. No stored value depends on it, so changing the mode later changes a displayed number and nothing else.
- **T** — Gives up the one-line native `/` for three lines carrying an explicit tie rule. Also gives up exact reproducibility against any external tool that truncates.

**Cheaper:** `(amountMinor * rateMicros * scale) / 1_000_000n`, BigInt truncation, one line and no tie rule. It is genuinely defensible at this scale, and if the three lines ever get in the way this is what replaces them.
**Falsifier:** A report that sums converted USD across all 10,000 employees and is reconciled against an external figure. Then the rounding mode has to match whatever that source does, and this choice is made by them rather than by us.

---

### 37. Comp ratio is a plain number from one double division, not a scaled integer division

**SOUND** · reversal: cheap, one expression in one function with no callers · 2026-10-14 · phase 4, `compRatio`

**Decision:** `compRatio` returns `number`, not `Money` and not a scaled integer. Integers stop at exactly one place: `Number(salary.amount) / Number(band.mid.amount)`. Nothing in `packages/core` rounds the result — it is the correctly-rounded double of the exact ratio, and a report that wants `0.95` rounds at the edge.

**Evidence:** `docs/glossary.md:15` defines comp ratio as `salary ÷ midpoint` and calls it unitless, so a `Money` return would carry a currency the quantity does not have.

The first draft of this entry divided in `bigint` scaled to micros, reusing decision 36's rounding helper, on the argument that `Number(bigint)` is lossy above `2^53` and `packages/core/src/fx.test.ts:113` proves `Money` reaches there. The argument does not survive the arithmetic. `Number()` on each operand carries a relative error under `2^-53`, and the two errors compose rather than compound, so the quotient is accurate to about `2.2e-16`. Scaling to micros caps the result at `1e-6`. The scaled version is the *less* precise of the two at every magnitude below roughly `1e26` minor units, which is where a relative error of `2^-53` first exceeds one part in a million. It was written to protect against a loss it is ten orders of magnitude worse than.

- **D** — The return type has to be decided; the function cannot avoid producing a quotient. The scaling was the part that did not need to exist.
- **O** — Cheap. One expression, no stored value, no caller until PB-045.
- **U** — Not a measurement, an error analysis, and it is the reason this entry reversed before any code was written. "Integer arithmetic is more exact" is true of `toUsd`, where the result is money and the division is the last step. It is false here, where the result is a ratio and the division is the only step.
- **B** — One function, one line. `divideHalfAwayFromZero` stays private to `fx.ts`; PB-032's percentile interpolation returns a `Money` and is the ticket that will want it shared.
- **T** — Gives up a stated decimal precision. `0.3333333333333333` reaches a caller where `0.333333` would have, so formatting has to round, which it was always going to do.

**Cheaper:** None. This is the cheapest form, and the alternative considered above is both longer and worse.
**Falsifier:** A requirement to reconcile comp ratio bit-for-bit against a fixed-point payroll system. Then the precision has to be stated rather than inherited, and the scaled division comes back on its own terms.

---

### 38. A missing band returns null; a mismatched currency or a non-positive midpoint throws

**SOUND** · reversal: cheap at zero call sites, expensive once five analytics endpoints each handle the result · 2026-10-14 · phase 4, `compRatio`

**Decision:** `compRatio` takes `PayBand | undefined` and returns `null` when the band is absent. It throws when the salary's currency differs from the band's, and when the midpoint is zero or negative.

**Evidence:** `docs/glossary.md:23` already settles the no-band case: "An employee with no band has no comp ratio — shown as 'no band', not as `0`, and not by dropping them from the headcount." That is a user-facing state with a specified rendering, which is exactly the condition decision 34's own falsifier names as the point where a value beats an exception. The two throws have no such state: `glossary.md:11` calls a zero-width band "a data error, not a divide-by-zero to swallow", and decision 11 requires the conversion helper to be unreachable from this path, so a GBP salary against a USD band has no answer to render.

- **D** — Yes, and decision 37 is what makes the midpoint guard load-bearing rather than cosmetic. Integer division by zero raises; `Number(0n)` does not, so a zero midpoint returns `Infinity` and a zero salary over it returns `NaN`. Either one travels through a mean and a percentile without raising anything, which is the silent-wrong failure phase 3 already paid for. A negative midpoint is worse: it divides cleanly and returns a plausible negative ratio.
- **O** — Cheap today. The door closes at PB-045 and PB-046, where each endpoint would otherwise pick its own convention.
- **U** — That a band can be missing is structural, not measured: the seed writes 48 bands for 48 level-country pairs (`apps/api/src/seed/reference.ts:217`), so it never misses today. Adding a country or a level without a band makes it reachable, and `apps/api/prisma/schema.prisma:174` indexes the pair without guaranteeing a row.
- **B** — One function. The caller branches once, at the cell that has to print "no band" anyway, so the null arm costs no branch that display did not already need.
- **T** — Gives up a uniform `number` return, so every caller's type widens by one arm.

**Cheaper:** Require `PayBand` and let the caller skip the call. Genuinely close, and rejected on one point: a caller that forgets produces no error, just a missing row, which is the failure the glossary line exists to prevent. Throwing instead was the first draft and is worse — a throw inside a 10,000-row map fails the whole report for one unbanded employee.
**Falsifier:** Band lookup made total — a default band per level, or a `NOT NULL` link from employee to band. Then the `undefined` arm is dead code and the signature should tighten to `PayBand`.

---

### 39. A percentile is a `Money` rounded to the minor unit; an empty group returns null

**SOUND** · reversal: cheap in code, moderate in trust — the rounding point moves a published figure by a cent · 2026-10-14 · phase 4, `percentiles`

**Decision:** `percentiles` returns `Money` values, interpolated in `bigint` and rounded half away from zero at the one division, reusing decision 36's rule. An empty group returns `null` rather than zeros or an empty list of points.

**Evidence:** The interpolation method is not decided here — `docs/glossary.md:47` already fixes it as linear interpolation between closest ranks, naming NumPy's default and Postgres `PERCENTILE_CONT`, and the same line promises "the SQL aggregation and the TypeScript implementation agree without either emulating the other". That promise is what forces this entry: `PERCENTILE_CONT` returns `double precision`, so an interpolated p50 arrives from SQL unrounded and has to be rounded somewhere. Deciding it once, here, is what makes the two agree. `docs/data-model.md:99` already lists "percentiles between two values" among the divisions that must not drift.

- **D** — Yes. A percentile of integer minor units lands between two of them whenever the group size and the point do not divide evenly, which is most of the time: p25 of a four-person group sits a quarter of the way between two salaries.
- **O** — Cheap in code, one expression. The cost of changing it later is that every published p25/p50/p75/p90 moves by up to one minor unit, which reads as a data change rather than a formatting change.
- **U** — No measurement. The claim is that two implementations of one documented method must round identically to agree, which follows from the method, not from a benchmark. It is checkable at PB-044, where the SQL and the TypeScript run over the same slice.
- **B** — `percentiles` and PB-034's median gap, which reads p50. It also moves `divideHalfAwayFromZero` out of `fx.ts` into `money.ts`, which decision 37's blast radius predicted would happen at this ticket rather than the last one.
- **T** — Gives up reporting a percentile as an exact fraction. Nobody wants a p50 of £62,400.004, and `Money` has nowhere to put it.

The empty-group arm is decision 38's rule applied again, not a new call: an empty slice is a filter that matched nobody, which the distribution report has to render, so it gets a value rather than an exception. A single `null` beats one null per requested point — every point is undefined for the same reason, and the caller branches once.

**Cheaper:** Return the raw double and let the report round. Rejected because it puts the rounding in the API layer and the web layer, which is two places to disagree, and because a `number` salary in a package whose first decision was integer minor units invites exactly the arithmetic decision 1 removed.
**Falsifier:** Percentiles computed only in SQL, with the TypeScript version deleted. Then Postgres owns the rounding and this entry is about a function that no longer exists.
