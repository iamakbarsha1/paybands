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
