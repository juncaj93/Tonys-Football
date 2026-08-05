# Homepage art fidelity — three states of the same room

The commissioner reported twice. First that *"much of the homepage art now has
distorted coloring and shading"*, then — after the first fix — that *"the entire
homepage, including Tony, does not preserve the visual quality of the original
approved art."* Both were right, and these are the pictures that show why the
first answer was not enough.

**Four columns, and two of them exist to stop a wrong reading.** A plain
before/after would let a reader conclude the first attempt had simply been too
timid — `-plus4` shows that more of the same was not the answer. And without
`-source` there is nothing to be faithful *to*, only two productions to prefer
between.

| suffix | state | shell mean error¹ |
|---|---|---|
| `-source` | **the approved painting**, reduced to the shipped canvas and *not quantized* — the benchmark | 0 by definition |
| `-before` | the shared 32 (`4a36244`) | 35.0 |
| `-plus4` | the shared 32 + four `zone` colours (`b4815a1`) | 21.6 |
| `-after` | each painterly family quantized against **its own** palette | **5.9** |

¹ against the approved source, out of a possible 441.

The three production columns are read out of git rather than off disk, so the
comparison cannot drift with a working tree; `-source` is produced by the
pipeline's own downscale with the quantizer left out, so exactly one step
separates it from `-after`. Regenerate with
`npx tsx scripts/palette-evidence.mts`.
Enlargements are **nearest-neighbour** — smoothing them would blur the one thing
being compared.

## The files

| file | rectangle | scale |
|---|---|---|
| `shell-whole-*` | the whole shell | 1:1 (320 × 569) |
| `tony-whole-*` | Tony, whole | 2× |
| `tony-face-*` | his face — the ruling's named fidelity reference | 6× |
| `ceiling-*` | x 40–240, y 0–70 | 4× |
| `wall-behind-tony-*` | the oven alcove, x 50–160, y 165–265 | 4× |
| `floor-*` | the foreground band, x 40–240, y 460–560 | 4× |
| `booths-*` | x 180–320, y 260–380 | 4× |
| `counter-front-*` | `zone_counter_front.png`, whole | 2× |

## What to look for

- **The ceiling** is the clearest of the eight. Under the shared 32 it is **68% a
  single colour** with the tile grid broken into dashes over it. Under +4 it is
  two tones and still orange. Now it is a calm shaded surface with continuous
  grout lines and the downlights reading as light.
- **Tony's face** is the ruling's reference. His skin was landing on the shared
  palette's muddy tans because nothing in it is his yellow-orange. It is the
  source's warm yellow again, his shading is contiguous, and the jersey is a
  clean blue rather than a near-black navy.
- **The floor** is the one where appearance and arithmetic disagree, and it is
  worth knowing before reading the picture: its **light tiles never changed** —
  `amber-mid` is 14.5% of the band in every column. What changed is the dark
  half, which was crimson `red-dark` *and* brown `wood-dark` rendering one tile.
  The tiles read cleaner because their surround stopped being two unrelated hues.
- **The wall** answers the ruling's *"do the walls remain cream rather than
  amber"* directly. Measured on the lit wall beside the board, the shared 32 drew
  it in **8 colours, 39% of them from the `wood` ramp** — brown, on a wall,
  because nothing warmer was in range. It is 27 graded warm tones now.

## The numbers

Measured on the shipped shell:

| | shared 32 | +4 | **after** |
|---|---|---|---|
| mean quantization error | 35.0 | 21.6 | **5.9** |
| `amber` (lamp-glow) share | 27.3% | 20.7% | **0.9%** |
| busiest single colour | 35.8% | 35.8% | **4.2%** |
| distinct colours in the asset | 26 | 30 | **90** |
| file size | 19 KB | 19 KB | 60 KB |

Tony's mean error goes **30.3 → 14.5**, and he is 40 distinct colours against 26.
**His isolated-pixel rate goes up too — 11.1% → 16.0%** — for the reason below:
at the shared 32 his face was flat because it had four tans to be flat in.

**Only the two painterly families change.** Seven files in total: six `zone`
assets and Tony. All twelve approved Batch B collectibles are byte-identical,
because a family extension is additive and never replaces a shared colour.

## Two things these numbers do not say

- **The isolated-pixel rate got worse and that is not a regression.** The shell's
  went 2.23% → 13.46% while the picture became far more faithful. The metric
  counts pixels differing from all four neighbours, which on an honestly rendered
  gradient is most of them — so it rewards flat posterized fields. The ruling
  says as much: *"do not rely only on… isolated-pixel rate"*.
- **This is not the whole page.** `docs/evidence/homepage-fidelity/` has the
  composition at 390 / 375 / 360, before and after, which is what the ruling asks
  to be judged. A crop of the ceiling cannot answer whether Tony belongs in the
  room he is standing in.

The reasoning, the four architectures that were measured, and the repair script
this made unnecessary: `docs/PALETTE_FIDELITY_BOUNDARY.md`.
