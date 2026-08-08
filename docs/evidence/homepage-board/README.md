# The Tonight board, before and after

Captured through `npm run visual:qa` on a production build against a freshly
reset `tonys_visual`, at `deviceScaleFactor: 3`. The board crops are **1:1 device
pixels** — no magnification — so what is in the file is what the phone draws.

| file | what it is |
|---|---|
| `<w>-board-before.png` | the board on `main` at `bb7342d` |
| `<w>-board-after.png` | the same crop on this branch |
| `<w>-room-after.png` | the whole room, for regression |

The board renders **145 CSS px wide at 390** and **133.9 at 360**; its text field
is 107 shell units, or **120.4 CSS px at 360**. Every size decision in this slice
was measured against that number rather than judged by eye, and the tables are in
`lib/design/type.ts` and `app/layout.tsx`.

## What changed

**The paper.** The baked face was an amber, mottled ground with a dark vignette
pulled in from every edge. It is covered — not repainted — by an opaque cream
rectangle over `TONIGHT_CREAM`, the measured extent of the paper. The wooden
frame around it is untouched: the wood was never the defect.

**The type.** `WEEK ONE` was 20px Silkscreen, which gives **13px capitals** at
the only size that fits. It is now 37px Micro 5 — **17px capitals** in a heavier,
condensed pixel letter. `33 days out` is 19px in the same face.

**One keyline and one rule**, where there had been a painted outline, a frame
line and a vignette competing at 130px wide.

## What is deliberately still true

The board is **runtime-driven**. `lib/parlor/tonight.ts` decides what it says;
`app/page.tsx` only prints `{ hero, detail }`. Nothing here knows a football
fact, and no state was added.

## Honest residuals

- **The face is flat.** The room is textured pixel art and the board's paper now
  carries no grain at all, so it is the cleanest surface in the room. That is the
  direction's "restrained texture" taken to its end; a paper tooth could be added
  later without touching anything else.
- **Micro 5's `W` is idiosyncratic** — two joined `V`s rather than a crossed
  form. It is legible at all three widths, and it is the price of the heaviest
  condensed *pixel* face that fits. A smooth face measured better and was
  rejected for looking pasted-on.
- **A smooth face would still be stronger.** Big Shoulders Display gave 28px
  capitals against Micro 5's 17. Staying inside the room's visual language costs
  about eleven pixels of capital height, and that trade is the ruling.
