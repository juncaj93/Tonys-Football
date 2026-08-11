# Head prototype — two rounds, both refused, and getting closer

**The anatomy has been right since round 1** — real brow structure, cheek and
temple planes, a dimensional nose, eye construction, ears growing out of the
skull, a shaped jaw. That is not what is failing and it must not be redrawn.

| | round 1 | round 2 | needed |
|---|---|---|---|
| delivered as | 1254 × 1254 square | 1024 × 1536 | either is fine |
| neck | ~3% of the height | reaches past the collar | reaches the collar |
| eye line, down the skull | 57% | **57%** | **46%** |
| detail density | 31 source px per game px | **26** | ~9, like the body |
| palette drift | 25.1 | 23.4 | under 5 |
| unoutlined edge pixels | 24 | **5** | 0 |

**Round 2 fixed the neck and did not move the eyes.** Both deliveries put the eyes
57% of the way down the skull; our layout puts them at 46%, because the drawn head
has a relatively tall cranium above the eyes. Three rows, and it matters: the
moustache, goatee and beard are all painted to the mouth, and the hat brims clear
the brow.

`round-2-fitted.png` is the delivery with its **skull** fitted to rows 24–52 —
the jaw lands exactly, and the eye line is the visible gap.

## The ingest changed twice while reading these

- **A head is fitted; a build is not.** A build's placement is its own business.
  Ten layers are measured off a head, so the question is whether its *internal*
  proportions are ours, and fitting is what makes that checkable.
- **The skull is fitted, not the whole drawing.** Fitting the bounding box let a
  short neck stretch the skull and pushed every feature down with it — which is
  why round 1 read as "eyes wrong *and* neck wrong" when it was one fault.
- **A neck may run past the collar row.** The shirt is drawn over it, so a long
  neck is hidden rather than wrong. The earlier rule would have refused a correct
  delivery.

`lib/character/head.test.ts` holds all of it — eleven tests, including the two
corrections above as cases that must keep passing.
