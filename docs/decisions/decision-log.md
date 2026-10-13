# Decision log

Design decisions, logged as they were made rather than reconstructed afterwards, each one argued against before being accepted.

Verdicts: **SOUND** (evidence supports it) · **WEAK** (defensible, but thinner than claimed or a cheaper option exists) · **WRONG** (evidence contradicts it) · **UNFOUNDED** (not judgable yet).

Lenses: **D**oes it need to exist · **O**ne-way door · **U**ntested claim · **B**last radius · **T**rade given up.

---

### Decision 1: Money is stored as integer minor units, never as a float or decimal string

**Verdict:** SOUND
**Date:** 2026-10-13
**Context:** Schema design, before any migration was written
**Reversal cost:** expensive — it is a column type across every salary and band row, plus every read path

**Decision as stated:** `amount_minor BIGINT`. All arithmetic in integers; formatting to a display string happens once, at the edge.

**Evidence:** `docs/design-notes.md` §4 — the five reports all compose division (comp ratio, range penetration) over sums. Floating-point currency drifts under repeated division, and percentile interpolation multiplies the drift.

**DOUBT:**
- D: Yes. Comp ratio and percentiles are the product; a figure that is a cent off destroys trust in the whole tool.
- O: One-way door, decided at the right time — before the schema exists.
- U: Not an untested claim. Binary floating point cannot represent 0.1; this is arithmetic, not a benchmark.
- B: Touches every money column and every read path, which is exactly why it is decided now rather than later.
- T: Gives up readability of raw rows in a SQL client, and needs a `Money` type to stop raw numbers leaking around. Accepted.

**Cheaper alternative:** Postgres `NUMERIC`. Exact, and honestly close. Rejected because it arrives in JavaScript as a string or a lossy number and needs wrapping anyway — so the `Money` type is written either way, and integers make the wrapper simpler.

**Falsifier:** If every reported figure were a rounded whole-currency-unit display value with no chained division, `NUMERIC` would be the lazier correct choice.

---

### Decision 2: A standalone Fastify API, not Next.js route handlers

**Verdict:** SOUND
**Date:** 2026-10-13
**Context:** Stack selection, after the role description was read in full
**Reversal cost:** moderate — the domain logic lives in `packages/core`, so the HTTP layer is replaceable; the deploy setup is not

**Decision as stated:** `apps/api` as a Fastify 5 + TypeScript service, separate from `apps/web`.

**Evidence:** Role description, requirements: *"4+ years of experience in ReactJS, Node, TypeScript, LLMs and PostgreSQL"*. The assessment brief: *"Language & Framework as per the role you've applied for"*. Node is named as its own item alongside React.

**DOUBT:**
- D: Yes — but the honest reason is legibility, not architecture. Route handlers would also be Node. A separate service makes the backend reviewable without reading the frontend.
- O: Not a one-way door. The domain code is framework-free; swapping the HTTP layer is a day.
- U: No performance claim is being made here. None would be true at this scale.
- B: Adds a second deploy target and a CORS boundary — both real costs, both small.
- T: Gives up the single-deploy simplicity of one Next.js app. For a take-home judged on backend craft, visible backend structure is worth more than one fewer deploy.

**Cheaper alternative:** Next.js route handlers, one deploy, one repo, no CORS. It would genuinely work.

**Falsifier:** If the brief had named Next.js full-stack rather than listing Node separately, the cheaper option would win.

---

### Decision 3: PostgreSQL, not the SQLite named in the brief

**Verdict:** SOUND
**Date:** 2026-10-13
**Context:** Stack selection
**Reversal cost:** moderate — Prisma abstracts most of it, but `BIGINT` handling and any raw aggregation SQL differ

**Decision as stated:** Neon Postgres via Prisma.

**Evidence:** The brief says *"Relational database of your choice, like SQLite"* — permitted, not required. The role description names PostgreSQL in its requirements line.

**DOUBT:**
- D: Yes. SQLite on a free host needs a persistent volume, which is the single most common way a deployed take-home is found dead a week later.
- O: Not really — Prisma keeps the switch cheap while the queries stay ordinary.
- U: No claim that Postgres is faster here. At 50k rows neither database is the constraint.
- B: Adds a hosted dependency and a connection string to manage. Accepted.
- T: Gives up zero-setup local running. Mitigated by a `docker compose up` for local Postgres and a documented one-command path.

**Cheaper alternative:** SQLite, a committed file, no hosting. Cheapest by far for local review; worst for a live URL.

**Falsifier:** If the deployment requirement were dropped and only a local clone were reviewed, SQLite would be the right answer.

---

### Decision 4: `packages/core` as a separate workspace package

**Verdict:** WEAK
**Date:** 2026-10-13
**Context:** Repo layout, before any code exists
**Reversal cost:** cheap — it is a folder move and an import path change

**Decision as stated:** Comp maths and shared domain types in their own package, framework-free, consumed by both the API and the web app.

**Evidence:** No code yet. Judged against `tasks/todo.md` phase 4, which lists seven pure functions with their own test suite.

**DOUBT:**
- D: Arguably not. `apps/api/src/domain/` with no framework imports would test identically. The package boundary buys enforcement — a lint rule can forbid Fastify imports inside it — but enforcement of a rule one person could simply follow.
- O: Cheap to reverse; nothing external depends on the boundary.
- U: Yes, this is the soft spot. "The web app needs the same types" is an assumption until the web app is written. If the frontend ends up consuming only API response types it could infer, the package has one real consumer.
- B: Adds TypeScript project references and a build-order edge to CI. Small but not free.
- T: Gives up a flatter tree for a boundary that is currently aspirational.

**Cheaper alternative:** `apps/api/src/domain/`, with the web app importing types through a single generated API-contract file.

**Falsifier:** If by phase 9 the web app imports actual functions from core — formatting, band-position maths for a chart — and not just types, this upgrades to SOUND. If it only ever imports types, the package should collapse and the log should say so.

---

### Decision 5: Effective-dated salary history, when no report needs it

**Verdict:** SOUND
**Date:** 2026-10-13
**Context:** Data model, §3.2 of the design notes
**Reversal cost:** expensive in the other direction — that is the entire argument

**Decision as stated:** Salary lives in `salary_record` rows with `effective_from` / `effective_to`. "Current salary" is derived, not stored on the employee.

**Evidence:** `docs/design-notes.md` §2 — all five reports read current salary only. So this is complexity ahead of demonstrated need, which normally fails the first lens.

**DOUBT:**
- D: Not for the reports. It survives on asymmetry: adding it now is one table and a date predicate; adding it later rewrites the schema, the seed, and every analytics query.
- O: The one-way door is the *flat* version, not this one. A history table can always be ignored; a single `salary` column cannot be un-flattened without a migration.
- U: The claim "an HR manager eventually asks what we paid her before the promotion" is a product judgment, not a measurement. Stated as such.
- B: Every read path grows a date predicate. Contained by making it one predicate everywhere, used identically, rather than a flag that can drift.
- T: Gives up a simpler schema and a simpler seed. Held in check by keeping the UI surface to a timeline on the detail page — no point-in-time reporting, no "as of" filter.

**Cheaper alternative:** One `current_salary_minor` column on `employee`. Smaller everywhere, and sufficient for every report in scope.

**Falsifier:** If Incubyte answers question 4 with "current salary is enough", the cheaper option wins outright and this gets reversed while it is still one table.

---

### Decision 6: Authentication yes, role system no

**Verdict:** SOUND
**Date:** 2026-10-13
**Context:** §3.3 of the design notes
**Reversal cost:** cheap — the route guard is the single place that changes

**Decision as stated:** Session login with hashed passwords and protected routes. No roles table, no permissions matrix.

**Evidence:** The brief names exactly one persona, the HR manager. It also requires a deployed, publicly reachable app.

**DOUBT:**
- D: Auth yes — 10,000 people's salaries on an open URL is a judgment failure whatever else the repo gets right. Roles no — there is no second user type to authorise differently.
- O: Neither direction is a one-way door.
- U: No claim being made beyond "the data is sensitive", which the dataset settles.
- B: Auth touches every route, which is why it is one guard registered once rather than a check per handler.
- T: Gives up the convenience of an open demo link. Paid for with seeded credentials in the README.

**Cheaper alternative:** No auth at all, open demo URL. Cheapest, and wrong for this dataset.

**Falsifier:** An employee-facing or manager-facing view would make RBAC necessary immediately.

---

### Decision 7: An LLM ask bar, built last and feature-flagged

**Verdict:** WEAK
**Date:** 2026-10-13
**Context:** §8 of the design notes, after reading the role description
**Reversal cost:** cheap by construction — nothing in phases 1–9 imports it

**Decision as stated:** A natural-language input that translates a question into a zod-validated query object, which then runs the same deterministic analytics functions the report pages use. The model never computes a number and never sees a salary row.

**Evidence:** Role description requirements line names LLMs. Assessment brief: *"We are not looking for the most complex system, but for good engineering judgment."* The design notes §2 already decided the reports are the product.

**DOUBT:**
- D: Honestly, no. The HR manager's job is done by the reports. This exists because the role description asks for LLM experience, which is a candidate's reason, not a user's. Recorded as such rather than dressed up as a product need.
- O: Not a one-way door. Isolated behind a flag and deletable in one commit.
- U: The claim "it demonstrates judgment about where a model belongs" is unverifiable until a reviewer reacts to it. It could as easily read as scope creep in a brief that warns against exactly that.
- B: Adds an API key, a network dependency, and a mocked boundary in the test suite. All contained to phase 10.
- T: Gives up time that could go into the reports, the tests, or the performance pass — the things actually being graded.

**Cheaper alternative:** Skip it. Write a paragraph in the design notes about why a language model should not be allowed near money arithmetic, and spend the hours on test depth instead.

**Falsifier:** If phases 1–9 are not finished and polished, this phase should not start. That is the gate: it is only worth doing from a position of everything else being done.

---

### Decision 8: Public repository

**Verdict:** SOUND
**Date:** 2026-10-13
**Context:** Submission mechanics
**Reversal cost:** cheap, but not free — anything pushed to a public repo should be assumed to have been seen

**Decision as stated:** `github.com/iamakbarsha1/paybands`, public.

**Evidence:** The brief asks for a repository link shared by email. A private repo needs the reviewer's handle and an invite round trip.

**DOUBT:**
- D: Yes — reviewer friction is the thing being removed.
- O: Reversible, but with the usual caveat about anything already published.
- U: No claim made.
- B: Means no real secrets, ever. `.env` is gitignored and `.env.example` carries placeholders only. The `attack-surface-audit` gate in phase 12 checks git history, not just `HEAD`.
- T: The assessment brief is Incubyte's document, so it stays out of the repo — `*.docx` is gitignored rather than committed.

**Cheaper alternative:** Private with an invite. Marginally safer, slower for the reviewer.

**Falsifier:** If Incubyte prefers submissions kept private, flip it and send an invite.
