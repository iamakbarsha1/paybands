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
