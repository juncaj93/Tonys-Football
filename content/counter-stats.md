# Approved — Tony mentions a result

**Status:** Approved by the commissioner, 2026-07-31: *"Allow Tony to use verified Stats facts for occasional contextual dialogue."* There is no held-back second half, so the whole file is readable and `parseStatsAsides` reads to the end.

**Surface:** `parlor_stats_aside` · **kind:** `tony_line` · **where:** the front-counter dialogue panel, in place of the ordinary greeting, on the rare day a verified result is worth mentioning.

---

## What these are

`content/counter-greetings.md` is Tony saying one true thing about **you**. These are Tony saying one true thing about **a game** — the loudest result the fact layer has published, in his own voice, at the counter.

They are deliberately rare. `lib/parlor/aside.ts` gives them a long cooldown and refuses them outright whenever a moment is in play, because a manager standing in front of an unopened box does not want to hear about week nine.

## Where every number comes from

**Nowhere in this file, and nowhere in the code that renders it.**

Each variable is substituted from a single published `MatchupFact`, and the rendered sentence is then checked by **the Slice's own validator** (`lib/slice/validate.ts`) against the same fact packet the newspaper is checked against. A line that changed a name, a score, a margin or a tier does not get softened — it is refused, and Tony talks about something else.

That is the same rule `MANDATE §9` sets for the interface, applied to the surface where it is easiest to forget: a sentence spoken by a character reads as flavour, and flavour is exactly what an unchecked claim hides inside.

## Conditions

| Tag | True when |
|---|---|
| `stats_blowout` | The published lead is a blowout or a record margin — the classifier's word, never this file's |
| `stats_close_game` | The published lead is a game decided inside the `edged` threshold |
| `stats_champion` | The most recent finalized season produced a champion, and no louder fact is available |

Exactly one is ever held at a time. The fact layer decides which; this file only supplies words for it.

## Variables

| Variable | From |
|---|---|
| `{winner}` · `{loser}` | `winnerDisplayName` · `loserDisplayName` — canonical league names, never Sleeper handles |
| `{margin}` | The published margin, written to one place, exactly as the Slice writes it |
| `{points}` | The winner's score, to two places |
| `{champion}` | The manager who finished first in the most recent finalized season |
| `{season}` | That season's year |

## What these lines may never do

- **Name a retired manager.** The publication boundary is applied before a fact reaches this surface, and the validator refuses an unknown name on top of that. Tony's rare retired-manager cameos live in `counter-greetings.md` and are **fictional flavour with no statistics in them** — that separation is the whole reason both can exist.
- **Reach for a louder word than the classifier chose.** `stats_blowout` is only ever true when Stats said so.
- **Quote anybody.** The Slice's validator refuses quotation marks of every kind, and it checks these lines too.
- **Predict.** The chalkboard is where predictions live.

---

## The lines

**S1** · `stats_blowout` · *unimpressed*

> Tony saw what {winner} did to {loser}. {margin} points. He is not going to pretend that was a game.

**S2** · `stats_blowout` · *neutral*

> {winner} put {points} on the board that week. Tony wrote it down twice to be sure.

**S3** · `stats_blowout` · *neutral*

> {loser} came in here after that one and did not order anything. {margin} points will do that.

**S4** · `stats_close_game` · *pleased*

> {margin} between {winner} and {loser}. Tony had the radio on and burned a tray.

**S5** · `stats_close_game` · *neutral*

> Tony still thinks about {winner} and {loser}. {margin} points, and it could have gone the other way all afternoon.

**S6** · `stats_close_game` · *neutral*

> {winner} got out of that one by {margin}. Tony has the receipt somewhere.

**S7** · `stats_champion` · *pleased*

> {champion} took {season}. Tony keeps that banner where he can see it from the oven.

**S8** · `stats_champion` · *neutral*

> Nobody has taken a banner off {champion} yet. Tony is just saying.
