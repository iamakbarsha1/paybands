# Performance

Phase 11. Every analytics endpoint timed against the full seed, the slow ones explained, one
change made, and the same measurement taken again. `PB-070` is the before column, `PB-071` the
change, `PB-072` this file.

Decision 48 fetches whole rows and does the money arithmetic in `packages/core`, and said in
writing that nothing had measured what that costs. This is the measurement.

## How these numbers were taken

| | |
|---|---|
| Machine | Intel Core i7-9750H, 6 cores at 2.6 GHz, macOS 15.7.4, x86_64 |
| Database | `postgres:17-alpine` in Docker, 128 MB `shared_buffers`, 4 MB `work_mem`, data on tmpfs |
| Dataset | The full seed: 10,000 employees, 9,226 of them active, 34,898 salary records, 10,000 of those open, 48 pay bands, 12 FX rates |
| Instrument | `apps/api/src/perf/measure.ts` |
| Samples | p50 of 15 runs, after 3 warm-up runs that are discarded |

The seed is deterministic (`SEED = 20261013` in `apps/api/src/seed/generate.ts`), so both runs
read byte-identical rows. They ran against the same database, seeded once and left alone
between them, and `ANALYZE` was run before the first measurement so the planner had statistics
in both. The only difference between the two runs is the commit.

Reproduce it with:

```bash
docker compose up -d
docker exec paybands-test-db psql -U paybands -d postgres -c 'CREATE DATABASE paybands_perf'
export PERF_URL='postgresql://paybands:paybands@localhost:5433/paybands_perf'
cd apps/api
DATABASE_URL="$PERF_URL" DIRECT_URL="$PERF_URL" pnpm exec prisma migrate deploy
DATABASE_URL="$PERF_URL" pnpm exec tsx src/seed/index.ts
docker exec paybands-test-db psql -U paybands -d paybands_perf -c ANALYZE
DATABASE_URL="$PERF_URL" pnpm exec tsx src/perf/measure.ts
```

A separate database, rather than `paybands_test`, because the test suite truncates that one
and a half-measured run against half a dataset is worse than no number at all.

### Three layers, because "the endpoint is slow" is not a finding

Each report is timed three times over, at three depths:

- **fetch** — the repository call alone. The rows crossing the wire.
- **report** — the exported report function: fetch, plus the `packages/core` arithmetic over
  those rows. `report − fetch` is what decision 48's split costs.
- **http** — `app.inject` against the real app: report, plus routing, the session guard, zod
  response serialisation.

`inject` skips the TCP socket. That is the one thing these numbers understate, and it is
small next to what they do cover.

## Before

| Endpoint | rows | bytes | fetch p50 | report p50 | http p50 | http min | http p95 |
|---|---:|---:|---:|---:|---:|---:|---:|
| `GET /analytics/bands` | 48 | 7601 | 6.7 | 6.6 | 7.1 | 6.6 | 7.4 |
| `GET /analytics/distribution?groupBy=country` | 9226 | 830 | 97 | 97 | 95 | 89 | 104 |
| `GET /analytics/distribution?groupBy=department` | 9226 | 1336 | 93 | 94 | 95 | 88 | 110 |
| `GET /analytics/distribution?groupBy=level` | 9226 | 1029 | 85 | 99 | 99 | 94 | 132 |
| `GET /analytics/comp-ratio?groupBy=country` | 9226 | 913 | 95 | 99 | 92 | 87 | 107 |
| `GET /analytics/comp-ratio?groupBy=department` | 9226 | 1303 | 91 | 92 | 116 | 89 | 163 |
| `GET /analytics/comp-ratio?groupBy=level` | 9226 | 1048 | 87 | 163 | 95 | 85 | 409 |
| `GET /analytics/pay-gap?groupBy=country` | 9226 | 1425 | 94 | 111 | 108 | 103 | 115 |
| `GET /analytics/pay-gap?groupBy=department` | 9226 | 2191 | 117 | 139 | 111 | 103 | 133 |
| `GET /analytics/pay-gap?groupBy=level` | 9226 | 1739 | 91 | 106 | 109 | 102 | 304 |
| `GET /analytics/outliers` | 9226 | 30595 | 175 | 181 | 186 | 174 | 367 |

Milliseconds. `rows` is what the repository returned, `bytes` the response body.

Two things are already visible. `report` and `fetch` are the same number to within the noise,
so the arithmetic decision 48 moved into TypeScript was not what these requests were spending
their time on. And the one report that aggregates in SQL — bands, whose headcounts are a
`groupBy` — answers in 7 ms while every report that fetches rows takes 85 to 186.

## Where the time went

`log_min_duration_statement = 0` on the perf database, one run of each endpoint, then
`docker logs`. Every sliced report issues the same two statements, and Prisma pays for each
over the extended protocol's three stages:

| Statement | parse | bind | execute |
|---|---:|---:|---:|
| `SELECT … FROM employee WHERE termination_date IS NULL` | 0.1 | 0.2 | 11 |
| `SELECT … FROM salary_record WHERE effective_to IS NULL AND employee_id IN ($1…$9226)` | 8.4 | 9.4 | 14 |

Averages over one logging run, in milliseconds. Logging every statement costs something
itself, so read these as the shape of the problem rather than as the timings — the table above
is the measurement.

That second statement is how Prisma compiles a nested `findMany`: fetch the employees, then
fetch their salary records with every id of the first result bound in as a parameter. The `IN`
list is 9,226 parameters long, and parsing and binding it costs 18 ms before a row is read.
The outliers report's employee row is wider and its `include`d relations are two more
statements; its own execute averages 42 ms.

`EXPLAIN (ANALYZE, BUFFERS)` on the same statements, with the id list written out as literals:

```
Seq Scan on employee (actual time=0.011..2.543 rows=9226 loops=1)
  Filter: (termination_date IS NULL)
  Rows Removed by Filter: 774
Planning Time: 1.567 ms
Execution Time: 3.179 ms

Index Scan using one_open_salary_per_employee on salary_record (actual time=0.263..3.966 rows=9226 loops=1)
  Index Cond: (employee_id = ANY ('{1,2,3,…}'::integer[]))
Planning Time: 8.456 ms
Execution Time: 4.533 ms
```

So planning and executing both statements is 18 ms of a request that takes 95, and no index is
missing: the salary lookup already rides `one_open_salary_per_employee`, the partial unique
index the migration hand-writes, and the employee scan reads 10,000 rows to keep 9,226, which
is what a sequential scan is for.

The gap between that 18 ms and the 43 ms the server logs for the same two statements is
delivering 18,452 rows to the client, which `EXPLAIN ANALYZE` stops short of. The gap between
43 and 95 is **the Node process**, building one nested JavaScript object per employee with an
array of salary records hanging off it.

A spike confirmed that before anything was changed: the same rows, asked for as one join and
returned flat, took 40 ms against the 115 ms of the nested `findMany`, and adding the
grouping loop back on top changed nothing (37 ms — the loop is free).

## The change

`apps/api/src/repositories/analytics.ts`. The nested `findMany` became one `$queryRaw` join,
in one place that the three sliced reports share, and a second for the outliers report, which
also needed a department name and a level name:

```sql
SELECT e.country_code, e.department_id, e.job_level_id, e.gender::text,
       s.amount_minor, s.currency_code
FROM employee e
LEFT JOIN salary_record s ON s.employee_id = e.id AND s.effective_to IS NULL
WHERE e.termination_date IS NULL
```

Same rows, same filters, same work for the database — one round trip instead of two, no
parameter list, and a flat row instead of an object graph.

```
Hash Right Join (actual time=4.720..10.637 rows=9226 loops=1)
  Hash Cond: (s.employee_id = e.id)
  ->  Index Scan using one_open_salary_per_employee on salary_record s (actual time=0.028..2.204 rows=10000 loops=1)
  ->  Hash (actual time=4.517..4.518 rows=9226 loops=1)
        ->  Seq Scan on employee e (actual time=0.011..2.341 rows=9226 loops=1)
Planning Time: 1.580 ms
Execution Time: 11.326 ms
```

13 ms of planning and execution where the two statements were 18, and 36 ms of logged statement
time where they were 43 — most of which is now delivering 9,226 rows, half as many as before.
The database was never the problem and the join does not pretend otherwise; what it fixes is
the 9,226-parameter bind and the object graph. After it, the whole 40 ms fetch is accounted for
by the statement: there is almost nothing left in the Node process to remove.

Nothing above the repository changed. Response shapes are untouched, the money arithmetic
stays in `packages/core`, and the 53 analytics and ask tests — including the one that checks
the endpoint's percentiles against Postgres' own `percentile_cont`, and the five that check
`run(prisma, query)` equals the matching HTTP body — passed unchanged.

## After

| Endpoint | rows | bytes | fetch p50 | report p50 | http p50 | http min | http p95 | http before → after |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| `GET /analytics/bands` | 48 | 7601 | 6.8 | 6.7 | 7.6 | 6.9 | 8.7 | 7.1 → 7.6 |
| `GET /analytics/distribution?groupBy=country` | 9226 | 830 | 40 | 50 | 45 | 39 | 60 | 95 → 45 (−53%) |
| `GET /analytics/distribution?groupBy=department` | 9226 | 1336 | 33 | 40 | 42 | 39 | 44 | 95 → 42 (−56%) |
| `GET /analytics/distribution?groupBy=level` | 9226 | 1029 | 37 | 40 | 41 | 38 | 47 | 99 → 41 (−59%) |
| `GET /analytics/comp-ratio?groupBy=country` | 9226 | 913 | 33 | 41 | 38 | 36 | 43 | 92 → 38 (−59%) |
| `GET /analytics/comp-ratio?groupBy=department` | 9226 | 1303 | 34 | 41 | 43 | 39 | 52 | 116 → 43 (−63%) |
| `GET /analytics/comp-ratio?groupBy=level` | 9226 | 1048 | 39 | 45 | 41 | 35 | 123 | 95 → 41 (−57%) |
| `GET /analytics/pay-gap?groupBy=country` | 9226 | 1425 | 33 | 52 | 50 | 47 | 58 | 108 → 50 (−54%) |
| `GET /analytics/pay-gap?groupBy=department` | 9226 | 2191 | 34 | 53 | 54 | 49 | 80 | 111 → 54 (−51%) |
| `GET /analytics/pay-gap?groupBy=level` | 9226 | 1739 | 34 | 52 | 50 | 47 | 53 | 109 → 50 (−54%) |
| `GET /analytics/outliers` | 9226 | 30595 | 50 | 54 | 55 | 51 | 73 | 186 → 55 (−70%) |

Bands is the control: it never fetched rows, nothing about it changed, and its number did not
move.

## What this answers

Decision 48's falsifier was "a measurement showing the row fetch dominates the request", and
it does: 40 ms of a 45 ms distribution request, 50 of 55 for outliers. But the decision it was
written to overturn — move the percentiles into SQL, duplicate decisions 33 to 36 in a second
language — is not what the numbers ask for.

`report − fetch` is the price of decision 48, and it is now readable rather than lost in the
noise:

| Report | fetch p50 | report p50 | arithmetic |
|---|---:|---:|---:|
| distribution | 33–40 | 40–50 | 7–10 ms, four percentiles per slice over 9,226 converted amounts |
| comp-ratio | 33–39 | 41–45 | 6–8 ms, a ratio and a bucket per person |
| pay-gap | 33–34 | 52–53 | 18–19 ms, a USD conversion per person plus mean and median per slice |

Converting 9,226 salaries to USD and taking two averages costs 19 ms. Writing that conversion
a second time in SQL, against the `fx_rate` join, with no test able to see both copies at
once, buys 19 ms. Decision 48 stands, and the entry now carries this number instead of an
open question.

## What was not changed, and why

- **No index was added.** Every plan above uses one. The salary lookup rides the partial
  unique index; `employee_termination_date_idx` is not used for the scan and should not be —
  92% of the table matches the filter.
- **No `percentile_cont`.** See above: it would buy 7–10 ms on the distribution report in
  exchange for the money arithmetic existing twice.
- **Bands was left alone.** 7 ms, because its headcount is a `groupBy` in SQL and 48 band rows
  is all that crosses the wire.
- **`GET /employees` was not measured here.** It pages at the database and returns 50 rows, so
  it is not in the row-fetch class of problem this ticket was about.

## What these numbers do not cover

- **A managed Postgres.** This is a container on the same machine; Neon adds round-trip
  latency to every statement, which is one reason the two-statement shape was worth removing.
- **Concurrency.** One client, one request at a time. These are latencies, not throughput, and
  nothing here says what ten simultaneous outlier reports cost.
- **A cold cache.** `ANALYZE` had run and the working set fits in `shared_buffers`.
- **The browser.** Every figure stops at the HTTP response, and the report screens render
  after that.
