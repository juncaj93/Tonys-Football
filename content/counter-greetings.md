# Counter Greetings — Draft

**Status:** Draft for commissioner review. Group A is approved-by-construction (every claim is verified league data). **Group B requires commissioner sign-off before seeding.**
**Target:** ~30 lines at M1. See `17 §3`.

---

## How these work

Each line is a `content_entries` row:

| Field | Value |
|---|---|
| `kind` | `tony_line` |
| `surface` | `parlor_greeting` |
| `required_tags` | The derived tags a manager must hold to be eligible |
| `template_text` | The line, with `{name}` and occasionally `{days}` |
| `expression` | `neutral` · `pleased` · `unimpressed` |
| `weight`, cooldowns | Standard content-engine fields (`16 §10`) |

**Lines are keyed to tags, never to names.** That keeps them true automatically — if the 2025 champion had been someone else, the same line still lands on the right person. It also means these are seedable before the Sleeper-username-to-manager mapping is finalised.

**Selection is the existing pipeline:** filter by eligibility → cooldown → weight → pick → log. "No line" must remain a valid outcome; when nothing is eligible, fall back to the untagged offseason lines (A13–A16).

### Voice rules applied (`12 §8`)

Short statements. One setup, one turn. Occasional fragments. Dry final tag. No phonetic accent, no Italian caricature, no "mama mia". Confident well beyond the available evidence. Affectionate even when brutal. **No profanity in any of these** — the greeting is the first thing a manager ever sees, and `12 §10` keeps profanity out of onboarding contexts.

---

## Verified facts these draw on

All from the imported 2024/2025 chain. Nothing here is inferred.

| Fact | Source |
|---|---|
| 2025 champion won the title at **7–7** | Winners bracket + roster record |
| The **11–3** team with the **most points (1868.7)** did not win | Roster settings |
| Second-most points (1859.7) finished **9–5** | Roster settings |
| One manager faced **1776.2 points against** — most in the league — and went 3–11 | Roster settings |
| One manager scored **1430.3** — fewest in the league | Roster settings |
| 2024 champion | Winners bracket |
| Roster 4 has had three different occupants across 2024/2025/2026 | Chain import |
| The 2026 newcomer has no prior season | Chain import |

---

# Group A — Verified

Safe to seed as-is. Every factual claim traces to imported data.

### Champion lines

**A1** · `champion_2025` + `title_at_500_or_worse` · *unimpressed*
> Morning, {name}. Seven and seven. And a ring. Tony has reviewed the tape and has questions.

**A2** · `champion_2025` · *pleased*
> {name}. Defending champ walks in and doesn't even hold the door. Fine.

**A3** · `champion_2025` · *neutral*
> {name}. Trophy's yours until September. Enjoy the quiet part.

**A4** · `champion_2024` · *pleased*
> Morning, {name}. Still the only reason anybody brings up 2024 in here.

**A5** · `champion_2024` + `not_champion_2025` · *neutral*
> {name}. One ring, one year removed. Tony's not calling it a drought. Tony's noting the date.

### The unlucky

**A6** · `most_points_2025` + `never_champion` · *unimpressed*
> {name}. Eighteen sixty-eight. Most points in the league. No ring. Tony's seen fairer ovens.

**A7** · `best_record_2025` + `never_champion` · *unimpressed*
> Eleven and three, {name}. Best record in the building. Somebody else has the trophy. Tony won't bring it up again. Probably.

**A8** · `high_points_low_wins` · *neutral*
> Morning, {name}. Second most points in the league. Nine and five. Somebody upstairs doesn't like you.

**A9** · `most_points_against_2025` · *neutral*
> {name}. Seventeen seventy-six thrown at you last season. That's not a schedule. That's a grudge.

### The rough seasons

**A10** · `fewest_points_2025` · *unimpressed*
> Morning, {name}. Fewest points in the league last year. Tony isn't judging. Tony is aware.

**A11** · `worst_record_2025` · *unimpressed*
> {name}. Three and eleven. The oven's been through worse. Not much worse.

**A12** · `missed_playoffs_both_seasons` · *neutral*
> {name}. Two seasons, no January. Tony's holding a booth for you anyway.

### Offseason — untagged fallbacks

These require no tags and are always eligible. They exist so the selector always has something, and so a manager with no distinguishing history still gets a real line.

**A13** · *neutral*
> Morning, {name}. Shop's closed, ovens are cold, nothing's happened since December. Come back in September.

**A14** · *unimpressed*
> {name}. It's July. Tony's doing inventory. There is no inventory.

**A15** · `{days}` · *neutral*
> Morning, {name}. {days} days until it matters again. Tony's counting. Tony's always counting.

**A16** · *neutral*
> {name}. Nothing on the board, nothing in the case, nobody downstairs. Tony's just glad somebody came by.

### The newcomer

**A17** · `newest_manager` · *neutral*
> You're the new one. Tony's collecting evidence.

**A18** · `inherited_slot` · *neutral*
> {name}. Fourth roster. Two guys had that seat before you. Neither left a note.

**A19** · `newest_manager` · *neutral*
> {name}. No record, no history, no opinions yet. Tony finds that restful.

> Zack receives **only** neutral, event-based lines until real history accumulates (`11 §13`). A17–A19 invent no temperament, no competence, and no permanent verdict.

### Title drought

**A20** · `never_champion` + `two_plus_seasons` · *neutral*
> Morning, {name}. Two seasons on that wall. Neither of them yours. There's still time. Allegedly.

**A21** · `made_playoffs_2025` + `never_champion` · *neutral*
> {name}. You got in last year. Then you didn't. Tony remembers both parts.

---

# Group B — Canon-based · **needs commissioner approval**

These draw on the approved character canon in `11`, not on imported data. The canon is approved as *canon*; putting it in Tony's mouth on the first screen a manager ever sees is a separate call. **Do not seed without sign-off.**

**B1** · `no_trades` · *unimpressed*
> {name}. Tony checked the ledger. You have never made a trade. The ledger is very short.

**B2** · `most_trades` · *pleased*
> Morning, {name}. Three trades before breakfast and the season hasn't started. Tony admires the commitment. Tony questions the judgment.

**B3** · `commissioner` · *pleased*
> {name}. The man with the keys. Tony assumes everything's above board and asks nothing further.

**B4** · `collector` · *neutral*
> Morning, {name}. Case is empty. Tony knows. Tony can feel you looking at it.

**B5** · `gambler` · *neutral*
> {name}. Nothing to bet on in July. Tony's sorry. Genuinely, this time.

**B6** · `complainer` · *unimpressed*
> Morning, {name}. Before you start — Tony already knows the schedule was unfair.

**B7** · `decisive_trader` · *pleased*
> {name}. Tony had an offer for you. You'd have already answered. Wrong, probably, but fast.

**B8** · `lions_fan` · *neutral*
> {name}. Preseason's coming. Tony's optimistic. Tony's always optimistic. It's a problem.

**B9** · `young_trash_talker` · *unimpressed*
> Morning, {name}. Loudest man in the building. Zero trophies in the building belong to him. Tony finds this funny.

**B10** · `bapple` · *neutral*
> {name}. Nothing's growing out back. Tony checked. Tony checks every year.

> B10 gestures at the joke without explaining it (`13 §2`). If it doesn't land instantly for the person receiving it, cut it rather than expand it.

---

## Tags to derive

Computed from imported history. Booleans, recomputed on import and after each finalised week.

**From season outcomes**
`champion_2024` · `champion_2025` · `not_champion_2025` · `never_champion` · `two_plus_seasons` · `made_playoffs_2025` · `missed_playoffs_both_seasons`

**From records and scoring**
`best_record_2025` · `worst_record_2025` · `most_points_2025` · `fewest_points_2025` · `most_points_against_2025` · `high_points_low_wins` · `title_at_500_or_worse`

**From roster continuity**
`newest_manager` · `inherited_slot`

**From canon (`11`), commissioner-set rather than derived**
`commissioner` · `no_trades` · `most_trades` · `collector` · `gambler` · `complainer` · `decisive_trader` · `lions_fan` · `young_trash_talker` · `bapple`

### Template variables

| Variable | Source |
|---|---|
| `{name}` | `users.display_name` |
| `{days}` | Days until season start, from the injected clock (`lib/clock.ts`) |

A line whose variables cannot all be resolved is **skipped, never rendered with a gap** (`05 §2.3`).

---

## Unresolved — needs the commissioner

**Sleeper username → manager mapping.** Four 2025 accounts are not confidently mapped to the canon names in `11`:

```
RonJonathan     11-3, 1868.7 PF   (best record, most points, no ring)
Tupaz11          9-5, 1699.4 PF
imbrickedup22    4-10, 1770.0 PA
jfletcher433     3-11, 1776.2 PA  (most points against)
```

Confidently mapped: `BigJuncer` → Alex · `MattyB2317` → Matty B · `MattLee04` → Matt Lee · `cheeseking` → Cheese · `SuggMyNick` → Nick · `NateyDee` → Nathan.

The remaining four are Ryan, Brandon, Joe, and the Topouzian account in some order — **not guessed here.** Group A lines do not depend on the mapping, since they key on tags. Group B lines do: `no_trades` and `complainer` must land on the right person or the joke is simply wrong about someone.
