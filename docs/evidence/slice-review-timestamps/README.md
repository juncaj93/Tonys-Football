# The record says when — before and after

Visual debt 11. `/admin/slice/<version>`'s audit history showed **who** decided
and **in what order**, and the answer to *"when was this approved"* sat in
`slice_reviews.occurred_at` and never reached the screen.

Order is not a time. It says one thing followed another; it does not say whether
that was a minute later or a month.

| file | what it is |
|---|---|
| `<width>-before.png` | the record at `origin/main` |
| `<width>-after.png` | the same record, same data, same build |

Captured at device resolution (deviceScaleFactor 3) on the `review-approved`
demo state, so 360 is 1080 image pixels wide. The element itself is
photographed rather than the viewport — **the sweep never sees this**: its
screenshots are viewport-height and the record sits below the fold. The type
floor is still enforced there, because `checkTypeFloor` measures the DOM rather
than the picture.

## What changed

Each row gains one line under the sentence:

```
Demo commissioner approved it
"reads straight, and the board is complete"
6 AUG 2026, 11:17 AM EDT
```

Under, not inside. A reviewer reads the record for *what happened*; the stamp is
what they come back for when something is disputed, and threading it into the
sentence would lengthen every row for a fact most readings do not need. It is
`TYPE.metadata` — the smallest role, and tabular, so a column of stamps lines up
down the page.

All three stamps read the same minute here because the demo applier writes the
chain in one transaction. On a real review they differ, which is the entire
point.

## The convention is a module, not a line in this component

That is why the debt waited. Formatting a date commits the *product* to a
convention, no user-facing surface had formatted one, and choosing it inside a
screen about publication governance would have been the wrong place to decide
it.

`lib/design/moment.ts` is that decision made in its own file, the way
`lib/design/type.ts` was for size:

- **The league zone, with the offset named** — `EDT`/`EST`, not a flat `ET`.
  `lib/parlor/season.ts` already counts league *days* in `America/New_York`; a
  displayed time in another zone would be a second clock, and two clocks
  disagree eventually. A test asserts the two files use the same zone.
- **The month as a word.** `06/08/2026` is 6 August or 8 June depending on the
  reader. For an audit trail that is a defect, not a style preference.
- **Assembled from `formatToParts`.** `format()` with a date *and* a time inserts
  a connector — `at`, currently — and which one has changed between ICU
  versions. The text must depend on this repository, not on the Node build.
- **No relative time.** `2 hours ago` is the obvious thing to add and it is wrong
  twice: it is not deterministic, so the visual gate could never assert it, and
  it loses the fact, which is the one thing an audit trail may not do. The
  export surface is pinned by a test, so adding one has to delete that test.

Regenerate: apply the demo state, then screenshot the record element at each
width against a local production server.
