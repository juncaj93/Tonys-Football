# Champions and history — before and after

`/timeline` is where every champion banner's **View season** lands. It shipped in
V1 as a four-digit year and a name, with a note in the file calling it
*"deliberately thin"* and pointing at the deferred Season Story.

That was the right call when nothing else was derivable. It stopped being right
when Stats Intelligence landed: `lib/stats` has produced verified, ranked,
suppression-aware facts since then, and this page was showing none of them — a
history page that knew the league's biggest win and its closest finish and
printed neither.

| file | what it is |
|---|---|
| `390.png`, `375.png`, `360.png` | device resolution — 1170 / 1125 / 1080 px |
| `*-1to1.png` | 1 CSS pixel per image pixel, which is what a reviewer's eye is at arm's length from |

`before` is `/timeline` at `dde6237`. `after` is the same page reading the same
database through `lib/league/timeline.ts`. **Nothing else changed** — same
build, same panels, same room behind, same return plate.

Regenerate: `npx tsx scripts/homepage-shot.mts <outDir> <label> /timeline`
against a local production server.

## What changed

| | before | after |
|---|---|---|
| **per season** | the year, and a champion's name | the year, the champion, the season's **biggest win** and its **closest game**, each with both scores and both managers |
| **the current season** | `TBD` above *"Still being played. Nobody has won it yet."* | `IN PROGRESS` beside the year, and one sentence — the label carries the state so the body does not have to |
| **what is not shown** | nothing said | *"32 more on record"* — a reader cannot tell a short list from a trimmed one |
| **the sign** | `CHAMPIONS $ HISTORY` | `CHAMPIONS AND HISTORY` |

That last row is a real defect the capture caught rather than a copy preference.
Silkscreen's ampersand is a vertical bar through a rounded bowl, and at display
size it reads as a dollar sign. A pixel face has the glyphs it has; the fix is
the word.

## Two facts per season, one of each kind

`seasonFacts` publishes up to one largest-margin and one closest-game **per
week**, so a finalized season offers around thirty-four. The obvious cut — top
two by selection score — was written first and returned **two blowouts for both
recorded seasons and no close game at all**, because a margin outranks a
nail-biter in `scoreOf`.

Every fact it produced was true. The page was simply telling one half of the
story twice, which is invisible without real data and is why the assertion that
catches it runs against the recorded 2024 and 2025 seasons rather than a
hand-written fixture.

## Where the numbers come from

All of them through `lib/stats`, and none of them computed here — `MANDATE §9`.
The derivation formats; the component prints. `components/league/presentation.test.tsx`
polices that from the component side and `lib/league/timeline.test.ts` from the
data side, so a display component cannot start rounding a score on its way to
showing it.
