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
