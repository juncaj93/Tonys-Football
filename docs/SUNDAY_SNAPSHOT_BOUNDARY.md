# The Sunday snapshot and the Monday comeback — the implementation boundary

**Status:** implemented, 2026-08-04. This is the canonical account of how the
product knows what the scores were before Monday, and what the newspaper is
allowed to say about it.

It sits under `docs/PRODUCT_DELIVERY_MANDATE.md` and `PROJECT_SPEC/16` in the
hierarchy of `AUTONOMY.md §1`.

---

## 1. Why a whole cron job for one sentence

`16 §4.3` gives the reason in its own words:

> **Sunday ~11:55pm ET** — pre-Monday score snapshot. This is the only way the
> Monday-comeback stories required by `07 §8` can be truthful; `04 §22` did not
> specify a job that produces it.

A final score cannot say whether somebody was behind on Sunday night. Nothing
else in the product records it, and it is unrecoverable afterwards — so either
the league spends one of its two permitted cron jobs on a photograph, or the
paper guesses. `MANDATE §9` does not allow the paper to guess.

**This is the second and final cron.** `16 §4.3` allows exactly two and both now
exist. There is no third.

---

## 2. What the snapshot records, and what it does not

One row per **paired** game of one week:

| | |
|---|---|
| `season_id`, `week`, `sleeper_matchup_id` | what game, and the key that joins it to its finalized result |
| `roster_a_id`, `roster_b_id` | who, by seat |
| `points_a_cents`, `points_b_cents` | the two scores, in cents |
| `captured_at` | from the injected clock — the business instant of the photograph |
| `source` | `live(https://api.sleeper.app/v1)`, in `sync_runs.source`'s vocabulary |

Unpaired rosters are not stored. `fantasy_matchups` already refuses those and
says why — *"a table of games is the wrong place to record a non-game"* — and a
comeback happens inside a game.

### It does not record remaining Monday exposure, and that is a hard limit

The obvious extra field is *"how many of this roster's starters have yet to
play"*. **It is not available.** `lib/sleeper/endpoints.ts` is the entire surface
this product talks to, and none of its eight endpoints carries an NFL schedule:
no kickoff times, no game assignments, nothing that says which players are on
Monday.

The only proxy in the payload is *"starters on zero points"*, and it cannot
distinguish a player who has not played from one who played and scored nothing —
a defense that gave up 35 and a quarterback on a bye look identical. A number
that is wrong sometimes is worse than a number that is absent, so there is no
number.

Nothing in the product needs one. The claim the paper makes is *"was behind, then
won"*, and that is answered entirely by two scores at one moment and two scores
at the end.

### It does not record prose

Structured facts only. Every sentence is derived at render time from the numbers,
so a redesign of the newspaper cannot change what was true.

---

## 3. Timing, and exactly how much guarantee it is

Vercel runs crons in **UTC**; the league's day is Eastern (`lib/parlor/season.ts`).
A single UTC schedule cannot be 11:55pm ET all season, because the NFL season
crosses the November change from EDT to EST.

**`55 4 * * 1`** — Monday 04:55 UTC:

| period | local time | where that sits |
|---|---|---|
| EDT (September – early November) | **Monday 00:55 ET** | after Sunday night football ends (~11:30pm), before any Monday game |
| EST (November – January) | **Sunday 23:55 ET** | `16 §4.3`'s stated time exactly |

The obvious alternative, `55 3 * * 1`, is 11:55pm ET during EDT and **10:55pm ET
during EST** — which is *inside* the Sunday night game for half the season. That
is the mistake this choice avoids, and it is why the job runs slightly late in
September rather than slightly early in December.

### The limitation, stated plainly

**The boundary is a clock, not a schedule.** The job does not know when Monday's
games are, because nothing available tells it. A week whose only game is on
Thursday, a Saturday slate in December, an international kickoff at 9:30am, a
postponed game moved to Tuesday — none of those changes when the photograph is
taken.

What that costs, precisely:

- **A game with no Monday exposure** is photographed at its final score. The fact
  reports `held` or `never-led`, no result flips, and nothing is published. The
  correct outcome, arrived at without knowing the schedule.
- **A game postponed past the photograph** is captured mid-flight and would
  report a "comeback" that includes non-Monday scoring. The claim would still be
  *literally* true — the manager was behind at that instant and won — but the
  word "Monday" in the headline would be wrong.

The second is a real limitation and is accepted rather than hidden. `16 §4.3`
specifies a fixed Sunday-night job and the data to do better does not exist in
this product's upstream.

**The schedule is protected by a test, not by this paragraph.**
`lib/cron/secret.test.ts` reads `vercel.json`, converts the UTC hour into
Eastern at **both** offsets, and asserts each lands after 23:00 Sunday ET and
before 06:00 Monday ET — so a session that moves the hour has to change the
assertion that says why it is where it is. The same file asserts there are
**exactly two** crons and that every declared path has a `route.ts` on disk, the
scheduled-404 failure that kept this entry out of `vercel.json` until the route
existed.

---

## 4. Idempotency — and why it is stronger than usual here

`UNIQUE(season_id, week, sleeper_matchup_id)`, `ON CONFLICT DO NOTHING`, plus an
append-only trigger refusing `UPDATE` and `DELETE`.

Everywhere else in this schema, idempotency means *"a retry is harmless"*. Here
it means something stronger, and the difference is the whole design:

> **A second capture of a week is a materially different and worse photograph.**

A retry an hour later photographs a moment that already includes Monday scoring.
An upsert would replace the truth with a plausible-looking falsehood, silently,
and leave nothing anywhere to show it had happened — turning every comeback claim
of that week into a false statement in a published newspaper.

So the **first** capture is the one that counts, permanently, and the database
refuses the rest. Not the service: a caller cannot do it by accident and cannot
do it on purpose either.

### There is no correction path, and that is a decision

A stat correction that moves a *final* score flows through the ordinary import
and changes the final margin. A stat correction that would have moved the
*snapshot* cannot be applied, because the snapshot is a record of what was known
at a moment, not of what turned out to be true.

A league that can retake the photograph does not have one.

If a correction path is ever wanted, it must be a **new row** carrying its own
`captured_at` and a reason, never an edit — the same shape as
`slice_publication_holds`. Nothing in v1 needs it.

---

## 5. The comeback, defined

`lib/stats/comeback.ts`. Two subtractions on a stored snapshot and a finalized
result. No projection, no win probability, no odds, no model — `16 §9` bans all
three from the paper, and this is the story most likely to tempt one in.

### Every outcome is named, including the silent ones

| outcome | meaning |
|---|---|
| `comeback` | trailed at the snapshot, won |
| `held` | led at the snapshot, won |
| `collapse` | led at the snapshot, lost (the same event from the other chair) |
| `never-led` | trailed at the snapshot, lost |
| `tied-at-snapshot` | level; nobody came from behind because nobody was behind |
| `no-snapshot` | the week was never photographed |
| `not-final` | no decided result, or the game is not publishable |
| `unpaired` | a bye, or a snapshot whose rosters are not this game's |

A caller that cannot tell *"nobody came back"* from *"we never looked"* will
eventually publish the second as the first, so those are different outcomes
rather than a shared null.

### Structured values

`deficitCents` · `blownLeadCents` · `finalMarginCents` · `swingCents` ·
`winner` · `loser` · `flipped`. Cents throughout: `128.44 − 121.78` in IEEE 754 is
`6.659999999999997`, and a margin that drifts stops matching the board printed
beside it.

### What separates a comeback from an ordinary Monday

Two conditions, and the second is the one that keeps the paper honest:

1. **The result flipped.** Whoever led on Sunday night is not who won. A leader
   extending a lead is not a comeback however many points moved.
2. **The deficit was real.** `STORY_GATES.minComebackDeficit` is **10 points** —
   a starter's afternoon. Below it the swing is inside the noise of a single stat
   correction.

The threshold lives in `stories.ts` with every other editorial gate, **not** in
the fact module. A threshold inside the arithmetic would be a second, invisible
editorial policy sitting under the one that is written down.

### It scores on the deficit, not the margin

The one place this story disagrees with every other margin-shaped kind, and
deliberately: a one-point win after being forty behind is a bigger story than a
one-point win after being one behind, and the final margin cannot tell them
apart. `significance = 400 + deficit × 2` — clearing `STORY_FLOOR` (340) at once
and `LEAD_FLOOR` (460) at a thirty-point hole.

---

## 6. What the paper does with it

`monday-comeback` is a `StoryKind` like any other. It is derived by
`deriveStories`, ranked by significance, selected by `lib/slice/select.ts`,
rendered by `lib/slice/render.ts` and checked by `lib/slice/validate.ts`.

Nothing about the existing rules changed:

- **The board still prints in full.** A new candidate cannot suppress required
  coverage, and `comeback-story.test.ts` asserts every other candidate of the
  week survives its arrival.
- **Retired managers are filtered upstream**, by `publishableWeek`, before
  derivation sees the game. This story inherits that without knowing about it,
  and `comeback-story.test.ts` asserts it **through the real filter** rather than
  by reading the code — so a future kind wired in below `publishableWeek` fails
  there rather than shipping a retired manager's name.
- **Novelty ordering may reorder but not suppress.** The rule is unchanged; what
  it can see is not. `recentLeadKinds` re-derives the previous two issues, and it
  was reading no snapshots at all — so `monday-comeback` could be *this* week's
  lead and could never be a *recent* one, and two comebacks in a row would have
  printed unreordered. `factPacket` now reads three weeks' photographs and hands
  each previous week **its own**: this week's would report a recovery that did
  not happen, and none at all makes the kind permanently invisible to the rule.
- **The Tuesday job still does not publish.** It ends at `submit: true` and the
  draft lands on the press desk.
- **A week with no snapshot produces no candidate at all**, silently — which is
  every historical week in the archive, since the job did not exist for any of
  them.

### The demo state

`slice-monday-comeback`, photographed by the visual driver at all three widths.
Its fixture supplies one recovery **and three games that also moved and did not
flip** — a state showing only the comeback would not prove the paper can tell a
recovery from an ordinary Monday, which is the exact failure this whole gate is
written against.

---

## 7. The door

`lib/cron/secret.ts`, shared by both jobs. It used to be a private copy inside
the Tuesday route; two copies of a security check is a fix applied to one door
and not the other.

**With `CRON_SECRET` unset both routes answer 404** — not 401, on the same
reasoning as `requireAdmin()`: a 401 confirms the route exists and is worth
attacking. Unset means shut, never "runs unprotected in development".

Until the secret is set in Vercel production, **both jobs are scheduled and
inert.** Neither is operational.

`lib/cron/secret.test.ts` holds all of it: unset refuses even a well-formed
`Bearer` request; a wrong secret, a prefix of the right one and a wrong scheme
are all refused; the refusal is a 404; a job response is never cacheable; and
**both routes call the shared check as their first statement, before `getDb()`**,
with neither reading `CRON_SECRET` itself. A route that opens a connection and
*then* decides whether it was allowed to is one refactor away from doing the work
first.

---

## 8. What this slice deliberately did not do

- **No third cron.** `16 §4.3` allows two and there are now two.
- **No live score sync.** One endpoint, one insert, no loop, no schedule of its
  own, and a table that refuses to be written twice — shaped so it cannot grow
  into the thing `16 §4.3` bans in the same sentence that permits it.
- **No projections, win probability, odds or AI judgment** anywhere in the fact
  or the gate. The validator's banned-term scan already refuses the vocabulary;
  this slice never reaches for it.
- **No change to publication.** The Tuesday job authors and stops.
