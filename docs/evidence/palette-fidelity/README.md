# Homepage art fidelity — before and after

The commissioner's report was *"much of the homepage art now has distorted
coloring and shading."* The cause is **palette quantization**, not the source
art, and these are the pictures that show it.

`before` is the shipped asset at `4a36244`; `after` is the same asset at `HEAD`.
Both are read out of git, never off disk, so the pair cannot drift with a working
tree. Regenerate with:

```bash
npx tsx scripts/palette-evidence.mts
```

Enlargements are **nearest-neighbour**. Smoothing them would blur the one thing
being compared — which colour each pixel snapped to.

Every claim below is a colour count on the rectangle named, not an impression of
the picture. Where the two would disagree, the count wins — see *"the light tiles
never changed"*.

| File | Rectangle | What changed |
|---|---|---|
| `shell-whole-before.png` / `-after.png` | the whole shell, **1:1** (320 × 569) | The room read as though lit by sodium light. Its three largest colours were `wood-dark` 25.9%, `red-dark` 22.4% and `amber-deep` 18.1% — one brown, one crimson and one gold doing the work of walls, ceiling, floor, furniture and counter between them. They are now `zone-ember` 35.8%, `zone-brick` 14.7% and `zone-ochre` 11.2%, three warm neighbours, and the materials separate. |
| `ceiling-before.png` / `-after.png` | x 40–240, y 0–70, **4×** | **68% of the ceiling was a single colour** — `amber-deep` — with the tile grid rendered as dark scratches over it and `red-dark` at 7% making the scorch. It is `zone-ochre` 47.4% and `amber-deep` 36.0% now: **two tile tones**, which is what the ceiling actually is, with a clean one-unit grid between them and the recessed lights reading as lights. The scorch cleanup of visual debt 9 survives, and had to be re-derived to do so (`PALETTE_FIDELITY_BOUNDARY.md §7a`). |
| `wall-behind-tony-before.png` / `-after.png` | the oven alcove, x 50–160, y 165–265, **4×** | A single brown checker at roughly Tony's own value — `wood-dark` 30.3% with **`skin-4` at 17.0%**, a *skin* colour holding up a wall. The backsplash is `zone-ember` inside a `wood-dark` frame now, so the recess reads as a recess and `skin-4` drops to 13.2%. |
| `floor-before.png` / `-after.png` | the foreground band, x 40–240, y 460–560, **4×** | A dense red-on-brown mottle across the whole bottom of the screen — the *"muddy"* in the report — now flat deep red with sparse speckle. **The light tiles never changed:** `amber-mid` is 14.5% of the band before *and* after. What changed is the dark half, which was `red-dark` 47.5% *and* `wood-dark` 21.4% — crimson and brown rendering one tile — and is now `zone-ember` 51.9% and `zone-brick` 24.0%, two values of one material. The tiles read cleaner because what surrounds them stopped being two unrelated hues, not because any cream was added. |
| `booths-before.png` / `-after.png` | x 180–320, y 260–380, **4×** | The same substitution further back: `red-dark` 33.6%, `wood-dark` 22.6% and `skin-4` 9.1% become `zone-ember` 40.4%, `zone-brick` 24.9% and `zone-ochre` 9.7%. The counter's vertical boards stop being red streaks and show grain. |
| `counter-front-before.png` / `-after.png` | `zone_counter_front.png`, whole, **2×** | The `/counter` backdrop — the same defect on a second asset, and the largest error improvement of any: **36.4 → 20.1**. Heavy stipple across the checker, potted plant brown; clean now, plant green. |

## The numbers behind the pictures

`npx tsx scripts/palette-report.mts`, measured on the **incoming source art** and
quantized the way production quantizes it:

| asset | family | mean error | isolated px | `paper` share | `amber` share |
|---|---|---|---|---|---|
| shell | `zone` | 35.0 → **21.6** | 2.30% → 2.23% | 0.1% | 27.3% → **20.7%** |
| counter-front | `zone` | 36.4 → **20.1** | 2.49% → 2.86% | 0.0% | 14.1% → 12.8% |
| newspaper-rack | `zone` | 28.4 → **23.1** | 15.27% → 16.39% | 10.4% | 1.5% → 0.2% |
| tony | `character` | 30.3 → 30.3 | 11.06% → 11.06% | 25.4% | 10.1% |
| neon-sign, signed-jersey, burn-barrel | `collectible` | unchanged | unchanged | unchanged | unchanged |

The bottom two rows are the point of the scoping decision: **only `zone` changes.**
Tony and all twelve approved Batch B collectibles are byte-identical, because the
extension is additive and never replaces a shared colour.

### There are two ways to count a ramp's share, and they answer different questions

The table above **quantizes the source** and reports where each source pixel
*would land*. Counting the colours in the **finished PNG** instead gives a
different and equally true set of numbers, and the two have been mixed up once
already:

| the shipped shell | `paper` | `amber` | `wood` | `red` | the four new |
|---|---|---|---|---|---|
| before | 5.6% | 24.8% | 31.5% | 24.6% | — |
| after | 5.6% | 16.8% | 6.4% | 0.2% | **62.3%** |

Two things fall out of it.

**The room's only cream was painted on, not chosen.** The `paper` share of the
finished asset is 5.6% before *and* after, while the quantizer routes 0.1% of the
source there either way. The difference is `clean-parlor-surfaces.ts`, which
paints the Tonight board's face flat `paper-white` after quantization — so every
cream pixel in the old room was a repair script's, and none of it was the palette
reaching the walls. That is the coverage gap, stated from the other side.

**`wood` and `red` collapse, and that is the defect leaving.** 31.5% → 6.4% and
24.6% → 0.2% look alarming until you read the error census: `#670d07`, `#681306`
and `#580d07` are deep booth red and were landing on `wood-dark #4A2E1C` at a mean
distance of 42–47. They now land on `zone-ember #661505`. The pixels moved to a
**nearer, warmer** colour, which is why the mean error falls with them.

Both assets are **palette-closed before and after** — zero off-palette pixels —
and the dimensions and alpha are unchanged.

**Two things these numbers do not say**, and the boundary document says both at
length:

- **Isolated pixels do not improve.** The shell's barely moves and two assets get
  slightly worse. More colours mean more decision boundaries. The *"fewer isolated
  noisy pixels"* in the acceptance criteria is a different mechanism and is
  recorded as open.
- **Tony is not fixed by this and this does not claim he is.** He is the control
  case: his coverage was already fine, and his 11.06% isolated rate is untouched
  because his family is not extended.

The reasoning, the choice of the four colours, the scoping decision and the three
defects the re-derivation exposed: `docs/PALETTE_FIDELITY_BOUNDARY.md`.
