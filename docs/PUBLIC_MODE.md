# Temporary public mode — the record

**Status: PUBLIC since 2026-08-06.** This file was written while the repository
was still private, so that the decision, the accepted risk, and the restore path
were recorded *before* anything changed rather than reconstructed afterwards.
That is why it reads forwards; only this status line moves as the state does.

The transition itself is complete: the visibility change was made manually, the
hardening in `#70` merged as `e4b56cb`, and both required gates plus the
post-merge `main` CI ran on standard public `ubuntu-latest` runners. **Nothing
below is superseded** — the accepted risk, the contribution policy and the
return-to-private path all still govern.

## Production demo-seat status: UNVERIFIED

> **Production demo-seat status: UNVERIFIED — commissioner accepted temporary
> public exposure risk.**

This is a **commissioner risk acceptance, not a finding that the count is zero.**
Nobody has run the query. It must still be run when secure production access is
available:

```sql
SELECT
  count(*) AS demo_users,
  count(*) FILTER (WHERE is_admin = true) AS demo_admins
FROM users
WHERE sleeper_user_id LIKE 'demo:%';
```

**Reason it is unverified:** the production database could not be safely reached
from the phone-only environment. No `DATABASE_URL`, no `vercel`, `neonctl` or
`wrangler` CLI, and `.env.local` points at `localhost`. Asking for a production
connection string was explicitly forbidden.

**If a demo seat is later found in production**, it is an authentication
incident, not a cleanup task: any `is_admin = true` row must stop relevant
deployment and authentication work, be reported with identifiers redacted, and
be remediated only through an approved plan — deletion, session invalidation and
credential review. **Do not silently remediate production.**

Do not close or erase this follow-up.

## Why public at all

GitHub Actions minutes for **private** repositories are exhausted until next
month. Public repositories get standard hosted runners that do not draw on that
allowance. The intent is to run the two required gates, land queued work, and
return to private.

## What the audit found

No live secret exists in the working tree, in any of 52 remote branches, or
anywhere in Git history — 2,798 objects and 2,216 text blobs scanned. No `.env`
files, database files, dumps, private keys, source maps or Playwright traces. No
email addresses and no phone numbers. No releases and no tags. PINs are argon2id
hashed at OWASP parameters. There are **zero** `NEXT_PUBLIC_` variables.

`ci.yml` and `visual-qa.yml` reference **no secrets at all**, both declare
`permissions: contents: read`, and `pull_request_target` has never appeared in
any commit. Vercel deploys through its own GitHub App rather than a workflow.

## Public contribution policy

**DO NOT ACCEPT OR MERGE OUTSIDE CONTRIBUTIONS DURING TEMPORARY PUBLIC MODE.**

No outside pull request may be merged without Alex's explicit approval. Forking
is left enabled: public clones are possible regardless, so disabling it buys
nothing real.

## Return to private

Not automatic. Wait for Alex's explicit instruction.

```bash
gh repo edit juncaj93/Tonys-Football --visibility private --accept-visibility-change-consequences
```

Then re-verify, in order: private visibility · branch protections · required
checks · collaborators · Actions settings · repository and environment secrets ·
Vercel integration · Neon access · public Issues and pull requests · surviving
public forks. Run one controlled private validation only once capacity exists.

**Public clones, downloads and detached forks cannot be recalled.** Returning to
private removes nothing that was already taken.
