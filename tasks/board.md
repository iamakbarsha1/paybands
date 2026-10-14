# paybands — ticket board

Single source of truth for ticket status. Detail lives in [`user-stories-PART1.md`](user-stories-PART1.md) and [`user-stories-PART2.md`](user-stories-PART2.md); the build order lives in [`todo.md`](todo.md).

**Rules**

- A ticket moves here first. Tick the matching box in `todo.md` in the same change — one of them going stale is how the two files start disagreeing.
- `blocked` always names what it is waiting on. A blocked ticket with no blocker is a todo.
- Status vocabulary: `done` · `next` · `todo` · `blocked` · `out of scope`.
- Debt tickets (`PB-Dnn`) sit in the same board as planned work. A found problem that is not on a board is a forgotten problem.

**Progress** — 37 of 90 done (phases 0–4 complete, phase 5 under way).

| Phase                   | Tickets | Done |
| ----------------------- | ------- | ---- |
| 0 Requirements and repo | 7       | 7    |
| 1 Workspace skeleton    | 4       | 4    |
| 2 Schema                | 6       | 6    |
| 3 Seed                  | 10      | 10   |
| 4 Comp maths            | 8       | 8    |
| 5 API employees         | 7       | 1    |
| 6 API analytics         | 6       | 0    |
| 7 Auth                  | 5       | 0    |
| 8 Web employees         | 6       | 0    |
| 9 Web reports           | 5       | 0    |
| 10 Ask bar (optional)   | 5       | 0    |
| 11 Performance          | 3       | 0    |
| 12 Audits               | 4       | 0    |
| 13 Ship                 | 8       | 0    |
| Debt and missed         | 6       | 1    |

---

## In flight

| ID     | Story                                      | Status | Blocked by |
| ------ | ------------------------------------------ | ------ | ---------- |
| PB-042 | Integration test harness against a real database | next   | —          |
| PB-D03 | Push local commits to `origin/main` | todo   | —          |

---

## Phase 0 — Requirements and repo

| ID     | Story                                               | Status | Blocked by |
| ------ | --------------------------------------------------- | ------ | ---------- |
| PB-001 | Requirements written before any product code        | done   | —          |
| PB-002 | Design notes separated from the plan                | done   | —          |
| PB-003 | Data model documented with its four modelling calls | done   | —          |
| PB-004 | Glossary of comp terms                              | done   | —          |
| PB-005 | Clone to running in under two minutes               | done   | —          |
| PB-006 | Repo hygiene files                                  | done   | —          |
| PB-007 | Clarifying questions sent with defaults             | done   | —          |

## Phase 1 — Workspace skeleton

| ID     | Story                                    | Status | Blocked by |
| ------ | ---------------------------------------- | ------ | ---------- |
| PB-008 | pnpm workspace with strict TypeScript    | done   | —          |
| PB-009 | Framework-free boundary enforced by lint | done   | —          |
| PB-010 | One test runner, a project per package   | done   | —          |
| PB-011 | CI gate on every push                    | done   | —          |

## Phase 2 — Schema

| ID     | Story                                            | Status | Blocked by |
| ------ | ------------------------------------------------ | ------ | ---------- |
| PB-012 | Neon project with pooled and direct URLs         | done   | —          |
| PB-013 | Schema for the nine tables                       | done   | —          |
| PB-014 | Money stored as integer minor units              | done   | —          |
| PB-015 | Indexes for the report query shapes              | done   | —          |
| PB-016 | One open salary record, enforced by the database | done   | —          |
| PB-017 | Migrations committed, not pushed                 | done   | —          |

## Phase 3 — Seed

| ID     | Story                                            | Status | Blocked by |
| ------ | ------------------------------------------------ | ------ | ---------- |
| PB-018 | Deterministic generator                          | done   | —          |
| PB-019 | Reference data covering the dates it serves      | done   | —          |
| PB-020 | 10,000 employees on a realistic pyramid          | done   | —          |
| PB-021 | Effective-dated salary histories                 | done   | —          |
| PB-022 | Planted outliers defined over active employees   | done   | —          |
| PB-023 | Seeded HR login that survives a reseed           | done   | —          |
| PB-024 | Batched inserts                                  | done   | —          |
| PB-025 | The seed refuses a database it did not write     | done   | —          |
| PB-026 | Determinism proved in CI                         | done   | —          |
| PB-027 | Cross-field invariants asserted, not just counts | done   | —          |

## Phase 4 — Comp maths (test-first, two commits per ticket)

| ID     | Story                                       | Status | Blocked by     |
| ------ | ------------------------------------------- | ------ | -------------- |
| PB-028 | `Money`                                     | done   | —              |
| PB-029 | `toUsd` — effective-dated FX lookup         | done   | —              |
| PB-030 | `compRatio`                                 | done   | —              |
| PB-031 | `rangePenetration`                          | done   | —              |
| PB-032 | `percentiles`                               | done   | —              |
| PB-033 | `outliers`                                  | done   | —              |
| PB-034 | `payGap` with suppression                   | done   | —              |
| PB-035 | Edge-case coverage is named, not incidental | done   | —              |

## Phase 5 — API: employees

| ID     | Story                                            | Status | Blocked by     |
| ------ | ------------------------------------------------ | ------ | -------------- |
| PB-036 | Fastify app with zod at the boundary             | done   | —              |
| PB-037 | `GET /employees`                                 | todo   | PB-036, PB-042 |
| PB-038 | `GET /employees/:id`                             | todo   | PB-037, PB-030 |
| PB-039 | Create and edit an employee                      | todo   | —              |
| PB-040 | Record a salary change                           | todo   | PB-039         |
| PB-041 | Repository layer separate from handlers          | todo   | —              |
| PB-042 | Integration test harness against a real database | next   | —              |

## Phase 6 — API: analytics

| ID     | Story                             | Status | Blocked by     |
| ------ | --------------------------------- | ------ | -------------- |
| PB-043 | `GET /analytics/bands`            | todo   | PB-042         |
| PB-044 | `GET /analytics/distribution`     | todo   | PB-032, PB-042 |
| PB-045 | `GET /analytics/comp-ratio`       | todo   | PB-030, PB-042 |
| PB-046 | `GET /analytics/outliers`         | todo   | PB-033, PB-042 |
| PB-047 | `GET /analytics/pay-gap`          | todo   | PB-034, PB-042 |
| PB-048 | Aggregation split stated and held | todo   | PB-044         |

## Phase 7 — Auth

| ID     | Story                                        | Status | Blocked by |
| ------ | -------------------------------------------- | ------ | ---------- |
| PB-049 | Passwords hashed with argon2id               | todo   | —          |
| PB-050 | Session cookie                               | todo   | PB-049     |
| PB-051 | Every route behind the guard                 | todo   | PB-050     |
| PB-052 | Login rate limit                             | todo   | PB-050     |
| PB-053 | Unauthenticated requests rejected everywhere | todo   | PB-051     |

## Phase 8 — Web: employees

| ID     | Story                                    | Status | Blocked by             |
| ------ | ---------------------------------------- | ------ | ---------------------- |
| PB-054 | App shell                                | todo   | PB-042                 |
| PB-055 | Login page                               | todo   | PB-050, PB-054         |
| PB-056 | Employee list                            | todo   | PB-037, PB-054         |
| PB-057 | Employee detail                          | todo   | PB-038, PB-054         |
| PB-058 | Edit employee and record a salary change | todo   | PB-039, PB-040, PB-057 |
| PB-059 | Loading, empty and error states          | todo   | PB-056                 |

## Phase 9 — Web: reports

| ID     | Story                 | Status | Blocked by     |
| ------ | --------------------- | ------ | -------------- |
| PB-060 | Pay bands screen      | todo   | PB-043, PB-054 |
| PB-061 | Distribution screen   | todo   | PB-044, PB-054 |
| PB-062 | Comp ratio screen     | todo   | PB-045, PB-054 |
| PB-063 | Outliers screen       | todo   | PB-046, PB-057 |
| PB-064 | Gender pay gap screen | todo   | PB-047, PB-054 |

## Phase 10 — Ask bar (optional, feature-flagged)

| ID     | Story                                         | Status | Blocked by |
| ------ | --------------------------------------------- | ------ | ---------- |
| PB-065 | Natural language to a validated query object  | todo   | PB-047     |
| PB-066 | The query object runs the deterministic paths | todo   | PB-065     |
| PB-067 | The model sees no salary and no name          | todo   | PB-065     |
| PB-068 | Off without an API key                        | todo   | PB-065     |
| PB-069 | The translator is tested at a mocked boundary | todo   | PB-065     |

## Phase 11 — Performance

| ID     | Story                                                  | Status | Blocked by |
| ------ | ------------------------------------------------------ | ------ | ---------- |
| PB-070 | Measure every analytics endpoint against the full seed | todo   | PB-048     |
| PB-071 | Fix the slow ones and prove the fix                    | todo   | PB-070     |
| PB-072 | Performance notes                                      | todo   | PB-071     |

## Phase 12 — Audits

| ID     | Story                                      | Status | Blocked by     |
| ------ | ------------------------------------------ | ------ | -------------- |
| PB-073 | Attack surface audit                       | todo   | PB-051         |
| PB-074 | Legal exposure audit                       | todo   | PB-073         |
| PB-075 | Decision sweep ranked by cost to reverse   | todo   | PB-D01         |
| PB-076 | Security document written from the reports | todo   | PB-073, PB-074 |

## Phase 13 — Ship

| ID     | Story                         | Status | Blocked by     |
| ------ | ----------------------------- | ------ | -------------- |
| PB-077 | Production database           | todo   | PB-025         |
| PB-078 | API deployed                  | todo   | PB-077         |
| PB-079 | Web deployed                  | todo   | PB-078         |
| PB-080 | CORS locked to the web origin | todo   | PB-079         |
| PB-081 | README points at the live app | todo   | PB-079         |
| PB-082 | AI usage documented           | todo   | —              |
| PB-083 | Demo video                    | todo   | PB-079         |
| PB-084 | Submit                        | todo   | PB-081, PB-083 |

## Debt and missed items

| ID     | Story                                                      | Status       | Blocked by |
| ------ | ---------------------------------------------------------- | ------------ | ---------- |
| PB-D01 | Database-level determinism assertion (decision 24 is WEAK) | blocked      | PB-042     |
| PB-D02 | The Legal level-mix fix has no test                        | done         | —          |
| PB-D03 | Local commits are not pushed                               | todo         | —          |
| PB-D04 | Six clarifying questions still unanswered                  | todo         | —          |
| PB-D05 | The `packages/core` collapse test (decision 4)             | blocked      | PB-064     |
| PB-D06 | Audit log of salary edits                                  | out of scope | —          |
