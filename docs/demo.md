# Demo

`PB-083`. A script for a 3 to 5 minute recording. The script is here; the recording is not,
and the video link goes in the table at the bottom once it exists.

The brief asks for a working product, not a tour of a codebase. So the video stays in the
browser except for one deliberate 20 seconds, and the one thing it argues for is the thing
this build is actually about: a language model is not allowed near the arithmetic.

## Before recording

```bash
pnpm install
docker compose up -d
pnpm --filter @paybands/api db:seed     # or point at the deployed database
pnpm dev
```

Browser at 1440 by 900, zoom at 110%, one tab, bookmarks bar hidden. Sign out first, so the
recording starts at the login screen rather than inside a session.

Have `ANTHROPIC_API_KEY` set for the recording. The ask bar is the last 45 seconds and it does
not render without one.

## Recording against the deployment instead

`PB-083` asks for the deployed app, which is <https://paybands-flame.vercel.app>. Two things
differ from the local run above, and both were checked against the live deployment on
2026-10-19.

**Wake the API first.** Render's free tier stops the service after fifteen idle minutes and the
first request back waits about a minute. Open <https://paybands-api.onrender.com/health> and
wait for `{"status":"ok"}` before you start recording, or the login screen hangs on take one.

**The ask bar is off there.** That same health response carries `"ask":false`, because the
Render service is deployed with an empty `ANTHROPIC_API_KEY` — the configuration `deploy.md`
describes, where the ask bar is off and everything else works. The `/reports` page draws no ask
bar and `POST /ask` answers `503` with `The ask bar is off: this server was started without
ANTHROPIC_API_KEY.` A feature that is off correctly looks exactly like a feature that was never
built, so this will not announce itself; it just will not be there when you reach 3:00.

Pick one before recording:

| | |
|---|---|
| Set the key on Render | The whole script records in one pass against the deployment. Costs a key in a dashboard and tokens per question |
| Record 3:00 to 3:45 locally | Deployment for the first three minutes, local for the ask bar. The cut is visible only in the URL bar |
| Drop the beat | Not advised. It is the segment the rest of the video is an argument for |

## The script

Times are cumulative. The target is 4 minutes with 30 seconds of slack.

### 0:00 — What this is (20s)

> paybands. The user is an HR manager who runs all of this in spreadsheets today, across ten
> thousand employees in six countries. Two jobs: keep the salary data, and answer questions
> about how the organisation pays people.

On screen: the login page. Sign in while talking.

Do not read out the credentials. They are in the README.

### 0:20 — The data is real enough to be wrong (40s)

On screen: `/employees`, unfiltered.

> Ten thousand employees, paged server-side at twenty-five. Filter by country, department,
> level, and whether somebody has left.

Filter to one country. Then sort by surname.

> Sorting by surname ties on employee number, because surnames repeat, and a page boundary
> that lands on a tie is where paging quietly skips somebody.

Open one employee.

> Their salary history, effective-dated. Each raise closes the previous record and opens a new
> one, so there is exactly one open salary per person and the database enforces that rather
> than the application.

Point at the comp ratio and the band position.

### 1:00 — Five reports (90s)

On screen: `/reports`.

Open **pay bands**.

> Eight levels in six countries, each in that country's own currency. Spread is the width over
> the minimum, which is the one figure that compares across currencies.

Open **outliers**.

> Forty people below their band and twenty-five above. Those are planted in the seed, because
> a report that finds nothing demonstrates nothing.

Open **gender pay gap**, grouped by department.

> Sales has a real gap. Legal does not have one you can see, and that is the point of the row:
> eight people on screen — eleven hired, three since left — and the report suppresses any slice
> where either compared group is under five rather than publishing a number computed from three
> women.

The row reads `8` because the gap report counts only people without a termination date. The
seed plants Legal at eleven, and three of them have left. Saying eleven over a row that shows
eight is the one line in this script that contradicts the screen behind it.

Open **distribution** and change the grouping once.

> Percentiles by country, department or level.

Do not open all five. Four is enough and the fifth is a click away.

### 2:30 — The money is the part worth checking (30s)

Go back to **pay bands**. Distribution converts every slice to USD so the groups compare, so it
is the one report with a single currency on it — the wrong screen for the next sentence.

> Every amount is stored as integer minor units, never a float, and converted at a rate that
> was in force on the date of the record rather than today's. The conversion rounds half away
> from zero. Across the whole seeded payroll, which is eight hundred and eighteen million
> dollars, choosing truncation instead would lose twenty-five dollars and eighty-six cents.
> That is one part in thirty-one million. I know the figure because there is a test that
> measures it, not because I estimated it.

This is the 20 seconds where showing the test is worth more than describing it. Open
`apps/api/src/seed/fx-rounding.test.ts` only if the pace allows; otherwise say the number and
move on.

### 3:00 — The ask bar (45s)

On screen: `/reports`, with the ask bar visible.

Type: `which department has the widest gender pay gap?`

The answer on this data is Operations, at a 17.7% mean and 12.2% median — not Sales, which the
1:00 beat called out and which comes fourth. Know that before you ask it on camera.

> The question goes to a model. The model does not see a single row, a salary or a name. It
> gets the question and a schema, and it returns a query object: which of the five reports,
> grouped by what, filtered how. That object is validated, and anything that does not fit is
> rejected rather than retried until it parses.

The answer appears as a sentence plus a link.

> It answers with what it understood and a link to the report. The number you end up reading
> is the report's own, computed by the same deterministic code as every other screen. The
> model chooses the question. It never does the arithmetic.

Click through to the report.

Then type something out of scope, such as `who is the CEO?`, and let it refuse.

> And it declines rather than inventing an answer.

### 3:45 — Close (15s)

> The reports are the product and the model is one bounded feature at the edge of it, built
> last, behind a flag, and the whole thing works with the flag off. Trade-offs are in the
> decision log, sixty-eight entries written while deciding rather than reconstructed
> afterwards.

Stop.

## What to leave out

| Not in the video | Why |
|---|---|
| The repository tree | Nobody has ever been convinced by a folder structure |
| CI, lint, the test count | The green check is on the PR and the count is in `testing.md` |
| The architecture diagram | It is a document, and reading a diagram aloud is slower than reading it |
| Creating and editing an employee | Real, and it is the least surprising thing here |
| Anything about how this was built | `ai-usage.md` covers it, and the video has four minutes |

## Known rough edges, if asked

Worth having ready rather than discovering live.

- The ask bar is single-turn. No conversation memory, no follow-up question.
- The login rate limiter counts in one process, so two instances mean two counts
  ([decision 51](decisions/decision-log.md)).
- There are no component tests, and `testing.md` says so and says what that leaves untested.
- Retention, export and erasure are not implemented, which
  [`security.md`](security.md) records as accepted rather than missed.

## The recording

| | |
|---|---|
| Video | _not recorded yet_ |
| Length | target 3 to 5 minutes |
| Ticket | `PB-083` |
