# Glossary

Compensation terms defined once, so the schema, the API, the tests and the UI labels use the same words for the same things. Where a term has competing definitions, the one this product uses is stated.

## Bands

**Pay band** — the sanctioned range for one job level in one country: minimum, midpoint, maximum, in that country's currency. Scoped to level *and* country, never level alone ([`data-model.md`](data-model.md) §3).

**Midpoint** — target pay for a fully competent performer at that level, and the anchor for comp ratio. **Stored, not computed** as `(min + max) / 2`: real bands are often asymmetric, and storing it keeps the product honest about bands that are not centred.

**Band width** — `max − min`, in minor units. Denominator for range penetration. A zero-width band is a data error, not a divide-by-zero to swallow.

## Band position

**Comp ratio** — `salary ÷ midpoint`. How pay compares to target for the role. Unitless.

| | |
|---|---|
| `0.80` | 20% below midpoint — new in role, or underpaid |
| `1.00` | At midpoint |
| `1.15` | 15% above — typically a strong, experienced performer |

Computed in local currency against the local band, so the ratio never moves when an exchange rate moves. An employee with no band has **no comp ratio** — shown as "no band", not as `0`, and not by dropping them from the headcount.

**Range penetration** — `(salary − min) ÷ (max − min)`. Position in the band, `0.0` at minimum to `1.0` at maximum.

Both are reported because they answer different questions: comp ratio asks "how does this compare to target", range penetration asks "how much room is left". Two people can share a comp ratio of 1.0 and sit very differently if their bands have different widths.

Values outside `0.0`–`1.0` are real and not clamped — below `0` is under band minimum, above `1` is over band maximum. Both are outlier conditions.

## Outliers

An employee whose pay falls outside what their band sanctions. Three conditions, reported separately rather than merged into one count:

| Condition | Test |
|---|---|
| Below band | `salary < band.min` |
| Above band | `salary > band.max` |
| Comp ratio out of threshold | outside a configurable range, default `0.80`–`1.20` |

The first two are facts about the band. The third is policy, so the threshold is shown in the report rather than buried in the code — a number that changes the result should be visible to whoever reads the result.

## Statistics

**Percentile (p25, p50, p75, p90)** — the value below which that share of the group falls. `p50` is the median.

Percentiles falling between two observations can be interpolated several ways, and the methods disagree on the same data. This product uses **linear interpolation between closest ranks** — NumPy's default, and Postgres's `PERCENTILE_CONT` — so the SQL aggregation and the TypeScript implementation agree without either emulating the other. Tested at the edges: empty set, one value, two values, all equal. Switching methods changes every published number.

**Mean** — arithmetic average. One executive salary moves it for a whole department.

**Median** — the middle value, `p50`. Insensitive to extremes.

Both are reported, because they disagree informatively. A large mean gap with a small median gap says the difference lives at the top of the organisation, which is a different problem with a different fix.

## The gap

**Gender pay gap** — the difference between two groups, as a percentage of the higher-paid group:

> mean gap = `(mean(A) − mean(B)) ÷ mean(A)`
> median gap = `(median(A) − median(B)) ÷ median(A)`

This is the **unadjusted** gap — everyone in the group, with no control for level, tenure or role. It is the measure statutory gender pay gap reporting uses, and it is what this product reports.

It is **not** an equal-pay measure. A 12% gap does not mean women are paid 12% less for the same work; it usually means the distribution across levels differs. The reports break the gap down by department and level so that distinction is visible, and the UI says so where the number appears.

Employees with `other` or `undisclosed` gender count toward headcount and are excluded from the two-group comparison. The excluded count is stated, not silently dropped.

**Suppression** — withholding a statistic because the group is too small to mean anything, or small enough to identify individuals.

Groups below the configured minimum return a **suppression marker** — not a number, not zero, not an omitted row. The response names the group and the reason, so the UI shows "not reported — group too small" rather than a blank cell that reads as "no gap". A gap over three people is noise with a decimal point on it, and the spreadsheet this replaces makes computing it trivially easy. Refusing to compute it is a feature.

## Money and time

**Effective dating** — storing a fact with the date range over which it was true, so history is preserved rather than overwritten. Salary records, pay bands and FX rates are all effective-dated, half-open, with `NULL` meaning still in force ([`data-model.md`](data-model.md) §2).

**Current salary** — not a stored column. The salary record whose range covers today; exactly one per employee, enforced by a partial unique index.

**Minor units** — the smallest indivisible unit of a currency: cents for USD, paise for INR, and the yen itself for JPY, which has none. `$1,234.56` is `123456` / `USD`; `¥1,234` is `1234` / `JPY`. Decimal places are a property of the currency, applied once when formatting for display.

**Normalised USD** — a salary converted through the effective-dated rate table, used **only** for cross-country salary comparison in the distribution report. Never for comp ratio, range penetration or outlier detection, which compare a salary to its own local band. Derived at read time; the original amount and currency are what is stored.
