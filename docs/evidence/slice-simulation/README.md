# Slice simulation evidence — three Tuesdays

**Generated.** `npm run simulate -- all` writes the reports; `npm run
simulate:shots` writes the pictures. `docs/SLICE_SIMULATION_LAB.md` is the
reasoning; everything in this directory is the receipt.

**Every score is simulation input.** It exists inside a throwaway local database,
no production surface can reach it, and nothing here is a claim about football.
Sleeper remains the source of truth in production. Everything the product *did*
with it — the sync, the close, the selection, the prose, the refusals and the
approval — is the shipping code.

---

## PRESEASON — the draft-review special

The Tuesday before the opener. The league has drafted, nobody has played, and
Tony has graded all ten boards.

| | |
|---|---|
| **The report** | [`preseason.md`](preseason.md) |
| First screen | [390](preseason-slice-390-fold.png) · [375](preseason-slice-375-fold.png) · [360](preseason-slice-360-fold.png) |
| The whole issue | [390](preseason-slice-390.png) · [375](preseason-slice-375.png) · [360](preseason-slice-360.png) |
| One review open | [390](preseason-slice-390-open.png) · [375](preseason-slice-375-open.png) · [360](preseason-slice-360-open.png) |

Headline: *Everybody has a team now*. Week 0 — a slot, never a printed number.

**2,188 px at 390 — about 2.6 screens**, down from 8,024 px and 9.5 screens
before the 2026-08-11 restraint ruling: the board and the ten team sections were
the same ten managers twice, and are now one list that opens. Opening a review in
place costs 750 px.

---

## WEEK 8 — midseason

Seven Tuesdays already played through the real cron. Two managers level on wins
and 0.60 of a point apart, the league's highest scorer at 2–5, a live four-game
win streak, and a bounty authored in week 5 still open.

| | |
|---|---|
| **The report** | [`week-8.md`](week-8.md) |
| First screen | [390](week-8-slice-390-fold.png) · [375](week-8-slice-375-fold.png) · [360](week-8-slice-360-fold.png) |
| The whole issue | [390](week-8-slice-390.png) · [375](week-8-slice-375.png) · [360](week-8-slice-360.png) |

Headline: *It stopped being a game* — a `blowout` lead, a `nail-biter` demoted by
the novelty rule, and a `streak`. The week-5 bounty was claimed.

**No board.** `08 §1` and `08 §29`: the paper is highlights, and results live on
the standings surfaces. Under it, **Tony's Line is open** — *"Tony has the week
at 119.83. Over or under — your call."* with the OVER / UNDER control and the
stake beneath it.

---

## WEEK 16 — the semifinal

Fifteen Tuesdays played, with a bracket that advanced. Six of the ten placements
settle here; the four deciding a championship do not.

| | |
|---|---|
| **The report** | [`week-16.md`](week-16.md) |
| First screen | [390](week-16-slice-390-fold.png) · [375](week-16-slice-375-fold.png) · [360](week-16-slice-360-fold.png) |
| The whole issue | [390](week-16-slice-390.png) · [375](week-16-slice-375.png) · [360](week-16-slice-360.png) |

Headline: *A hair in it* — a semifinal decided by 0.42. Its report carries §6a,
**the same week re-assembled a week later**, which is where the `elimination`
story appears and where it demonstrably could not have.

---

## What the pictures are

`/slice` — the real route, signed in as a real manager through the real door,
reading the issue that scenario's cron drafted and a named person approved and
published. Not a preview parameter and not a fixture.

Up to three per width, because a full-page capture of a long issue is a thumbnail
nobody can read and hides the only question a phone actually asks:

- **`-fold`** — what the phone shows before anybody scrolls, at real size;
- **plain** — the whole issue, top to bottom;
- **`-open`** — the preseason board with one manager's review expanded, which is
  the half of *"let each owner read their detailed one"* that a collapsed
  screenshot cannot show.

The server each shot is taken against is checked to be **this tree's build**
before the camera fires (`assertServerIsOurBuild`). That check exists because the
first pass after the restraint ruling photographed a stale server that was still
holding the port — see `docs/SLICE_RESTRAINT_BOUNDARY.md §4`.

[`shots.json`](shots.json) records the widths, the files and the page height in
CSS pixels, so *"how many screens is this"* is a number rather than an inference
from an aspect ratio.
