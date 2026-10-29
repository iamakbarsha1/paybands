# Deploying

`PB-077`, `PB-078` and `PB-079` are one sitting. This is the order to do them in, what to set,
and what to check before moving on.

Three services. The database comes first because the API needs its URL, and the API comes
before the web app because the web app needs its URL. The one loop in that chain is CORS: the
API has to know the web origin, which does not exist until the web app is deployed, so
`WEB_ORIGIN` is set twice.

Everything below assumes the repository is pushed and CI is green.

| | Where | Ticket |
|---|---|---|
| Database | Neon, production branch | `PB-077` |
| API | Vercel | `PB-078`, `PB-D26` |
| Web | Vercel | `PB-079` |

---

## 1. Database (`PB-077`)

Create a production branch on the existing Neon project and take both connection strings. They
are the same host; the pooled one has `-pooler` in it.

Migrations run through the direct URL, not the pooled one. They take advisory locks and build a
shadow database, neither of which belongs on a pooled connection
([decision 20](decisions/decision-log.md)).

```bash
cd apps/api
DATABASE_URL="$PROD_DIRECT_URL" DIRECT_URL="$PROD_DIRECT_URL" pnpm exec prisma migrate deploy
DATABASE_URL="$PROD_DIRECT_URL" pnpm exec tsx src/seed/index.ts
```

The seed takes a few minutes for 10,000 employees and about 35,000 salary records. It refuses
to run against a database holding a different number of employee rows than it writes, which is
its way of saying "this database is not mine".

Two things to confirm in the console while it is open, both from
[`security.md`](security.md)'s list of what the repository cannot settle:

- **The runtime role's grants.** The app's `DATABASE_URL` does not need to own the tables.
  Migrations are the only thing that needs DDL, and they run from your machine through the
  direct URL.
- **Encryption at rest, and the region.** Neon encrypts at rest by default; the region is the
  choice that matters, because this build holds salary and gender together and the demo data
  being synthetic is what makes any region defensible. A real deployment picks the region its
  employees are in.

**Done when:** `SELECT count(*) FROM employee` returns 10,000 and `SELECT count(*) FROM
app_user` returns 1.

---

## 2. API (`PB-078`, moved to Vercel by `PB-D26`)

Deploy `apps/api` as its own Vercel project. It runs as one function rather than a long-lived
process, which is what `src/vercel.ts` is for: the same `buildApp` the server uses, handed one
request at a time instead of a listening socket.

| | |
|---|---|
| Framework preset | Other |
| Root directory | `apps/api`, with **Include source files outside of the Root Directory** on — the workspace packages live above it |
| Build | `pnpm build` (set in `apps/api/vercel.json`) |
| Output directory | `public`, which is empty on purpose; everything is rewritten to the function |
| Node version | 24.x |
| Region | `sin1`, set in **project settings** and not in `vercel.json` — the key there is rejected on plans limited to one region, and the setting is not |
| Health check path | `/health` |

**Why the function imports a build rather than the source.** `apps/api/api/index.js` re-exports
`dist/vercel.js`. Vercel's bundler traces imports but does not transpile them, and
`@paybands/core` ships TypeScript with no build step, so a function importing it through the
workspace would ship a `.ts` file into a Node runtime. `tsup` already inlines core
(`noExternal`), so the function is pointed at that output and there is one bundler in the
chain instead of two.

**Turn Vercel Authentication off.** New projects get it on, and on an API it answers every
call — including the browser's — with a login page instead of JSON. The API has its own auth;
this protection is the wrong layer for it.

`postinstall` runs `prisma generate`, so the client is built before the API is. That generate
needs no database, and since `PB-D16` it no longer asks for one — it used to resolve
`DIRECT_URL` at config load and take `pnpm install` down with it wherever no `.env` existed,
which is every platform build and every fresh clone.

### Environment

| Variable | Value | What happens if it is wrong |
|---|---|---|
| `DATABASE_URL` | The **pooled** Neon URL | The unpooled one works until connections run out |
| `SESSION_SECRET` | `openssl rand -base64 32`, at least 32 characters | The process refuses to start under 32. Changing it later signs every live session out |
| `WEB_ORIGIN` | The Vercel URL, with no trailing slash | Every browser request fails CORS. Set it again after step 3 |
| `TRUST_PROXY` | `true` | See below. This is the one that bites |
| `CROSS_SITE_COOKIE` | `true`, unless both apps share one registrable domain | See below. This is the other one |
| `ANTHROPIC_API_KEY` | A key, or leave it empty | Empty means the ask bar is off and everything else works |
| `NODE_VERSION` | `24` | `engines.node` is `>=24` with no upper bound, which resolves to whatever is newest. Pin it. On Vercel this is the project's Node version setting |
| `PORT`, `HOST` | Only read by `src/index.ts` | A function has no socket to bind |

`DIRECT_URL` is not needed at runtime — the API does not migrate — but set it anyway so
`prisma migrate deploy` can be run against this database from a shell without assembling the
unpooled host by hand.

**Run the migrations before the first deploy, not after.** The Vercel cutover found this the
expensive way: the production branch was two migrations behind `main`, the old host was still
serving code old enough not to notice, and the first login against the new deployment answered
500 with `column app_user.role does not exist`. `pnpm exec prisma migrate deploy` with
`DIRECT_URL` pointed at the production branch is the whole fix, and it is additive, so a
previous deployment still reading the old columns keeps working while you do it.

### `TRUST_PROXY` is not optional here

Both rate limiters count by `request.ip`. Behind a platform proxy every request arrives from
the proxy, so with `TRUST_PROXY` unset the limiter sees one client and **five wrong passwords
lock out every visitor** ([decision 51](decisions/decision-log.md), `PB-D13`).

`true` trusts the nearest hop, which is what one platform proxy needs. Anything else is read
as the list of addresses or subnets to trust. Both behaviours are held by tests; removing the
fix fails them.

The multi-instance leg of decision 51 stays open, and since `PB-D26` this deployment makes it
real rather than theoretical. The limiter counts in one process's memory. Render ran a single
instance, so "deploy one instance" was advice a deployment could follow; a function autoscales,
so the honest statement is that **five login attempts is five per instance, and the number of
instances is the platform's to choose**. Nothing caps the total.

That is accepted here rather than fixed, because the fix is a shared store and this database
holds synthetic data behind a password that is printed in the README. What makes it acceptable
is also what makes it worth writing down: the limiter still stops a single client hammering one
instance, argon2id still costs an attacker real time per guess, and the ceiling is named instead
of implied. A deployment holding real salaries should back the limiter with Redis before it
holds anything else.

### `CROSS_SITE_COOKIE` is the one that looks like a bug in your code

`paybands-flame.vercel.app` and `paybands-api.vercel.app` are two different registrable domains,
which makes every call from the browser to the API a **cross-site** request. The session cookie
ships as `SameSite=Strict`, and a browser discards a Strict cookie that arrives on a cross-site
response.

A shared suffix is not a shared site, and this is the trap `PB-D26` walked up to: moving the API
onto Vercel put both apps under `vercel.app` and changed nothing, because `vercel.app` is on the
Public Suffix List. Each subdomain is its own registrable domain, so the flag stays on. Verified
rather than reasoned: the live login returns `SameSite=None; Secure` and a real Chromium session
signs in and stays in.

What that looks like: `POST /auth/login` returns **200** with a correct `Set-Cookie`, the
browser stores nothing, `GET /auth/me` returns 401, and the UI bounces straight back to the
login screen. Nothing in the API log is wrong. Nothing in the response is wrong. It reads as a
bug in the session code, and it is not one.

Set `CROSS_SITE_COOKIE=true` and the cookie goes out as `SameSite=None; Secure`, which the
browser keeps. Leave it unset only if you put both apps under one registrable domain, through
a custom domain pair or a Vercel rewrite, in which case `Strict` is the better value and you
should keep it.

This was found by running the browser smoke with the page on `localhost` and the API on
`127.0.0.1`, which is cross-site by the same rule. Both values are held by tests in
`auth-cross-site.db.test.ts` (`PB-D15`, [decision 63](decisions/decision-log.md)).

What `None` gives up, and why it is acceptable here: `Strict` is a browser-enforced CSRF
defence, and `None` removes it. What remains is that CORS allows exactly one origin, and every
route that changes anything takes a JSON body. A cross-site form post cannot set
`content-type: application/json`, so it is refused at the body parser before any handler runs,
and a cross-site `fetch` cannot read the response. The same-domain deployment is still the
better one; this is the trade a free-tier split deployment makes.

### Before moving on

- `GET /health` returns `{"status":"ok","ask":false}`, or `"ask":true` if a key was set.
- The URL is `https`. The session cookie is `Secure`, so over plain HTTP it is set by the API
  and never sent back, which looks exactly like a login that silently does nothing.
- `POST /auth/login` with the seeded credentials returns 200 and sets a cookie.

**Done when:** the health check is green on the platform's own dashboard, not only in your
browser.

---

## 3. Web (`PB-079`)

Deploy `apps/web` on Vercel. Root directory `apps/web`, framework Next.js, and pnpm detected
from the lockfile.

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | The API's `https` URL, no trailing slash. Production and Preview only |

`NEXT_PUBLIC_API_URL` is inlined at build time, not read at runtime. Changing it needs a
redeploy, not a restart.

**Leave the Development environment unset.** `apps/web/lib/api.ts` falls back to
`http://localhost:3001`, which is where a developer's API actually is; setting the variable for
Development points `vercel dev` and `vercel env pull` at the production API instead, which is a
local run quietly reading and writing live data. The fallback is the correct value, so the
absence of the variable is the configuration, not a gap in it.

Read the production alias off the deployment rather than predicting it. Vercel project names
are not yours to assume: `paybands` was taken, so this one is aliased `paybands-flame`. That
is the whole reason `WEB_ORIGIN` is set second — guess it and CORS fails against a URL that
looks right.

Then go back to the API and set `WEB_ORIGIN` to the Vercel URL, and restart it. Until that
happens every request from the browser fails preflight, which in the UI looks like "Could not
reach the server" on every screen.

CORS is one origin and only if one was given. A preview deployment on a different Vercel URL
will not be allowed through; that is the rule working, not a bug.

**Done when:** signing in at the live URL lands on `/employees` with rows in the table, and
`/reports/bands` renders money.

---

## 4. If the ask bar is turned on

It is off without a key and everything else works, which is the supported default. If a key is
set, one thing is still outstanding from [`security.md`](security.md): **does the provider
retain question text, and for how long?** The question is sent to a third party, which the bar
says in its own UI copy. Check the account's data settings before anybody types a real question
into it.

The bar is also rationed by session ([decision 60](decisions/decision-log.md)), because what it
spends is a key.

---

## Afterwards

Fill the live URL into [`../README.md`](../README.md) where it is marked, which closes
`PB-081`. The demo credentials are already there and are the seed's own, which ships them on
purpose: `hr@paybands.example` / `paybands-demo-2026`.

Then record the URL and the date in [`../tasks/todo.md`](../tasks/todo.md) under phase 13.

## What shipped, 2026-10-19, and what moved on 2026-10-29

| | |
|---|---|
| Web | <https://paybands-flame.vercel.app>, Vercel, root directory `apps/web` |
| API | <https://paybands-api.vercel.app>, Vercel function, region `sin1`, root directory `apps/api` |
| Database | Neon `broad-base-15080110`, branch `production` (`br-long-truth-a1putcqw`), `aws-ap-southeast-1` |

Both projects build from `main` on push, so a merge redeploys both. The function sits in the
same region as the database on purpose; the default would have put every query across an ocean.

### Why the API left Render (`PB-D26`)

Render's free tier stopped the service after 15 idle minutes, and the first request back was
**measured at 42.7 seconds** on 2026-10-29 — paid by whoever opened the link first, on a login
screen that gave no reason for the wait.

The first fix was a scheduled job pinging `/health` every five minutes. It worked and it was
wrong: the same free tier meters **750 instance hours a month**, a service that never sleeps
burns about 730, and the workaround quietly traded an intermittent latency problem for a quota
that suspends the service outright. A workaround for one limit on a free tier is usually a
trade against a different limit on the same account.

So the API moved to the platform the web app was already on, where there is no sleep and no
hour meter. `/health` answers in **under half a second** warm or cold, the keepalive job is
deleted, and the three paragraphs of cold-start apology are gone from the README.

What it cost, stated rather than buried: the rate limiter's multi-instance ceiling stopped
being theoretical (above), and the function needed an entry point and a pre-bundling step the
long-running server did not.

Two things this runbook got wrong before anybody ran it, now fixed above: the build command
needed `corepack enable`, and `NODE_VERSION` needed pinning. A third was in the code rather
than the document — see `PB-D16`. A fourth was not in the runbook at all: it never said to run
the migrations before cutting over, which is how `PB-D26` met `column app_user.role does not
exist` on its first login.

## The rollback

There is no state to lose. The database is seeded rather than accumulated, the sessions are
signed cookies with no server-side record ([decision 50](decisions/decision-log.md)), and
nothing writes to the database except the two employee endpoints and the salary-change one.
Rolling back is redeploying the previous commit; reseeding is `pnpm db:seed` again, which
truncates and rewrites byte-identical rows.
