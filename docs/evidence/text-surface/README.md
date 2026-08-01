# The text-surface refresh — before and after

Both sides are the **real driver output**, not mock-ups: `npm run visual:qa`
against a production build on a fresh database. `before` is `c3dc077` (`main`
with PR #53 merged), captured from a worktree at that commit; `after` is this
branch.

Every crop is the **360** capture — the narrowest width this product supports,
and the width every decision in this slice was judged at. Taken at the driver's
3× device scale and resampled to 1× with nearest neighbour, so the pixel grid
survives the reduction.

| Pair | What to look at |
|---|---|
| `review-refused-before.png` / `-after.png` | The screen the direction named. **Before:** a flat cream panel floating on the room with no frame; `STAFF ONLY` in red leading the badge row; the draft's version, renderer and content digest running together in one 12px string; the verdict a 13px red caps line; and the four findings a bare list with the kind and the offending value in running text, no columns, no alignment, no rule between them. **After:** a mounted sheet — dark frame, corner brackets, stepped drop; the status stamp first, because *what state is this in* is question one; a drawn warning glyph; the digest on its own line in the `machine` role; and the findings as a bordered ledger with keys left, values right-aligned and unwrapped, and a rule between findings. |
| `slice-championship-before.png` / `-after.png` | The printed paper. **Before:** a bare cream panel against the counter's checker; `TONY’S TUESDAY SLICE` wrapping wherever the browser chose; a championship issue whose nameplate is identical to an ordinary Tuesday's. **After:** the same mounted sheet; the nameplate in two deliberate lines; a red championship flag between the dateline and the second rule; a headline, a ruled score deck and a lead paragraph in three separated steps. |
| `review-waiting-before.png` / `-after.png` | The press desk. Section labels at 15px rather than 12px — furniture is what a reader navigates by; the `refused by the check` clause on its own line rather than appended to a queue row's filing detail, where it was the fifth item of a `·`-separated run; and the same mount around the sheet, so the desk and the paper on it are visibly the same kind of object. |

The `AS IT WILL PRINT` label is the clearest single-line comparison in the first
pair, and it has now been through all three states. It was **cream type straight
onto the room**, so at 360 the words landed across the counter's red-and-white
checker. A **cream plate** fixed the contrast against the artwork and created the
opposite problem: a cream label sitting directly above cream paper, reading as
part of the sheet it was supposed to be naming. It is a **dark plaque** now,
which separates from both grounds at once.

Nothing in either pair is a content change. The prose, the scores, the findings
and the draft identity are byte-identical; `Edition` is untouched. The reasoning,
the measured type metrics and what was deliberately left alone:
`docs/TEXT_SURFACE_BOUNDARY.md`.
