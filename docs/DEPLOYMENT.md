# Deployment

**Slice:** V0 Pipeline (`17 §4`)
**Rule this document exists to enforce:** a preview deployment must never be able to read production data.

---

## 1. What the pipeline is

```
git push  →  Vercel build
                 │
                 ├─ npm run db:migrate      ← migrations, before anything serves traffic
                 └─ next build
                          ↓
              deployment goes live
```

`package.json` defines `vercel-build`, and Vercel runs it in place of `build`. That ordering is the whole point: the schema is always at least as new as the code running against it. A failed migration fails the build, and the previous deployment keeps serving.

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
| `ANTHROPIC_API_KEY` | optional | leave unset | — | The Slice must publish without it (`16 §9`). |
| `CRON_SECRET` | later | — | — | Not used until the two scheduled jobs exist. |

**Pooled, not direct.** Neon shows two connection strings. Use the one whose host contains `-pooler`. Serverless functions open a pool per instance; the direct endpoint runs out of connections under even this league's tiny load.

---

## 3. Provisioning, once

### Neon

1. Create a project — region **US East (Ohio)** or whichever is nearest; Postgres 17; free tier.
2. The project's default branch (`main` or `production`) is the **production** database.
3. Create a second branch named **`sandbox`** from it. This is what every preview deploy uses.
4. Copy the **pooled** connection string of each branch.

Both branches are empty. The first deploy migrates them; `npm run db:seed` populates content and imports the recorded league history, and both are idempotent.

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
