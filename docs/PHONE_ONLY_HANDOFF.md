# Handoff — what is waiting, and what it will cost to land

**Written 2026-08-05, under the phone-only Actions-conservation mode**
(`AUTONOMY.md §4`). The commissioner has no machine until the following week, so
this document assumes **nothing can be run locally by the reader**. Every claim
here was verified in the session that wrote it, and every claim that could *not*
be verified says so.

Read this with `docs/CHECKPOINT.md`. That file is the durable product state; this
one is the merge queue and its price.

---

## 1. The one number

| | |
|---|---|
| Included Actions minutes remaining | **~200 of 2,000** (commissioner, 2026-08-05) |
| A pull request costs | **~20.5 min** — CI ~4.5 + Visual QA ~16, both on `pull_request` |
| Merging it costs | **~4.5 min** — CI fires again on the push to `main` |
| **So one slice, opened and merged** | **~25 min ≈ 12.5% of what is left** |

Durations are the median of the last six real runs of each workflow, not an
estimate. Linux runners bill 1×.

**Nothing in this repository has been pushed in a way that spends any of it.**
Verified after the fact rather than assumed: `list_workflow_runs` filtered to
`claude/homepage-palette-fidelity` returns `total_count: 0`.

---

## 2. What is on the backup branch

| | |
|---|---|
| Branch | `claude/homepage-palette-fidelity` |
| Head | `b4815a1` — *Give the room four colours it never had* |
| Base | `origin/main` at `4178187` (#67) |
| Open PR | **none, deliberately** |
| Workflow runs created | **0** |

Three commits:

| SHA | What |
|---|---|
| `6b8fc78` | The four measurement scripts. They change nothing and are what any future palette argument is made from |
| `4a36244` | `docs/PALETTE_FIDELITY_BOUNDARY.md` — the diagnosis, the mechanism, the candidate, the scoping decision |
| `b4815a1` | The palette extension itself: `art/palette.json`, six reprocessed `zone` assets, and the re-derived shell corrections |

**This branch supersedes the designated branch.**
`claude/text-surface-tuesday-slice-fouqq1` is two commits ahead of `main`
(`6b8fc78`, `4a36244`) and both are contained here. Merging the palette branch
makes the designated branch's remote state redundant; there is no second PR to
open for it.

---

## 3. What the slice actually is

The commissioner's report was *"much of the homepage art now has distorted
coloring and shading."* The cause is **palette quantization** — not the source
art, not the browser, not CSS, not scaling, not filters — established by
rendering the pipeline's own intermediate stage rather than by argument. **No new
art was required**, which supersedes the earlier `art/SHELL_AUDIT_*` conclusion
that the homepage needed targeted regeneration.

Four warm colours, chosen by weighted k-means over the worst-served pixels and
scoped to the `zone` family by commissioner decision. Additive: they never
replace a shared colour, which is the property that keeps Tony and all twelve
approved Batch B collectibles **byte-identical**. Six assets change, all `zone`.

Measured on the incoming source art, the way production quantizes it:

| asset | mean error | `amber` share |
|---|---|---|
| shell | 35.0 → **21.6** | 27.3% → 20.7% |
| counter-front | 36.4 → **20.1** | 14.1% → 12.8% |
| newspaper-rack | 28.4 → **23.1** | 1.5% → 0.2% |
| tony, and the collectibles | unchanged, by design | unchanged |

The single sentence that says what it is for: **the room stopped being three
colours.** Its three largest were one brown, one crimson and one gold — 66%
between them, holding up walls, ceiling, floor, furniture and counter alike. The
ceiling on its own was **68% a single colour**.

Full reasoning: `docs/PALETTE_FIDELITY_BOUNDARY.md`.
Pictures: `docs/evidence/palette-fidelity/` — twelve PNGs and a README,
regenerable with `npx tsx scripts/palette-evidence.mts`.

---

## 4. Gates — what ran, and what the results were

Every gate ran **locally, in full**, on a production build against a freshly
created and freshly seeded database. None was skipped, shortened or relaxed.

| Gate | Result |
|---|---|
| `npm run typecheck` | clean |
| `npm run lint` | clean |
| `npm run test` | **1368 passed / 84 files**, 2 skipped |
| `npm run build` | clean |
| `npm run art:validate` | clean |
| `npm run visual:qa` | **88 states × 3 widths, passed**, zero hydration sightings |

**One thing to know before the hosted Visual QA runs, because it changes what to
do if it comes back red.** A sweep of this branch once failed on two React `#418`
hydration errors, and the same commit swept clean before and after — three sweeps
is 792 captures and 2 sightings, roughly **one per 396**. It is **intermittent and
not this slice**, which changes only PNG bytes, `art/palette.json` and the art
scripts. It is now **visual debt 16**, measured in `docs/VISUAL_DEBT.md`.

So a hosted sweep has roughly a **one-in-three chance of failing on a defect that
has nothing to do with the change**. If it does, there are two honest options and
neither is a re-run:

- **Merge on the evidence.** Three local sweeps of this exact commit, two clean,
  and the failure is a console error rather than a rendering defect — every
  product gate was green in all three. This is the commissioner's call, not a
  session's.
- **Leave it and come back to visual debt 16 first.** Also defensible. What is
  not defensible is spending sixteen more minutes to re-roll the same die.

**What has *not* been verified: production.** Nothing carrying this has been
merged or deployed, so no claim is made about the hosted site. That is a smaller
claim than "verified" and it is the accurate one.

---

## 5. The order to land things in

Opening the pull request is the act that releases conservation mode **for this
slice and no other**. Everything in §6 still applies to everything else.

1. **Open one pull request** from `claude/homepage-palette-fidelity` into `main`.
   One, not three — the three commits are one slice, and splitting them spends the
   allowance three times over.
2. Let CI and Visual QA run **once**. A red run is diagnosed locally and pushed as
   a fix to this branch, which is allowed once the PR exists. **Never re-run a red
   workflow unchanged** — see the note in §4 about the one failure mode where that
   is tempting.
3. Merge. Then look at the hosted homepage: the room *is* the slice, and a green
   gate has never been evidence that a room looks right.
4. **Only then** consider `CRON_SECRET`. It is not part of this slice and it is
   not a session's step; see §6.

---

## 6. Two things a session must not do, and why they are here

**Do not set `CRON_SECRET`.** It activates *both* scheduled jobs at once — the
Sunday snapshot and the Tuesday finalize — and it is the last human-only step in
the deployment. The preconditions are in `docs/CHECKPOINT.md` and they are not
met while nothing is merged.

**Do not claim production is verified.** Nothing merged means nothing deployed.
A slice under this mode is *verified locally*, and the distinction is the whole
value of the sentence.

---

## 7. What is still open after this lands

Recorded so it is visible rather than quietly absent:

| | |
|---|---|
| **The isolated-pixel rate** | The palette extension does not improve it and measurably makes it slightly worse — more colours mean more decision boundaries. *"Fewer isolated noisy pixels"* needs a spatial-coherence remedy, which is a different mechanism and a separate decision |
| **Tony** | Untouched by design. His coverage was always fine; his 11.06% isolated rate is the thing a palette cannot fix |
| **Visual debt 9 — the ceiling** | Already closed by `clearCeilingScorch`. This slice did not reopen it: the requantization moved every colour the mechanism keys on, so the whole opening was re-derived, and that re-derivation is where the three defects in `PALETTE_FIDELITY_BOUNDARY.md §7a` came from |
| **Visual debt 1, 2, 11, 14** | Unchanged, and none is touched by this slice. See `docs/VISUAL_DEBT.md` |
