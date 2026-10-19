# Decision sweep

`PB-075`, run at `256f002` over all 60 entries in [`decision-log.md`](decision-log.md).

A log of 60 decisions read front to back is a list. Ranked by what it costs to undo each one,
it is a map of where the build is committed and where it is still free. That is the only
question this file answers: **if this turns out to be wrong, what does putting it right
cost?** Whether each one is right is the log's own job, and the verdict column carries its
answer.

Four tiers, and a decision sits in the highest one that applies.

| Tier | What it means | Count |
| --- | --- | --- |
| [One-way doors](#one-way-doors) | A migration over existing rows, or a convention already baked into committed data | 4 |
| [Moderate](#moderate) | A shape every later file follows; undoing it is a day of mechanical edits | 8 |
| [Cheap in code, expensive in trust](#cheap-in-code-expensive-in-trust) | One expression, but the wrong version publishes a plausible number nobody double-checks | 10 |
| [Cheap](#cheap) | One file, one constant, one import path | 38 |

The tiers are not severity. A cheap decision can be the one that publishes a wrong pay gap,
and an expensive one can be obviously right — decision 1, money as integer minor units, is
the most expensive to reverse in the whole log and the least arguable.

## One-way doors

Four, and all four were decided before the thing that would have to be migrated existed.
That is the pattern worth naming: every expensive door in this build was opened deliberately,
at the moment it was still free, with the reasoning written down the same day.

| # | Decision | Verdict | What reversal costs |
| --- | --- | --- | --- |
| 1 | Money is stored as integer minor units | SOUND | A column type on every salary and band row, plus every read path |
| 5 | Effective-dated salary history, when no report needs it | SOUND | Expensive in the other direction — a flat `salary` column cannot be un-flattened |
| 15 | Integer surrogate keys, with natural keys for country and currency | SOUND | A type change on every key and every foreign key |
| 35 | Rate windows are half-open, `[effectiveFrom, effectiveTo)` | SOUND | The convention is already in 12 committed rate rows and 48 pay-band rows |

Decision 5 is the one to read twice: it is a one-way door in the *other* direction. Keeping a
history nobody queries costs a table; starting flat and needing history later costs a
migration that invents effective dates for rows that never had them.

## Moderate

| # | Decision | Verdict | What reversal costs |
| --- | --- | --- | --- |
| 2 | A standalone Fastify API, not Next.js route handlers | SOUND | The domain logic is framework-free; the deploy setup is not |
| 3 | PostgreSQL, not the SQLite the brief names | SOUND | Prisma hides most of it; `BIGINT` handling and the raw aggregation SQL differ |
| 9 | FX rates stored as integer micros, not a decimal column | SOUND | One column type and one conversion function — settled before any migration |
| 23 | The seed assigns primary keys itself, then resets every sequence | SOUND | The ids are woven through every foreign key the generator emits |
| 27 | A terminated employee keeps an open salary record | SOUND | A backfill, plus every join written against the invariant |
| 47 | Queries live in `src/repositories`, and the client is an argument to `buildApp` | SOUND | Moving queries back into handlers across every endpoint |
| 48 | SQL groups and filters; `packages/core` does the money arithmetic | SOUND | Contained to the repository and handler of each endpoint; the response shape does not move |
| 50 | The session is a signed cookie with no server-side record | SOUND | A migration and a lookup per request; the cookie name, routes and client stay |

Decision 48 earned its number since: `PB-070` measured the split and `PB-071` changed what
runs underneath it without the response shapes moving, which is the containment the entry
claimed.

## Cheap in code, expensive in trust

The tier the log kept inventing words for. One expression decides each of these, and getting
it wrong produces a number that is internally consistent, plausible on screen, and wrong —
the kind of error that survives review and is found by a confused reader, if at all.

| # | Decision | Verdict | The number at stake |
| --- | --- | --- | --- |
| 10 | `gender` is a NOT NULL enum with an explicit `undisclosed` | SOUND | A `NULL` branch gone unwritten in every consumer |
| 11 | Comp ratio is computed in local currency, never in normalised USD | SOUND | Every comp ratio, moving for no visible reason |
| 18 | The one-open-salary invariant is a hand-written partial unique index | SOUND | Two open salary records, which every report would silently double-count |
| 29 | The seed's planted properties are defined over active employees | SOUND | A report asserting whatever the seed happened to return |
| 33 | Conversion carries a minor-unit scale factor | SOUND | A 100× error in one country's salaries |
| 34 | A missing rate on the date throws rather than returning a typed "no rate" | SOUND | Six analytics paths each branching differently on a gap |
| 38 | A missing band returns null; a bad currency or midpoint throws | SOUND | Five endpoints each choosing what "no band" means |
| 39 | A percentile is a `Money` rounded to the minor unit | SOUND | Every published p25/p50/p75/p90, by up to one minor unit |
| 40 | `outliers` reports four buckets rather than three | SOUND | A band gap read as underpayment |
| 41 | `payGap` suppression keys on each compared group | SOUND | A published gap over three people — the failure the feature exists to prevent |

Decision 41 is the one with a test named after it rather than after a function, and decision
18 is the one whose cost is asymmetric: dropping the index is one line, and the rows it lets
in are wrong by the time anybody looks.

## Cheap

Thirty-eight entries, each reversible in one file, one constant or one import path. Listed
for completeness rather than discussion; the verdict column is where any argument lives.

| # | Decision | Verdict |
| --- | --- | --- |
| 4 | `packages/core` as a separate workspace package | SOUND, upgraded by this sweep |
| 6 | Authentication yes, role system no | SOUND |
| 7 | An LLM ask bar, built last and feature-flagged | **WEAK, still** |
| 8 | Public repository | SOUND |
| 12 | TypeScript project references dropped; core is consumed as source | SOUND |
| 13 | TypeScript 6, not the TypeScript 7 the registry marks latest | SOUND |
| 14 | Node 24, not the Node 22 the planning notes named | SOUND |
| 16 | `app_user` has no foreign key to `employee` | SOUND |
| 17 | Prisma 7, not the 8.0.0-rc the registry tags `latest` | SOUND |
| 19 | `salary_record.reason` is a Postgres enum, not free text | SOUND |
| 20 | Migrations connect direct, the app pooled | SOUND |
| 21 | Prisma lives in `apps/api`, not a `packages/db` workspace | SOUND |
| 22 | The seed generates its own data, with no data-generation dependency | SOUND |
| 24 | Determinism is proved on the generator, not on the database | SOUND, strengthened by `PB-D01` |
| 25 | The seeded password hash uses a fixed argon2id salt | SOUND |
| 26 | The planted outliers are hard-coded, not drawn from the distribution | SOUND |
| 28 | The seed truncates and re-inserts with no wrapping transaction | SOUND |
| 30 | A reference table is dated from before the earliest row it serves | SOUND |
| 31 | The hire-date skew is computed with `sqrt`, not `Math.pow` | SOUND |
| 32 | The seed refuses a database it did not write | SOUND |
| 36 | Rounded half away from zero at the single division | **WEAK, still** |
| 37 | Comp ratio is a plain number from one double division | SOUND |
| 42 | Legal's level mix is covered structurally, its statistics deliberately not | SOUND |
| 43 | zod reaches Fastify through its own compiler hooks | SOUND |
| 44 | The integration test database is a local container, not a Neon branch | SOUND |
| 45 | The harness seeds about fifty explicit employees | SOUND, upgraded by this sweep |
| 46 | Database tests skip themselves without `TEST_DATABASE_URL` | SOUND |
| 49 | Argon2id at OWASP's 19 MiB profile, held by a test | SOUND |
| 51 | The login limit counts in memory, in one process | **WEAK, still** |
| 52 | The browser validates with the API's own schemas | SOUND |
| 53 | The ask schema stays in the API, where its one enforcer is | SOUND |
| 54 | The query calls the report functions, not the routes | SOUND |
| 55 | The model is sent the question and the schema, and never a row | SOUND |
| 56 | The key is read at the edge and the model is handed in | SOUND |
| 57 | The sliced reports fetch their rows as one join | SOUND |
| 58 | The ask bar answers with a link to the report | SOUND |
| 59 | A 5xx answers one sentence and the reason goes to the log | SOUND |
| 60 | The ask bar is rationed by session | SOUND |

## The WEAK entries, one by one

Six entries carried a WEAK verdict into phase 12. Three are now SOUND because the fact each
one was waiting for arrived; three are still WEAK, and this is what each is still waiting for.

> **Superseded in part.** Phase 13 went back to the three that were still WEAK and collected
> what was collectable. None of the verdicts moved. [What phase 13 closed](#what-phase-13-closed)
> at the end of this document records what changed and what each entry is now waiting for,
> which for two of the three is nothing.

**24 — determinism proved on the generator, not the database. Strengthened.** `PB-D01` turned
the hand-run digest comparison into an assertion: `apps/api/src/seed/determinism.db.test.ts`
runs the writer twice and compares a digest of four tables and every sequence. The entry's
`Since:` records what the test covers and the one case it cannot see — a value read once at
module load, equal within a run and different tomorrow.

**4 — `packages/core` as a separate workspace package. Upgraded.** The entry's own falsifier:
*"If by phase 9 the web app imports real functions from core — formatting, band-position
maths for a chart — this upgrades to SOUND. If it only ever imports types, the package should
collapse."* It fired in favour. `apps/web/app/(app)/reports/bands/page.tsx:3` imports
`bandSpread` and `money` and computes the spread column with them;
`apps/web/components/salary-change-form.tsx:3` parses user input with `moneyFromMajorUnits`
and validates with `salaryChangeInput`; `apps/web/lib/money.ts:1` formats through
`minorUnitsFor`; `apps/web/components/employee-form.tsx:3` validates against the API's own
`employeeInput` and `employeePatch`. Four files, arithmetic and validation rather than enum
tables. The package stays, and `PB-D05` — the collapse test this falsifier described — is
answered rather than open.

**45 — the harness seeds fifty explicit employees, not the shipped ten thousand. Upgraded.**
The entry rejected "truncate and run the shipped seed once per test run" on run time and said
so plainly: *"'Too slow' is the untested half of this… If a full seed against a local
container turns out to cost seconds rather than minutes, this entry is the one to revisit."*
`PB-D01` measured it: **14.4 s** against the local container, under the entry's own 20-second
bar. So the claim was thinner than stated, and the conclusion survives anyway — for a reason
that is now arithmetic rather than assumption. Database tests reset between files
(`resetAndSeed` truncates and rewrites the fixture, `fileParallelism: false`), so the shipped
seed is not paid once per run but once per file: eighteen files at 14.4 s is four and a half
minutes against about a second each today. `PB-D01`'s own test pays it twice on purpose and
took the database suite from 30 s to 67 s, which is the measurement of that arithmetic.

**7 — an LLM ask bar at all. Still WEAK, and the gate is passed.** The entry's gate was *"If
phases 1–9 are not finished and polished, this phase should not start."* They were, and it
did, and the bar now has a browser caller (`PB-D09`). Nothing has answered the **D** line —
*"the HR manager's job is done by the reports. This exists because the role description asks
for LLM experience — a candidate's reason, not a user's"* — and nothing can answer the **U**
line until a reviewer reads it. The verdict is a statement about whose reason it serves, not
about whether it works, and it stays.

**36 — rounded half away from zero at the single division. Still WEAK.** Nothing has changed:
the bias against truncation is still about one part in ten million against this seed, still
moves no percentile, no comp ratio and no gap percentage. The falsifier is unfired because
nothing reconciles converted USD against an external figure, and nothing in phases 5 to 13
will. It is three lines doing what one line nearly does, kept because "rounded to the nearest
cent" is explainable and truncation is asymmetric across the sign.

**51 — the login limit counts in memory, in one process. Still WEAK, and the stake went up.**
Decision 60 put `POST /ask` behind the same counter, so what the ceiling now risks is a paid
model key rather than password guesses. Both falsifiers are still unfired for the same
reason: there is one process and no proxy, because nothing is deployed. `PB-078` is where
both arrive — a second instance makes the counter wrong by however many instances there are,
and a proxy without `trustProxy` makes it wrong in the dangerous direction by counting the
whole internet as one client. The upgrade is a shared store, and it is not premature until
there is a second process to share one with.

## What this sweep changed

- Decision 4: **WEAK → SOUND**, falsifier fired in favour, with the four web files named.
- Decision 45: **WEAK → SOUND**, the run-time claim measured at 14.4 s and the per-file
  arithmetic recorded.
- Decision 24: already strengthened by `PB-D01` earlier in phase 12; listed here for the
  count.
- `PB-D05`, the `packages/core` collapse test, is answered by decision 4's evidence.
- Nothing was found that contradicts a decision. No entry moved to WRONG.

## What phase 13 closed

The sweep left three entries WEAK and said what each was waiting for. Two of the three were
waiting for something that could be produced without a deployment, and were not. This is that
work. **No verdict moved**, which is the finding rather than a disappointment — in each case
the measurement confirmed the reason the entry was WEAK instead of overturning it.

**36 — the rounding mode. The thin part is no longer thin.** The sweep said the falsifier was
unfired "because nothing reconciles converted USD against an external figure". Something does
now, by a method the shipped code does not share: `apps/api/src/seed/fx-rounding.test.ts` sums
the whole active payroll three ways over the shipped seed, one of them accumulating undivided
numerators and dividing once at the end. The exact total is **$818,621,426.23**; half away from
zero lands 75 minor units above it and truncation 2,586 below — **$25.86, one part in 31.7
million**, against the entry's estimated "$50 … one part in ten million". The estimate was
pessimistic by half, because 3,997 of the 9,226 rows are USD and divide exactly. The verdict
stays WEAK on the **D** line, which said the choice between modes is near-free either way;
$25.86 on $818 million is that sentence with a number in it. Nothing further is collectable
here: the falsifier as written needs an external authority, and this project will never have
one.

**51 — the in-memory limiter. The dangerous leg is fired and fixed.** The sweep said both
falsifiers were unfired "for the same reason: there is one process and no proxy, because
nothing is deployed". That was true of the multi-instance leg and wrong about the proxy leg —
`inject` can put every request behind one address and name the client in `X-Forwarded-For`,
which is what a proxy does. `auth-rate-limit.db.test.ts` now holds both behaviours: untrusted,
five wrong passwords lock out the next person through the same proxy; trusted, they refuse only
the guesser. The sweep also said `PB-078` is where the deployment decides this, and there was
nothing for it to decide with — `trustProxy` defaulted to false and no code read it. It is now
`TRUST_PROXY`, read at the edge. The verdict stays WEAK on the other leg: two instances still
keep two counters, and that one genuinely needs a second process.

**7 — the ask bar's existence. Closed as unanswerable here.** The sweep had this right and
phase 13 adds only the conclusion: the **D** line already concedes this serves a candidate's
reason rather than a user's, and the **U** line is unverifiable until a reviewer reacts. Every
falsifiable claim around the feature is settled in its own entry — 54, 55, 56, 58. There is no
instrument in this repository that can move this one, so it stops being an open question and
becomes a recorded position.

Three tickets carry the work: `PB-D13` (the `trustProxy` knob that did not exist), `PB-D14`
(decision 36's unmeasured claim), and `PB-D12`, which this pass opened rather than closed —
`design-notes.md` §6 names one Playwright smoke and the repository has none.
