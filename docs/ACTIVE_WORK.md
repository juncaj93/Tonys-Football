# Active work — who is on what, right now

**Read this before you start a substantial workstream. Claim your area before you
write code.**

This file exists because parallel sessions duplicated real work. Three separate
sessions independently found and fixed the same Slice week-finality defect; two
independently measured the same visual-gate problem on the same afternoon; two
open-item entries were filed under the same number and had to be renumbered
afterwards (#92); and two rehearsal harnesses had to be reconciled at merge
because neither knew the other existed.

None of that was a mistake by any session. Each one read the repository
correctly — the repository just had no way to say *"somebody else is already
here."* This file is that way.

---

## The rule

1. **Before beginning a substantial workstream, read this table.**
2. **If your area is unclaimed, add a row — then start.** The row lands in the
   first commit on your branch, not at the end.
3. **If your area is already claimed, stop.** Do not independently implement
   overlapping work. Pick something else, or narrow your scope to something the
   claim does not cover, and say in your PR which claim you worked around.
4. **Remove your row when the PR merges** — or when the workstream is abandoned.
   A stale claim is worse than no claim, because the next session believes it.

**A claim is not a reservation and not a priority.** It says *someone is holding
this right now*, nothing more. It confers no ownership of the area's future and
does not outlive the branch.

### What belongs here

One row per **meaningful** workstream — something that will take a branch and a
pull request, and that another session could plausibly start in parallel.

### What does not

- **Human-only actions.** `CRON_SECRET`, the commissioner variable, the smoke
  test, Tony's dialogue line, the draft grades. Those live in
  `docs/ACTIVATION.md` and no session performs them.
- **Tiny one-off edits.** A typo, one stale sentence, a single link. If claiming
  it takes as long as doing it, do it.
- **Commissioner decisions.** Those are `docs/OPEN_ITEMS.md` category **G** and
  the ruling index. A decision is not work in progress.

### What this is deliberately not

**No lock server. No task manager. No database table. No CI enforcement.** It is
a Markdown table maintained by convention, and that is the whole design — the
failure it prevents is *two sessions unaware of each other*, and a table they
both read prevents it. Enforcement would need a mechanism that outlives a
session, which is the complexity this deliberately declines. If it stops being
maintained, that is evidence the convention failed, not a reason to automate it.

---

## Claimed

| Area / workstream | Branch | Owns | Must not touch | Opened |
|---|---|---|---|---|
| V1 collectible catalog lock and production reconciliation (planning only, awaiting rulings) | `claude/tonys-pizza-v1-curation-3ukg1w` | `docs/CATALOG_LOCK_RECONCILIATION.md` (+ the two superseded curation docs) · on approval, `art/assets.inventory.json` collectible names · `lib/economy/catalog-audit.ts` `ITEM_FORM` · `art/prompts/collectible.md` · `docs/art/BATCH_F_COLLECTIBLE_HANDOFF.md` · `docs/art/BRAND_EXCEPTIONS.md` · a `name` field in `lib/assets/registry.ts` + `lib/counter/catalog.ts` · a collectible-flavour surface on `content_entries` | any slug · any rarity · `CATALOG_SIZE` · `lib/counter/rewards.ts` · `lib/counter/tokens.ts` · any migration · any existing art file (retire, never overwrite) · `docs/OPEN_ITEMS.md` **G2** | 2026-08-12 |

**Empty is a real state**, and it means what it says: no session is holding any
area. It does not mean there is no work — `docs/OPEN_ITEMS.md` is the list of
what is open, and this is the list of what is *being done*.

---

## The row format, worked

```
| Visual gate integrity (debt 16) | claude/visual-gate-16-ab12cd | scripts/visual-qa-quarantine.ts · scripts/visual-qa.mts (reporter only) · docs/VISUAL_DEBT.md item 16 | any product component · any route · ALL_STATES · any other docs/ entry | 2026-08-11 |
```

- **Area** — what a reader would call the work, not the branch name.
- **Branch** — so the next session can go and look at it.
- **Owns** — the files and areas you expect to change. Be specific enough that
  somebody can tell whether their work overlaps.
- **Must not touch** — the boundary you are holding yourself to. This is the
  most useful column: it is what tells a second session *"your work is safe."*
- **Opened** — the date. A row months old with no branch activity is abandoned;
  delete it and say so in your PR.

---

## If two claims collide anyway

Say so in the pull request, name the other branch, and reconcile before merging
rather than at merge. `docs/TECH_LEAD_OPERATING_MODEL.md §6` is the standing
guidance and its first rule applies directly: **when two branches change the same
decision in opposite directions, the ruling decides — not the merge.** Keep both
sides of an additive conflict; a test deleted to make a conflict disappear is a
regression with a green tick beside it.
