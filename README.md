# paybands

Salary management and pay analytics for 10,000 employees across multiple countries.

The user is an HR manager who runs all of this in spreadsheets today. Two jobs: keep the salary data, and answer questions about how the organisation pays people.

> Status: schema, migrations and a 10,000-employee seed in place. Comp maths next. Build order: [`tasks/todo.md`](tasks/todo.md).

## Running it

Node 24 (see `.nvmrc`) and pnpm via Corepack:

```bash
corepack enable
pnpm install
```

| Command | Does |
|---|---|
| `pnpm dev` | API on `:3001`, web on `:3000` |
| `pnpm test` | Vitest across all packages |
| `pnpm typecheck` | `tsc --noEmit` across the workspace |
| `pnpm lint` | ESLint + Prettier check |
| `pnpm build` | Both apps |

## Database

Postgres on Neon, schema managed by Prisma.

```bash
cp apps/api/.env.example apps/api/.env       # fill in both URLs
pnpm --filter @paybands/api db:migrate       # apply migrations
pnpm --filter @paybands/api db:seed          # 10,000 employees, ~35k salary records
```

Two connection strings rather than one. `DATABASE_URL` is pooled and serves the app; `DIRECT_URL` is unpooled and serves migrations, which take advisory locks and build a shadow database ([decision 20](docs/decisions/decision-log.md)).

The seed is deterministic. Running it twice produces the same database, and `apps/api/src/seed/generate.test.ts` holds that to a committed hash.

| Seeded login | |
|---|---|
| Email | `hr@paybands.example` |
| Password | `paybands-demo-2026` |

It contains planted outliers, because a report that finds nothing demonstrates nothing: 40 employees paid below their band minimum, 25 above the maximum, one department with a real gender pay gap, and one department too small for a gap to be reportable.

### Tests that need a database

API tests ending in `.db.test.ts` run against real Postgres, not a mock. They skip themselves when `TEST_DATABASE_URL` is unset, so `pnpm test` works on a fresh clone; CI always sets it ([decision 46](docs/decisions/decision-log.md)).

```bash
docker compose up -d                           # Postgres 17 on :5433, data in tmpfs
export TEST_DATABASE_URL='postgresql://paybands:paybands@localhost:5433/paybands_test'
pnpm test                                      # migrations apply, then the suite runs
```

The harness loads 50 people rather than the shipped 10,000 — the same reference tables, a population small enough to reload between runs, and one planted example of every case a report has to render ([decision 45](docs/decisions/decision-log.md)). It refuses any database whose name does not end in `_test`.

## API

| Route | What it answers |
|---|---|
| `GET /health` | liveness, unauthenticated, no query schema |
| `GET /reference` | the currency, gender and salary-reason vocabularies |
| `GET /employees` | a page of employees |
| `GET /employees/:id` | one employee, their salary timeline, band position and comp ratio |

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
| [`docs/clarifications.md`](docs/clarifications.md) | Questions asked before building, and the defaults assumed while waiting |
| [`tasks/todo.md`](tasks/todo.md) | Phase-by-phase build order |

## CI

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs install → typecheck → lint → test → build on every push, as four named steps so a red build says which gate failed.
