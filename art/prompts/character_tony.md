# Prompt Template — Tony

**Family:** `character` · **Canvas:** 32 × 48 · **Height:** 46px (the master unit)
**Slugs:** `character_tony_neutral` · `character_tony_pleased` · `character_tony_unimpressed`

Tony is the single most important asset in the project. He defines the master height unit that every other character scales from, and he is the brand. **He never ships as a placeholder.**

---

## Prompt structure

1. `_style_preamble.md` → THE BLOCK, verbatim
2. The FAMILY section below, verbatim
3. One SUBJECT line

---

## FAMILY

```
SUBJECT TYPE: A single standing character, full body, facing the viewer straight-on or
at a slight three-quarter turn. Feet flat on an implied floor line at the bottom edge.
Arms visible. Compact, stocky, animated posture — a person who has been on his feet all
day and has opinions about it.

PROPORTIONS: Roughly four-and-a-half heads tall. Slightly large head for readability at
small size. Hands simplified to mitten-like shapes. Feet simplified to solid blocks.

DETAIL BUDGET: No more than six distinct interior shapes on the face and eight on the
body, excluding the outline. The silhouette alone must identify the character — if it
were filled with one flat color, you would still know who it is.

OUTLINE: Fully enclosed 1-pixel outline in a warm near-black.

BACKGROUND: Fully transparent. No floor, no shadow, no scenery, no props except those
named in the subject line.
```

---

## SUBJECT lines

### `character_tony_neutral` — the canonical Tony

```
SUBJECT: Tony, the middle-aged owner of the pizza parlor. Slightly balding with dark
hair at the sides. A thick dark mustache — his strongest facial identifier. A white
pizza apron, stained with use, worn over a plain blue-and-silver football jersey with
NO markings, NO numbers, NO logos, and NO wordmarks of any kind. A single cigarette
tucked behind his right ear. Practical dark work shoes. Expression: confident and
mildly exhausted, like a man who has seen every bad beat and claims he predicted all
of them. Arms relaxed at his sides. Neutral standing pose.
```

### `character_tony_pleased`

```
SUBJECT: [same description as neutral] — Expression changed to delighted and slightly
smug. One eyebrow raised, a half-smile under the mustache. Posture opened up, chest
out a little. Same clothing, same cigarette, same proportions, same outline weight.
Only the face and posture differ from the neutral pose.
```

### `character_tony_unimpressed`

```
SUBJECT: [same description as neutral] — Expression changed to flat, deeply unimpressed,
eyelids low. Arms crossed. Head tilted very slightly. Same clothing, same cigarette,
same proportions, same outline weight. Only the face and posture differ from the
neutral pose.
```

---

## Required traits — from `12 §3`, non-negotiable

- Slightly balding
- Dark mustache, or an equally strong facial identifier
- Pizza apron
- Blue-and-silver football jersey beneath it, **with no team marks whatsoever**
- Cigarette behind one ear
- Compact, expressive posture
- Confident, mildly exhausted expression

Tony may later appear in seasonal variants, but he must remain **instantly recognizable** across all of them.

---

## Prohibited

- **Do not reference Mario, Luigi, or Nintendo in any form.** Tony evokes classic platform-game energy through posture, proportion, and color — never through copied design.
- No overalls, no red cap, no white gloves, no round nose.
- No Italian-stereotype dress, gestures, or props.
- No real team logos, marks, colors-as-trademark, or player likenesses.
- No text on the apron or jersey.

## Acceptance

- Recognizable at 46px on a phone at 1×
- The three expressions read as **the same person** in three moods
- Mustache and balding pattern are identifiable at final size
- Silhouette test passes
- Quantizes to `palette.json` without losing the face
