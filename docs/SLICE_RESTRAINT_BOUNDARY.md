# The Slice restraint ruling — the canonical account

**Commissioner direction, 2026-08-11.** Three changes to what the Tuesday Slice
prints, decided after looking at the simulation lab's photographs of the real
thing (`docs/SLICE_SIMULATION_LAB.md`).

> *"We have to do 'more is less' with Tuesday Slice. We don't need all the scores
> on the board. The main highlights are the focus. And then maybe Tony's new line
> for the week at the bottom, with the option to place a bet against it. And for
> draft grades let's make it streamlined for the Tuesday Slice, but allow each
> owner to read their detailed one."*

Read with `PROJECT_SPEC/08_TONYS_TUESDAY_SLICE_GAZETTE_SYSTEM.md` (the editorial
standard), `docs/PRESEASON_SLICE_BOUNDARY.md` (the draft review) and
`PROJECT_SPEC/18_PARLOR_NAVIGATION_MAP.md §3.4` (where the market lives).

---

## 1. The board is not printed — and this restored the spec rather than changing it

The finding that matters most here is that **the direction and the specification
agree**, and the implementation was the thing out of step.

| | |
|---|---|
| `08 §1` | the Slice *"should not read like a generic fantasy recap, **a box-score summary**, or an AI-generated newsletter"* |
| `08 §2` | *"Do not force sections. Do not publish filler to hit a quota."* |
| `08 §29`, acceptance criteria | *"**no fixed section is forced**"* |

A ledger of all five games, every week, whatever happened, is a fixed section and
it is a box score. It had a defensible reason — the pre-board Slice reported the
two games the fact layer had an opinion about and dropped the rest — and that
reason is now **overridden on purpose** rather than forgotten.

### The cost, stated rather than discovered later

On a typical week the paper carries two or three stories, so **six or seven of
ten managers are not named in it at all**. That is the exact failure the board
was introduced to fix, accepted knowingly this time: results live on the
standings and history surfaces, which is where a reader goes to *look something
up* rather than to *read*.

### What did not change

`Edition.scoreboard` is **untouched**. It stays in the packet, in the published
snapshot and in `editionHash`, so **no published version's hash moved** and the
record of the week is complete. This is a decision about what the paper *prints*,
not about what it *knows* — and it means a future surface can print a board
without re-deriving anything.

### Where the tie guarantee went

`components/slice/presentation.test.tsx` held the protection for a defect that
really shipped: `leftWon` is false on a draw and the board's only separator was
the literal word `over`, so a drawn game printed *"Cheese over Nathan"* on the
surface the league reads as true.

Deleting that test with the section would have retired the protection. It **moved
to `lib/slice/slice.test.ts`**, asserted on `renderEdition`, which is where the
data is made and where it still matters for whoever prints a board next.

**A false green was created and caught in the same pass**, and it is worth
recording because it is the shape this repository keeps paying for: two of the
four board tests went on **passing vacuously** after the removal, because the
fixture's own deck and body contain `154.42` and the assertion was
`toContain('154.42')`. The replacements use values that appear nowhere else, and
one of them asserts that the markup is **byte-identical** with a full board and
with none — which is the strongest available form of *"it is not printed"*.

---

## 2. Tony's Line is open, and the guard was never the flag

`lib/flags.ts` now ships `tonysLine: true`.

The old comment there said shut was *"the only honest state today"* because the
2026 season has no games. **That was right about the danger and wrong about where
the guard lives.**

`authorTonysLine` returns `thin-basis` while `basis.medianTeamScoreCents` is
null, and `MIN_BASIS_TEAM_WEEKS = 12` keeps it null until the league has played
roughly a fortnight — ten managers reach twelve team-weeks during week 2. So with
the flag open:

| Week | What is authored |
|---|---|
| preseason, 1, 2 | **no line at all**, and the band prints nothing |
| 3 onwards | a real season median, and the market runs |

Nothing fires on nothing, and the offseason is unchanged. `lib/simulation/lab.test.ts`
asserts exactly this through the **real cron** against a season the cron played:
no line in the preseason, and the earliest line in a full season is week 3.

### The bet was already built

Opening the flag is the whole change. `chalkboardFor` returns the market,
`StakesBand` prints it under the paper, and `BoardEntry` renders `PickSide` when
`canPick` — so the paper gains **Tony's Line with its OVER / UNDER control** and
the parlor sign gains it too. One pick per manager on their own team, a fixed
stake, and a 2× payout enforced by `weekly_stakes_line_pays_double` in the
database. No projection of any kind, which is what killed the prop-bet system
this replaces.

### What this changes about the split, recorded because it is a decision

`16 §38` already puts the market on the paper and `18 §3.4` puts it on the sign;
both now carry it, which is what opening the flag does. `18 §3.4`'s *"later,
behind the approved feature flag"* is satisfied — this is that later.

**Shutting it again is the same one line**, and nothing is lost: an authored
stake stays authored and settles on its own terms.

---

## 3. The draft review is one board that opens

The preseason issue used to print the board — ten names and ten grades — and then
ten full sections underneath it. That is the same ten managers twice, and it is
most of why the issue measured **8,024 px at 390, about nine and a half phone
screens**.

There is now **no separate "Team by team" section**. The board is the only list,
and a row opens into the detail that used to be the second pass.

| | Before | After |
|---|---|---|
| the issue, at 390 | 8,024 px · 9.5 screens | **2,188 px · 2.6 screens** |
| with one review open | — | 2,938 px · 3.5 screens |

`sections.board` and `sections.teams` are the **same ten managers** —
`renderPreseason` builds both from `packet.teams` — so nothing is lost by
rendering the richer one, and both stay in `Edition` untouched for the same
reason the weekly scoreboard does.

### Why `<details>` and not a route per manager

A page per manager would read a **published snapshot**, and the moment a grade is
corrected after publication the route and the printed issue disagree while
claiming to be the same paper. Keeping it inside the issue means there is one
document and it is the one the commissioner approved.

The browser's own disclosure also needs no JavaScript, is in the DOM whether open
or shut — so the gates still count ten takes on a collapsed board — is keyboard
operable, and announces its expanded state without any ARIA of ours.

**It has to read as paper, not as a widget.** The summary is a ledger row with
the same rule between rows the board always had, and the marker is a printed
`+` / `−` in the quiet ink rather than a disclosure triangle. `list-none` is set
on both the element and the WebKit pseudo-element, because Safari draws its own
marker from a different selector and leaving one of the two produces a triangle
on iOS and nothing anywhere else.

---

## 4. A defect in the evidence pass, found and fixed here

The first re-photograph after these changes captured the **old build**. An
orphaned `next-server` from the previous scenario was still holding port 3122,
the replacement died on `EADDRINUSE`, and the readiness probe got its 200 from
the stale server. Three scenarios were photographed against stale code and filed
under the new one; only a string that had changed in the same session gave it
away.

`scripts/harness.ts` documents that exact incident from the visual sweep, in
writing, and exports the check for it. Two fixes, both in
`scripts/simulate-shots.mts`:

- **readiness is not identity** — it now calls `assertServerIsOurBuild`, which
  fetches an asset whose URL contains this tree's `BUILD_ID` and which a stale
  server answers 404 for while still answering 200 on every page;
- **the wrapper is not the server** — `npx next start` is a wrapper and the
  process that holds the port is a grandchild called `next-server`. The spawn is
  now `detached` and the whole **process group** is signalled, then the port is
  waited on until it is genuinely free.

---

## 5. A defect in the product, found by refusing to trust a plausible story

The first two sweeps of this branch failed the console gate with **3** and then
**5** quarantined React `#418` hydration errors, against a ceiling of 2.

They looked exactly like the documented background. Visual debt 16 is an
intermittent `#418` that `scripts/visual-qa-quarantine.ts` describes as appearing
*"under six different state names across five routes and three widths, never
twice in the same place"*, and the two runs shared **not one** state between
them. The quarantine's own discriminator seemed to clear this branch too:

> A newly introduced structural mismatch is **deterministic**. It fires on every
> capture of the state it affects — at minimum three times, once per width.

Nothing fired at more than one width, and two of the routes — `/door`, `/profile`
— render nothing this branch touched.

**That reading was wrong, and a baseline is what showed it.** `main`, checked out
and rebuilt in the same container, against the same Chromium and the same seeded
database, logged **1** and passed.

| Build | Quarantined `#418` | Result |
|---|---|---|
| `main` | 1 | passed |
| this branch, before the fix | 3, then 5 | failed |
| this branch, after the fix | 2 | passed |

### The cause

The collapsed board row put a heading between two spans inside a `<summary>`:

```html
<summary>
  <span aria-hidden>+</span>
  <h3>Alex</h3>          <!-- invalid -->
  <span>A+</span>
</summary>
```

`<summary>`'s content model is **phrasing content, _or_ one element of heading
content** — not a heading *among* phrasing siblings. Invalid nesting is nesting
the parser is free to restructure, and a restructured tree is a `#418`
`args[]=HTML` structural mismatch by construction.

The scatter is explained too: console errors surface asynchronously and are
attributed to whatever page the driver has reached by the time they land, which
is why they showed up on routes this branch cannot reach. **The distribution was
real and the inference from it was not.**

The `<h3>` was inherited from the standalone team section this row replaced,
where it genuinely was a section heading. In a ledger row it is not one, so
making it a `<span>` costs nothing in the document outline.

### What this is worth remembering for

Two of the three defects in this branch were **self-inflicted and caught only by
measurement** — this one and the stale-server photograph in §4. Both were
plausible-story failures: there was a good reason to believe nothing was wrong,
and the good reason was wrong. The baseline run is cheap and it is the only thing
that separates *"the gate is flaky"* from *"I broke something."*

---

## 6. What did not change

- **No story rule, no selection rule, no significance threshold.** What leads a
  week is exactly what led it before.
- **No validator rule.** Every issue still passes the same deterministic check.
- **`Edition`'s shape and hash.** Both the weekly scoreboard and the preseason
  board remain in it.
- **The approval chain.** The cron still ends at `submit`, and publication still
  requires a recorded approval naming a person.
- **The schema, the crons, the economy, the catalog, the art.** Nothing.
- **`docs/ACTIVATION.md`.** All five human actions are unmoved.
