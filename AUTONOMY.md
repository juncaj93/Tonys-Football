# AUTONOMY.md — how Tony's advances without a human in the loop

**Status:** active. This file is the operational contract; `docs/TECH_LEAD_OPERATING_MODEL.md` is the role and ruling record.

> **Read `docs/PRODUCT_DELIVERY_MANDATE.md` first.** It is a standing **commissioner** ruling (2026-07-30) and therefore level 1 in `§1` below. It governs how this file is applied: what "complete" means (`§5`), the permanent visual-quality standard (`§6`), the mandatory screenshot loop (`§7`), demoability as a product requirement (`§8`), specialist ownership (`§9`), and the deterministic stats-fact layer that must precede any narrative copy (`§10`).

---

## 0. The problem this solves

Tony's was being advanced by a human copying reports between chat sessions. That made conversation memory the operational state, and conversation memory does not survive a session. Every handoff was a chance to lose a ruling, and two rulings were lost that way before this file existed.

**The repository is the state machine.** Labels, PR bodies, check runs and committed Markdown are durable; a chat is not. If a decision is not in the repository or in a PR comment, it did not happen.

---

## 1. Source-of-truth precedence

When materials disagree, resolve in this order and **correct the loser** rather than re-litigating:

1. Latest explicit commissioner ruling — currently `docs/PRODUCT_DELIVERY_MANDATE.md`
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

**Green CI is necessary and never sufficient.** The full bar is `PRODUCT_DELIVERY_MANDATE.md §5`, and the screenshot loop in its `§7` is **mandatory** for every user-facing slice.

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

### The Actions allowance is a standing constraint too

**Commissioner, 2026-07-31: the account is near its monthly included GitHub Actions minutes.**
This is a *conservation* instruction, not a suspension of the gates.

What the triggers actually are, verified rather than assumed:

| Workflow | Fires on |
|---|---|
| `visual-qa.yml` | `pull_request` · `workflow_dispatch` |
| `ci.yml` | `pull_request` (any base) · pushes to `main` |

So **pushing commits to a branch with no open pull request costs nothing**, and that is where
work goes. Allowed: working locally, running the gates locally, committing, pushing to a
non-PR branch, updating the checkpoint and the ruling index, reading existing GitHub results,
and preparing **one** coherent future PR branch.

Prohibited until the reset is confirmed: opening or reopening a pull request · pushing to a
branch that already has one · pushing to `main` · merging · manual dispatch · re-running a
failed or cancelled run · using CI as an exploratory debugging loop · a series of small PRs ·
deploying to verify routine work.

**The reset is not inferred from the calendar.** It takes an explicit commissioner statement,
or billing/usage evidence the session can read directly. "It is probably a new month" is not
authorization.

**Commissioner, 2026-08-01 — one coherent PR per completed slice is authorized.** The
direction that opened and merged #51 and then assigned the homepage slice says it in the
instruction itself: *"One coherent homepage-polish PR; no cosmetic micro-PRs; do not rerun
red workflows unchanged. After green: merge, verify deployment."* That is the explicit
statement the paragraph above asks for, and it is narrow: **one** PR when a slice is
finished and every gate has already passed locally, on a production build against a fresh
database. Everything else in the prohibited list still stands — no micro-PRs, no pushes to
`main`, no manual dispatch, no re-running a red run unchanged, and CI is never the debugger.

**No release gate is weakened by any of this.** `npm run check` and `npm run visual:qa` still
run in full, on a production build against a fresh database, every time — only their *GitHub
execution* is deferred. When the allowance returns, the branch becomes one meaningful CI and
visual-QA run rather than a dozen cheap ones.

---

### 2026-08-05 — emergency conservation, then phone-only

Two directions on the same day, and the second is narrower than the first.

**Emergency, morning.** *"GitHub has reported that this account has used 1,800 of 2,000
included Actions minutes, with the allowance resetting in 27 days. Effective immediately,
stop triggering GitHub Actions."* The 2026-08-01 authorization above — one coherent PR per
completed slice — is **withdrawn for the duration**. There is no PR allowance at all.

**Phone-only, afternoon.** The commissioner has no machine until the following week and
cannot run anything locally, so a session may **not** hand work off as *"run these commands
when you get back."* Remote branches may be used as **storage**, on one condition that was
checked rather than assumed: an ordinary push to a feature branch with **no open pull
request** creates no workflow run. Verified three ways —

| | |
|---|---|
| the files | `ci.yml` is `push: branches: [main]` + `pull_request:`; `visual-qa.yml` is `pull_request:` + `workflow_dispatch:`; `orchestrator.yml` is `workflow_dispatch:` only |
| the history | 30 of 30 runs on feature branches were `pull_request`; 30 of 30 `push` runs repository-wide were on `main` |
| the experiment | after pushing `claude/homepage-palette-fidelity`, `list_workflow_runs` for that branch returns `total_count: 0`. Repeated on `claude/timeline-history` — including a **force-push** after a rebase, which is the case worth having checked, since it is a push that rewrites history rather than adding to it |

**Do not edit a workflow trigger to permit a backup push.** If a push would cost a run, the
answer is not to push.

**A backup branch is storage. It is not approval to merge.** Prohibited until the
commissioner explicitly releases it: opening or reopening a pull request · merging ·
pushing to `main` · pushing to a branch that has an open PR · re-running any workflow ·
`workflow_dispatch` · empty or documentation-only commits made to trigger CI · **setting
`CRON_SECRET`** · **claiming production is verified.**



**2026-08-06 — one PR authorized, spent, and mode resumed.** The commissioner
authorized a single hosted pull request for the homepage-fidelity slice and no
more. It merged as **#68** for **~25 minutes** — CI 4m30s + Screenshots 16m00s on
the PR, plus CI on the push to `main`. Both gates were green first time; nothing
was re-run. **Conservation mode is active again from that merge**, with the same
prohibited list as above, and a further hosted run needs a new authorization.

The last two are not Actions rules and are listed here because they are the two things a
session under this mode is most likely to get wrong. `CRON_SECRET` activates *both* crons at
once and is the commissioner's step, not a session's. And nothing merged means nothing
deployed: a slice under this mode is **verified locally**, which is a true and much smaller
claim than *verified*.

---

### 2026-08-07 — temporary public mode, and conservation lifted

**The allowance was never made larger. The repository moved to where it does not apply.**
A public repository's standard `ubuntu-latest` runners do not draw on the private-repository
allowance, so making `juncaj93/Tonys-Football` public is what released the queue — not a
budget increase, and not the monthly reset.

The transition is worth recording because **two separate blocks had to come off, and the
first one hid the second.**

| | |
|---|---|
| private, allowance spent | a run object **was** created and died in ~3s with `runner_id: 0` — the exhausted-allowance signature |
| public, Actions still disabled | **no run object was created at all** for PR #70. Different failure, and the absence *was* the finding: no failed run, no annotation, no message to quote |
| public, Actions enabled, still blocked | both gates queued at `21:56:11Z` and were cancelled together at `22:11:14Z`, `runner_id: 0`, job logs **HTTP 404**, check-run output empty. CI's cap is 15 minutes and Visual QA's is 35, so a per-job timeout **cannot** end both on the same second — a single external event did |
| public, budget ceiling raised to `$1` | both gates ran on `GitHub Actions 1000000824` / `…825`, and post-merge `main` on `…826`. Green |

**`$1` is a safety ceiling, not a spending authorization.** It exists so that an
account-level zero-budget block cannot stop otherwise-free public runners from starting. If
ordinary Tony's CI ever consumes it, **stop and report** the product/SKU charged, the amount,
the workflow and runner type, and the repository visibility at the time.

**What is released:** opening and merging pull requests, pushing to `main` through a merged
PR, the ordinary one-coherent-PR-per-slice rule, and both required gates running hosted.

**What is unchanged, and none of it was ever about minutes:** only `ubuntu-latest` · no
larger runners · no paid services · no paid AI · **the retired orchestrator stays retired**
(`docs/RETIRED_WORKFLOWS.md`) · no rerunning green or unchanged commits · no workflow
triggered for its own sake · **`CRON_SECRET` is still the commissioner's step** · and no
outside contribution may be merged while the repository is public.

**Elapsed time is still not observable inside a session container.** The clock-drift incident
that cost two healthy jobs on #69 is the reason: judge a hosted job only by GitHub's own
timestamps, and never cancel a run on a local timing judgement.

`docs/PUBLIC_MODE.md` is the public-mode record — the accepted risk, the contribution policy
and the return-to-private checklist. `docs/PHONE_ONLY_HANDOFF.md` is **history**; it is not
the current queue.

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
