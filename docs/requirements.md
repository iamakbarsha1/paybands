# Requirements

Written before the first line of product code. Source: the brief, "Salary Management Assessment — Candidates".

## Goal

Replace the spreadsheet an HR manager at ACME uses to hold salary data for 10,000 employees across multiple countries.

Two jobs:

1. **Hold the data** — employees, levels, departments, countries, and salaries that change over time.
2. **Answer questions about it** — band position, distribution, outliers, gender pay gap.

Job 2 is what Excel does badly at 10,000 rows. That is where the engineering goes.

## User

One persona: the HR manager. No employee view, no manager self-service, no admin tier. The brief names one user.

## In scope

### Data

| | |
|---|---|
| Employees | Name, code, email, country, department, level, manager, hire date, status, gender |
| Salaries | Effective-dated. A raise opens a record and closes the old one; it never overwrites a number. |
| Pay bands | Min / midpoint / max, per level **and** country |
| Reference | Countries, currencies, FX rates, departments, levels |
| Editing | Create and edit an employee, record a salary change |
| Browsing | Paginated, filterable, sortable list; detail page with a salary timeline |

### Reports

| Report | Answers |
|---|---|
| Pay bands | What are the bands, and where does each person sit in theirs? |
| Distribution | Headcount and p25 / p50 / p75 / p90 by country, department, level |
| Comp ratio | How does pay compare to band midpoint, overall and per slice? |
| Outliers | Who is below band min, above band max, or outside the comp-ratio threshold? |
| Gender pay gap | Mean and median gap, suppressed where the group is too small |

Suppression is a feature. A gap computed over three people is noise with a decimal point on it, and it is exactly the mistake a spreadsheet invites. Small groups return "not reported, group too small", stated in the response rather than silently dropped.

### Cross-cutting

- **Multi-currency.** Salaries stored in local currency; USD derived through an effective-dated rate table. Comparing INR to GBP unconverted produces meaningless bands.
- **Auth.** Session login, hashed passwords, every route protected. Public URL, 10,000 people's salaries.
- **Seed.** 10,000 employees, deterministic, with outliers planted so the outlier report has something true to find.
- **Tests.** The comp arithmetic is built test-first.

## Non-goals

| Cut | Why |
|---|---|
| Payroll, payslips, tax | This analyses compensation. Payroll is a different product with a per-country legal surface. |
| Bonus, equity, total rewards | Triples the data model to answer a second-order question. Bands, gaps and outliers live in base pay. |
| Approval workflows | Needs an approver, which is a second role. The brief names one. |
| Excel import / export | The brief frames the spreadsheet as the problem. An import path rebuilds it. |
| Audit log of salary edits | Real HR systems need it. Cut as scope, and named here as the first thing to add — salary history records *what* changed, not *who*. |
| Role-based access control | One persona. A permissions matrix would authorise a user that does not exist. |
| Point-in-time analytics | History is in the model; exposing it across every report multiplies the query and UI surface. It surfaces as a timeline only. |
| Live FX rates | A network dependency and nondeterministic tests, for no gain in analysis quality. |
| Multi-tenancy, i18n, notifications, mobile | Nothing in the brief asks for them. |

## Deliberate complexity

Two places this build spends more than the reports need. Both recorded, because unexplained complexity is what the brief warns against.

- **Effective-dated salary history.** No report reads it. Built anyway on asymmetry: one table and a date predicate now, versus rewriting the schema, the seed and every query later. A flat `current_salary` column is a one-way door.
- **`packages/core` as its own package.** Keeps the comp arithmetic testable with no database, HTTP or React. If the web app only ever imports types from it, it should collapse into the API — that test is written into the decision log.

## Done means

Deployed and reachable with seeded credentials · clone to running in under two minutes · fast, deterministic tests green in CI · a commit history that shows the build order · a short video.

## Open questions

Six went to Incubyte before the build started, each with a stated default so none of them blocks. See [`clarifications.md`](clarifications.md).
