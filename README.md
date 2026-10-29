# paybands

Salary management and pay analytics for 10,000 employees across multiple countries.

The user is an HR manager who runs all of this in spreadsheets today. Two jobs: keep the salary data, and answer questions about how the organisation pays people.

## Live

| | |
|---|---|
| Web | <https://paybands-flame.vercel.app> |
| API | <https://paybands-api.vercel.app> |
| Email | `hr@paybands.example` |
| Password | `paybands-demo-2026` |

Both are on Vercel and neither sleeps, so the first click costs no more than the second. The
API answers [`/health`](https://paybands-api.vercel.app/health) if you would rather see the
service before the login screen.

The login is the seed's own and ships on purpose. Every row behind it is synthetic: names
recombined from per-country pools, emails at the reserved `.example` domain, salaries computed
by the generator ([`docs/security.md`](docs/security.md)). No real person is in this database.

## Two minutes, from clone to running

Node 24 (see `.nvmrc`), pnpm via Corepack, Docker for the database.

```bash
corepack enable
pnpm install

docker compose up -d                                        # Postgres 17 on :5433
cp apps/api/.env.example apps/api/.env                       # then set DATABASE_URL and DIRECT_URL
#   both to: postgresql://paybands:paybands@localhost:5433/paybands_test
#   and SESSION_SECRET to anything 32 characters or longer

pnpm --filter @paybands/api db:migrate
pnpm --filter @paybands/api db:seed                          # 10,000 employees, about 16 seconds
pnpm dev                                                     # web on :3000, API on :3001
```

Open `http://localhost:3000` and sign in with the credentials above.

The ask bar needs `ANTHROPIC_API_KEY` in `apps/api/.env`. Without one it is off and every
other screen works, which is the supported default rather than a degraded mode.

## Commands

| Command | Does |
|---|---|
| `pnpm dev` | API on `:3001`, web on `:3000` |
| `pnpm test` | Vitest across all packages |
| `pnpm typecheck` | `tsc --noEmit` across the workspace |
| `pnpm lint` | ESLint + Prettier check |
| `pnpm build` | Both apps |

## Database

Postgres on Neon in production, a container locally. Schema managed by Prisma.

Two connection strings rather than one. `DATABASE_URL` is pooled and serves the app; `DIRECT_URL` is unpooled and serves migrations, which take advisory locks and build a shadow database ([decision 20](docs/decisions/decision-log.md)).

The seed is deterministic. Running it twice produces the same database, and `apps/api/src/seed/generate.test.ts` holds that to a committed hash. 10,000 employees and 34,898 salary records in about sixteen seconds.

It contains planted outliers, because a report that finds nothing demonstrates nothing: 40 employees paid below their band minimum, 25 above the maximum, one department with a real gender pay gap, and one department too small for a gap to be reportable. [`docs/seed-design.md`](docs/seed-design.md) has the distributions and why each one is shaped the way it is.

### Tests that need a database, and one that needs a browser

Five vitest projects. `core`, `api` and `web` need nothing — `web` runs the screens in jsdom with the API stubbed. `api-db` runs against real Postgres, not a mock. `smoke` starts both apps against a seeded database and drives Chromium at them. Both of the last two skip themselves when what they need is missing, so `pnpm test` works on a fresh clone and runs 250 of the 410; CI refuses to let either skip ([decision 46](docs/decisions/decision-log.md)).

```bash
docker compose up -d                           # Postgres 17 on :5433, data in tmpfs
export TEST_DATABASE_URL='postgresql://paybands:paybands@localhost:5433/paybands_test'
pnpm exec playwright install chromium          # once, for the browser smoke
pnpm test                                      # migrations apply, then all four projects run
```

The harness loads 50 people rather than the shipped 10,000 — the same reference tables, a population small enough to reload between runs, and one planted example of every case a report has to render ([decision 45](docs/decisions/decision-log.md)). It refuses any database whose name does not end in `_test`. [`docs/testing.md`](docs/testing.md) has the strategy.

## API

| Route | What it answers |
|---|---|
| `GET /health` | liveness, unauthenticated, no query schema |
| `GET /reference` | the currency, gender and salary-reason vocabularies |
| `GET /employees` | a page of employees |
| `GET /employees/:id` | one employee, their salary timeline, band position and comp ratio |
| `POST /employees` | add a joiner |
| `PATCH /employees/:id` | correct a record, or set a leaving date |
| `POST /employees/:id/salary` | record a raise: closes the open record and opens the new one |

`GET /employees` is keyset paginated, not offset: the response carries `nextCursor`, an opaque
base64url token naming the last row read, and a cursor this API did not issue is a 400. Pages
never exceed `limit`, which caps at 100.

| Query | Values | Default |
|---|---|---|
| `country` | ISO-2 code | all |
| `department`, `level` | id | all |
| `status` | `active`, `left`, `all` | `active` |
| `sort` | `name` (surname), `hireDate`, `id` | `name` |
| `direction` | `asc`, `desc` | `asc` |
| `limit` | 1–100 | 25 |
| `cursor` | a `nextCursor` from a previous page | — |

Money crosses the wire as minor units in a string (`{ "amountMinor": "5500000", "currencyCode": "USD" }`), because JSON has no integer wide enough to be trusted with it. An employee the band table does not cover answers 200 with `band`, `compRatio` and `rangePenetration` all null, never a dropped row.

Every sort breaks ties on `id`, which is what keeps a page boundary stable when two people
share a surname. Unknown query parameters are rejected rather than ignored.

## Layout

```
apps/api        Fastify HTTP service
apps/web        Next.js App Router UI
packages/core   comp arithmetic and domain types — no framework imports, no I/O
```

Node 24 · TypeScript 6 · Fastify 5 · PostgreSQL via Prisma · Next.js 16 · React 19 · Vitest.

## Documents

| Document | What's in it |
|---|---|
| [`docs/requirements.md`](docs/requirements.md) | Goal, scope, and what is deliberately left out, with reasoning |
| [`docs/data-model.md`](docs/data-model.md) | ER diagram and the four modelling calls the schema turns on |
| [`docs/glossary.md`](docs/glossary.md) | Comp ratio, range penetration, percentile method, mean vs median gap |
| [`docs/design-notes.md`](docs/design-notes.md) | The reasoning behind the scope and the stack |
| [`docs/decisions/decision-log.md`](docs/decisions/decision-log.md) | Every real decision, argued against when it was made |
| [`docs/decisions/sweep.md`](docs/decisions/sweep.md) | The first 60 decisions ranked by what reversing one costs, with the one-way doors named |
| [`docs/clarifications.md`](docs/clarifications.md) | Questions asked before building, the defaults assumed while waiting, and what each one would cost to be wrong |
| [`docs/architecture.md`](docs/architecture.md) | System diagram, the boundaries and what enforces them, one analytics request traced hop by hop |
| [`docs/api.md`](docs/api.md) | All sixteen routes, the one error shape, auth, limits and CORS |
| [`docs/testing.md`](docs/testing.md) | What is unit tested, what is integration tested, why the maths carries 42% of the suite, and what is not tested at all |
| [`docs/seed-design.md`](docs/seed-design.md) | Distributions, how the 48 bands are built, and the rows planted so the reports find something true |
| [`docs/ai-usage.md`](docs/ai-usage.md) | How this build used an AI assistant, and the places its output was rejected |
| [`docs/performance.md`](docs/performance.md) | Every analytics endpoint timed against the 10,000-row seed, before and after the one change made |
| [`docs/security.md`](docs/security.md) | The two audits before deploy: what holds a credential, what the model is allowed to see, what personal data is held and what this build does not implement |
| [`docs/deploy.md`](docs/deploy.md) | The runbook for the three deployment tickets, and the two environment variables that fail silently |
| [`docs/demo.md`](docs/demo.md) | The demo script, minute by minute |
| [`tasks/todo.md`](tasks/todo.md) | Phase-by-phase build order |

## CI

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs install → typecheck → lint → test → build on every push, as four named gates so a red build says which one failed. A Postgres service container and a Chromium install sit in front of them, because the integration suite and the browser smoke refuse to skip in CI ([decision 46](docs/decisions/decision-log.md)).
