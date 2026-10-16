# AI usage

`PB-082`. This build was written with an AI coding assistant, in a terminal, by a developer
reviewing every diff before it was committed. That is worth stating plainly rather than
leaving a reviewer to infer it from the commit rate.

What follows is the honest version: how the assistant was used, the rules the build imposed
on it, and — the part the ticket asks for — the places its output was rejected, with the
reason each time.

## How it was used

| Used for | Not used for |
| --- | --- |
| Drafting implementation from a written ticket that already existed | Deciding what to build. The 90 tickets, their acceptance criteria and the phase order were written first, in `tasks/` |
| Writing tests before the implementation they cover, then the implementation | Judging whether a test is honest. Every non-trivial test was mutated and had to fail |
| Research into a library's actual behaviour, read in `node_modules` rather than recalled | Deciding the schema, the money representation, or anything in the one-way-door tier of `decisions/sweep.md` |
| The first draft of documentation, including this file | The numbers in it. Every figure here and in `performance.md` was measured and re-run |
| Adversarial review of work already written, in several passes with different framings | Accepting that review's output. Five of its findings in phase 3 were real; others were not, and were dropped |

The decision log is the control: 60 entries, each written when the decision was made, each
carrying the lens it was argued against and the fact that would prove it wrong. An assistant
that produces a plausible choice and a plausible justification for it is exactly the risk; a
falsifier written at the same time is what turns the justification into something checkable
later. Two of those falsifiers later fired and flipped their entries — `decisions/sweep.md`
records which.

## Rules the build held it to

1. **Tests first on anything with logic**, committed before the implementation. The commit
   order is the evidence, not a claim.
2. **A test is not believed until it has failed.** Every guard, branch and invariant added in
   this build was mutated — the code broken on purpose — and the test had to go red. Several
   times it did not, and that is recorded below.
3. **No number without a measurement.** `performance.md` carries the method, the hardware,
   the run count and both tables. A claim like "the join is faster" with no number attached
   was treated as unfinished work.
4. **Decisions are logged as they are made**, not reconstructed at the end, and each one
   names the cheaper alternative it rejected.
5. **The model is never in the product's arithmetic.** See the last section.

## Where its output was rejected, and why

**A scaled-integer comp ratio, rejected before any code was written** — decision 37. The
draft computed the ratio in scaled integers on the theory that integers are more exact. They
are not, here: a ratio of two money amounts is one division, and doing it in scaled integers
rounds twice where a double rounds once. The sketch was reversed in the log before the
function existed.

**Twenty-one passing assertions that proved nothing** — phase 3, decisions 29 to 32. An
adversarial review pass over a seed generator that was green found five cross-field defects:
outliers planted on employees the reports filter out, 657 active employees reporting to
someone who had already left, and three reference tables whose validity windows did not cover
the dates they had to serve. Every one was two correct halves in two different functions with
nothing relating them. The lesson — assert relationships between fields, not quantities the
generator produces — is the first entry in `tasks/lessons.md` about this.

**A test that passed for the wrong reason** — `lessons.md`, "A red test can pass for the wrong
reason". A test written alongside its implementation went green on a code path that was not
the one under test. Mutation is what found it, and mutation became the rule.

**A fixture helper whose default parameter lied** — `lessons.md`. A helper with a default
argument silently substituted the default when a test passed `undefined` explicitly, so the
test asserted on data it had not set up. Rejected and rewritten to take the value or refuse.

**An assertion no fixture row could violate** — `lessons.md`. A test asserted a property that
every row in the fixture satisfied by construction. It could never fail, so it was not a
test. Replaced with a fixture that can violate it.

**A predicted performance fix that the measurement did not need** — decision 48's falsifier,
and `performance.md`. The log had predicted that if the analytics endpoints were slow, the
repair would be moving percentile arithmetic into SQL. `PB-070` measured instead of assuming:
the plan was fine, no index was missing, and the 95 ms was the ORM building one nested object
per employee and binding 9,226 keys into a second statement. The predicted fix was dropped
and a join replaced it — 95 ms to 45. The prediction is still in the log, marked as half
fired, rather than quietly edited out.

**A sequence query that matched nothing and agreed with itself** — `PB-D01`, this phase. The
determinism test compared two seeds. Its first draft read sequence values by matching
`pg_get_serial_sequence`'s schema-qualified name against `pg_sequences.sequencename`, which
holds the bare name, so every lookup returned nothing — and "nothing" equals "nothing", so
the comparison passed. The third assertion in that file, which checks the first run wrote
rows at all, is what caught it, and it is there because a comparison that can pass on empty
input is not a comparison.

**A mutation that survived, kept rather than hidden** — `PB-D01` again. To prove the new test
bites, the constant that makes the seeded login row identical between runs was broken in two
ways. Derived per call, the test failed, correctly. Derived once at module load, the test
passed — both runs in one process read the same value. That is a real limit of the test, so
it is written into decision 24 and into `lessons.md` rather than left for someone to discover.

**A security audit's findings, in code this assistant had written** — `PB-073`. The audit
found an unlimited route to a paid model, an error handler leaking internal messages, and
three dependency advisories. All three were in code produced earlier in this build and
reviewed at the time. Reviewing a diff catches a different class of problem than auditing the
whole surface for one, which is why phase 12 exists as its own phase.

**Prose, repeatedly.** The documentation in this repository is written to be read. Draft
passages that padded, hedged, or restated the same point twice were cut. If any remain, that
is the same failure, caught less well.

## The model inside the product

Separately from how the build was made: one feature calls a language model at run time, and
it is fenced.

- The ask bar sends the user's question and a JSON schema rendered from the query type. It
  never sends a row, a name or a salary (decision 55), and two tests hold the route to that
  by comparing the prompt it produced against the prompt rendered with no route in the way,
  and against every row the same request returned.
- What comes back is parsed by zod against five reports. Anything else is a refusal with a
  reason, never a retry (`docs/design-notes.md` §7).
- The arithmetic runs in `packages/core`, the same code the report screens use. A question
  and a click reach one implementation.
- Unset `ANTHROPIC_API_KEY` and the feature is off: `/health` reports `ask: false`, the bar
  does not render, and every other feature works.

The honest summary of the ask bar is in decision 7, which has carried a WEAK verdict since
the day it was written: the HR manager's job is done by the reports, and the bar exists
because the role description asks for LLM experience. That is a candidate's reason, not a
user's, and the log says so.
