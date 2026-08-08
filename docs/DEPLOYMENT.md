# Deployment

**Slice:** V0 Pipeline (`17 §4`)
**Rule this document exists to enforce:** a preview deployment must never be able to read production data.

---

## 1. What the pipeline is

```
git push  →  Vercel build
                 │
                 ├─ npm run db:migrate      ← migrations, before anything serves traffic
                 ├─ npm run db:seed         ← league history + content, idempotent
                 └─ next build
                          ↓
              deployment goes live
```

`package.json` defines `vercel-build`, and Vercel runs it in place of `build`. That ordering is the whole point: the schema is always at least as new as the code running against it. A failed migration fails the build, and the previous deployment keeps serving.

`db:seed` imports the recorded 2024–2026 league chain and the Counter Greetings from `content/counter-greetings.md`. Both steps are idempotent — a second run reports zero changes — so a database that is already current is left alone. It reads committed fixtures rather than the live Sleeper API, so a Sleeper outage cannot take a deploy down with it. Editing a greeting in the markdown and pushing is therefore all it takes to change what Tony says.

`npm run build` stays pure — no database, no side effects — so local builds and CI do not need a database to typecheck and compile.

| Branch | Deploys to | Database |
|---|---|---|
| `main` | production, the live `*.vercel.app` URL | Neon **production** branch |
| every other branch / PR | a preview URL | Neon **sandbox** branch |

Hobby preview URLs are public to anyone holding the link. That is why the sandbox branch exists and why the preview `DATABASE_URL` must be scoped to Preview only.

---

## 2. Environment variables

Set in **Vercel → Project → Settings → Environment Variables**. The Environment column is load-bearing.

| Variable | Production | Preview | Development | Notes |
|---|---|---|---|---|
| `DATABASE_URL` | Neon **production** pooled | Neon **sandbox** pooled | — | Two different values. Never the same string. |
| `SESSION_SECRET` | unique | unique, different | — | `openssl rand -base64 32`. Different per environment so a preview cookie cannot be replayed against production. |
| `SLEEPER_LEAGUE_ID` | `1385016656425668608` | same | same | Configuration, not a secret. |
| `COMMISSIONER_SLEEPER_USER_ID` | commissioner's Sleeper ID | same | same | Unset = nobody is an admin and admin routes 404. |
| `CLAIM_CODE` | optional | optional | — | A shared word the claim screen asks for once. Unset = anyone with the URL can claim an unclaimed name. |
| `ANTHROPIC_API_KEY` | optional | leave unset | — | The Slice must publish without it (`16 §9`). |
| `CRON_SECRET` | **required** | — | — | `openssl rand -base64 32`. **Both** scheduled jobs' only door — `lib/cron/secret.ts`, one implementation. **Unset means both routes refuse everything**, including Vercel's own scheduler; a job that runs unprotected is a job whose missing secret nobody notices. Production only: a preview deploy must never close a week or photograph one. |

### The scheduled jobs

`vercel.json` declares **two**, which is the number `16 §4.3` allows and the
number that now exist. There is no third.

| path | schedule | UTC | Eastern |
|---|---|---|---|
| `/api/cron/sunday` | `55 4 * * 1` | Monday 04:55 | **Mon 00:55 EDT · Sun 23:55 EST** |
| `/api/cron/tuesday` | `0 9 * * 2` | Tuesday 09:00 | Tue 05:00 EDT · Tue 04:00 EST |

Vercel's schedules are UTC and the league's day is Eastern, so neither can hold
its local hour across the November change. Each is placed where the drift is
harmless in the direction it drifts.

**Sunday is the one that had to be thought about.** `16 §4.3` asks for *"Sunday
~11:55pm ET"*, and the obvious `55 3 * * 1` is 11:55pm during EDT and **10:55pm
during EST — inside the Sunday night game** for half the season. `55 4 * * 1` is
11:55pm ET in EST and 00:55 ET on Monday in EDT: after Sunday night football
either way, and before any Monday game either way. The job runs slightly late in
September rather than slightly early in December.

Tuesday's hour is not load-bearing in the same way — an hour either side of 5am
is before the shop opens.

Both are safe to retry and safe to run by hand:

```
curl -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron/sunday
curl -H "Authorization: Bearer $CRON_SECRET" "https://<host>/api/cron/sunday?week=6"
curl -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron/tuesday
curl -H "Authorization: Bearer $CRON_SECRET" "https://<host>/api/cron/tuesday?week=6"
```

Each answers `200` with a report, `500` when something threw, and `404` to
anything without the secret.

**Tuesday never publishes** — the draft lands on `/admin/slice` and stops
(`16 §9`).

**Sunday never overwrites.** A week is photographed once; a second run reports
`captured: false` and writes nothing, because the second photograph would already
include Monday scoring. `docs/SUNDAY_SNAPSHOT_BOUNDARY.md §4` is why that is a
constraint and a trigger rather than a convention.

**Tuesday reads Sleeper before it closes anything.** `16 §4.3`'s first step. One
league payload, users, rosters, both brackets and one matchups request per week
played so far — around twenty requests by January, and `maxDuration = 60` is
declared on both routes because the framework default of 10s would time out
mid-season. `docs/IN_SEASON_SYNC_BOUNDARY.md` is the account.

**Pooled, not direct.** Neon shows two connection strings. Use the one whose host contains `-pooler`. Serverless functions open a pool per instance; the direct endpoint runs out of connections under even this league's tiny load.

### Turning the jobs on — the one-time activation

**This is the only step in the whole product that a person has to do, and until
it is done both jobs are scheduled and inert.** They answer `404` to everything,
including Vercel's own scheduler, because `lib/cron/secret.ts` treats an unset
`CRON_SECRET` as *shut* rather than as *open*.

Nothing below is time-critical before the season's first Tuesday. Doing it early
is free: with no week played, the job reads an empty week and reports
`ran: true` with nothing done.

**1 — generate a value.** On any machine, in a terminal:

```
openssl rand -base64 32
```

32 bytes of entropy. Anything shorter, memorable, or reused from another service
is not acceptable: this single value is the entire authorization for closing a
week, paying tokens and photographing a game.

**2 — set it in Vercel.** Project → Settings → Environment Variables.

| Field | Value |
|---|---|
| Name | `CRON_SECRET` |
| Value | the generated string |
| Environments | **Production only** |

**Production only is not a nicety.** A preview deploy is public-by-URL on Hobby
and points at the sandbox database; a preview holding this secret could close a
week or photograph a game in an environment nobody is watching.

**3 — redeploy.** Environment variables are read at runtime, but Vercel only
applies a new one to deployments created after it was set. Redeploy `main` from
the Vercel dashboard, or merge anything.

**4 — verify, without exposing the value.**

```
curl -s -o /dev/null -w '%{http_code}\n' https://<host>/api/cron/tuesday
# expect 404 — no secret, no door

curl -s -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron/tuesday | head -c 400
# expect 200 and a JSON report
```

Read `$CRON_SECRET` from your shell environment rather than typing it inline, so
it does not land in shell history. **Never paste the value into a commit, an
issue, a pull request, a screenshot or a chat message.** It appears in no log:
both routes read it through `cronAuthorized` and neither ever prints it, and both
jobs send failure detail to the runtime log rather than into a response body
precisely because that body is readable by whoever holds the secret.

**What success looks like.** A JSON body naming the season and the week, with
`ran: true`. Before the season starts the honest answer is a report whose
`skipped` list says the week holds no publishable game — that is the job working,
not failing. Vercel's own scheduled invocations then appear under
Project → Observability → Crons.

**Rollback.** Delete the variable and redeploy. Both jobs return to answering
`404` and nothing else changes — no data is written or unwritten by the flip, and
every operation either job performs is idempotent, so turning it back on later
picks up from wherever the data is.

**Rotation.** Same procedure with a new value. There is no revocation list and
none is needed: the old value stops working the moment the new one is deployed.

---

## 3. Provisioning, once

### Neon

1. Create a project — region **US East (Ohio)** or whichever is nearest; Postgres 17; free tier.
2. The project's default branch (`main` or `production`) is the **production** database.
3. Create a second branch named **`sandbox`** from it. This is what every preview deploy uses.
4. Copy the **pooled** connection string of each branch.

Both branches are empty. The first deploy migrates and seeds them, and every step of that is idempotent.

### Vercel

1. Import the GitHub repository. Framework preset: **Next.js**. Root directory: repository root.
2. Set the environment variables from §2 **before** the first deploy, or the first build fails on the migration step. That failure is recoverable — set the variables and redeploy — but avoidable.
3. Deploy `main`.

### Verify

```
curl -s https://<project>.vercel.app/api/health
{"status":"ok","commit":"<sha>","database":"reachable"}
```

`status: ok` proves three things at once: the build is live, the commit is the one you pushed, and the running function can reach its database. Anything else is a deploy that has not finished landing.

---

## 4. Migrations

Forward-only. Generated with `npm run db:generate`, committed, reviewed in the pull request, applied by the build.

- **Before real accounts exist:** additive migrations are ordinary work.
- **After managers have claimed accounts:** never destructive, and a non-additive migration is its own reviewed PR (`17 §7`).
- A migration shipping alongside a revertible feature must be additive, so the previous build still runs against the new schema. Rollback is reverting the merge; Vercel redeploys the previous build against a schema that moved forward, and that only works if the schema stayed backward-compatible.

---

## 5. Rollback

1. Revert the merge commit on `main`.
2. Vercel builds and promotes the previous code automatically.
3. The database is **not** rolled back. If the reverted change carried a destructive migration, this is where that decision gets expensive — which is why they are forbidden after accounts exist.

Vercel's "Instant Rollback" on a previous deployment is faster and equivalent for code, with the same caveat about schema.

---

## 6. Attaching a domain later

Nothing in the application knows its own origin: session cookies are host-only (no `Domain` attribute), links are relative, and no artifact embeds a URL. Attaching `tonys.juncaj.net` is therefore a Vercel domain setting plus one DNS record, with no code change and no session loss beyond the host change itself.

Do not add an origin to the code to "prepare" for this. The preparation is the absence.
