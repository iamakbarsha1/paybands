# paybands

Salary management and pay analytics for 10,000 employees across multiple countries.

The user is an HR manager who runs all of this in spreadsheets today. Two jobs: keep the salary data, and answer questions about how the organisation pays people.

> Status: workspace and CI in place, product code starting. Build order: [`tasks/todo.md`](tasks/todo.md).

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

Database setup and the 10,000-employee seed arrive in phases 2 and 3.

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
