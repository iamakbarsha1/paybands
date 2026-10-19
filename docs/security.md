# Security and privacy

Written from the two audits phase 12 ran against `5564541`: an attack surface audit
(`PB-073`) over secrets, auth, database, input and exposure, and a legal exposure audit
(`PB-074`) over privacy, content, sales and AI. Every finding below was either fixed in the
commit named beside it or accepted here with a reason, which is what `PB-073` asks for.

Not legal advice. The privacy section states what this build does with personal data; what
the law requires of a particular deployment is for a lawyer in that jurisdiction.

## What this covers

| Audit | Scope | Where the findings went |
| --- | --- | --- |
| `PB-073` | `apps/api`, `apps/web`, `packages/core`, the seed | three failures, all three fixed in `5564541` |
| `PB-074` | the same, plus the user-facing copy and the absence of policy pages | four findings: two fixed, one is this document, one accepted below |

Both audits worked one checklist item at a time, and an item nobody could settle from the
repository is recorded as such rather than passed. Those are in [What the repository cannot
settle](#what-the-repository-cannot-settle).

## The security position

**Nothing but the API holds a credential.** `apps/api/src/index.ts` is the only file that
reads `ANTHROPIC_API_KEY`, `SESSION_SECRET` or a connection string, and it hands each one
down as a value (decision 56). The browser bundle holds one environment variable,
`NEXT_PUBLIC_API_URL`, which is a base URL. No `.env` is tracked: `.gitignore` ignores
`.env` and `.env.*` and keeps `apps/api/.env.example`, whose values are placeholders. A
history search for key-shaped strings, `postgresql://` and `SESSION_SECRET=` finds the
example file, the docs and one test fixture, `sk-ant-notarealkey-0123456789`.

**Every route is private unless one line says otherwise.** The guard runs on `onRequest`,
before body parsing and before validation, so an unauthenticated request never reaches a
schema (`apps/api/src/auth/guard.ts`). Three paths are public and they are declared
together: `/health`, `/auth/login`, `/auth/logout`. A route added tomorrow is private
without anybody remembering to make it so, and opening one is a visible edit to that set.

**The session is a signed, HttpOnly, Secure, SameSite=Strict cookie** carrying a user id and
its own expiry inside the signature (`apps/api/src/auth/session.ts`). The expiry is signed
rather than left to `Max-Age`, because `Max-Age` is a request to a browser and a replayed
cookie is not sent by a browser. There is no session table, so a stolen cookie stays valid
until it expires — decision 50 carries that ceiling and names the upgrade. `SameSite=Strict`
plus a single allowed CORS origin is also what stands in for a CSRF token: a cross-site POST
carries no cookie.

**Passwords are argon2id** (`apps/api/src/auth/password.ts`), and login answers one sentence
for a wrong password and an unknown email alike, hashing on both paths so the timing does not
separate them (`apps/api/src/routes/auth.ts`).

**Two routes are rate limited and they count different things.** Login counts five attempts
per fifteen minutes per address, because there is no session yet. `POST /ask` counts twenty
questions per fifteen minutes per session, because there always is one and what it spends is
a paid key rather than a password. A refused question never reaches the model. Both windows
are in one process and in memory: two instances mean two counters, and a client behind a
proxy counts as the proxy until `TRUST_PROXY` is set. Decision 51 carries both ceilings, and
`PB-D13` closed the second one as far as code can: the option is read at the edge
(`apps/api/src/index.ts`) and both behaviours are held by tests — untrusted, five wrong
passwords refuse the next person through the same proxy; trusted, they refuse only the
guesser. Setting it correctly at deploy time is still a human decision, and an unset
`TRUST_PROXY` behind a proxy is the dangerous configuration rather than a merely weak one.

**SQL is parameterised everywhere it is written by hand.** The two `$queryRaw` joins in
`apps/api/src/repositories/analytics.ts` interpolate nothing. The two `$executeRawUnsafe`
calls in the seed take table names from that module's own `TABLES` constant and never touch a
request. Every request body, query string and response is parsed by zod at the boundary, with
`strictObject` throughout, so an unknown field is a 400 rather than a value quietly dropped.
Writes map field by field (`apps/api/src/repositories/employees.ts`), which is what keeps a
request from setting a column the route never offered.

**An unhandled error no longer explains itself to the browser.** Fastify's default handler
sends `error.message` whatever the status, so a driver fault or an unexpected enum value
reached the browser as prose about a column. `apps/api/src/app.ts` now answers one fixed
sentence for anything 500 and up and sends the reason to the log. A 4xx message is unchanged,
because those are the API's own words and the screens render them.

**CORS is one origin, decided per request.** A stranger gets no `Access-Control-Allow-Origin`
header at all rather than the configured origin echoed back, and the allowed method list is
checked against Fastify's own route table by `apps/api/src/cors.test.ts` (`PB-080`).

**The dependency tree is clean as of this commit.** Three advisories sat under the Prisma CLI
in a MySQL driver this app never loads; `prisma` 7.10.1 carries `mysql2` 3.24.4 and
`deepmerge-ts` 8.0.2, so the bump cleared all three. `pnpm audit --prod` reports none.

### What the model boundary is allowed to see

The ask bar sends the question text and nothing else. `translate` takes a question and a
completion function and holds no client, no repository and no row (decision 55), and two
tests hold the route to it: one compares the prompt the route produced against the prompt
`translate` renders with no route in the way, and one checks that prompt against every row the
same request went on to return. The answer is a query object parsed by zod against the five
reports; anything else is a stated refusal with a reason, never a retry. The arithmetic runs
in `packages/core` either way, so a question and a click reach one implementation.

Unset the key and the feature is off: `POST /ask` answers 503 with a reason and `/health`
reports `ask: false`, which is how the browser knows not to draw the bar. Every other feature
works.

## The privacy position

### What is held, and which report needs it

| Field | Why it exists |
| --- | --- |
| Name, employee code | Identifying a person on the employee screens and in the outliers list |
| Work email | Identifying a person; unique per row |
| Gender | The gender pay gap report (`PB-047`), which cannot be computed without it |
| Country | Pay bands are per country per level, and comparison needs a currency |
| Department, job level, manager | Every sliced report groups by one of them |
| Hire date, termination date | Who is active, which every report filters on |
| Salary history, effective dates, reason | The product |
| HR login: email, display name, argon2id hash | Signing in |

No field in `prisma/schema.prisma` is collected without a report that reads it. Gender is the
one worth stating plainly: it is held because a gender pay gap report is in the requirements,
it is recorded as one of four values including *other* and *undisclosed*, and the report puts
the people it cannot compare in the headcount and outside the two-way comparison rather than
hiding them (`docs/glossary.md`).

### Who receives it

Two processors, and only one of them always.

1. **The database host.** Every row lives in Postgres at the host named in `DATABASE_URL`.
2. **The model provider, only when `ANTHROPIC_API_KEY` is set.** It receives the text of a
   question typed into the ask bar, with no row, no name and no salary attached. The ask bar
   says so above the box rather than in a policy page, because that box is the one place in
   the app whose contents leave for a third party.

Nothing else. There is no analytics vendor, no tag manager, no session replay, no pixel and
no error reporter in `apps/web` — a sweep for the usual names finds nothing to gate behind a
consent banner. The single cookie, `paybands_session`, is strictly necessary for signing in,
which is why there is no banner: consent is not the basis it rests on.

### Lawful basis, retention, rights

For a real deployment inside a company: the employment relationship for holding pay and
identity data, and the employer's legitimate interest in pay analysis for the reports.
Consent is the wrong basis for either — an employee cannot freely refuse their own payroll
record.

**Retention and the subject's rights are not implemented in this build, and that is accepted
rather than overlooked.** There is no `DELETE /employees/:id`, no export endpoint and no purge
job: `terminationDate` marks a leaver and keeps every row, including salary history, with no
stated period. For a demo over synthetic rows the exposure is zero, and the work is named
rather than done: a retention period per table, a delete that removes a person and their
salary rows in one transaction, and an export of the same JSON the detail screen reads. A
deployment holding real employees needs all three before it holds them.

**A disputed answer can be reconstructed.** `POST /ask` logs the translated query and the
report it ran, never the question text — the query is the part that is useful afterwards, and
the question is the part that could name a person.

### The demo data is synthetic

Confirmed, not assumed:

- Names are recombined from per-country pools of common given and family names
  (`apps/api/src/seed/names.ts`) by a seeded generator. No row in those pools is a person, and
  no row came from a real dataset.
- Emails are `first.last<id>@paybands.example` (`apps/api/src/seed/generate.ts`).
  `.example` is reserved by RFC 2606 and cannot receive mail.
- Salaries, hire dates, genders and the planted outliers are computed by the generator, whose
  output is pinned to a committed hash in `apps/api/src/seed/generate.test.ts`. Running the
  seed twice produces the same database.
- The only credential in the repository is the seeded demo login, `hr@paybands.example`,
  which exists so a reviewer can sign in.

Name collisions with living people are arithmetic rather than sourcing: combining common
first and last names 10,000 times will match real people by coincidence. The method above is
the honest statement of it; no row describes anybody.

## What the repository cannot settle

| Question | What would settle it | When |
| --- | --- | --- |
| Is the API served over TLS, so the `Secure` cookie arrives at all? | The deployed URL and its certificate | `PB-078` |
| Is `TRUST_PROXY` set, so the login limiter counts clients rather than the proxy? | The platform's proxy behaviour, and the variable now wired to read it | `PB-078` |
| Is `CROSS_SITE_COOKIE` set, so the browser keeps the session cookie at all? | Whether the web app and the API end up on one registrable domain | `PB-078`, `PB-079` |
| Does the runtime database role own the tables, or is it restricted? | The role's grants in the database console | `PB-077` |
| Is the data encrypted at rest, in an appropriate region, under a signed processor agreement? | The host's console and DPA | `PB-077` |
| Does the model provider retain question text, and for how long? | The provider account's data settings | Before real data is typed into the bar |

Row-level security is not one of these. There is one tenant, one database role and one kind
of user: every signed-in person is an HR administrator by the brief, so `GET /employees/:id`
serving any employee to any session is the product rather than a leak. Nothing but the API
holds the connection string, and no browser talks to the database. A second kind of user —
a manager who may see their own reports only — is the change that would make per-row policy
the right tool, and it would arrive with a role column rather than as a policy bolted under
the current one.

## The audits in one line each

| Finding | Severity | Outcome |
| --- | --- | --- |
| `POST /ask` had no rate limit | HIGH | Fixed in `5564541`, held by two tests that fail without the hook |
| Unhandled errors returned their own message | LOW | Fixed in `5564541`, held by a test that fails when the 500 echoes its cause |
| Three advisories under the Prisma CLI | LOW | Fixed by `prisma` 7.10.1; `pnpm audit --prod` is clean |
| The ask bar did not say the question leaves for a third party | HIGH | Fixed: the disclosure is above the box, and the answer names the model |
| No privacy statement anywhere | HIGH | Fixed: this document, linked from `README.md` |
| A model answer could not be reconstructed | LOW | Fixed: the translated query is logged, the question is not |
| No erasure, export or retention period | LOW here, HIGH for a real deployment | Accepted above, with the three pieces of work named |
