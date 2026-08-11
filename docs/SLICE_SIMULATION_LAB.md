# The Tuesday Slice simulation lab — the canonical account

**This is the boundary document for `lib/simulation/`.** It records what the lab
is, what the three scenarios showed, and — separately and explicitly — what the
lab observed and deliberately did **not** repair.

`docs/evidence/slice-simulation/` is the **generated** evidence: the reports and
the photographs of what actually printed. `npm run simulate -- all` rewrites the
reports and `npm run simulate:shots` rewrites the pictures. This document is the
reasoning; those are the receipts.

---

## 1. The question, and why nothing already answered it

Every Slice anybody has looked at was one of two things:

| | |
|---|---|
| a real week of **2024 or 2025** | `rackIssue`'s historical fallback, and `?edition=blowout` and friends |
| a **hand-written week rendered in memory** | `lib/slice/editions.ts` — scores in a literal, never in a database |

Both are useful and neither answers the commissioner's question, which is about
a season the product has actually *played*:

> What does Tony's Tuesday Slice feel like when this league has stories — after
> a draft, at midseason, and in the bracket?

The rehearsals get close and are aimed elsewhere. `docs/WEEK_1_REHEARSAL.md`
asks whether the chain survives a week; `docs/WEEK8_REHEARSAL.md` asks what
seven Tuesdays leave behind; `docs/PLAYOFF_REHEARSAL.md` asks what the
postseason settles. All three are about **correctness**. None of them prints the
paper and looks at it.

So this is a lab, not a fourth rehearsal.

---

## 2. The one rule

```
   fake input data  →  REAL derivation  →  REAL drafting rules  →  REAL issue
```

`lib/simulation/scenarios.ts` supplies scores, a bracket and ten grades.
**Everything downstream is the shipping code**, called the way the deployed
routes call it — `runSundayJob`, `runTuesday`, `generateDraft`,
`generatePreseasonDraft`, `reviewDetail`, `approveVersion`, `publishVersion`.

`lib/simulation/lab.ts` composes those calls and records what came out. It
formats nothing, classifies nothing, counts no wins of its own — the standings
in every report come from `standingsThrough`, because `MANDATE §9` makes
`lib/stats` the sole authority and a lab with its own arithmetic would be a
second answer to a question that already has one.

**No prose was written to make a demo look good.** Not a headline, not a deck,
not a lead story, not a column. The only editorial text anywhere in this
workstream is the ten preseason grades, which are an *input* in exactly the way
they are an input to the product — and they are `DEMO_REVIEWS`, reused from the
draft-board demo states rather than copied, so this repository holds **one** set
of fixture editorial.

### A refusal is a result

Where the product declines to say something, the record keeps the refusal in the
product's own vocabulary and the report prints it under a heading of its own —
*"What Tony refused to say"* — with the same weight as the paper. That half of
the exercise turned out to be the more valuable one. §6.

---

## 3. Nothing here is a new scoreboard

All three scenarios reuse a fixture that already exists and is already the
canonical one for its shape:

| Scenario | Input | Owned by |
|---|---|---|
| **preseason** | the recorded **2025 draft**, 160 real picks, re-seated onto this season's rosters (`lib/demo/draft-fixture.ts`) | `docs/PRESEASON_SLICE_BOUNDARY.md` |
| **week 8** | `MIDSEASON_GAMES` — forty games, eighty scores, frozen | `docs/WEEK8_REHEARSAL.md §11` |
| **week 16** | `WEEK_16_SCRIPT` — fourteen weeks and a bracket that advances | `docs/PLAYOFF_REHEARSAL.md` |

`WEEK8_REHEARSAL.md §11` says the scoreboard is that file's deliverable and the
plumbing around it is not, so the lab **consumes** it. A midseason league with a
different forty games would be a second answer to *"what does week 8 look
like"*, and the first time the two disagreed nobody would know which was the
product.

The one reshaping is mechanical: `MIDSEASON_GAMES` is turned into a
`SeasonScript` so the rehearsal harness can play it. The fixture carries **one**
score line per game, so `preMonday` equals `final` and no Monday comeback is
derivable from any of the three — which is a property of the input, stated on
every report, rather than a limitation of the product. Week 1's rehearsal is
where the comeback lives.

---

## 4. Isolation — four layers, none of them an environment variable

1. **Its own database.** `scripts/simulate-shots.mts` refuses `tonys_dev`,
   `tonys_test` and `tonys_visual` by name and every hosted host by pattern.
   `tonys_sim` is the lab's.
2. **It truncates before it starts.** Same guard `scripts/rehearse.ts` carries,
   for the same reason: the rule was broken once and a preview dataset was
   destroyed.
3. **Nothing in `app/` imports `lib/simulation/`**, so none of it is in a bundle
   and no route can reach a simulated fact. No preview parameter was added, no
   demo state was added, and `?edition=` gained no keys.
4. **No demo seat and no credential.** The commissioner actor is the league's
   real Alex row, which is who approves in production — so the approval path
   exercised is the production one rather than a privileged shortcut. The
   simulated draft is the one stored artefact and it carries a `demo:` draft id,
   so a database holding one says so in the row.

### Why it is not a demo state, and why that is not a preference

`scripts/visual-qa.mts` applies its states in sequence against **one** database
and loops widths on the outside. A scenario that played sixteen weeks of 2026
into it would leave sixteen closed weeks, forty-odd rewards and a published
issue behind, and every state photographed afterwards would be photographed
against a league that had been somewhere. That is not a regression the gate
would catch — it is a regression the gate would *become*.

So the lab keeps its own database, its own server and its own output directory,
and `ALL_STATES` is untouched.

### The approval boundary is not weakened anywhere

The cron ends at `submit: true` in all three scenarios and the record asserts it:
`statusBeforeApproval` is `needs_review` every time. The stamps are
`approveVersion` and `publishVersion` with a named actor, which is the only path
there is — a publication with no recorded approval naming somebody is refused at
a database constraint rather than by this code.

**No simulation shortcut exists that could become a production bypass**, because
there is no shortcut: the lab presses the same two buttons a person presses.

---

## 5. What each scenario produced

The reports carry the full paper. This is the summary.

### Preseason — the draft-review special

The Tuesday job **attempted the weekly paper first and it refused**, which is the
honest test `PRESEASON_SLICE_BOUNDARY §9` specifies rather than a calendar one.
Only then did the preseason mode engage.

| | |
|---|---|
| what printed | `preseason`, week **0** — a slot, never a printed number |
| headline | *Everybody has a team now* |
| board | ten managers, ten grades, `A+` through `F`, first under the lede |
| from the draft room | 16 rounds · first off the board *Ja'Marr Chase — Alex* · *round one: six running backs* · *first defense: 14th round* |
| week one | **five fixtures**, printed as two names and a word |
| validator | passed |
| page | **8,024 px at 390** — about **9.5 screens**. See §6 |

Week one's fixtures are on the page because the scenario serves week 1 the way
Sleeper really serves a drafted-but-unplayed week: ten rows at zero. The sync
**refuses to store it** and the preseason issue reads the same payload for its
*pairings only* — the two behaviours that look contradictory and are not.

### Week 8 — midseason

Seven Tuesdays played first, in order, through the real cron. Not inserted.

| | |
|---|---|
| going in | Matty B and Matt Lee level on wins and **0.60 of a point** apart · Alex 2–5 and the league's highest scorer · Nathan on four straight |
| the Tuesday | closed 5 games · **2 stakes settled** · 6 rewards, 1150 tokens · 2 offers written for week 9 |
| lead | `blowout` — *It stopped being a game* · Matty B 158.90 — Ryan 94.27 |
| also | `nail-biter` (0.42) and `streak` (Nathan, 5) |
| demoted | the nail-biter, *"led 1 issue(s) ago"* — the novelty rule, working, across weeks the cron really played |
| validator | passed |

**The rolling bounty was claimed.** Authored in week 5 against Alex's 149.24 and
beaten in week 8 by Matty B's 158.90 — a wager written before anybody had played
the week that settled it, which is a state only a midseason scenario can reach.

### Week 16 — the semifinal

Fifteen Tuesdays played first, with a bracket that advanced.

| | |
|---|---|
| lead | `nail-biter` — *A hair in it* · Joe 130.97 — Alex 130.55 |
| also | `high-score` — Ryan 162.38 |
| dateline | `Season 2026 · Week 16 · Playoffs` |
| settled | six of the ten final placements; the four deciding a championship correctly did not |
| validator | passed |

---

## 6. What Tony refused to say

This is the half worth reading.

### 6.1 `elimination` cannot be told on the day, and can a week later — **by design**

The most interesting thing the lab found, and it is **correct behaviour**
demonstrated rather than a defect.

`elimination` fires on `season_memberships.final_rank`, which is written from the
bracket's own placement games. Ranks one and two do not exist until the **final**
has been played. So on the Tuesday of the semifinal the story is unavailable —
and the same week, re-assembled after week 17, carries it:

| | On the Tuesday it printed | Re-assembled after week 17 |
|---|---|---|
| lead | `nail-biter` | `nail-biter` |
| kinds available | `nail-biter` · `high-score` | `nail-biter` · `high-score` · **`elimination`** |

`lib/stats/stories.ts` already says this in writing — *"it is retrospective…
making it live needs the bracket itself persisted, which nothing in this product
stores today"* — and `docs/OPEN_ITEMS.md` **G5** declines that persistence for
v1. The lab is the first thing to *show* it.

**The published issue did not move**, and that is asserted: a version's content
is immutable by trigger, so a fact recorded later produces a **new** version
rather than editing one somebody approved.

### 6.2 Nothing on a playoff paper says which round it is

Week 16's board prints five games in one list. Two are semifinals, one is the
fifth-place game and two are consolation finals, and the paper cannot tell them
apart — because the product does not store the bracket's structure.

This is **G4** and **G5** exactly: `FOR THE TITLE` is refused on the Tonight
board for the same missing fact. The dateline says `Playoffs` because
`week_type` supports that much and no more.

### 6.3 Tony's Line is absent from every scenario

Correct, and nothing here opened it. `18 §3.4` puts it behind a shut flag, the
job reads the same flag every surface reads, and `MIN_BASIS_TEAM_WEEKS = 12`
would refuse it structurally in week 1 regardless. The lab asserts the absence.

### 6.4 No Monday comeback anywhere

A property of the inputs — all three fixtures carry one score line per game — and
stated on every report rather than left to be noticed. The Sunday leg is still
run for the featured week, because *"the snapshot exists and produced no
comeback"* and *"no snapshot was ever taken"* are different states.

### 6.5 The software still never grades a draft

Asserted over the sections the **renderer** built — the board, the snapshot, the
history, the slot, the positional counts and the shape lines. `adp`, `reach`,
`steal`, `sleeper`, `bust`, `project` and `value` appear in none of them. `take`
and `concern` are excluded from that scan deliberately: they are the
commissioner's words in Tony's voice, and forbidding a vocabulary there would
forbid Tony an opinion (`PRESEASON_SLICE_BOUNDARY §5`). They are not unchecked —
the validator's banned-term half still applies, and every issue passed it.

---

## 7. Observations recorded, and deliberately not fixed

**Nothing in the product was changed to make a demo better.** Each of these is
reported with its evidence; none is repaired here.

| # | What | Kind |
|---|---|---|
| 1 | The preseason issue is **8,024 px at 390** — about **9.5 screens** — against 1,680 for a weekly paper. Ten team sections with five picks each. The board is first, so a manager who only wants their grade is done in two taps, which is the mitigation `PRESEASON_SLICE_BOUNDARY §7` designed. Whether the *rest* wants to be that long is a product question | editorial / visual |
| 2 | Week 16's column reads *"An ordinary week, and Tony prints those the same as the other kind."* on a semifinal decided by 0.42. `EditionCharacter` is derived from story strength and knows nothing about the bracket | editorial |
| 3 | Every weekly report carries the skipped line *"The draft has not finished, so nothing was stored."* — the draft sync, correctly refusing the real 2026 `pre_draft` board, every week from September to January. Correct, and it will read oddly on a commissioner's week-16 report | operational clarity |
| 4 | The stakes band can print **`TONY'S CALL · WEEK 18`** beside **`THE BOUNTY · WEEK 17`**. That is a *rolling* bounty behaving exactly as `16 §38` specifies, and the two week labels side by side may read as staleness | editorial |
| 5 | Week 16's regular season is lopsided — 14–0 down to 1–13 — because `WEEK_16_SCRIPT` generates scores from a fixed per-roster strength so the top six separate cleanly. Correct for a bracket rehearsal, and it means the **standings** in that scenario are not a realistic league | simulation input |
| 6 | The ten fixture grades are assigned in **board order** so `A+` through `F` all appear on one page, so a take is not about the manager it lands beside — *"the defending champion drafted like one"* sits under Brandon while the champion is Matty B | simulation input |

Observation 4 also produced an **evidence** defect, found and fixed inside this
workstream: the first photograph pass ran *after* the retrospective had played
week 17, so it captured week 16's paper beside week 18's stakes band. The
photograph pass now stops where the Tuesday morning stops
(`--no-retrospective`), and the reason is written where the flag is.

---

## 8. The gate, and the evidence

`lib/simulation/lab.test.ts` is the gate — **16 assertions against a real
Postgres**. `scripts/simulate.ts` asserts nothing and writes the reports. Two
things that both check would be two places to disagree, and the disagreement
would be invisible because both are green. Same split `scripts/rehearse.ts` uses.

**What the gate pins:** which paper each Tuesday printed; that every issue passed
the deterministic validator; the **kind** of story that led — not its words, so a
copy edit does not fail the build and a calibration change does; that the
midseason league really holds the four conditions its premise claims; that
`elimination` is unavailable on the day and available afterwards; that Tony's
Line is shut; that no draft judgement the software derived reaches the page; that
the cron left every paper at `needs_review` and a **named person** moved it; that
exactly one issue is published per scenario and every other week's draft is still
waiting; that every balance reconciles to its own ledger; and that the report is
rendered from the same record the assertions read.

**What it deliberately does not pin:** the prose. A test that pinned a headline
would fail whenever somebody improved a curated template, which teaches the next
session to edit the test.

### Running it

```
DB_NAME=tonys_sim bash scripts/dev-db.sh reset   # once
DATABASE_URL=…/tonys_sim npm run simulate -- all # the reports
DATABASE_URL=…/tonys_sim npm run simulate:shots  # the pictures
```

`--keep` leaves the database holding the last scenario, so a dev server pointed
at the same `DATABASE_URL` serves `/slice` with that issue on the rack.

---

## 9. What this lab must never become

- **A way to make the product look better.** If a scenario exposes empty
  sections, weak hierarchy, a strange selection or a defect, the finding is
  recorded and the product is left alone.
- **A production surface.** No route, no preview parameter, no demo state, no
  `?edition=` key, no flag. Adding one would put a simulated fact one query
  string away from a manager.
- **A fourth rehearsal.** It asserts the properties of the *lab*; correctness of
  the chain belongs to `lib/rehearsal/` and `lib/slice/midseason-week8.test.ts`.
- **A second scoreboard.** A new scenario writes a `SeasonScript` or reuses an
  existing fixture. It does not fork one.
- **A place where prose is authored.** The ten grades are the only editorial text
  and they are reused, not written here.

Nothing in this workstream changed a Slice rule, a story rule, a validator rule,
a cron schedule, a flag, a migration or a schema. `docs/ACTIVATION.md`'s five
human actions are all unmoved.
