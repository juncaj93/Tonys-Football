# PRESEASON_SLICE_BOUNDARY.md — the draft-review special

**Status:** built. **Canonical account** of the preseason Tuesday Slice: what it is, what it may say, who says it, and what it will never do.

Read with `PROJECT_SPEC/16_FINAL_RECONCILED_PLAN.md §9` (the Slice pipeline and the approval gate), `docs/SLICE_REVIEW_BOUNDARY.md` (the review chain), and `docs/IN_SEASON_SYNC_BOUNDARY.md` (why a drafted-but-unplayed week is not stored).

---

## 1. The gap this closes

`16 §4.3`'s Tuesday chain recaps **the week that just closed**. On the Tuesday before the opener there is no week: `factPacket` refuses with `no-week`, the press desk stays empty, and the league's first ever issue is the one that never printed.

That is not a defect in the weekly pipeline — it is correct about a season that has not started. What was missing was a second kind of paper for the one Tuesday that has no week behind it.

The commissioner's ruling: the first 2026 issue is a **Draft Review and Season Preview**, published after the league drafts and before week one finalizes.

---

## 2. It is one architecture, not two newspapers

```
                      ┌── weekly:    lib/stats → factPacket ──┐
                      │                                        ├─► renderEdition ─► Edition
                      └── preseason: draft facts + Tony's ─────┘
                                     grades → preseasonPacket
                                                                      │
                                      slice_issue_versions ◄──────────┘
                                              │
                          the SAME chain: draft → submit → approve → publish → the rack
```

Everything downstream of the packet is shared. A preseason issue is an `Edition`, stored in `slice_issue_versions`, hashed the same way, approved by a person the same way, served by `rackIssue`. Every guarantee from `0011` applies because it **is** one of those issues: immutable content, one published version, mandatory named approval, the manual hold.

What is new is one packet builder (`lib/slice/preseason.ts`), one fact layer (`lib/slice/draft-facts.ts`), one editorial store (`lib/slice/preseason-reviews.ts`) and one renderer. There is no second publication path, no second validator and no second archive.

### The discriminator is an optional field, and that is deliberate

`Edition.preseason` is optional and absent on every weekly issue. `canonical()` drops `undefined`, so **every weekly issue already published hashes to exactly what it hashed to before this existed**. A required `kind` on `Edition` would have moved all of them, and a version's hash is what a commissioner's approval names.

`slice_issues.kind` records the same fact in a column, so a query never has to open the JSON.

### Week zero

The preseason issue is `week = 0` — a slot, never a printed number. It is what lets both kinds share `slice_issues`' existing `UNIQUE(season_id, week)` **untouched**: weekly issues are week ≥ 1. Two CHECKs make the pairing exact in both directions (`slice_issues_preseason_is_week_zero`), so `(weekly, 0)` and `(preseason, 3)` are equally unwritable.

No surface prints the zero. The dateline says `Season 2026 · Preseason` under a masthead flag reading `Draft review` — two different facts, *when* and *what kind*, rather than the same two words four rows apart. The queue row says `Draft review`; the review screen's heading says `Season 2026 · Draft review`.

---

## 3. Eligibility is product state, never the calendar

A calendar rule would publish a draft review on a fixed Tuesday whether or not anybody had drafted, and would keep the preseason mode alive into October if the arithmetic were a week out.

`preseasonEligibility` asks four questions, each of a table that owns it:

| Condition | Read from |
|---|---|
| the season is open | `seasons.finalized_at IS NULL` |
| the draft is complete, with picks | `season_drafts.status` — Sleeper's own word |
| no week has been closed | `week_finalizations` is empty for the season |
| no result is stored | `fantasy_matchups` holds nothing for the season |

**The last two are both checked and neither is redundant.** Matchups with no finalization is the ordinary Sunday-to-Tuesday state, and it is exactly where the preseason mode must not reappear.

The **reviews** are deliberately not part of eligibility. *"Is this the preseason"* and *"has Tony finished writing"* are different questions, and the desk has to be able to show the second one — a board that said *"not eligible"* because a grade was missing would tell the commissioner nothing about what to do next.

---

## 4. What is objective, and where it comes from

`lib/slice/draft-facts.ts` reads `season_drafts` and `draft_picks`, which are Sleeper's, and **produces data rather than sentences**. The phrasing is the renderer's, for the same reason `render.ts` writes the weekly sentences: a fact layer that also phrased things would be marking its own homework.

Stated on the page, all countable:

- the draft's round count, and when the last pick landed;
- every manager's picks in board order, with `1.01`-style labels;
- their draft slot, their positional counts, the round they took a quarterback;
- a position they loaded up on early — only when it took ≥ 3 of their first 5 picks;
- who went first overall; what round one was made of, only when one position took at least half of it; which round the first defense went in.

**Never inferred, and never will be:** ADP · reach · steal · sleeper · bust · value · projected points · projected finish · winner of the draft · loser of the draft. Every one needs a comparison source this product does not have, and inventing a plausible one would put a fabricated football fact on the page in the same typeface as a real one.

**Guarded rather than hedged.** An observation whose condition fails is *absent*. A page that says *"one wide receiver went in round one"* has told the reader nothing and cost them a line.

**The publication boundary applies.** Active managers only, through `activeLeagueManagers` — a retired manager who drafted in a season they then left is a true fact and not a printable one.

---

## 5. What is editorial, and how it is checked

**Tony's grade and Tony's take are opinions.** The commissioner types them; the paper prints them as Tony's; nothing that reaches a reader says a person supplied them. `slice_draft_reviews.updated_by` records who typed it and is visible only on the desk.

### Why the software never grades

A draft grade needs ADP, projections or a value model. This product has none, on purpose. A grade the software computed would be the interface deriving a fantasy judgement for itself, which `MANDATE §9` puts beyond it — and it would assert *"B+"* in the same typeface a score is asserted in. **This is a permanent product decision, not a gap waiting for a model.**

### Two rules for two kinds of prose

| Prose | Number & name scan | Banned terms & quotes |
|---|---|---|
| everything the renderer built | **blocks** | **blocks** |
| `take` and `concern` | **advises** | **blocks** |

Checking a take against a fact packet would refuse Tony his own voice: he is allowed to think the running back room is thin, and no packet will ever contain the word *thin*.

The banned-term half still applies, because `16 §9`'s bans are **product rules rather than renderer rules**: the league has no kickers whoever is typing, win-probability language implies a model that does not exist whoever is typing, an unreleased feature named in print is a promise the shop cannot keep whoever is typing, and a quotation mark is fabricated testimony because nobody in this league said anything on the record. Refused at input, in the editor, with the reason shown.

The number-and-name scan still **runs** on editorial copy and its findings are recorded in the packet as **advisories** — shown on the review screen, never blocking. A reviewer who sees a player listed under a manager who did not draft him has been handed exactly the thing worth a second look.

**To reverse this** would mean deciding that a take may only contain names the draft contains, which forbids Tony mentioning a bye week, another manager's player, or his own oven.

### Tony's best pick is a real pick, of theirs

Chosen from a list of that manager's own picks — so the paper cannot praise a player they did not draft. Enforced twice: the editor offers only their picks, and `slice_draft_reviews_best_pick_is_theirs` is a **trigger**, in exactly the shape `0006` uses for the Showcase. A foreign key can say *"that pick exists"* and cannot say *"that pick is theirs"*.

---

## 6. The human workload

Ten teams, from a phone, without it becoming a chore.

- **One manager per screen.** A ten-team form is a spreadsheet, and a spreadsheet on a phone is a scroll with a keyboard over half of it.
- **The grade is thirteen taps.** A radio grid, not a `<select>` — an iOS picker hides twelve of thirteen behind a scroll, and a grid cannot produce `B+ ` with a trailing space.
- **Save and next** is the primary action, and *next* prefers somebody Tony has not reached — so a second pass to fix one grade lands on the next unwritten one rather than the alphabetical neighbour.
- **Every save is committed on its own.** Nothing is staged, there is no final submit, and four on the bus plus six that evening loses nothing.
- **The draft sits above the fields**, because the grade is a response to it and a form that asked for the verdict first would make somebody scroll back up to check themselves.

Required: grade, take. Optional: best pick, concern — and a manager whose draft had no single highlight does not force one to be invented.

**Readiness:** `Tony's draft board — 7 of 10 reviewed`, on the board and on the press desk. The issue cannot be drafted until every active manager has a grade **and** a take; the print control is *absent* until then rather than present-and-disabled, and its absence at 0 and at 4 is what makes its presence at 10 mean something.

---

## 7. The issue

| § | Section | Source |
|---|---|---|
| 1 | masthead, flag `Draft review`, dateline `Season 2026 · Draft Review` | curated |
| 2 | headline, deck, opening | curated variants, hashed on the season |
| 3 | **Tony's draft board** — ten names, ten grades | editorial |
| 4 | **From the draft room** — rounds, first off the board, round one, first defense | draft facts |
| 5 | **Team by team** — grade · name · slot · take · picks · positional counts · shape · optional aside(s) | both, separated on the page |
| 6 | **For the record** — defending champion | verified history |
| 7 | **Week one** — the fixtures, two names and a word between them | Sleeper's schedule |
| 8 | Tony's column | curated, factless |

The board is **first**, directly under the lede, so a reader who only wants their own grade is done in two seconds without scrolling past ten sections.

Each team section is built the same way so the eye learns the shape once: the grade is the anchor — display type, the paper's red, on the **left** where a scanning eye lands — so ten sections read as a column of grades with detail hanging off them rather than as ten paragraphs.

### Week one is passed in, not read

The schedule exists only in a Sleeper payload the weekly sync **deliberately refuses to store** (`docs/IN_SEASON_SYNC_BOUNDARY.md`: a drafted-but-unplayed week is ten rows at zero points, and storing it would finalize a week nobody played). `lib/sleeper/schedule.ts` reads the *pairing* and not the result, and it is called by the Tuesday job or the commissioner's button — never from a render path. It lands inside the **snapshot** the version stores, which is what every other published sentence in this product is.

No spread. No favourite. No projection.

---

## 8. AI

There is none in this feature. Every sentence is a curated template or a stored fact, and the two editorial fields are typed by a person. `ANTHROPIC_API_KEY` is unset and the issue publishes correctly, which `preseason.test.ts` asserts by producing the whole thing with the variable deleted.

---

## 9. Cron

**No third scheduled job.** `16 §4.3` allows two and this is the second.

The Tuesday job attempts the weekly paper **first**; the preseason issue is what happens when that one *refuses*. That is the honest test rather than a calendar one: `generateDraft` declines with `no-week` or `not-final` exactly when no week has been played, and `preseasonEligibility` then asks whether the league has actually drafted.

It also syncs the draft — two requests, every week rather than on the one week the draft happens, for the reason `grantSeasonalBoxes` runs every week: a job that fired only on the right week would silently skip a retry, a redeploy, a league that drafted on a Wednesday, and an environment seeded afterwards. Idempotent through `UNIQUE(draft_id, pick_no)`.

**It does not publish.** `submit: true`, the draft lands on the press desk and stops. `16 §9`'s approval gate has no preseason exemption and there is no parameter that creates one.

---

## 10. Historical integrity

A grade is **mutable** — that is the workflow — and the historical guarantee comes from somewhere stronger. Publication snapshots the rendered edition into `slice_issue_versions`, whose content is immutable by trigger (`0011`), so editing a grade after publication changes the **next** paper and cannot reach the one already printed. Correcting a printed issue is a new version through the same chain, which leaves both on the record.

A completed draft's picks are immutable outright (`draft_picks_immutable`): a re-sync inserts what is missing and never rewrites what is there. If Sleeper's payload ever disagreed with a stored pick, the honest response is that somebody looks — not that the product silently adopts the newer answer.

---

## 11. What is deliberately not built

- **No automated grading model**, ever. §5.
- **No other special editions.** Playoff preview, championship issue and season awards are architecturally reachable — a second `Edition` payload and a second `slice_issue_kind` — and none is built. Reuse is welcome; feature creep is not.
- **No public voting on grades, and no manager self-grading.** Tony is the editorial author.
- **No prose editing of the issue.** Same as the weekly paper (`docs/SLICE_REVIEW_BOUNDARY.md §7`): the controls are approve, reject and regenerate. Regenerating a draft review means going back to the grades, so the review screen sends a refused preseason issue to the board rather than offering a redraft button that would produce identical bytes.

---

## 12. The defect that would have cost the whole season

**The Slice could not draft any week of a live season.** `factPacket` took its
finality from `seasons.finalized_at` — the books, closed in January — rather
than from `week_finalizations`, the per-week record `lib/stats/finality.ts`
introduced and whose own header names the Slice as its second consumer. That
wiring was never done.

The consequence is only visible with a season in motion: the first live Tuesday
would close week one, pay every reward, settle every stake, and then decline to
print the paper with *"that week is still open."* `16 §4.3`'s last step would
have produced nothing from September to January, and the review desk `16 §9`
makes mandatory would have stayed empty for the entire season it governs.

Found twice, independently: the week-8 rehearsal measured it and pinned it
(`docs/WEEK8_REHEARSAL.md §5.1`), deliberately leaving it for whoever owns the
Slice's editorial architecture; this workstream hit it from the other side,
because a preseason issue that hands over to a weekly pipeline which can never
print is not a finished feature.

**Nothing was relaxed.** A week is final when the Tuesday job wrote its
finalization **or** the season closed, and the job writes that row four steps
before it drafts — so the week the paper is about is closed by the time it is
rendered. The approval gate is untouched: what changed is that there is now
something on the desk to approve. The comparison **populations** stay
season-finalized only, because an open season's numbers can still move and a
percentile that shifts under a published fact makes the fact retroactively
wrong.

The rehearsal's test now asserts the repair — eight Tuesdays, eight papers, all
of them waiting on a stamp — where it used to assert the defect.

---

## 13. Two more defects found by looking

**`MetadataStrip` dropped every attribute passed to it.** It named the four props it wanted and discarded the rest, so three `data-` markers written for gates — the press desk's docket, the draft board's progress count and its draft status — were in the source, looked correct in review, and **did not exist in the DOM**. Found because a new gate queried one and timed out; the older one had been decoration since it was written. Every other primitive on that sheet already spread.

**The name scanner refused the league's own draft board.** A real player name is not two clean words: `Ja'Marr Chase` scans as `Ja`, then the pair `Marr Chase`; `Amon-Ra St. Brown` scans as `Amon`, `Ra St`, `Brown`. Every piece is in the packet — they came out of stored picks — and the *pair* is an artefact of how the scanner walks the string. `validate.ts` now permits a multi-word match whose parts are each permitted, which is the right rule rather than a workaround: the question it asks is *"was that permitted"*, and a pair of separately permitted words is permitted. A pair containing one unknown word is still refused.

---

## 14. After the real draft — the whole of Alex's job

1. Open `/admin/slice/draft`.
2. Tap **Pull the draft**. (Or wait: the Tuesday job does it.)
3. Tap the first name. Tap a grade. Type a sentence. Optionally pick a favourite and name a concern. Tap **Save, and next**.
4. Repeat until the board reads `10 of 10`.
5. Tap **Print a draft review**. Read the paper as it will print.
6. Approve — or reject with a reason, fix the grade, and print again.
