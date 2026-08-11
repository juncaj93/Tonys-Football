# Head prototype, round 1 — **refused**

The anatomy is right: a real brow, cheek and temple planes, a dimensional nose,
eye construction, ears growing out of the skull, a shaped jaw. That is what was
asked for and it should not be redrawn.

It was delivered as a **standalone square portrait**, 1254 × 1254, ignoring the
plate — so it registers against nothing.

| | delivered | wanted |
|---|---|---|
| eye line | 41% down | **32.5%** (row 37) |
| jaw | 97% down | **70%** (row 52) |
| neck | ~3% of the height | **28%** |
| detail density | 31 source pixels per game pixel | **9**, like the body |
| palette drift | 25.1 | under 5 |

`round-1-delivered.png` is what arrived. `round-1-fitted.png` is that file scaled
onto the body by `--head` with the wanted rows drawn over it: the head fills the
whole head-and-neck band, so the chin lands where the collar is and the eyes sit
three rows low.

**The single correction is the neck.** With almost none drawn, fitting the
bounding box oversizes the skull by about 38%, which is what pushes every feature
down. The second is scale: a full-frame portrait carries three and a half times
more detail than forty rows can hold, and most of it mushes on the way down.
