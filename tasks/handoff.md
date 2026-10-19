# Handoff

Written at the end of the session that finished phase 12 and cleared the last of the debt a
machine could clear. Read this, then `board.md` for status and `todo.md` for build order.

**Check this file against the repository before trusting it.** `git log --oneline -20` and
`git status` settle any disagreement; `board.md` is the next most reliable, because a ticket
moves there in the same commit as the code.

## Where the build is

91 of 99 tickets. 351 tests green, typecheck, lint and build clean, working tree clean. Phases
0 to 12 are complete: the API, the auth, the employee screens, all five reports, the ask bar
with its browser caller, the performance numbers, and both audits with their fixes.

**Seven of the eight open tickets need a person, not a session** — credentials, a camera, or an
answer from the client. The eighth is `PB-D12`, a committed browser smoke test, which
`architecture.md` opened when it found that `design-notes.md` §6 names one and the repository
has none.

A later session added the two artifacts the brief names that the build had never produced
([`architecture.md`](../docs/architecture.md), [`api.md`](../docs/api.md)) and went back to the
three decisions the phase-12 sweep left WEAK. None of the three verdicts moved, which was the
finding. `sweep.md` §"What phase 13 closed" has it.

## What this session built

| Ticket | What landed |
| --- | --- |
| `PB-D09` | The web ask bar. `apps/web/components/ask-bar.tsx` on the reports index, hidden on a server with no key, answering with the query it understood and a link to the screen that runs it |
| `PB-073` | Attack surface audit, 27 checklist items, three failures — all three fixed: a rate limit on `POST /ask`, an error handler that stops 5xx explaining itself to the browser, and `prisma` 7.10.1 clearing three advisories |
| `PB-074` | Legal exposure audit. The ask bar now says the question goes to Anthropic before anyone types in it, the route logs the translated query and never the question, and the demo data is confirmed synthetic with the method stated |
| `PB-076` | `docs/security.md` — both audits as one artifact, including the five questions only a deployment can settle |
| `PB-D01` | The seed's determinism is an assertion now, not an argument: `seed/determinism.db.test.ts` runs the writer twice and compares digests and sequences. Decision 24 is SOUND |
| `PB-075` | `docs/decisions/sweep.md` — all 61 decisions ranked by cost to reverse, the one-way doors named, every WEAK entry resolved or restated |
| `PB-082` | `docs/ai-usage.md` — how this build used an AI assistant and the eight places its output was rejected |
| `PB-D11` | The Review table in `todo.md` reaches phase 12 |
| `PB-D07` | `packages/core/src/wire.ts`: one declaration per response, the API serialising through it and the browser's types inferred from it |
| `PB-D05` | Answered by decision 4's own falsifier: the web imports and calls real functions from `packages/core`, so the package stays |

Eight commits, `1de4ac8` to `c22def7`.

## The two things worth remembering

**A feature behind a paid API is still verifiable.** There is no `ANTHROPIC_API_KEY` on this
machine, so the ask bar could have shipped typechecked and unproven. The Anthropic SDK reads
its base URL from the environment, so twenty lines of `node:http` answering `/v1/messages`
with one canned body put the real client, the real route, the real seeded database and a real
browser on one path. Changing the canned query between runs drove the accepted, the filtered
and the refused branch in turn. `lessons.md` has it.

**Two runs in one process cannot see a value read once at module load.** `PB-D01`'s test runs
the seed writer twice and compares. Mutating the demo hash salt per call fails it, correctly.
Mutating it at module load passes, because both runs read the same value. The test is sound
for what it covers and blind to that class, and decision 24 says so rather than claiming
"deterministic".

## How to run it

```bash
docker compose up -d
export TEST_DATABASE_URL='postgresql://paybands:paybands@localhost:5433/paybands_test'
pnpm test

cd apps/api && pnpm dev     # 3001, reads apps/api/.env
cd apps/web && pnpm dev     # 3000
```

The demo login is `hr@paybands.example` / `paybands-demo-2026`.

**The database suite takes 67 seconds now**, up from 30. `PB-D01` seeds twice on purpose;
`docs/decisions/decision-log.md` decision 45 has the arithmetic for why that is paid once in
one file rather than per file.

**`ANTHROPIC_API_KEY` turns the ask bar on, and nothing breaks without it.** Unset or empty,
`POST /ask` answers 503 with a reason, `/health` reports `ask: false`, and the bar does not
render at all. No test calls a real model.

**The dev database still has two employees made by hand** — E-9901 Ada Byron and E-9902 Grace
Hopper, ids 10002 and 10003. A reseed removes both.

**`paybands_perf` is still in the test container**, holding the full seed for measurement.
`docker compose down` removes it with the container; `docs/performance.md` rebuilds it in four
commands.

## Open, and only a person can clear them

- **The push.** 130 commits ahead of `origin/main`, and `block-dangerous-git.sh` blocks
  `git push`, so it has to be your hands. Everything from phase 6 onwards is local only.
- **`PB-D04`** — six clarifying questions still unanswered (`docs/clarifications.md`).
- **`PB-077` to `PB-079`** — the production database, the API and the web app. All three need
  a Neon branch and a host; `docs/security.md` lists the five things to confirm while doing it,
  including whether `trustProxy` is set, which the login and ask limiters both depend on.
- **`PB-081`, `PB-083`, `PB-084`** — the README pointing at the live app, the demo video, and
  the submission itself.

## If you want more from a session

Both suggestions that used to live here are done. `docs/architecture.md` and `docs/api.md`
exist, and the three WEAK decisions were revisited: 36's bias is measured at **$25.86, one part
in 31.7 million** against an estimated $50; 51's dangerous leg is fixed and tested, with
`TRUST_PROXY` now a variable the deployment can set rather than a Fastify default nobody read;
and 7 is closed as unanswerable from inside the repository, because the **U** line needs a
reviewer and a reviewer is not an instrument this project owns.

What is left for a session: `PB-D12`, the Playwright smoke that `design-notes.md` §6 names and
nothing wrote. Also still missing from the §5 artifact list are `testing.md`, `seed-design.md`
and `demo.md` — the first two describe things that exist and are reconstructable from the code,
and the third is the video script, which blocks on `PB-083`.
