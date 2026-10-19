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
| API | Render or Fly | `PB-078` |
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

## 2. API (`PB-078`)

Deploy `apps/api`. It is a pnpm workspace, so the build has to run from the repository root.

| | |
|---|---|
| Build | `corepack enable && pnpm install --frozen-lockfile && pnpm --filter @paybands/api... build` |
| Start | `node apps/api/dist/index.js` |
| Health check path | `/health` |
| Root directory | blank — it is a pnpm workspace, so the build runs from the repository root |

`corepack enable` comes first so `pnpm` is the version `packageManager` names, which is the
version the lockfile was written by. `--frozen-lockfile` is the part that cares.

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
| `NODE_VERSION` | `24` | `engines.node` is `>=24` with no upper bound, which resolves to whatever is newest. Pin it |
| `PORT`, `HOST` | Usually set by the platform | — |

`DIRECT_URL` is not needed at runtime. The API does not migrate.

### `TRUST_PROXY` is not optional here

Both rate limiters count by `request.ip`. Behind a platform proxy every request arrives from
the proxy, so with `TRUST_PROXY` unset the limiter sees one client and **five wrong passwords
lock out every visitor** ([decision 51](decisions/decision-log.md), `PB-D13`).

`true` trusts the nearest hop, which is what one platform proxy needs. Anything else is read
as the list of addresses or subnets to trust. Both behaviours are held by tests; removing the
fix fails them.

The multi-instance leg of decision 51 stays open and this deployment does not close it. The
limiter counts in one process's memory, so two instances mean two independent counts and an
attacker gets ten attempts rather than five. Deploy one instance, or accept that number.

### `CROSS_SITE_COOKIE` is the one that looks like a bug in your code

`paybands-flame.vercel.app` and `paybands-api.onrender.com` are two different registrable domains,
which makes every call from the browser to the API a **cross-site** request. The session cookie
ships as `SameSite=Strict`, and a browser discards a Strict cookie that arrives on a cross-site
response.

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
| `NEXT_PUBLIC_API_URL` | The API's `https` URL, no trailing slash |

`NEXT_PUBLIC_API_URL` is inlined at build time, not read at runtime. Changing it needs a
redeploy, not a restart.

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

## What shipped, 2026-10-19

| | |
|---|---|
| Web | <https://paybands-flame.vercel.app>, Vercel, root directory `apps/web` |
| API | <https://paybands-api.onrender.com>, Render free, Singapore, one instance |
| Database | Neon `broad-base-15080110`, branch `production` (`br-long-truth-a1putcqw`) |

Both platforms build from `main` on push, so a merge redeploys both.

Render's free tier stops a service after 15 minutes without traffic and takes about a minute
to start again. The README says so, because otherwise the first thing a reviewer meets is a
login screen that hangs and no reason given.

Two things this runbook got wrong before anybody ran it, now fixed above: the build command
needed `corepack enable`, and `NODE_VERSION` needed pinning. A third was in the code rather
than the document — see `PB-D16`.

## The rollback

There is no state to lose. The database is seeded rather than accumulated, the sessions are
signed cookies with no server-side record ([decision 50](decisions/decision-log.md)), and
nothing writes to the database except the two employee endpoints and the salary-change one.
Rolling back is redeploying the previous commit; reseeding is `pnpm db:seed` again, which
truncates and rewrites byte-identical rows.
