# Clarifying questions sent to Incubyte

The assessment email asked candidates to clarify rather than assume. These went out before the build started. Each one carries the default I proceeded on, so none of them blocked progress — if an answer contradicts a default, the change is small and early.

---

**Subject:** Re: Incubyte Engineering Assessment — 7 clarifications

Hi Titiksha,

Requirements doc is written and the build is underway. Seven questions. Each carries the default I'm proceeding on, so none of them block me.

1. **Deadline.** Is there a cut-off date?

2. **"Answer questions about how the org pays people."** Reporting views, or a natural-language query interface? _Default: reporting views — pay bands, comp ratio, distribution, outliers, gender pay gap._

3. **Currency.** Salaries in local currencies needing normalisation, or one reporting currency throughout? _Default: local currency stored, USD derived from a seeded rate table._

4. **Salary history.** Effective-dated history, or current salary per employee? _Default: effective-dated._

5. **Auth.** Expected for a single-persona tool, or is an open demo URL fine? _Default: single login, no role system._

6. **Gender pay gap.** Is seeding a gender field acceptable? I'd suppress the figure for groups below a minimum headcount. _Default: included, with suppression._

7. **LLM.** The role description lists LLMs. Worth adding a natural-language ask bar, or do you want the tool without it? _Default: included, built last, behind a flag — it translates a question into a validated query and never computes a figure itself._

Repository link follows shortly.

Best,
Akbar Sha

---

## Answers received

Sent 2026-10-13, the day the repository was initialised. Nothing had come back by 2026-10-19,
with every phase through 12 closed and only the deployment left.

| #   | Question              | Answer | What changed |
| --- | --------------------- | ------ | ------------ |
| 1   | Deadline              | —      | —            |
| 2   | Reporting vs NL query | —      | —            |
| 3   | Multi-currency        | —      | —            |
| 4   | Salary history        | —      | —            |
| 5   | Auth                  | —      | —            |
| 6   | Gender gap            | —      | —            |
| 7   | LLM                   | —      | —            |

Seven went out. Six of them carry a default the build then depended on; question 1 asked for
a date and the build proceeded without one.

---

## What an answer would change now (`PB-D04`)

The point of carrying a default was that nothing blocked. The cost of that is that six
assumptions are now load-bearing and nobody has confirmed any of them. This section says what
each one bought, and what it would cost to be wrong, so an answer arriving late is a change
with a known price rather than a surprise.

The cost column is the same scale [`decisions/sweep.md`](decisions/sweep.md) uses.

| # | Default taken | What it would cost to reverse |
|---|---|---|
| 2 | Reporting views, not a natural-language interface | **Moderate.** Both exist. The ask bar translates a question and links to the report that answers it rather than rendering the answer itself ([decision 58](decisions/decision-log.md)). An answer of "natural language is the product" means the bar renders results inline, which is a second copy of five report layouts that can then disagree with the first. The reports stay either way. |
| 3 | Local currency stored, USD derived from a seeded rate table | **Expensive, and the one real one-way door here.** It is in the schema, the 48 pay bands, the 12-row FX table with two validity periods, `toUsd`, and every analytics query that converts before it aggregates. An answer of "one reporting currency throughout" is a smaller product reached by deleting a lot of correct code. An answer of "we did not want multi-currency at all" is the only one that makes the build wrong rather than over-built. |
| 4 | Effective-dated salary history | **Expensive to add back, cheap to drop.** The `salary_record` table, the partial unique index that lets exactly one record stay open per employee, the half-open chain, and the FX rate in force on each record's date all follow from it. An answer of "current salary only" is deletion. The reverse, having shipped current-salary-only and then needing history, is a migration over live data. The expensive direction was taken first on purpose. |
| 5 | One login, no role system | **Cheap to extend, and nothing to undo.** The guard is one hook over every route (`PB-051`, `apps/api/src/auth/guard.ts`), and the session is a signed cookie with no server-side record ([decision 50](decisions/decision-log.md)); adding roles means a column and a check inside the hook. An answer of "an open demo URL is fine" costs nothing either, since the login still works and can be bypassed by not asking for it. The build chose the harder default because salary data on a public URL with no auth is the one choice that would have been indefensible. |
| 6 | Gender field seeded, gap reported, small groups suppressed | **Cheap, and it is a clean deletion.** One column, one report, one of five screens, and the suppression rule. [`security.md`](security.md) already records salary plus gender as the most sensitive pair in the database. An answer of "do not seed gender" removes a screen and makes the product smaller without making anything else wrong. This is the question whose unanswered state is least comfortable, because it is the one with a privacy dimension rather than only an engineering one. |
| 7 | Ask bar included, built last, behind a flag | **Cheap, and the cost is written down.** [`design-notes.md` §7](design-notes.md) lists exactly what deleting it touches: one import and three lines in `app.ts`, the `ask` field on the health response, one composition line in `index.ts`, and the dependency. It is an afternoon, and it touches no report, no screen and no query. [Decision 7](decisions/decision-log.md) is logged WEAK and was closed in phase 13 as unanswerable from inside the repository, because its own argument against is that the feature serves a candidate's reason rather than a user's, and only a reviewer can settle that. |

Question 1, the deadline, is the one with no default. The build was sequenced so that it would
have been submittable at the end of any phase from 9 onward: five report screens over a
working API on seeded data, with the ask bar, the performance work and the audits as phases
that each add something and remove nothing. That sequencing is what a missing deadline bought,
and it is in [`../tasks/todo.md`](../tasks/todo.md) rather than here.

None of the six was wrong in a way the build has found. That is not evidence they are right.
It is the expected result of choosing defaults that match the brief's plain reading, and it
would stay true if one of them were quietly wrong.
