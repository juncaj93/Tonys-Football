# Round 2 evidence — **the art in these pictures is NOT registered**

Every image here was produced from `art/incoming/16EEB307-…png` by writing a
**temporary** mask module, rendering, and reverting it. `BUILD_MASKS` is still
empty on this branch and every manager in the product still renders the drawn
sprite. Nothing here shipped.

The mask behind them was produced with **`--fit`**, which normalised placement
only — rescaled `0.892×` and moved down 18 rows. Without it the delivery fails
three registration checks; with it, one.

| File | What it shows |
|---|---|
| `diag-mask.png` | the delivered art snapped to the seventeen role keys, unfitted, with the required band drawn over it |
| `prototype-preview.png` | four managers from **one** file — four skin tones, four shirt colours, all resolved at render time |
| `room-390.png` · `room-375.png` · `room-360.png` | the figure in the real storeroom at each phone width |
| `room-closeup.png` | the same scene at device-pixel scale, for judging the head-to-body join |

**The open defect these pictures make obvious** is the head: it is still the
*drawn* plate, because painting it is not authorised. Against a painted body it
is the weakest thing in the frame, and that is the decision the prototype exists
to surface.
