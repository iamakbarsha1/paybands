# Handoff

Written at the end of the session that finished phases 6 and 7 and took phase 8 to its
fourth ticket. Read this, then `board.md` for status and `todo.md` for build order.

**Check this file against the repository before trusting it.** The previous handoff was six
tickets stale by the time it was read. `git log --oneline -15` and `git status` settle any
disagreement; `board.md` is the next most reliable, because a ticket moves there in the same
commit as the code.

## Where the build is

60 of 90 tickets. 235 tests green, typecheck and lint clean, working tree clean, 144 commits
local. Phases 0 to 7 are complete; phase 8 has four of its six.

- **Phase 6, analytics** — five endpoints, each with its own refusal stated rather than
  implied: an empty band, an empty group, an unbanded employee, a suppressed slice.
- **Phase 7, auth** — argon2id, a signed session cookie, every route private unless the
  allowlist names it, five sign-in attempts per address per fifteen minutes.
- **Phase 8, web** — the shell, the login page, the employee list and the employee detail.

`origin/main` is **68 commits behind local**. `block-dangerous-git.sh` blocks `git push`, so
a human has to run it. PB-D03 is closed on the board but the push after this session has not
happened.

## Next ticket: PB-058, edit an employee and record a salary change

`POST /employees`, `PATCH /employees/:id` and `POST /employees/:id/salary` are all built and
tested (phase 5). What is missing is the screens. The detail page at
`apps/web/app/(app)/employees/[id]/page.tsx` is where both belong — a form for the employee
fields, and a form that opens a new salary record and closes the one it replaces.

The API refuses a salary change dated at or before the open record, and a currency the
timeline does not use, with a 400 before any write. Both messages are worth showing
unchanged; they say exactly what is wrong.

Then PB-059 — loading, empty and error states — which `lib/use-api.ts` already makes cheap:
it answers `loading`, `error` or `ready` and every screen renders all three.

## How to run it

```bash
docker compose up -d
export TEST_DATABASE_URL='postgresql://paybands:paybands@localhost:5433/paybands_test'
pnpm test

cd apps/api && pnpm dev     # 3001, reads apps/api/.env
cd apps/web && pnpm dev     # 3000
```

`apps/api/.env` is gitignored and now needs `SESSION_SECRET` (32 characters or more) as well
as the two database URLs; `.env.example` documents both it and `WEB_ORIGIN`. The demo login
is `hr@paybands.example` / `paybands-demo-2026`.

Docker Desktop was cold at the start of this session and `docker compose up -d` sat silent
for ten minutes pulling `postgres:17-alpine`. It was working the whole time — the output was
buffered behind a pipe. Give it the time before concluding it is broken.

## What this session decided

Decisions 48 to 51 in `docs/decisions/decision-log.md`, in the order they were made:

| # | The call | Why it might be revisited |
|---|---|---|
| 48 | SQL groups and filters; `packages/core` does the money arithmetic | `PB-070` measures the row fetch; if it dominates, percentiles move into SQL |
| 49 | Argon2id at OWASP's 19 MiB profile, algorithm held by a test | the library's `Algorithm` is a const enum `verbatimModuleSyntax` refuses |
| 50 | A session cookie with no server-side record | it gives up revocation: a stolen cookie is good for eight hours |
| 51 | The login limit counts in memory, in one process | **WEAK.** Behind a proxy it counts the whole internet as one client unless `PB-078` sets `trustProxy` |

`PB-080` (CORS) was pulled forward out of phase 13: the browser cannot reach the API without
it, and a login page nobody has run is not a login page that works.

## Conventions that bit this session

All four are in `lessons.md`. These two cost the most time:

- **A test that quotes the constant it checks moves with the mistake.** The argon2 cost
  assertion read its expectation off `ARGON2ID`, so raising the time cost kept it green.
  Pin policy constants to their literals.
- **An assertion no fixture row can violate is not a test.** The outlier report asserted that
  no leaver appears in any list, and passed with the leaver filter deleted — none of the four
  seeded leavers is an outlier. Make the row the filter has to remove, inside the test.

Every green test in this session was mutated before it was believed, and each commit body
records which mutation turned which test red. Keep that.

## Two things only a person can clear

- **PB-D04 — six clarifying questions are still unanswered** (`docs/clarifications.md`). Each
  has a stated default and the build has run on those defaults. The risk is that one turns
  out wrong late.
- **The push.** 68 commits, including all of phases 6 and 7.

## Commit rhythm to keep

Per ticket: `test(...)` with the red tests and what they are red for, `feat(...)` with the
implementation and the mutations that proved the tests bite, `docs:` moving `board.md` and
`todo.md` together, and a `docs:` decision entry whenever a choice closed off an alternative.
One concern per commit, checked against the staged file list rather than the intent.
