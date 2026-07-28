# Shared Style Preamble

**Reuse this block verbatim in every generation prompt. Never paraphrase it.**

Paraphrasing is how style drift begins. A reworded preamble in batch 4 produces assets that are individually fine and collectively wrong, and the divergence is not visible until the assets sit next to each other. Copy and paste; do not rewrite.

---

## THE BLOCK

```
STYLE: Hand-crafted pixel art in the manner of late-1990s / early-2000s console and
handheld games. Limited palette, flat color fills, crisp 1-pixel outlines, strong
readable silhouettes. Cozy, warm, slightly worn. Nothing glossy, nothing 3D-rendered,
no gradients, no anti-aliasing, no soft shadows, no lens effects, no drop shadows.

SETTING: A neighborhood pizza parlor in a fictionalized Metro Detroit, operating since
the 1990s. Red-and-white checkered cloth, worn wood paneling and laminate, amber
incandescent light, neon beer and sports signage, arcade carpet, CRT glow, paper menus,
faded football memorabilia, handwritten signs taped to things. Familiar, lived-in,
a little shady. Not a tourist-board Detroit, not a generic neon casino, not steampunk,
not cyberpunk, not fantasy-medieval.

CAMERA: Flat frontal elevation. Straight-on, camera at character eye level, like looking
at a lit stage or a diorama. No vanishing point, no perspective convergence, no isometric
projection, no foreshortening, no tilt. Floors read as horizontal bands. Props sit on the
floor line or hang on the wall plane.

LIGHT: One warm key light from the upper left, the color of an incandescent bulb. Cool
low-influence ambient fill from the lower right. Shadows are one step darker in the same
color family, never black and never grey. Neon is emissive: full-value color with a
one-pixel bloom, unaffected by the key light.

PALETTE: Restrict to a warm, slightly desaturated palette of roughly 32 colors —
warm near-blacks, browns, brick reds, cream paper tones, amber, muted blues, with a
few saturated neon accents in cyan, green, yellow, and magenta. Never pure black
(#000000). Never pure white (#FFFFFF).

OUTPUT: Generate at high resolution in this style. Do not attempt to output at the final
tiny pixel dimensions — the asset will be downscaled with nearest-neighbor and quantized
afterward. Transparent background unless the prompt says otherwise. Single subject,
centered, full subject visible with a small margin, no cropping at the edges.

NEGATIVE — never include any of the following:
team logos, league marks, or any sports-team insignia; real athletes or recognizable
likenesses of real people; real signatures or autographs; brand names, wordmarks, or
corporate logos; Mario, Luigi, or any Nintendo character; any existing video-game,
film, or cartoon character; watermarks; signatures; text or lettering of any kind
unless the prompt explicitly requests it; photorealism; 3D rendering; smooth gradients;
anti-aliased edges; drop shadows; lens flare; motion blur; multiple subjects when one
was requested.
```

---

## Usage

1. Paste THE BLOCK first
2. Then the family-specific section from the matching template file
3. Then the per-asset subject line

Every prompt is these three parts in that order, always.

## Expected yield

Budget a **50–70% cull rate.** Generate roughly four candidates per needed asset. Twelve sheets means somewhere near 150 generations. Generation is cheap and fast; **reviewing is the real cost**, so cull hard and early rather than trying to rescue a near-miss.

## Reminder

Assets are downscaled and quantized to `palette.json` after generation. That processing step — not the prompt — is what actually enforces palette consistency. The prompt gets you close; the pipeline makes it exact.
