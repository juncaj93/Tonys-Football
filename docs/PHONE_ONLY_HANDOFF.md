# Handoff — what is waiting, and what it will cost to land

> **Spent, 2026-08-06.** The slice this document was written for merged as
> **#68** (`dde6237`). It cost **~25 minutes** of hosted Actions: CI 4m30s +
> Screenshots 16m00s on the pull request, plus CI again on the push to `main`.
> Both gates were green first time and nothing was re-run.
>
> Conservation mode is **active again** — `AUTONOMY.md §4`. §1's arithmetic is
> what stays useful; §2 and §3 describe the slice that spent the money and are
> kept as the worked example of what a queued branch should carry.
>
> **Waiting now:** the Timeline slice on **`claude/timeline-history`**, which is
> rebased onto `cc333ec` so the checkpoint correction for #68 is a commit in its
> history rather than a second thing to remember. **One PR, ~25 minutes** on §1's
> arithmetic — unchanged, because the branch adds no workflow and no job.
> **0 workflow runs** created by pushing it, confirmed from GitHub afterwards.
> See `docs/CHECKPOINT.md`'s seventeenth-session entry.
>
> The checkpoint correction is **not** getting a run of its own — `AUTONOMY.md
> §4` and the 2026-08-06 ruling both refuse a documentation-only pull request a
> gate. It rides in whichever slice lands next, which is this one.

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

The commissioner reported twice. First that *"much of the homepage art now has
distorted coloring and shading"*, then — after the first fix — that *"the entire
homepage, including Tony, does not preserve the visual quality of the original
approved art."* Both were right.

**The cause is palette quantization**, established by rendering the pipeline's
own intermediate stage rather than by argument: the incoming source is clean, the
downscale is clean, the snap to the shared palette is the defect. **No new art
was required at any point**, which supersedes the earlier `art/SHELL_AUDIT_*`
conclusion that the homepage needed targeted regeneration.

**And the source art is not pixel art.** The shell arrives 941 × 1672 with
153,738 distinct colours; Tony 480 × 1315 with 72,004. The pixel-art look is
manufactured by the pipeline, and the shared 32 it snaps to were chosen for
46 × 46 collectibles generated in independent batches. That count was a
convention rather than a measurement.

So what ships is **typed family palettes, sized by measurement**: `zone` 64
colours and `character` 16, each derived by weighted k-means from that family's
own art and written into `palette.json` as literals. Additive, so no extension
ever replaces a shared colour — which is the property that keeps all twelve
approved Batch B collectibles **byte-identical**. Seven files change: six `zone`
assets and Tony.

The four-colour pass earlier on this branch is the same mechanism at a guessed
size. It halved the error and left a room still visibly orange at phone size, and
it is kept in history because the evidence set uses it as a column.

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
- `docs/evidence/palette-fidelity/` — asset crops in **four columns**: the
  approved source, the shared 32, the four-colour pass, and what ships. The
  source column is what fidelity is measured against; the four-colour column is
  what shows that more of the same was not the answer.

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
| `npm run visual:qa` | **88 states × 3 widths, passed — three times**, zero hydration sightings in all three |

**One thing to know before the hosted Visual QA runs, because it changes what to
do if it comes back red.** A sweep of this branch once failed on two React `#418`
hydration errors, and the branch has swept clean **five times** around them —
1,584 captures, 2 sightings, roughly **one per 792**. It is
**intermittent and not this slice**, which changes only PNG bytes,
`art/palette.json` and the art scripts. It is now **visual debt 16**, measured in
`docs/VISUAL_DEBT.md`.

At that rate a 264-capture sweep expects a quarter of a sighting, so a hosted run
has roughly a **1-in-4 chance of failing on a defect that has nothing to do with
the change** — and the estimate has fallen with every clean run, so read the
order of magnitude rather than the figure. If it does fail that way, there are
two honest options and neither is a re-run:

- **Merge on the evidence.** Six local sweeps of this branch, five of them
  clean, and the failure is a console error rather than a rendering defect —
  every product gate was green in all six. This is the commissioner's call, not
  a session's.
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
