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
| Base | `origin/main` at `4178187` (#67) |
| Open PR | **none, deliberately** |
| Workflow runs created | **0**, confirmed from GitHub after each push |

It is **one slice in two passes**, and the second supersedes the first inside the
branch. Described rather than listed by SHA, so this section does not go stale
every time a commit lands:

| pass | what |
|---|---|
| **the audit** | four measurement scripts, and `docs/PALETTE_FIDELITY_BOUNDARY.md` — where the colour is lost, proved by rendering the pipeline's own intermediate stage |
| **the four-colour extension** | `familyExtensions.zone` with four colours. Correct mechanism, guessed size. Superseded below, and **kept in history on purpose**: the evidence set uses it as its middle column |
| **the instrument repairs** | two tools that were reporting confidently and wrongly — the study script could not see the palette that had shipped, and the glow gate could kill a sweep with an unhandled rejection |
| **typed family palettes** | what merges. `zone` 64 colours and `character` 16, each derived from that family's own art, plus the repair script the change made unnecessary |

`git log --oneline origin/main..claude/homepage-palette-fidelity` is the
authoritative list.

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

**Superseded within the branch, and the second pass is what merges.** Four
colours halved the error and left a room still visibly orange on a phone. The
2026-08-06 ruling asked for the page to be judged at true phone size, and at
true phone size four was not enough.

What ships is **typed family palettes sized by measurement**: `zone` 64 colours,
`character` 16, each derived by weighted k-means from that family's own art.

| shipped shell | shared 32 | +4 | **now** |
|---|---|---|---|
| mean quantization error | 35.0 | 21.6 | **5.9** |
| lamp-glow (`amber`) share | 27.3% | 20.7% | **0.9%** |
| busiest single colour | 35.8% | 35.8% | **4.2%** |
| file size | 19 KB | 19 KB | 60 KB |

Tony's error goes 30.3 → **14.5**. Every collectible is byte-identical; seven
files change in total.

The single sentence that says what it is for: **the room stopped being three
colours.** Its three largest were one brown, one crimson and one gold — 66%
between them, holding up walls, ceiling, floor, furniture and counter alike. The
ceiling on its own was **68% a single colour**.

Full reasoning: `docs/PALETTE_FIDELITY_BOUNDARY.md`.

Pictures, and the second set is the one to look at first:

- `docs/evidence/homepage-fidelity/` — **the whole page** at 390 / 375 / 360,
  before and after, at device resolution and at 1:1. The 2026-08-06 ruling asks
  for the composition rather than crops, and this is it.
- `docs/evidence/palette-fidelity/` — asset crops, **three-way**: the shared 32,
  the four-colour pass, and what ships. The middle column is the argument — it
  shows that more of the same was not the answer.

Both regenerable: `scripts/palette-evidence.mts` reads its inputs out of git, and
`scripts/homepage-shot.mts` drives a local production server.

---

## 4. Gates — what ran, and what the results were

Every gate ran **locally, in full**, on a production build against a freshly
created and freshly seeded database. None was skipped, shortened or relaxed.

| Gate | Result |
|---|---|
| `npm run typecheck` | clean |
| `npm run lint` | clean |
| `npm run test` | **1338 passed / 84 files**, 2 skipped — thirty fewer than the previous pass, because `clean-parlor-surfaces.ts`'s thirty-four tests were retired with the script and four took their place |
| `npm run build` | clean |
| `npm run art:validate` | clean |
| `npm run visual:qa` | **88 states × 3 widths, passed — twice**, zero hydration sightings in both |

**One thing to know before the hosted Visual QA runs, because it changes what to
do if it comes back red.** A sweep of this branch once failed on two React `#418`
hydration errors, and the same commit swept clean before it and twice after —
four sweeps is 1,056 captures and 2 sightings, roughly **one per 528**. It is
**intermittent and not this slice**, which changes only PNG bytes,
`art/palette.json` and the art scripts. It is now **visual debt 16**, measured in
`docs/VISUAL_DEBT.md`.

At that rate a 264-capture sweep expects half a sighting, so a hosted run has
roughly a **40% chance of failing on a defect that has nothing to do with the
change**. If it does, there are two honest options and neither is a re-run:

- **Merge on the evidence.** Four local sweeps of this commit's product code,
  three of them clean, and the failure is a console error rather than a rendering
  defect — every product gate was green in all four. This is the commissioner's
  call, not a session's.
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
| **Visual debts 8 and 9 — the wall and the ceiling** | Still closed, and now closed by the *cause* going rather than by a repair. `clean-parlor-surfaces.ts` is deleted with its thirty-four tests; the surfaces are correct with no filter run over them |
| **Visual debt 16 — the residual `#418`** | Untouched, and deliberately not investigated further on this branch. The census instrumentation stays |
| **Visual debt 1, 2, 11, 14** | Unchanged, and none is touched by this slice. See `docs/VISUAL_DEBT.md` |
| **Tony's inherent detail at 88 px** | Not a defect and not fixed. If a future report is about his *sharpness* rather than his colour, the lever is a higher-resolution asset and `PALETTE_FIDELITY_BOUNDARY.md §4`'s option D has the numbers |
| **Collectibles inside a 96-colour room** | They still quantize against the shared 32 by commissioner decision. Nothing in the evidence shows them clashing, but only a real screen answers it |
