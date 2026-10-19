# Seed design

`design-notes.md` §5 has listed this document as planned since phase 0. It covers the
distributions, the salary spread, and the rows planted so that a report which finds something
is finding something true.

The seed is not sample data. Five of the six screens are reports over a population, and a
population drawn uniformly at random makes every one of them say the same uninteresting thing.
A pay-gap report over evenly distributed salaries finds no gap. An outlier report over a
normal spread finds no outliers. A suppression rule never fires if no group is small. So the
population is shaped first, and then the tests assert that the shape survived.

## Determinism

`SEED = 20_261_013` in `apps/api/src/seed/generate.ts`, run through `mulberry32`, a 32-bit
PRNG written out in nine lines in `rng.ts` rather than taken as a dependency.

`TODAY` is `2026-10-01` and is a constant. Nothing in the generator reads a clock, because a
clock read makes yesterday's rows differ from today's and breaks the committed hash.

Three things hold determinism, and they fail differently:

| Test | What it catches |
|---|---|
| `generate.test.ts`, same data from two calls in one process | A generator that consumes shared mutable state |
| `generate.test.ts`, matches the committed hash of its canonical JSON | Any change to the population at all, intended or not |
| `determinism.db.test.ts`, byte-identical rows on a second write | A writer that reorders, renumbers, or drifts a sequence |

The third one matters more than it looks. It also asserts that the sequences end where the
first run left them, and that rows were written at all, so two empty tables cannot agree with
each other and pass.

The one hash the writer computes uses a fixed salt, which is why `app_user` is byte-identical
on every reseed while the login path still salts at random.

## The population

10,000 employees, hired between 2014-01-01 and 2026-08-01.

| Dimension | Shape |
|---|---|
| Country | US 35, India 25, UK 12, Germany 12, Singapore 9, Japan 7 (weights) |
| Department | Engineering 30, Sales 15, Customer Success 10, Product 8, Marketing 8, Operations 8, Design 6, Finance 6, People 5 (weights). Legal is not drawn; see below |
| Gender | female 44, male 52, other 2, undisclosed 2 (weights) |
| Job level | A pyramid in percent of headcount, L1 first: 9, 22, 26, 21, 12, 6, 3, 1. Sums to 100 |
| Leavers | 8% chance, never before 180 days after hire |

Those weights leave 9,226 employees active, which is the number `performance.md` timed
against. 34,898 salary records, 10,000 of them open: every employee, including every leaver,
ends on an open record, which is what makes the partial unique index worth having.

Six countries rather than two, because multi-currency is the part of this problem that is
easy to get wrong and invisible when you do. Five of the six currencies have two minor units
and JPY has none, so a report that assumes two decimal places formats ¥1234 as ¥12.34 here
rather than in production. `minorUnitsFor` throws on a currency it does not know for the same
reason.

## Pay bands

48 bands: eight levels in six countries, built rather than listed.

Each level has a USD midpoint, from $55,000 at L1 to $360,000 at L8. That midpoint is
multiplied by a market factor per country (US 100%, UK 85%, Germany 80%, Singapore 75%, Japan
70%, India 30%), converted at the current FX rate, then rounded to a step: 1,000 units of the
local currency, except India where the step is 10,000 rupees. Minimum is 80% of the midpoint
and maximum is 120%, each rounded the same way.

The rounding is the reason the bands are built in `bigint` minor units with the basis-point
scale and the currency scale cancelling against the rate's micros. A band that rounds to a
figure a person would recognise is a band a reviewer will read, and a band whose edges are
rounded is also a band whose edges can be crossed by rounding, which the next section has to
account for.

12 FX rates: six currencies in two periods, the second from 2024-01-01. Two periods rather
than one so that a salary dated 2019 and a salary dated 2025 convert at different rates, and
a query that joins on the wrong validity window produces a wrong total rather than an error.

## Salary spread, and the outliers planted in it

Every employee gets a target comp ratio drawn around a centre with a spread, then the salary
is the band midpoint scaled to that ratio.

| Group | Centre | Spread |
|---|---|---|
| Everyone | 1.00 | 0.17 |
| Sales, female | 0.92 | 0.11 |
| Sales, male | 1.04 | 0.11 |

Every drawn ratio is clamped to the range 0.82 to 1.18. That clamp is the load-bearing part.
The bands are rounded, so 0.80 and 1.20 are not reliably inside them; 0.82 and 1.18 are, with
room to spare, and `generate.test.ts` asserts it over all 48 bands rather than taking it on
trust. The effect is that nobody falls out of their band by accident, so every row the outlier
report returns is a row that was put there deliberately.

What was put there:

| Planted | Count | Comp ratio | Why |
|---|---|---|---|
| Below band | 40 | 0.62 to 0.77 | The outlier report has to find under-paid people |
| Above band | 25 | 1.24 to 1.42 | And over-paid ones, which is the case nobody thinks to check |

All 65 are on active employees. That was not true at first: phase 3's adversarial review found
outliers planted on leavers that every report filters out, so the seed was generating rows no
screen could ever show. `generate.test.ts` now asserts it, and separately asserts that the core
outlier report agrees on exactly who is out of band, which is the same fact checked from the
other end.

Sales carries a gender gap of about 12 points at the centre, which is large enough to be
reportable and small enough to be plausible.

Legal is the opposite case, and it is the only department not drawn from the weights. It is
fixed at 8 men and 3 women, 11 people in a company of 10,000, deliberately sized under any
reportable threshold. The pay-gap report suppresses a slice when either compared group falls
below 5, so Legal is the group that proves the suppression branch runs rather than being dead
code. `generate.test.ts` checks both halves through the core report: Sales reportable, Legal
suppressed. It also checks Legal is spread across more than one job level, so the suppression
is not an artefact of everyone sitting at the same band.

## Salary history

One to several records per employee, half-open and contiguous: each record's `effectiveTo` is
the next one's `effectiveFrom`, and the last is open.

Raises are drawn as merit (3% to 9%) or promotion (12% to 20%), and the history is built
backwards from the current salary, so the open record carries the target comp ratio and the
earlier ones are what it grew from. Building it forwards would mean the current salary is
wherever the raises happened to land, and the planted gap and outliers would be approximate.

Three assertions hold the parts a query can get wrong:

- Every employee has one contiguous half-open chain.
- No leaver is paid after the day they left.
- Every salary-record date has a pay band and an FX rate in force on it.

The last one is also from phase 3's review: three reference tables had validity windows that
did not cover the dates they had to serve. Each defect was two correct halves in two different
functions, with nothing in the suite relating them.

Employees never point at a terminated manager, which is the other half of that review's
finding: 657 active employees reported to someone who had left.

## The rounding the seed was used to measure

`fx-rounding.test.ts` converts the whole active payroll through `toUsd` and measures what the
rounding choice costs. The shipped total is $818,621,426.23. Half-away-from-zero lands within
$0.75 of the exact figure; truncation loses $25.86, always downward, which is one part in 31.7
million.

Decision 36 had estimated about $50, or one part in ten million, and nobody had run it. The
number is in the log now. The first attempt at the assertion failed at 0.28 of a minor unit
per row, which is how the 3,997 USD rows that divide exactly were found.

## The test fixture is not this

`apps/api/src/testing/fixture.ts` is 50 people, written out rather than generated, and it is
what every integration test and the browser smoke run against. It is a separate population for
two reasons: 10,000 rows are too slow to reload between test files, and shrinking this seed by
a parameter would move the RNG stream that the committed hash pins (decision 45).

The reference tables are imported from here rather than retyped, so only the population
differs. The fixture plants its own landmarks for the same reasons this seed does: one person
below their band, one above, one with no band at all, four leavers, a Sales gap, and a Legal
department of four that the suppression floor has to catch. `testing.md` has the rest.

## Running it

```bash
cd apps/api
pnpm db:seed
```

It truncates the nine tables it owns and writes them back in dependency order with the ids the
generator chose, then moves every sequence past them so the first `POST /employees` after a
seed does not collide with row 10,000.

It refuses to run against a database whose `employee` table holds a different number of rows
than this seed writes, because that is a database this seed did not write. `PAYBANDS_SEED_FORCE=1`
overrides it. The test harness makes the same refusal from the other side: it will not truncate
a database whose name does not end in `_test`.
