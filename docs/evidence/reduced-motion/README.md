# The reduced-motion promise, now verified

The parlor moves: two haze drifts, the sign's sway, the lamp's breathe, the
ceiling's flicker, Tony's entrance, the box's wait and open, the reveal's rise
and burst — **seventeen keyframe animations** in `app/globals.css`.

For somebody who has asked their phone for less motion, the product answers in
**seven places**: four `@media (prefers-reduced-motion: reduce)` blocks in
`globals.css`, plus JavaScript branches in `arrival.tsx`, `spoken-line.tsx` and
`counter-tray.tsx`.

**Nothing verified any of it.** There was no reduced-motion state in the visual
suite and no assertion anywhere in the repository. The promise was made in seven
places and checked in none.

## What these are

`<width>-reduced-motion.png` — the homepage at 390 / 375 / 360, device
resolution, rendered with `prefers-reduced-motion: reduce`. This is the room as
a manager who asked for less motion actually receives it.

There is no "before" image, and that is not an omission: **the promise was
already kept**. Measured before writing anything, motion allowed versus reduced
on the same page:

| | animations running after settle |
|---|---|
| motion allowed | **3** — `haze-drift` ×2, `sign-sway`, all infinite |
| `prefers-reduced-motion: reduce` | **0** |

So this slice is coverage, not a repair. The room already stops. What did not
exist was anything that would notice if it stopped stopping.

## Why the gate reads the compositor, not the stylesheet

`document.getAnimations()` is the set of animations the browser is actually
running. A stylesheet audit would have been easier and would have missed the
likeliest future regression: an animation started from JavaScript with
`element.animate()`. The Web Animations API is precisely what
`animation-duration: 0.01ms !important` **cannot** touch.

## The control is the half that matters

"Nothing is animating under reduce" passes trivially if the room stops animating
at all — a gate that cannot fail is not a gate. So the same page is sampled
twice, and the motion-allowed pass **must find the room alive**. If the haze and
the sign ever go quiet for everybody, this gate fails and says the control
failed, rather than reporting a success it did not earn.

## Proven to have teeth

A `body.animate()` loop was injected into `components/scene/room-stage.tsx` —
the exact regression class CSS cannot suppress — and the gate failed at all
three widths:

> `[reduced-motion] @390 1 animation(s) still running under prefers-reduced-motion:`
> `script-driven on .min-h-dvh. A manager who asked for less motion is getting it`
> `anyway. CSS cannot suppress an animation started from JavaScript, so check for`
> `element.animate() before reaching for a stylesheet fix.`

With the injection removed it passes. The defect was never committed; it existed
only long enough to prove the assertion was real.

Regenerate: `npx tsx scripts/visual-qa.mts --state=reduced-motion` against a
local production server.
