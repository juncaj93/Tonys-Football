# The homepage as one composition — before and after

The 2026-08-06 fidelity ruling asks for the page to be judged whole: *"inspect the
homepage as one composition rather than only isolated asset crops."* A crop of the
ceiling cannot answer whether Tony belongs in the room he is standing in.

`before` is the branch at `9550bb3` — the shared 32 plus the four-colour `zone`
extension of 2026-08-05. `after` is the same page with each painterly family
quantized against **its own** palette. **Nothing but the palette changed**: same
build, same layout, same geometry, same components, same server. The two sets of
captures were taken minutes apart against one running server, with only the PNGs
on disk swapped.

| file | what it is |
|---|---|
| `390.png`, `375.png`, `360.png` | the frame at **device resolution** — 1170 / 1125 / 1080 px, which is what the phone actually draws |
| `*-1to1.png` | the same frame at **1 CSS pixel per image pixel** — what a reviewer's eye is at arm's length from |

Regenerate with `npx tsx scripts/homepage-shot.mts <outDir> <label>` against a
local production server.

## What changed, region by region

Every claim here is visible in `390-before-1to1.png` beside `390-after-1to1.png`.

| | before | after |
|---|---|---|
| **walls** | dark orange throughout | warm cream, with the panel mouldings legible against them |
| **ceiling** | a flat orange field, tile grid broken into dashes | two ochre tile tones with continuous grout lines and the downlights reading as light |
| **wood** | the counter front read as red streaks | brown, with the vertical board grain visible |
| **floor** | gold-on-dark-red, muddy | red-and-cream checkerboard with clean tile edges |
| **booths** | a single dark mass on the right | red banquettes with their backs and seats separated |
| **plants** | brown blobs | green, both the hanging basket and the pot |
| **doorway / window** | flat brown rectangles | a panelled door, and a window with sky |
| **Tony** | skin muddy tan, jersey navy-black | the source's yellow-orange skin, clean jersey blue, cream apron |

The last row is the one the ruling puts first — *"whether Tony belongs naturally
in the room; whether his palette matches the environment."* He was quantized
against a palette with no yellow-orange in it while the room was quantized
against a palette with no cream. They now share the property that each is drawn
in its own colours, and they sit together.

## What is deliberately identical

- **Tony's placement, layering, glow, entrance and interaction.** The ruling
  makes him a fidelity reference rather than a geometry task, and nothing here
  moves him a pixel.
- **The Tonight board's text, the receipt, the banner rail, the tray.** Runtime
  HTML over baked surfaces, untouched.
- **Every collectible.** They quantize against the shared 32 by commissioner
  decision, and all twelve approved pieces are byte-identical.

## The measurements

`docs/PALETTE_FIDELITY_BOUNDARY.md`. The short version: the shell's mean
quantization error against its own source falls **35.0 → 5.9** of a possible 441,
the lamp-glow ramp's share of the room falls **27.3% → 0.9%**, and the busiest
single colour falls **35.8% → 4.2%** — the room stops being three colours.
