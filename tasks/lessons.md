# Lessons

Corrections made during the build, kept so the same mistake is not repeated.

## Length is part of readability

**2026-10-13.** The first pass of `requirements.md`, `data-model.md`, the decision log and every commit body said the right things at roughly three times the necessary length. Nothing in them was wrong; they were just padded — three sentences where one carried the argument, qualifiers that added no information, and restatements of a point already made in the paragraph above.

**Rule:** one sentence per reason. If a second sentence does not add a fact, cut it. A decision log entry should fit on a screen; a commit body should be one to three lines. Reviewers read short prose and skim long prose, so padding costs exactly what it was meant to buy.

## One concern per commit means checking the file list, not the intent

**2026-10-13.** Two commits mixed concerns despite the rule being written down: a `chore: licence and editorconfig` commit also carried checkbox updates to `tasks/todo.md`, and a later commit mixed checkbox updates with a stack-version sync and two link fixes. The intent was single each time; the `git add` was not.

**Rule:** read the staged file list out loud before committing. A file that does not belong to the sentence in the subject line belongs to a different commit.

## Record the drop, not just the choice

**2026-10-13.** `tasks/todo.md` specified TypeScript project references. They were dropped during phase 1 for a good reason, but the plan item was the only place that said they were ever wanted, so the drop would have been invisible.

**Rule:** when implementation departs from the plan, edit the plan item in the same change and point it at the decision log entry. A silently unticked box reads as forgotten, not decided.

## A number measured on one RNG stream does not compare to one measured on another

**2026-10-14.** Deciding whether to require the seed's manager pool to hold only active employees, I measured the cost at one extra employee left without a manager. A reviewer measured the same thing independently and got the same answer. We were both wrong. Each of us had measured against the pre-fix generator, and the other fixes in flight shifted the random stream, so the two datasets were not the same dataset. Measured correctly, by toggling only the guard — which consumes no randomness, so the stream stays aligned — the cost is zero.

**Rule:** before comparing two numbers out of a seeded generator, check that exactly one thing changed and that the thing does not consume randomness. Two observers agreeing is not corroboration when both made the same methodological error. Phase 11 compares query times before and after an index; the same trap is waiting there.

## Assert relationships between fields, not quantities the generator produces

**2026-10-14.** The seed shipped with eight assertions, all passing, and four adversarial reviewers then found five defects. Every assertion checked a number the generator had been written to emit: row counts, planted outlier counts, the one-open-record invariant. Every defect was a relationship between two fields set in two different functions with nothing relating them — salary records dated after a termination, outliers planted on employees the reports filter out, reference tables whose validity windows did not cover the dates they served.

**Rule:** a test written from the same mental model as the code can only confirm that model. For generated data, ask the domain's questions instead: for every field that ends something, look for activity after it; for every pair of dates, check the ordering; for every child row, check it falls inside its parent's lifetime. Phases 4 to 6 write far more tests than this one did.

## Integer arithmetic is not automatically more exact than a double

**2026-10-15.** Decision 37 first ruled that `compRatio` should divide in `bigint` scaled to micros rather than converting both operands with `Number()`, on the argument that `Number(bigint)` is lossy above `2^53` and `fx.test.ts` proves `Money` reaches there. The argument is wrong. `Number()` on each operand carries a relative error under `2^-53`, so the quotient is accurate to about `2.2e-16`, while scaling to micros caps the result at `1e-6`. The "exact" version is ten orders of magnitude worse, and only overtakes the double somewhere past `1e26` minor units. It was caught while designing the tests, before any code was written.

**Rule:** "integers are more exact" holds when the result is money and the division is the last step. It does not hold when the result is a ratio and the division is the only step. Before choosing fixed point over a double, compute the crossover: compare the relative error of the conversion against the relative precision the fixed point gives up.

## A red test can pass for the wrong reason

**2026-10-15.** Three times this session a test asserting `.toThrow(TypeError)` passed during the red phase, because a function that does not exist yet throws `TypeError: x is not a function`. The red run reported "9 failed, 1 passed", and the one that passed was the one testing a refusal that had not been written.

**Rule:** a red-phase assertion on an error must match the message, not the class, when the class is one the absent function would produce anyway. Read the passed count on a red run; a green test in a red suite is a test that is not yet testing anything.

## A fixture helper with a default parameter lies when you pass undefined

**2026-10-15.** `row(5, 6_000_000n, undefined)` was meant to build a row with no band. A defaulted parameter takes the default when the argument is `undefined`, so it built a banded row and two tests failed against correct code.

**Rule:** give the absent case its own named helper rather than a defaulted argument. `unbanded(5, …)` cannot be misread and cannot silently substitute.

## A test written after the code must be mutated before it is believed

**2026-10-15.** Three tests this session were written against code that already existed: the seed-to-outlier agreement, the seed-to-gap agreement, and the measures-agree file. All three passed on the first run, which proves nothing about whether they can fail.

**Rule:** when a test cannot be watched failing because its subject already works, break the subject on purpose and watch it fail then. Record the mutation and its effect in the commit body — "clamping range penetration at 0 turns two of these red" is evidence; "added tests" is not.

## A strict response schema on a status the framework also produces turns a 400 into a 500

**2026-10-15.** `POST /employees` declared `400: z.strictObject({ message })`. Our own 400s matched it; Fastify's validation errors did not, because their body also carries `statusCode` and `error`. The serializer parsed the framework's error against our schema, threw, and the client got a 500 for sending a bad body — the one case the schema existed to describe.

**Rule:** only declare a response schema for a status this code is the sole author of. Where the framework answers on the same status, the schema has to be loose enough for its shape, or absent.

## A mutation that changes no behaviour is a void experiment, not a missing test

**2026-10-15.** To check that the PATCH tests would catch a handler overwriting fields it was not given, the conditional spreads in `toColumns` were replaced with unconditional assignments. Every test stayed green. The tests were not blind: Prisma reads an explicit `undefined` exactly as an absent key, so the mutant behaved identically. A second mutation — rewriting the hire date unconditionally — turned exactly one test red.

**Rule:** before reading a surviving mutant as a coverage gap, check the mutant actually changes observable behaviour. Framework normalisation makes a void experiment look like a blind test.

## Simplifying for the runtime can break the type checker, and the type checker was the reason

**2026-10-15.** Following the void mutation above, those conditional spreads looked like ceremony worth deleting. Deleting them compiled under no flag we run: with `exactOptionalPropertyTypes`, a property explicitly set to `undefined` is not assignable to an optional property, so the spread form is what makes the object type-check. The tests passed the whole time; only `pnpm typecheck` disagreed.

**Rule:** when a construct looks redundant, run the full gate before removing it — redundant at runtime and redundant to the compiler are different claims. Record which of the two a construct serves when it serves only one.

## An assertion no fixture row can violate is not a test

**2026-10-15.** `GET /analytics/outliers` asserted that no leaver appears in any list. It passed with the leaver filter deleted from the query: none of the four seeded leavers is an outlier, so there was nothing for the assertion to catch. The mutation that should have turned it red turned nothing red.

**Rule:** an assertion about a filter needs a row the filter has to remove. Where the fixture has none, make one inside the test — terminating the planted below-band employee and reading the report again is what tests the filter — and restore it afterwards.

## A number in an acceptance criterion belongs to the dataset it was measured on

**2026-10-15.** PB-047 names "Sales at 11.7%", so the endpoint test asserted the gap comes out positive. It came out at −8.7%: in the fifty-person fixture the level and country mix outweighs the planted 0.92/1.04 comp ratios and the sign flips. The endpoint was right and matched `payGap` to the digit the whole time.

**Rule:** before asserting a planted statistic, check which dataset it was planted in. Structure belongs in the fixture test, statistics belong where the sample is large enough to carry them — the split decision 42 already made for Legal.

## Scripted edits to a tracked file cost the whole file

**2026-10-15.** Two board updates were made with a Python heredoc rather than the editing tool. The harness re-read both files in full to update its view — around two hundred lines of board and plan — to apply four string replacements.

**Rule:** edit tracked files through the editing tool and keep the shell for what the tool cannot express. The cost of a shell edit is not the script, it is everything the harness has to re-read afterwards.

## A test that quotes the constant it checks moves with the mistake

**2026-10-15.** `password.test.ts` asserted that the hash carried `m=${ARGON2ID.memoryCost},t=${ARGON2ID.timeCost}`. Raising the time cost to three kept it green: the assertion read its expectation out of the value under test, so both sides moved together.

**Rule:** pin a policy constant to its literal in the test. The assertion exists so that changing the number is a deliberate edit in two places, and reading the number back from the thing being checked removes exactly that.

## Restoring a mutated file with git deletes work git has never seen

**2026-10-15.** The mutate-run-restore loop that proves a test bites used `git checkout -- <file>` as its restore. Two of the three files were not committed: `contracts.ts` was untracked, so the restore errored and the mutation stayed in; `money.ts` was tracked but held the new parser, so the restore took it back to a version without the function, and fourteen tests went red for nothing to do with the mutation.

**Rule:** mutate only committed state, or copy the file to `/tmp` first and restore from the copy. `git checkout --` is a restore only when the content being restored is already in git.

## A surviving mutant can mean the number in the test is too small

**2026-10-15.** `moneyFromMajorUnits` was mutated to `Math.round(Number(input) * 100)` and every test stayed green, including the one whose name is about exactness past `Number.MAX_SAFE_INTEGER`. The test was not blind: 90071992547409.91 is simply a value the double still lands on after scaling. At 123456789012345.67 the scaled result is above 2^53, where doubles count in twos and the true answer is odd, and the same mutation turns it red.

**Rule:** before reading a surviving mutant as a blind test or a void experiment, check that the input sits in the range where the two implementations differ. For a precision claim, compute the crossover and test past it.

## A guard turns every existing test into an auth test

**2026-10-15.** The `onRequest` guard for PB-051 took seventy-one passing tests to 401 in one commit. The choice was a cookie on forty `inject` calls across nine files, or one in the harness that builds the test app.

**Rule:** when a cross-cutting requirement lands late, give the test harness the credential and an opt-out, rather than editing every call site. Tests whose subject is the new requirement pass `{ signedIn: false }`; tests of the band report go on reading bands.

## An injected request cannot fail on a preflight

**2026-10-15.** `PATCH /employees/:id` had passing integration tests and still could not be called from the browser: `@fastify/cors` defaults `Access-Control-Allow-Methods` to the browser's safelist — `GET,HEAD,POST` — and the edit form's preflight was refused before the request was made. Every test in the suite calls `app.inject`, which never sends a preflight, so none of them could have caught it.

**Rule:** an in-process request proves the handler, not the transport. Whatever the browser negotiates first — the preflight, the cookie attributes, a redirect — needs either a test that reads the negotiated headers or one pass through a real browser. `cors.test.ts` now reads Fastify's own route table and fails if a method it serves is missing from the preflight.

## A red run stays red when the test file does not compile

**2026-10-16.** The red phase for `PB-068` read `13 failed | 307 passed` and looked exactly right: thirteen is the number of new assertions plus the one existing `/health` test. The test file did not compile. A helper typed its payload `unknown`, which selected the wrong `app.inject` overload, and `pnpm typecheck` was failing the whole time. Vitest erases types without reading them, so every assertion still ran and still failed, for the right reason, with the right count. Nothing in the failing count could have shown it.

**Rule:** a red phase reads two things, the failing count and `pnpm typecheck`. A type defect in a test is invisible to the runner and surfaces one commit later, where it reads as though the implementation broke something.

## A lint boundary cannot guard a file that is allowed to hold the data

**2026-10-16.** Decision 55 guards `translate.ts` with `no-restricted-imports`, and the obvious next step was the same rule on `routes/ask.ts`, which holds a client and is one line from putting a row in a prompt. Mutating the handler to paste the outliers report into the question leaked real surnames to the model boundary using only `run` from `ask/run.ts` — the module the handler exists to call, which no rule could ever ban. A repository ban there would have stayed silent through the exact leak it was written for.

**Rule:** an import rule constrains what a file can reach, not what it does with what it is already allowed to reach. Before writing one, mutate the file to commit the offence and check the rule fires. A rule that reads like a guarantee and is not is worse than no rule, because it stops anyone writing the test.

## A query plan is measured at the narrowest boundary in the stack

**2026-10-16.** `PB-070` found the analytics endpoints answering in 85–186 ms, and `EXPLAIN (ANALYZE, BUFFERS)` on every statement Prisma emitted came back clean: the right indexes, 18 ms of planning and execution between the two statements a sliced report issues. The plan was not the problem and there was no index to add. The 95 ms was somewhere `EXPLAIN` cannot see — Postgres' own `log_min_duration_statement = 0` put 43 ms on those statements, because a logged duration includes delivering the rows to the client, and a timer around the repository call put 95, because what was left was Prisma building one nested object per employee.

**Rule:** three numbers before proposing a performance change — `EXPLAIN ANALYZE` planning plus execution, the server's logged statement duration, and wall clock around the call. Each boundary excludes the next one out. A latency claim built on `EXPLAIN ANALYZE` alone is a claim about the planner, and the planner is often the one part that was already fine.

## An ORM's nested read is two statements, and the second one carries the first one's keys

**2026-10-16.** The expensive statement in every sliced report was not expensive to execute. Prisma compiles `include`/nested `select` into a second query that binds every id of the first result — `WHERE employee_id IN ($1…$9226)` — and parsing it took 8.4 ms, binding it 9.4 ms, against 14 ms of execution. Over half the server time went on the parameter list before a row was read, and it shows up in the plan as planning time, which no index reduces. One join returning flat rows took the endpoint from 95 ms to 45.

**Rule:** when an ORM query is slow, read the SQL it actually sent before touching the schema. Count the bind parameters. A parameter list that scales with the result set is a shape problem, and the repair is a join, not an index.

## A feature behind a paid API is still verifiable: redirect the client, do not mock it

**2026-10-16.** `PB-D09` put a screen on top of `POST /ask`, and this machine has no `ANTHROPIC_API_KEY`. The two obvious options were both thin: ship it typechecked and claim the browser path "should" work, or set a fake key and only ever see the 503. The SDK reads its base URL from the environment, so twenty lines of `node:http` answering `/v1/messages` with one canned message body put the real client, the real route, the real seeded database and the real browser on one path with a deterministic answer. Changing the canned query between runs drove the accepted, the filtered and the refused branch in turn, including the bands screen's new filters, at a cost of nothing.

**Rule:** when a paid or missing external service blocks verification, check whether its client takes a base URL from the environment and point it at a local stub. A stub at the network boundary leaves every layer below it real, which is the opposite of a module mock: nothing in the application changes to accommodate the test.

## Two runs in one process cannot see a value read once at module load

**2026-10-16.** `PB-D01` asserts the seed writes the same database twice: run the writer, digest four tables and every sequence, run it again, compare. To prove the assertion bites, the salt that makes the demo login row byte-identical was mutated. Derived per call — `Buffer.from(String(Date.now())…)` inside the function — the test failed, correctly. Derived once at module load, the same mutation passed: both runs in one process read the one value, so the digests agreed about a salt that would differ tomorrow. The test is sound for what it covers and blind to that class.

**Rule:** a determinism test that runs the subject twice in one process proves per-call determinism, not per-run. Module-load constants, lazily-initialised caches and a clock read at import are invisible to it. Catching those needs a value committed to the repository — a hash, a fixture — that a later process is compared against, and when you mutate to prove a test bites, mutate at both scopes.
