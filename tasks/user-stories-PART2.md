# paybands — user stories, part 2 (phases 7–13, debt, non-goals)

Part 1 covers phases 0–6: [`user-stories-PART1.md`](user-stories-PART1.md).
Status for every ticket lives in [`board.md`](board.md). Format and conventions are stated at the top of part 1.

---

## Phase 7 — Auth

### PB-049 — Passwords hashed with argon2id

As the HR manager, I want the login password stored as an argon2id hash, so that a database leak does not hand over the account.
**Acceptance**

- argon2id with documented parameters; no plaintext or reversible storage anywhere
- The seeded demo user's fixed salt (PB-023) is confined to the seed, not to the login path
  **Phase** 7 · **Depends** PB-036 · **Evidence** —

### PB-050 — Session cookie

As the HR manager, I want to stay logged in without a token in the URL, so that a shared link never carries a session.
**Acceptance**

- `httpOnly`, `secure`, `sameSite=strict`; session invalidated on logout
- Tests cover an expired and a tampered session
  **Phase** 7 · **Depends** PB-049 · **Evidence** —

### PB-051 — Every route behind the guard

As a reviewer, I want the default to be "protected", so that a new endpoint is private unless someone deliberately opens it.
**Acceptance**

- Only `/health` and `/auth/login` are public
- The allowlist is one declaration, not a per-route flag
  **Phase** 7 · **Depends** PB-050 · **Evidence** —

### PB-052 — Login rate limit

As a maintainer, I want repeated login attempts throttled, so that a public URL is not an open guessing surface.
**Acceptance**

- Per-IP limit on `/auth/login` with a documented window
- A test proves the limit triggers
  **Phase** 7 · **Depends** PB-050 · **Evidence** —

### PB-053 — Unauthenticated requests are rejected everywhere

As a reviewer, I want one test that walks every protected route unauthenticated, so that coverage cannot drift as routes are added.
**Acceptance**

- The test enumerates the route table rather than listing routes by hand
- Every route except the allowlist returns 401
  **Phase** 7 · **Depends** PB-051 · **Evidence** —

---

## Phase 8 — Web: employees

### PB-054 — App shell

As the HR manager, I want a consistent layout and navigation, so that the reports and the employee list are one product.
**Acceptance**

- Next.js 16 App Router, shadcn/ui + Tailwind, one layout with nav
- `packages/core` types used for every API response shape
  **Phase** 8 · **Depends** PB-042 · **Evidence** —

### PB-055 — Login page

As the HR manager, I want to sign in from the browser, so that I can use the app without a terminal.
**Acceptance**

- Failed login shows a message that does not reveal whether the user exists
- Successful login lands on the employee list
  **Phase** 8 · **Depends** PB-050, PB-054 · **Evidence** —

### PB-056 — Employee list

As the HR manager, I want to page, filter and sort 10,000 employees from the server, so that the browser is never asked to hold the table.
**Acceptance**

- Pagination, filters and sort map onto PB-037; no client-side slicing of a full fetch
- Filter state survives a page reload
  **Phase** 8 · **Depends** PB-037, PB-054 · **Evidence** —

### PB-057 — Employee detail

As the HR manager, I want one screen with the salary timeline, band position and comp ratio, so that I can answer a pay question in one place.
**Acceptance**

- Timeline ordered, with the open record marked
- Band position shown against min / midpoint / max
  **Phase** 8 · **Depends** PB-038, PB-054 · **Evidence** —

### PB-058 — Edit an employee and record a salary change

As the HR manager, I want to add a joiner and record a raise from the UI, so that the data stays current without a database client.
**Acceptance**

- Forms validate with the same zod schemas the API uses
- A salary change shows the closed record and the new open one after save
  **Phase** 8 · **Depends** PB-039, PB-040, PB-057 · **Evidence** —

### PB-059 — Loading, empty and error states

As the HR manager, I want a screen with no data to say so, so that an empty result is distinguishable from a broken page.
**Acceptance**

- Every list and report screen has a loading, an empty and an error state
- No layout shift between loading and loaded
  **Phase** 8 · **Depends** PB-056 · **Evidence** —

---

## Phase 9 — Web: reports

### PB-060 — Pay bands screen

As the HR manager, I want the band table with occupancy, so that I can see the structure and where people sit in it.
**Acceptance**

- Bands by level × country with headcount and spread
- Links through to the filtered employee list
  **Phase** 9 · **Depends** PB-043, PB-054 · **Evidence** —

### PB-061 — Distribution screen

As the HR manager, I want headcount and percentiles by country, department and level with a chart, so that comparing slices does not require arithmetic.
**Acceptance**

- Grouping switch; chart and table read from the same response
- Percentile labels match the glossary
  **Phase** 9 · **Depends** PB-044, PB-054 · **Evidence** —

### PB-062 — Comp ratio screen

As the HR manager, I want a histogram plus a per-slice table, so that I can see both the shape and the detail.
**Acceptance**

- Histogram bucket boundaries stated on screen
- Per-slice table sortable
  **Phase** 9 · **Depends** PB-045, PB-054 · **Evidence** —

### PB-063 — Outliers screen

As the HR manager, I want an actionable list of people outside their band, so that the report ends in a decision rather than a number.
**Acceptance**

- Each row links to the employee detail page
- The three categories are filterable
- Against the seed: 40 below min, 25 above max appear
  **Phase** 9 · **Depends** PB-046, PB-057 · **Evidence** —

### PB-064 — Gender pay gap screen

As the HR manager, I want suppressed groups shown as suppressed, so that a missing number reads as a deliberate rule.
**Acceptance**

- Mean and median shown separately with the headcount behind each
- Suppressed groups render "not reported, group too small" with the threshold, never a blank or a zero
- Against the seed: Sales at 11.7%, Legal suppressed
  **Phase** 9 · **Depends** PB-047, PB-054 · **Evidence** —

---

## Phase 10 — Ask bar (optional, feature-flagged)

Deletes cleanly. Nothing in phases 1–9 imports it.

### PB-065 — Natural language to a validated query object

As the HR manager, I want to type a question and get an existing report, so that I do not have to learn where each filter lives.
**Acceptance**

- The model returns a query object, zod-parsed, rejected if it does not fit the schema
- A rejected parse shows the user what was not understood
  **Phase** 10 · **Depends** PB-047 · **Evidence** —

### PB-066 — The query object runs the deterministic paths

As a reviewer, I want the ask bar to reach the same code the UI does, so that it cannot produce a number the reports disagree with.
**Acceptance**

- No separate analytics path for the ask bar
- A test asserts the same query object through both entry points returns the same result
  **Phase** 10 · **Depends** PB-065 · **Evidence** —

### PB-067 — The model sees no salary and no name

As the HR manager, I want the LLM kept away from personal data, so that using it does not widen the privacy surface.
**Acceptance**

- The prompt carries the schema and the question only — no rows, no names, no salaries
- The model never computes a number
- A test asserts the outbound payload contains no employee data
  **Phase** 10 · **Depends** PB-065 · **Evidence** —

### PB-068 — Off without an API key

As a reviewer, I want the deployed demo to work with the flag off, so that the optional phase cannot break the submission.
**Acceptance**

- Absent key means the feature is hidden, not erroring
- Full app tested with the flag off
  **Phase** 10 · **Depends** PB-065 · **Evidence** —

### PB-069 — The translator is tested at a mocked boundary

As a maintainer, I want tests that do not call a model, so that the suite stays deterministic and offline.
**Acceptance**

- Fixed inputs to fixed query objects; the model boundary is mocked
- Malformed model output is covered
  **Phase** 10 · **Depends** PB-065 · **Evidence** —

---

## Phase 11 — Performance

### PB-070 — Measure every analytics endpoint against the full seed

As the HR manager, I want report times known at 10,000 employees, so that "fast" is a measurement.
**Acceptance**

- Each analytics endpoint timed against the full seed, method documented
- Numbers recorded before any optimisation
  **Phase** 11 · **Depends** PB-048 · **Evidence** —

### PB-071 — Fix the slow ones and prove the fix

As a maintainer, I want index and query changes justified by before-and-after numbers, so that the work is not speculative.
**Acceptance**

- `EXPLAIN ANALYZE` on the slow endpoints; index or rewrite; measure again
- Before and after measured with exactly one thing changed, on the same dataset — the trap recorded in `tasks/lessons.md` ("A number measured on one RNG stream does not compare to one measured on another")
  **Phase** 11 · **Depends** PB-070 · **Evidence** —

### PB-072 — Performance notes

As a reviewer, I want the numbers written down, so that the claim can be checked rather than believed.
**Acceptance**

- `docs/performance.md` holds before/after figures and the measurement method, no adjectives
  **Phase** 11 · **Depends** PB-071 · **Evidence** —

---

## Phase 12 — Audits

### PB-073 — Attack surface audit

As a maintainer, I want secrets, auth, database, input and exposure audited before deploy, so that a public URL holding 10,000 salaries is a considered risk.
**Acceptance**

- Every finding fixed, or accepted in writing with a reason
- Findings carry `file:line`
  **Phase** 12 · **Depends** PB-051 · **Evidence** —

### PB-074 — Legal exposure audit

As the HR manager, I want the privacy position stated, so that salary and gender data is handled as the personal data it is.
**Acceptance**

- GDPR-relevant findings recorded; privacy section written into `docs/security.md`
- Demo data confirmed synthetic
  **Phase** 12 · **Depends** PB-073 · **Evidence** —

### PB-075 — Decision sweep ranked by cost to reverse

As a reviewer, I want every logged decision ranked by how expensive it is to undo, so that the risky ones are visible rather than buried in a list of 30.
**Acceptance**

- Every decision in the log ranked; the one-way doors named
- WEAK entries either strengthened or stated as still weak
  **Phase** 12 · **Depends** PB-D01 · **Evidence** `docs/decisions/decision-log.md`

### PB-076 — Security document written from the reports

As a reviewer, I want one document covering security and privacy, so that the audits land as an artifact rather than as a chat log.
**Acceptance**

- `docs/security.md` written from PB-073 and PB-074
- Commit: `docs: security audit and decision log`
  **Phase** 12 · **Depends** PB-073, PB-074 · **Evidence** —

---

## Phase 13 — Ship

### PB-077 — Production database

As a reviewer, I want a reachable seeded database, so that the deployed app shows the same numbers the tests assert.
**Acceptance**

- Neon production branch, migrations applied, seed run
- The seed's refusal guard (PB-025) exercised against production before the run
  **Phase** 13 · **Depends** PB-025 · **Evidence** —

### PB-078 — API deployed

As the HR manager, I want the API reachable, so that the web app has something to talk to.
**Acceptance**

- Deployed with a green health check; migrations run on the direct endpoint
- No secret in the repo; configuration through environment variables
  **Phase** 13 · **Depends** PB-077 · **Evidence** —

### PB-079 — Web deployed

As the HR manager, I want a URL I can open, so that the product can be used rather than described.
**Acceptance**

- Deployed on Vercel, pointed at the API, login works with the seeded credentials
  **Phase** 13 · **Depends** PB-078 · **Evidence** —

### PB-080 — CORS locked to the web origin

As a maintainer, I want the API to refuse other origins, so that a public API is not a public data source.
**Acceptance**

- Allowed origin is the deployed web origin, never `*`
- A cross-origin request from another origin is rejected
  **Phase** 13 · **Depends** PB-079 · **Evidence** —

### PB-081 — README points at the live app

As a reviewer, I want the live URL, demo credentials and the two-minute local path in one place, so that evaluation starts immediately.
**Acceptance**

- README updated with URL and credentials; local path re-run on a clean clone
  **Phase** 13 · **Depends** PB-079 · **Evidence** `README.md`

### PB-082 — AI usage documented

As a reviewer, I want the prompts, the skills and the rejected output recorded, so that the use of AI in this build is inspectable.
**Acceptance**

- `docs/ai-usage.md` names where AI output was rejected and why
  **Phase** 13 · **Depends** — · **Evidence** —

### PB-083 — Demo video

As a reviewer, I want a three-to-five minute walkthrough, so that the design choices are explained alongside the screens.
**Acceptance**

- Scripted in `docs/demo.md`, recorded against the deployed app
- Covers suppression and the outlier report, since those are the non-obvious parts
  **Phase** 13 · **Depends** PB-079 · **Evidence** —

### PB-084 — Submit

As the builder, I want the repo link sent, so that the work is delivered.
**Acceptance**

- Reply sent with the repo and live URLs
  **Phase** 13 · **Depends** PB-081, PB-083 · **Evidence** —

---

## Carried debt and missed items

These are not in the phase plan. They were found during the build and would otherwise go unrecorded.

### PB-D01 — Determinism is proved on the generator, not on the database

As a reviewer, I want the database-level determinism claim to be an assertion, so that decision 24 stops resting on an argument.
**Context** Three reseeds were verified by hand to produce byte-identical `employee`, `salary_record`, `pay_band` and `app_user` digests, sequences included. The check is manual; CI only covers the generator.
**Acceptance**

- The digest comparison runs in the phase 5 test-database harness (PB-042)
- Decision 24 updated from WEAK once the assertion exists
  **Phase** 5 · **Depends** PB-042 · **Evidence** decision 24

### PB-D02 — The Legal level-mix fix has no test

As a maintainer, I want the Legal department's level mix covered, so that a regression in the suppression fixture is caught.
**Context** The fix was made and verified by inspection. A three-person group makes any statistical assertion fragile, which is why no assertion was written; recorded rather than covered.
**Acceptance**

- Either an assertion that is stable at this group size, or a written statement in the decision log that it is deliberately uncovered and why
  **Phase** 4 · **Depends** PB-034 · **Evidence** —

### PB-D03 — Local commits are not pushed

As a reviewer, I want the work on the remote, so that the commit history being graded is visible.
**Context** Local `main` sits ahead of `origin/main`. Nothing is pushed.
**Acceptance**

- `origin/main` matches local `main`
- Remote routed through `github.com-personal` per the account rule
  **Phase** — · **Depends** — · **Evidence** —

### PB-D04 — Six clarifying questions are still unanswered

As the builder, I want the stated defaults confirmed as the final position, so that the answers table is not left half-filled.
**Acceptance**

- `docs/clarifications.md` answers table filled, or a line stating that no reply arrived and the defaults stand
  **Phase** 13 · **Depends** — · **Evidence** `docs/clarifications.md`

### PB-D05 — The `packages/core` collapse test

As a maintainer, I want the stated test for the extra package applied, so that the deliberate complexity is either justified or removed.
**Context** Decision 4 wrote the test into the log: if the web app only ever imports types from `packages/core`, the package should collapse into the API.
**Acceptance**

- After phase 9, check what the web app imports from `packages/core`
- Record the outcome in the decision log either way
  **Phase** 12 · **Depends** PB-064 · **Evidence** decision 4

### PB-D06 — Audit log of salary edits

As the HR manager, I want to know who changed a salary and not just what changed, so that a disputed record can be traced.
**Context** Cut from scope deliberately, and named in `docs/requirements.md` as the first thing to add. Kept here so it is a decision rather than an omission.
**Phase** — (out of scope for this submission) · **Depends** — · **Evidence** `docs/requirements.md`

---

## Deliberately not built

No tickets exist for these. Each is a non-goal with a reason in [`docs/requirements.md`](../docs/requirements.md): payroll and tax, bonus and equity, approval workflows, Excel import/export, role-based access control, point-in-time analytics across every report, live FX rates, multi-tenancy, i18n, notifications, mobile.

If one of these is requested later, it enters as a new `PB-` ticket and the non-goal line in `docs/requirements.md` is updated in the same change.
