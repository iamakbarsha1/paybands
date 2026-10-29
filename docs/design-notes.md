# Design notes

Planning for the Incubyte take-home. Source: `incubyte-assessment.docx`, "Salary Management Assessment — Candidates".

Role applied for: Software Craftsperson — Node / React / TypeScript. The brief says the backend language should match the role, so this is a Node + TypeScript build.

Scope and non-goals live in [`requirements.md`](requirements.md). The schema lives in [`data-model.md`](data-model.md). This document holds the reasoning behind both.

---

## 1. What the brief asks for

| | |
|---|---|
| Goal | Salary management software, 10,000 employees, multiple countries |
| Persona | HR Manager at ACME, currently running everything in Excel |
| Core ask | Manage salary data in a web app, and answer questions about how the org pays people |
| Backend | Language matching the applied role. Relational DB, SQLite acceptable. |
| UI | React or Next.js, component library of choice |
| Seeding | A script producing 10,000 employees |
| Readiness | Deployed and working. Video demo. |
| Tests | Meaningful unit tests on core logic. Fast, deterministic, readable. |
| Process | Incremental commits showing how the solution evolved |
| Pre-work | A one-page requirements doc written **before** building, stating what is left out and why |
| Submission | Git repo link, replying to the original email |

The line worth re-reading: *"We are not looking for the most complex system, but for good engineering judgment."* Scope discipline is being marked. Cutting the right things and saying why is part of the deliverable.

---

## 2. "Answer questions about how the org pays people"

Read as **analytics and reporting**, not natural-language querying.

The persona is replacing spreadsheets. What she cannot do in Excel at 10,000 rows is slice, compare, and spot outliers quickly. An LLM query box would be a flashier demo and a worse product answer — it puts the interesting engineering in a prompt instead of in the data model, in a brief that warns against complexity for its own sake.

Five reports, listed in [`requirements.md`](requirements.md).

Small-sample suppression is the one that matters most. A gender pay gap computed over three people is noise presented as a finding — exactly what a spreadsheet makes easy and what this product should refuse to do.

---

## 3. Scope decisions

### 3.1 Multi-currency and FX — in scope

Salaries are stored in local currency, with a normalised USD figure for cross-country comparison.

The brief says "multiple countries". Comparing INR against GBP without normalising produces meaningless bands and a meaningless gap, so normalisation stops being optional once countries are in the data.

Rates come from a seeded, effective-dated table, not a live API. A live feed adds a network dependency and nondeterministic tests while changing nothing about analysis quality.

> Ceiling: static seeded rates. If real-time accuracy mattered, swap the source behind the same lookup.

### 3.2 Salary history — in scope, effective-dated

"Current salary" is derived from the record whose range covers today, not stored on the employee.

No report needs history, so this is the one place the plan spends complexity ahead of need. The reason is asymmetry: adding effective dating later rewrites the schema, the seed and every analytics query; adding it now costs one table and a date predicate. For salary data — where "what did we pay her before the promotion" is a question any HR manager eventually asks — current-only is a one-way door.

The complexity stays in the data model. The UI surface is a timeline on the detail page, nothing more.

### 3.3 Auth yes, roles no

The app is deployed to a public URL and holds the most sensitive dataset a company has. Shipping it behind an unauthenticated link would be a judgment failure regardless of how good the rest is. So: session login, hashed passwords, protected routes, a seeded HR-manager account.

But there is exactly one persona. A roles table and a permissions matrix would serve a user type that does not exist.

> Ceiling: single role. An employee-facing view would need real authorisation; the route guard is where that changes.

**The ceiling was lifted where it said it would be.** `PB-D20` ([decision 67](decisions/decision-log.md)) added an `analyst` role that reads everything and writes nothing, as one branch in that same route guard — a column and a default, not a permissions matrix. The plan was right about the mechanism and right to defer it: it cost one branch at the end because nothing in between had assumed a single role.

What it still does not do is the thing this section actually described. Both roles see every employee, so there is no employee-facing view and no per-row authorisation. That needs `app_user` joined to `employee`, which [`security.md`](security.md) carries as the open question it has been since phase 2.

---

## 4. Data model

Moved to [`data-model.md`](data-model.md) — ER diagram, the four modelling calls, indexes, and the half-open date-range convention.

---

## 5. Artifacts

The brief names six. This adds the ones it implies.

**Named in the brief**

| Artifact | File |
|---|---|
| Requirements | [`requirements.md`](requirements.md) — committed before the first implementation commit, so the order is itself evidence |
| Planning / design notes | this document |
| Architecture diagrams | [`architecture.md`](architecture.md) — system diagram and request flow for one analytics query |
| AI prompts | [`ai-usage.md`](ai-usage.md) — prompts used, and where AI output was rejected and why |
| Trade-offs | [`decisions/decision-log.md`](decisions/decision-log.md) |
| Performance | [`performance.md`](performance.md) — query plans and timings against the full seed |

**Added**

| Artifact | File | Why |
|---|---|---|
| ER diagram | [`data-model.md`](data-model.md) | The schema is the centre of this problem. A reviewer should judge it without reading a migration. |
| README | [`../README.md`](../README.md) | Clone to running in two minutes, or nothing else gets read |
| API contract | [`api.md`](api.md) | Makes the backend reviewable independently of the UI |
| Test strategy | [`testing.md`](testing.md) | What is unit versus integration tested, and why the maths gets the heaviest coverage |
| Seed design | [`seed-design.md`](seed-design.md) | Distributions, salary spread, and the outliers planted so the outlier report finds something true |
| Glossary | [`glossary.md`](glossary.md) | One vocabulary for the UI, the code and the tests |
| Security note | [`security.md`](security.md) | Sensitive data, public deployment. Auth, hashing, what is not logged. |
| Demo | [`demo.md`](demo.md) + video | Short script plus the recording |

Not planned: changelog, contribution guide, issue templates. Nobody else is contributing, and the commit history already tells the story.

---

## 6. Stack

The role description reads *"4+ years of experience in ReactJS, Node, TypeScript, LLMs and PostgreSQL"*. The stack matches that list literally rather than trying to be clever.

| Layer | Choice | Why |
|---|---|---|
| Backend | Node 24 + TypeScript 6 + Fastify 5 | The JD names Node. A standalone service makes the backend reviewable on its own; Next route handlers would be Node while hiding the backend inside the frontend. Fastify over Express for first-class types and schema validation at the route boundary. |
| DB | PostgreSQL (Neon) via Prisma | The JD names PostgreSQL. SQLite is permitted, not required, and needs a persistent volume on every free host. |
| UI | Next.js 16 App Router + React 19 | Named in the brief. Server components keep the 10k-row pages off the client. |
| Components | shadcn/ui + Tailwind | Owned source, no black-box library to fight |
| Charts | Recharts | Distribution and band charts are the only charting need |
| Shared | `packages/core` | Comp maths and domain types, framework-free and I/O-free. Testable without a database, HTTP or React. |
| Tests | Vitest + Testing Library + one Playwright smoke | Fast and deterministic, which the brief asks for by name |
| CI | GitHub Actions | A visibly green build says more than a paragraph about CI |
| Deploy | Vercel (web and API) + Neon (DB) | Public URL, free tier, reproducible |

**Two rows of that table turned out not to describe what was built.** Recorded here rather
than edited away, because the planning note being wrong is itself worth a reviewer's time.

The UI row credits server components with keeping the 10,000-row pages off the client. Every
screen that reads data is a client component, and the four server components fetch nothing.
What actually keeps the rows off the client is the `limit` cap of 100 on `GET /employees`.
[`architecture.md`](architecture.md) found this and carries it.

The Tests row names Testing Library, and for most of the build it was wrong: nothing was
installed and `apps/web` had no test file, leaving the Playwright smoke (`PB-D12`,
[decision 62](decisions/decision-log.md)) as the only thing in the repository executing code
in `apps/web`. It is right now — `PB-D21` added the `web` vitest project and 23 tests over
the branches the smoke cannot reach. The row was accurate about the plan and wrong about the
state of the repository for six phases, which is the thing worth a reviewer's time rather
than the final tick. [`testing.md`](testing.md) carries what those tests cover and what they
still do not.

The Deploy row is still a plan. [`deploy.md`](deploy.md) is the runbook, and writing it found
a third thing this table could not have told anybody: the web app and the API on two vendor
domains are cross-site, which made the session cookie's `SameSite=Strict` a deployment that
answers 200 and signs everyone out ([decision 63](decisions/decision-log.md), `PB-D15`).

---

## 7. The LLM question

The JD lists LLMs among its requirements, and the brief's phrasing can be read as natural-language querying. §2 settled the product answer: the reports are the product. That does not change.

**One bounded feature, built last, behind a flag.** An ask bar that turns a typed question into a *query*, never into an answer.

| | |
|---|---|
| The model does | translate English into a structured query object — metric, group-by, filters, date |
| The model never does | compute a number, read a salary row, see a name, produce displayed text |
| Validation | the query object is zod-parsed; anything that does not fit is rejected, not retried into submission |
| Execution | the validated query runs the same deterministic analytics the report pages call |
| Tests | the model boundary is mocked, so the suite stays fast and deterministic |
| Without an API key | the feature is off and everything else works |

Worth the phase because it makes the stronger engineering statement — that a language model is not allowed near money arithmetic — with working code rather than an opinion. Last and flagged because if the schedule tightens it deletes cleanly; nothing in phases 1–9 imports it.

Argued against in [decision 7](decisions/decision-log.md), where it is logged WEAK.

**Since `PB-068`, "nothing in phases 1–9 imports it" is no longer literally true.** `apps/api/src/app.ts` imports `registerAskRoutes` and the `Complete` type, because the server has to register the route and answer whether the feature is on. Deleting the phase now means that import, the three lines in `app.ts`, the `ask` field on the health response, the composition line in `index.ts`, and the dependency. It is still an afternoon and it still touches no report, no screen and no query. [Decision 56](decisions/decision-log.md) lists it, and records why the alternative that keeps this sentence true — registering from `index.ts` and decorating the flag onto the app — was not taken.

> Ceiling: single-turn translation. No conversation memory, no tool loop.

> The SDK client retries the transport up to twice by default, so one translation can be three HTTP requests. That is the connection being retried, not a second ask: the prompt is unchanged and no previous answer travels with it. A refused answer is refused once, which `apps/api/src/routes/ask.test.ts` counts.

---

## 8. Quality gates

Three skills run as gates, and their output becomes repo artifacts.

| Skill | When | Produces |
|---|---|---|
| `decision-critic` | at each decision | [`decisions/decision-log.md`](decisions/decision-log.md) — the trade-off artifact the brief asks for |
| `attack-surface-audit` | before deploy | `security.md` — secrets, auth, database, input, exposure, each with `file:line` |
| `legal-exposure-audit` | before deploy | the privacy section of `security.md`. Salary plus gender is personal data. |

The decision log is the useful one. Trade-offs written down while deciding produce something true; reconstructed the night before submission they produce something plausible.

---

## 9. Build order

Docs → workspace and CI → schema → seed → comp maths (test-first) → API → auth → UI → reports → optional ask bar → performance → audits → deploy.

Phase-by-phase checklist: [`../tasks/todo.md`](../tasks/todo.md).

Two sequencing choices are deliberate:

- **Docs commit before any product code.** The brief asks for requirements written before building. Commit order is the only way to show it.
- **The comp maths is test-first, one function per pair of commits.** The JD opens with "Write Tests First". A history where tests appear after the implementation says the opposite.

---

## 10. Questions sent to Incubyte

Six, each with a stated default so none of them blocks: deadline, the meaning of "answer questions", multi-currency, salary history, auth, and the gender field. See [`clarifications.md`](clarifications.md).
