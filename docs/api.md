# API contract

Sixteen routes over one Fastify instance. This document exists so the backend is reviewable
without opening the UI; [`architecture.md`](architecture.md) describes how a request moves
through it, and every schema named here is a zod object you can read in the file cited.

Base URL in development is `http://localhost:3001`. Everything is JSON.

## Conventions, before the routes

**One error shape.** Every 4xx body on this API is exactly `{ "message": string }` and every 5xx
body is exactly `{ "message": "Something went wrong." }`. There is no `statusCode` or `error`
key, and a 5xx never carries the underlying message — that goes to the log instead
([`apps/api/src/app.ts:97`](../apps/api/src/app.ts)). A test asserts that a thrown Prisma error
never puts the word "prisma" in a response ([`app.test.ts:59`](../apps/api/src/app.test.ts)).

**Validation names the field.** Requests are parsed by zod through Fastify's validator compiler
([`app.ts:88`](../apps/api/src/app.ts)). A failure becomes a 400 whose message is
`"<path>: <reason>"` joined with `; `. Query objects are `strictObject`, so `?departmant=2` is a
400 rather than a filter that quietly did nothing.

**Responses are parsed on the way out.** The serializer compiler runs the response schema's
`.parse()` before `JSON.stringify` ([`app.ts:106`](../apps/api/src/app.ts)), so a handler cannot
return a shape its own schema denies. When one tries, that is a 500 — a bug reaching the log, not
a malformed body reaching the browser.

**Money crosses the wire as a string.** `MoneyWire` is
`{ amountMinor: string, currencyCode: CurrencyCode }`
([`packages/core/src/wire.ts:16`](../packages/core/src/wire.ts)). Minor units are `bigint` in the
domain and JSON has no bigint, so they are serialised as decimal strings rather than rounded into
a `number`. Band figures on the bands report follow the same rule: `minMinor`, `midMinor`,
`maxMinor` are strings.

**Dates cross as `YYYY-MM-DD`.** Parsed with `z.iso.date()`. There is no time of day anywhere in
this domain.

**Ratios cross as plain numbers.** `compRatio`, `rangePenetration`, `meanGap` and `medianGap` are
unitless doubles, unrounded, because the edge that displays them is the edge that decides how many
places to show (decision 37).

## Authentication

| | |
|---|---|
| Cookie | `paybands_session` ([`auth/session.ts:4`](../apps/api/src/auth/session.ts)) |
| Value | `"<userId>.<expiresAtEpochMs>"`, signed with `SESSION_SECRET` |
| Flags | `httpOnly`, `secure`, `sameSite=strict`, `path=/`, `maxAge=28800` |
| TTL | 8 hours, carried **inside** the signed value as well as in `Max-Age`, so a replayed cookie is refused even where `Max-Age` is ignored |
| Issued | `POST /auth/login` only |
| Cleared | `POST /auth/logout`, and by `GET /auth/me` when the signed session names a user that no longer exists |

One guard, registered once, on `onRequest`
([`auth/guard.ts:27`](../apps/api/src/auth/guard.ts)) — so an unauthenticated request is refused
before its body is parsed and before any schema runs. Three paths are exempt, matched exactly and
not by prefix: `/health`, `/auth/login`, `/auth/logout`. Logout is public on purpose, so a browser
holding an expired cookie can still throw it away.

The guard's refusal is `401 { "message": "Sign in first" }`. That is a different sentence from the
login route's `401 { "message": "Email or password is wrong" }`, and deliberately so: one is told
to somebody who has not signed in, the other to somebody whose credentials were wrong. The login
message is identical for an unknown email and a wrong password, and an unknown email still pays
for a dummy hash, so the response cannot be used to enumerate accounts
([`routes/auth.ts:43`](../apps/api/src/routes/auth.ts)).

There are no roles. Decision 6 carries why, and its falsifier is any employee-facing view.

## Rate limits

Two routes are limited, by a fixed window counted in memory
([`auth/rate-limit.ts`](../apps/api/src/auth/rate-limit.ts)).

| Route | Limit | Window | Counted by | Refusal |
|---|---|---|---|---|
| `POST /auth/login` | 5 | 15 minutes | `request.ip` | `Too many sign-in attempts. Try again in N seconds.` |
| `POST /ask` | 20 | 15 minutes | session id, falling back to `request.ip` | `Too many questions. Try again in N seconds.` |

Both answer `429` with a `retry-after` header in seconds. Successful attempts count too, so the
limit cannot be stepped around by interleaving a correct password.

What `request.ip` means depends on deployment. Behind a proxy every request arrives from the
proxy unless `TRUST_PROXY` is set, which would count every visitor as one client and lock the
whole internet out after five wrong passwords. The option is wired
([`apps/api/src/index.ts:31`](../apps/api/src/index.ts)) and both behaviours are held by tests
([`routes/auth-rate-limit.db.test.ts`](../apps/api/src/routes/auth-rate-limit.db.test.ts));
setting it correctly is `PB-078`'s job. Decision 51 carries the remaining ceiling, which is that
two instances keep two counters.

## CORS

Registered only when `buildApp` is given a `webOrigin`, which the real server always is
([`app.ts:133`](../apps/api/src/app.ts)).

- `credentials: true`, because the session cookie has to survive a cross-origin fetch.
- `methods: ['GET', 'HEAD', 'POST', 'PATCH']`. `PATCH` is named because the browser's safelist
  stops at POST. [`cors.test.ts`](../apps/api/src/cors.test.ts) reads Fastify's own route table
  and fails if a method this API serves is missing from that list.
- The origin is decided per request by a callback, not echoed. A caller from an unknown origin
  gets no `Access-Control-Allow-Origin` header at all, and the value is never `*`.
- A request with no `Origin` is allowed: that is curl, or a platform health check, not a browser.

No `helmet`, no CSP, no `X-Frame-Options`. The API serves JSON to one known origin and the
protection it relies on is the cookie's own flags. `docs/security.md` records that as a conscious
position rather than an oversight.

---

## Routes

### Health and reference

#### `GET /health` — public

No auth, and no query schema at all, so a platform probe may append whatever it likes without
earning a 400.

```http
200 { "status": "ok", "ask": true }
```

`ask` is `true` exactly when the process was started with a non-empty `ANTHROPIC_API_KEY`
([`app.ts:116`](../apps/api/src/app.ts)). The browser reads this to decide whether to render the
ask bar at all.

#### `GET /reference` — auth required

Everything a form needs to populate a dropdown, in one call. Query must be empty.

```http
200 {
  "currencies":    ["USD","GBP","EUR","INR","SGD","JPY"],
  "genders":       ["female","male","other","undisclosed"],
  "salaryReasons": ["hire","merit","promotion","market"],
  "countries":     [{ "code": "US", "name": "United States" }],
  "departments":   [{ "id": 1, "name": "Engineering" }],
  "jobLevels":     [{ "id": 1, "name": "L1" }]
}
```

The first three come from constants in `packages/core`; the last three from the database. Both
halves are served here so the API and the UI cannot drift about what a valid gender is
([`wire.ts:164`](../packages/core/src/wire.ts)).

### Auth

#### `POST /auth/login` — public, rate-limited

```jsonc
// body — strictObject, apps/api/src/routes/auth.ts:10
{ "email": "hr@paybands.example", "password": "…" }   // email 1–320, password 1–1024
```

| Status | Body |
|---|---|
| `200` | `{ "user": { "id": 1, "email": "…", "displayName": "…" } }`, plus `Set-Cookie` |
| `401` | `{ "message": "Email or password is wrong" }` |
| `429` | `{ "message": "Too many sign-in attempts…" }` + `retry-after` |

#### `GET /auth/me` — auth required

`200` with the same `{ user }` shape. `401` from the guard when there is no valid session; `401`
with the cookie cleared when the session is valid but the user row has gone.

#### `POST /auth/logout` — public

`204`, no body, cookie cleared. The one route with no schema declared, because it has nothing to
validate and nothing to serialise.

### Employees

#### `GET /employees` — auth required

The only paginated endpoint in the API.

| Param | Type | Default |
|---|---|---|
| `country` | ISO-3166 alpha-2, exactly 2 chars | — |
| `department` | positive int | — |
| `level` | positive int | — |
| `status` | `active` \| `left` \| `all` | `active` |
| `sort` | `name` \| `hireDate` \| `id` | `name` |
| `direction` | `asc` \| `desc` | `asc` |
| `limit` | int, 1–100 | `25` |
| `cursor` | opaque, server-issued | — |

Declared at [`routes/employees.ts:57`](../apps/api/src/routes/employees.ts). The cap of 100 is
there so the response can never contain the table.

```http
200 { "employees": [ EmployeeListItem, … ], "nextCursor": "eyJ2YWx1ZSI6…" | null }
```

`EmployeeListItem` is `{ id, employeeCode, firstName, lastName, email, gender, countryCode,
departmentId, jobLevelId, hireDate, terminationDate | null, status }`
([`wire.ts:21`](../packages/core/src/wire.ts)).

The cursor is keyset, not an offset: base64url of `{ value, id }`, where `value` is the last row's
sort key and `id` breaks the tie. A client never builds one — it sends back what `nextCursor`
gave it. Anything else fails validation with `not a cursor this API issued`.

#### `GET /employees/:id` — auth required

```http
200 {
  "employee":         EmployeeListItem & { managerId, departmentName, jobLevelName },
  "salaryHistory":    [ { id, amountMinor, currencyCode, effectiveFrom, effectiveTo, reason } ],
  "currentSalary":    MoneyWire | null,
  "band":             { "min": MoneyWire, "mid": MoneyWire, "max": MoneyWire } | null,
  "compRatio":        number | null,
  "rangePenetration": number | null
}
```

`404 { "message": "No employee with id 123" }`.

Three of those can be null independently and they mean different things: no salary on record, no
band covering this level and country, and no ratio because one of the other two is missing.

#### `POST /employees` — auth required → `201`

Body is `employeeInput` ([`packages/core/src/contracts.ts:19`](../packages/core/src/contracts.ts)) —
the same object the browser's form parses with, which is what stops the two from disagreeing
about a valid gender (decision 52).

```jsonc
{
  "employeeCode":    "E-1001",          // 1–32
  "firstName":       "Ada",             // min 1
  "lastName":        "Byron",
  "email":           "ada@example.com",
  "gender":          "female",          // GENDERS
  "hireDate":        "2026-01-15",      // YYYY-MM-DD
  "terminationDate": null,              // optional, nullable
  "countryCode":     "GB",
  "departmentId":    1,
  "jobLevelId":      3,
  "managerId":       null               // optional, nullable
}
```

#### `PATCH /employees/:id` — auth required → `200`

Body is `employeePatch` — `employeeInput.partial()` refined to require at least one field. An
empty object is a 400 saying `name at least one field`. The browser's form sends only what
changed, which is what gives that refusal something to refuse.

#### `POST /employees/:id/salary` — auth required → `201`

```jsonc
{
  "amountMinor":  "8500000",   // string of digits, no leading zero — minor units
  "currencyCode": "GBP",
  "effectiveFrom": "2026-04-01",
  "reason":        "merit"     // hire | merit | promotion | market
}
```

Returns the created record. Writing a salary closes the open one: the database holds a partial
unique index allowing exactly one row per employee with `effective_to IS NULL`, so two open
records is a constraint violation rather than a report that quietly double-counts
([`data-model.md`](data-model.md), decision 18).

#### Write failures

All three write routes map a typed failure to a status
([`routes/employees.ts:81`](../apps/api/src/routes/employees.ts)):

| Failure | Status | Means |
|---|---|---|
| `duplicate` | `409` | The employee code or email is taken |
| `not-found` | `404` | No such employee |
| `unknown-reference` | `400` | No such department, level, country or manager |
| `out-of-order` | `400` | The new salary predates the open one |
| `currency-mismatch` | `400` | The salary's currency is not the employee's country's |

### Reports

Five GETs, all auth required, all pure reads. Each returns the whole report in one response —
there is no second call for a chart, because the chart and the table are drawn from the same body.

#### `GET /analytics/bands`

Query: `country` (2 chars, optional), `level` (positive int, optional).

```http
200 { "bands": [ { jobLevelId, jobLevelName, countryCode, currencyCode,
                   minMinor, midMinor, maxMinor, headcount } ] }
```

Band spread is **not** in the response. The browser computes it with `bandSpread` from
`packages/core` ([`reports/bands/page.tsx:148`](../apps/web/app/(app)/reports/bands/page.tsx)),
which is the column that compares bands across currencies.

#### `GET /analytics/distribution`

Query: `groupBy` — `country` | `department` | `level`. **Required**, no default.

```http
200 { "groupBy": "department", "currency": "USD",
      "groups": [ { key, name, headcount,
                    "percentiles": { "p25": MoneyWire, "p50": …, "p75": …, "p90": … } | null } ] }
```

Percentile points are fixed at 25/50/75/90. `percentiles: null` means the slice has nobody paid in
it, which is not the same as zero. Everything is converted to USD at the reference date, because
percentiles across six currencies are otherwise meaningless.

#### `GET /analytics/comp-ratio`

Query: `groupBy`, required.

```http
200 { "groupBy": "level",
      "buckets": [ { "from": null, "to": 0.8 }, { 0.8, 0.9 }, { 0.9, 1.0 },
                   { 1.0, 1.1 }, { 1.1, 1.2 }, { "from": 1.2, "to": null } ],
      "overall": { headcount, measured, unbanded, counts: number[] },
      "groups":  [ { key, name, headcount, measured, unbanded, counts } ] }
```

`counts` is positionally aligned with `buckets`. `measured` plus `unbanded` equals `headcount`, and
the gap between them is the report's honesty: somebody with no band is counted as present and
unmeasurable rather than dropped.

#### `GET /analytics/outliers`

Takes no parameters at all — the query schema is the empty strict object.

```http
200 { "threshold": { "min": 0.8, "max": 1.2 },
      "belowBand": [ OutlierRow ], "aboveBand": [ … ],
      "compRatioOutOfRange": [ … ], "noBand": [ … ] }
```

Four lists, not one flagged column. `noBand` is its own list because "we cannot judge this person"
is a different finding from "this person is paid wrongly".

#### `GET /analytics/pay-gap`

Query: `groupBy`, required.

```http
200 { "groupBy": "department", "currency": "USD", "minGroupSize": 5,
      "overall": PayGap, "groups": [ PayGap & { key, name } ] }
```

where `PayGap` is `{ headcount, compared: { male, female }, excluded, suppressed, reason,
meanGap, medianGap }`.

A slice with fewer than five of either gender is **suppressed**: `suppressed: true`, both gaps
`null`, and `reason` a sentence the screen prints verbatim. The API refuses to publish the number
rather than publishing one that identifies a person, and the refusal is in the response instead of
being an absence the UI has to guess at.

### Ask

#### `POST /ask` — auth required, rate-limited

```jsonc
{ "question": "how do engineering salaries compare by level?" }
```

| Status | Body |
|---|---|
| `200` | `{ "query": AskQuery, "result": <the matching report's body> }` |
| `422` | `{ "message": "…" }` — the model's answer did not fit `askQuery` |
| `429` | `{ "message": "Too many questions…" }` + `retry-after` |
| `503` | `{ "message": "The ask bar is off: this server was started without ANTHROPIC_API_KEY." }` |
| `503` | `{ "message": "The model could not be reached." }` |

`AskQuery` is a discriminated union on `report`
([`apps/api/src/ask/query.ts:12`](../apps/api/src/ask/query.ts)):

```ts
| { report: 'bands',        country?: string, level?: number }
| { report: 'distribution', groupBy: 'country' | 'department' | 'level' }
| { report: 'comp-ratio',   groupBy: … }
| { report: 'pay-gap',      groupBy: … }
| { report: 'outliers' }
```

The model produces the `query`, never the `result`. `result` is whatever the matching report
function returned — the same function the corresponding `/analytics/*` route calls, running the
same SQL and the same arithmetic. The `query` is echoed back because the browser renders what was
understood, as a sentence and a link, rather than rendering rows the user cannot check
(decision 58).

A question the schema cannot express is a 422 with a reason, not a guess.

---

## Status codes, all of them

| Code | Where from |
|---|---|
| `200` | Reads, `PATCH`, login |
| `201` | `POST /employees`, `POST /employees/:id/salary` |
| `204` | `POST /auth/logout` |
| `400` | zod validation; `unknown-reference`, `out-of-order`, `currency-mismatch` |
| `401` | The guard; failed login; a session naming a deleted user |
| `404` | Unmatched route; no such employee |
| `409` | `duplicate` |
| `422` | `/ask` could not translate the question |
| `429` | Login or ask rate limit |
| `500` | An uncaught exception, or a handler returning a shape its response schema denies |
| `503` | `/ask` with no key, or a model that could not be reached |
