# AUTONOMY.md — how Tony's advances without a human in the loop

**Status:** active. This file is the operational contract; `docs/TECH_LEAD_OPERATING_MODEL.md` is the role and ruling record.

---

## 0. The problem this solves

Tony's was being advanced by a human copying reports between chat sessions. That made conversation memory the operational state, and conversation memory does not survive a session. Every handoff was a chance to lose a ruling, and two rulings were lost that way before this file existed.

**The repository is the state machine.** Labels, PR bodies, check runs and committed Markdown are durable; a chat is not. If a decision is not in the repository or in a PR comment, it did not happen.

---

## 1. Source-of-truth precedence

When materials disagree, resolve in this order and **correct the loser** rather than re-litigating:

1. Latest explicit commissioner ruling
2. Latest recorded Technical Lead ruling (`docs/TECH_LEAD_OPERATING_MODEL.md §8`)
3. Approved visual references and canonical production assets
4. `PROJECT_SPEC/` and product Markdown
5. Architecture and art specifications
6. Implementation handoffs and derived docs
7. Existing code
8. Historical plans and superseded discussion

A contradiction found twice is a documentation bug. Fix the document.

---

## 2. Workflow states

One label per issue, and exactly one. The label **is** the state.

| Label | Meaning | Next actor |
|---|---|---|
| `ready-for-build` | Scoped, unblocked, nobody on it | frontend/data worker |
| `implementation-active` | A branch exists and is moving | the worker who claimed it |
| `ready-for-code-review` | PR open, CI green | technical lead |
| `ready-for-visual-qa` | Code review passed, preview deployed | visual QA |
| `visual-changes-requested` | A gate failed; repair task attached | frontend worker |
| `ready-for-integration` | All gates pass | technical lead |
| `ready-for-production` | Milestone coherent as a product | technical lead |
| `production-verification` | Merged; smoke tests running | release reviewer |
| `blocked-human-only` | Needs a credential, permission or payment | commissioner |

**Only `blocked-human-only` waits on a person.** Everything else is an actor's turn.

"Actor" means whoever holds that role contract when the work is picked up — a session, a workflow, whatever is available. The label says what happens next and which `agents/*.md` file governs it; it deliberately does not say what kind of thing performs it. That is why removing the orchestrator (`§4`) changed nothing here.

---

## 3. The lifecycle

```
   read spec + rulings
          │
   pick highest-priority unfinished milestone
          │
   decompose into one tightly scoped issue  ──► ready-for-build
          │
   worker branches, implements, opens PR
          │                                      implementation-active
   CI: typecheck · lint · test · build  ─────►  ready-for-code-review
          │
   technical-lead review of the diff  ───────►  ready-for-visual-qa
          │
   preview deploy + seed + npm run visual:qa
          │
      ┌───┴───┐
   fail      pass
      │         │
 repair task   ready-for-integration ──► ready-for-production
 (visual-      │
  changes-     merge to main → configured deploy
  requested)   │
      │        production-verification → smoke → done, or roll back
      └──► back to implementation-active
```

**Green CI is necessary and never sufficient.** Every visual defect this project shipped passed CI: the legacy homepage, the violet floor, the full-width bottom sheet, and a `<Link>` to a route that does not exist. `VISUAL_ACCEPTANCE.md` is the second gate and `npm run visual:qa` enforces the machine-checkable part of it.

---

## 4. What runs today, and what waits on a key

| Piece | State |
|---|---|
| `npm run visual:qa` — 12 states × 3 widths, deterministic gates, artifacts | **live**, no credentials |
| `.github/workflows/visual-qa.yml` — runs the above on every PR, uploads screenshots | **live**, no credentials |
| `.github/workflows/ci.yml` — typecheck · lint · test · build | **live** |
| `.github/workflows/orchestrator.yml` — the model-driven loop | **off, by decision.** Manual dispatch only. See below |

This split is deliberate, and on 2026-07-30 it paid for itself. The arithmetic gates were built first precisely because they depend on nothing; the judgement gates need a model, and a model costs money.

### The orchestrator is off, by commissioner decision

**2026-07-30: the league does not pay for API use.** That is a standing decision, and it is the highest form of authority in `§1` — it is not re-litigated and it is not worked around.

What changed:

- `orchestrator.yml` is reduced to **`workflow_dispatch` only**. No schedule, no `issues: labeled`, no `issue_comment`. It cannot fire on its own and nothing routine invokes it. The file is kept, not deleted, so the design stays legible and the decision stays reversible.
- `ANTHROPIC_API_KEY` should be **removed from Actions secrets**. With it absent, `preflight` skips the job, so even a manual dispatch is a no-op and no workflow in this repository can spend anything.
- A hard, welcome side effect: the hourly cron was standing up a Postgres service, an `npm ci` and a build every hour on a **private** repository, where Actions minutes are metered. That cost stops too.

**Nothing about the lifecycle in `§3` changes.** The labels are the state machine; the workflow was only ever one possible actor reading them. `agents/*.md` are role contracts, and a contract works the same whether a workflow or a person opens it. Turns are now taken in a session by whoever is driving the work — which is how M2 slice 1 shipped, under exactly the gates the loop would have applied.

**No product scope is lost.** Generative AI in this product is limited to Tony's Tuesday Slice, and `16 §9` already requires the Slice to publish correctly with the AI key unset — the template renderer is the default path, not a degraded one. `docs/DEPLOYMENT.md` has always specified this key as optional and unset in production. The only thing that needed money was the automation, and the automation was a convenience.

**Do not reintroduce a paid dependency** — no scheduled model calls, no per-pull-request review agent, no "just for the Slice" API path — without a new commissioner decision recorded in `§1`.

---

## 5. Rules that bind every actor

- **Never expose a secret** in code, logs, issue text, PR comments or screenshots. Secrets live in GitHub Actions secrets and are read only by workflows.
- **A merged PR is finished.** New work needs a new PR, even on the same branch.
- **Documentation absorbs code, never the reverse.**
- **Never delete an approved slug, record or asset to satisfy an older count.** Recalculate the count.
- **Do not merge an incomplete visual slice to `main`** because an individual PR is green. Group dependent work on an integration branch.
- **Merging `main` deploys production.** `vercel-build` runs migrate → seed → build. There is no quiet merge to `main`.
- **Tests must never run against the preview or production database.** `npm run test` resets league tables; point `DATABASE_URL` at a throwaway database. This rule exists because the rule was broken and a preview dataset was destroyed.

---

## 6. Escalation — the only four things a human must do

1. Provide a missing API key or secret
2. Install or authorize a GitHub App
3. Grant account permissions
4. Authorize payment

**Item 4 has a standing answer for API use: no** (2026-07-30). Do not escalate it again, and do not design work that depends on it being reversed. If a task appears to need paid model access, the correct move is to find the unpaid path — `16 §9` already requires one for the only feature that uses a model at all — or to say plainly that the task is not doable within that constraint.

Anything else — branch strategy, PR mechanics, spacing, typography, stale docs, test repairs, preview deploys, production deploys after the gates pass — is decided in the repository. Aesthetic uncertainty is resolved from the approved references, not by asking.

When escalation is genuinely required, it is **one message** with exactly what is missing, where to get it, where to paste it, which permissions to grant, and how to confirm success.
