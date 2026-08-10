# 07 — AI Story Engine and Fantasy Event Analysis

**Version:** 2.0  
**Status:** Canonical specification  
**Primary question:** How does the system convert verified league activity into a ranked set of true story candidates?

---

## 1. Purpose

The Story Engine identifies what mattered in the league.

It is not a writing model. It is a deterministic analysis pipeline that:

1. ingests verified data;
2. derives structured events;
3. evaluates context;
4. generates story candidates;
5. scores and ranks them;
6. prepares a fact packet for Tony’s Tuesday Slice.

The language model may later turn approved fact packets into prose. It must not discover facts by guessing or freely browsing application data.

Core pipeline:

> Sleeper and application events → normalized database → deterministic analysis → candidate facts → ranking → AI writing → validation → approval → publication

---

## 2. Separation of Responsibilities

### 2.1 Data layer

Responsible for:

- Sleeper sync;
- application event records;
- token ledger;
- collectibles;
- casino summaries;
- manager and season mapping;
- historical snapshots.

### 2.2 Analysis layer

Responsible for:

- matchup calculations;
- projection comparisons if reliable projection data exists;
- play-everyone record;
- lead changes;
- Monday-night state;
- trade lineage;
- rivalry context;
- historic rankings;
- significance thresholds;
- candidate scoring.

### 2.3 Generative writing layer

Responsible only for:

- headline options;
- story prose;
- Tony-style framing;
- transitions;
- comedic wording.

It may use only the supplied fact packet and approved canon context.

### 2.4 Validation layer

Responsible for:

- checking every factual claim;
- rejecting unsupported numbers;
- verifying identities and relationships;
- checking prohibited content;
- ensuring story count and length;
- confirming no kicker references;
- confirming no fabricated quotations.

---

## 3. Inputs

Required inputs may include:

- league settings;
- weekly matchups;
- roster points;
- starter and bench points;
- player metadata;
- transaction history;
- trade participants and assets;
- weekly standings snapshots;
- season-to-date standings;
- historical season summaries;
- manager identities and aliases;
- known rivalries;
- approved lore tags;
- prior published stories;
- token-ledger summaries;
- significant casino events;
- collectible pulls;
- feature launches and commissioner announcements.

Every input record must include source and timestamp.

Projection-based stories must be omitted if projection data is unavailable, stale, or inconsistent.

---

## 4. Event Normalization

Raw provider data must be transformed into stable internal event records.

Example event types:

- `matchup_finalized`;
- `weekly_high_score`;
- `large_margin_result`;
- `lead_change`;
- `monday_comeback`;
- `monday_collapse`;
- `bench_outperformance`;
- `trade_completed`;
- `trade_revenge_candidate`;
- `record_change`;
- `playoff_odds_swing`;
- `historic_score`;
- `casino_net_swing`;
- `legendary_collectible_pull`;
- `auction_result`;
- `feature_announcement`.

Each event should include:

- event ID;
- season;
- week;
- occurred time;
- source;
- involved managers;
- involved players or objects;
- verified numeric facts;
- comparison baseline;
- confidence;
- deduplication key;
- analysis version.

Events must be idempotent. Re-running the pipeline must not create duplicates.

---

## 5. Candidate Generation

A story candidate is not automatically a story.

Each candidate contains:

- candidate ID;
- primary event;
- related events;
- factual summary;
- involved managers;
- candidate category;
- significance metrics;
- context tags;
- humor opportunities;
- approved lore options;
- unsupported or missing context;
- score breakdown;
- eligible publication week;
- candidate status.

Candidates may be merged when several events describe the same narrative.

Example:

- a Monday comeback;
- a rivalry matchup;
- a playoff-seeding swing;
- a historic player score;

may become one major candidate rather than four repetitive stories.

---

## 6. Scoring Model

The score should be transparent and configurable.

Suggested dimensions, each normalized to a documented range:

- **Fantasy impact:** effect on win, standings, playoffs, or season.
- **Rarity:** how unusual the event is relative to league history.
- **Entertainment value:** measurable drama, reversal, extremity, or absurdity.
- **Personality connection:** relevance to established manager canon or rivalry.
- **Historical significance:** record, streak, championship context, or long-term callback.
- **Freshness:** whether similar stories were recently published.
- **Data confidence:** completeness and reliability of underlying facts.

A candidate should not rank highly solely because it offers an easy joke.

### 6.1 Penalties

Apply penalties for:

- duplicate narrative;
- recent overuse of the same manager;
- recent overuse of the same category;
- low data confidence;
- arbitrary “largest of the week” claims without significance;
- weak contextual relevance;
- reliance on missing projections;
- dependence on an inside joke still on cooldown.

### 6.2 Diversity constraint

The final set should represent the week, not simply the five highest raw scores.

Selection should consider:

- manager distribution;
- category distribution;
- positive and negative stories;
- primary versus secondary importance;
- repetition from recent issues.

Diversity must not force weak stories into publication. Publishing fewer than five stories is acceptable.

---

## 7. Required Candidate Categories

### 7.1 Meaningful blowout

Margin alone is not enough.

Suggested starting guidance:

- under 20 points: normally ignore;
- 20–39.99: candidate only with context;
- 40–59.99: strong candidate;
- 60 or more: headline-level candidate.

Thresholds must be configurable and evaluated against league scoring norms.

> **SUPERSEDED on the numbers — COMMISSIONER RULING, 2026-08-10 (R1).**
>
> The four bands above are **not** the thresholds. They were a starting
> suggestion, and the sentence immediately above them — *evaluated against league
> scoring norms* — is what was actually carried out.
>
> Measured over the **162** real finalized games of 2024 and 2025, the median
> margin is **~20.6** and **~54%** of games clear 20. A bare `>= 20` therefore
> labels half the league a blowout, which is a synonym for *a game happened*
> rather than a classification.
>
> **`lib/stats/significance.ts` is the authority**: every absolute floor here is
> kept verbatim and each tier above `beat` additionally requires a league-relative
> percentile. **No subjective AI classification of blowouts, and no thresholds
> that move week to week.** Recalibration is an intentional, documented product
> decision, never a silent change to what history meant.
>
> **This question is closed. Do not reopen the 20 / 40 / 60 bands as unresolved.**
> `docs/HISTORICAL_ANALYSIS_BOUNDARY.md §9` · `docs/TECH_LEAD_OPERATING_MODEL.md §8`

Context that raises importance:

- rivalry;
- playoff race;
- previously undefeated team;
- revenge matchup;
- historic margin;
- manager publicly favored in prior issue.

Do not claim “the biggest blowout” unless the comparison is verified.

### 7.2 Heartbreak and comeback

Potential signals:

- lead entering Monday;
- final reversal;
- narrow final margin;
- one player producing the deciding swing;
- high win-probability change if a reliable model exists;
- playoff impact;
- rivalry.

Do not invent live win probabilities. Use actual recorded scores and timestamps or clearly labeled deterministic estimates.

### 7.3 Trade revenge

A player traded away may create a candidate when that player later materially affects the former manager.

The engine must track:

- exact trade;
- date;
- former and current roster;
- matchup relation;
- performance;
- time since trade.

A revenge story is strongest when:

- the player directly faces the former manager;
- the performance is significant;
- the result changes the matchup;
- the trade is recent or historically notorious.

Do not treat every good game by a traded player as revenge.

### 7.4 Rivalry moment

Rivalries must come from commissioner-approved canon or accumulated verified history.

Signals:

- direct matchup;
- playoff elimination;
- season sweep;
- repeated close results;
- trade dispute or friendly rivalry already in canon;
- championship rematch.

The engine cannot invent a rivalry because two teams happened to play.

### 7.5 Luck or fraud

Use “fraud” as Tony-style editorial framing around transparent metrics.

Possible measures:

- actual record versus play-everyone record;
- points for versus record;
- close-game record;
- opponent scoring;
- expected wins from a documented method.

The fact packet must include the metric and calculation. Tony may joke, but the UI or article should not imply the label is an objective truth.

> **RESOLVED — COMMISSIONER RULING, 2026-08-10 (R2).**
>
> This section and `docs/DATA_AUDIT.md §9` disagreed: §9 listed all-play records
> as *"not recommended"*. Resolved in favour of keeping it, **as the neutral half
> only**.
>
> Play-everyone is permitted as a **secondary contextual measurement**, explicitly
> labelled and derived from the same verified eligible games. Verified Sleeper
> results remain authoritative. It is **not** an alternative standings system, a
> replacement for wins and losses, a *"true record"*, a luck ranking, a
> manager-quality ranking, a fraud detector, or evidence anybody *deserved* a
> different record.
>
> `lib/stats/luck.ts` ships the measurement and a **signed difference**, and
> nothing else — no `fraud` field, no luck score, no ordering by desert. The
> editorial layer may note the contrast; it may not make a factual claim about
> luck, skill, fraud or deservingness out of it.
>
> A week whose data integrity makes the comparison unreliable is excluded
> **whole**, never made asymmetric.
>
> `docs/HISTORICAL_ANALYSIS_BOUNDARY.md §9` · `docs/TECH_LEAD_OPERATING_MODEL.md §8`

### 7.6 Legendary performance

Potential triggers:

- historic weekly team score;
- top historical individual starter performance;
- record-breaking margin;
- season-defining streak;
- improbable lineup success.

Historical claims require complete historical coverage. If old data is incomplete, use limited wording such as “highest recorded since 2024.”

### 7.7 Bench crime

Compare bench production to plausible starter alternatives.

Avoid simplistic claims that assume hindsight-perfect lineup construction.

A candidate may be created when:

- a benched player substantially outscored a starter at an eligible position;
- the difference could have changed the result;
- the choice was legal under lineup rules;
- injury or inactive status does not invalidate the comparison.

Suggested starting thresholds:

- under 15 points: ignore;
- 15–24.99: weak;
- 25–39.99: candidate;
- 40 or more: major candidate.

### 7.8 Casino story

Casino stories should use aggregated and thresholded application events.

Eligible examples:

- major net gain;
- major net loss;
- jackpot;
- unusual streak;
- new game launch.

Do not publish every wager or encourage chasing losses.

Thresholds should scale to the seasonal token economy.

### 7.9 Collectible story

Eligible examples:

- legendary pull;
- first owner of an item;
- completed themed set if set mechanics exist;
- rare auction result;
- noteworthy basement display.

Do not turn ordinary common or rare pulls into weekly editorial filler.

### 7.10 Content announcement

Feature or seasonal announcements may enter the Gazette when meaningful.

They must be commissioner-authored or based on an active deployment/feature flag. The AI cannot announce an unshipped feature.

---

## 8. Monday-Night Analysis

The system should preserve weekly scoring snapshots when possible.

To identify a legitimate Monday story, store:

- score before Monday games;
- eligible remaining starters;
- final score;
- deciding player;
- lead change;
- final margin.

If reliable snapshots are unavailable, do not reconstruct them from memory or present a comeback as fact.

---

## 9. Historical Context

Historical context should be generated from a structured memory store, not model recollection.

Eligible memories:

- championships;
- playoff meetings;
- notable trades;
- league records;
- prior Gazette stories;
- recurring rivalry results;
- first legendary pulls;
- major casino moments;
- manager turnover.

Each memory needs:

- source;
- date or season;
- confidence;
- involved entities;
- factual statement;
- publication history.

AI may reference only memories explicitly included in the fact packet.

---

## 10. Inside-Joke and Character Context

For each candidate, retrieve only relevant approved context.

Context packet may include:

- manager profile summary;
- Tony relationship;
- rivalry;
- eligible active lore;
- recent lore usage;
- restrictions;
- cooldown status.

The model must not receive the entire lore database by default. Smaller targeted context reduces accidental overuse and contradiction.

No context should be injected for Zack beyond verified events and approved neutral traits until his canon develops.

---

## 11. Fact Packet Contract

Each proposed story sent to the writing model should use a structured schema.

Example fields:

```json
{
  "candidate_id": "string",
  "category": "monday_comeback",
  "season": 2026,
  "week": 7,
  "verified_facts": [
    {
      "fact_id": "f1",
      "statement": "Alex defeated Ryan 142.4 to 141.8.",
      "source_record_ids": ["..."]
    }
  ],
  "allowed_inferences": [
    "The final margin was less than one point."
  ],
  "prohibited_claims": [
    "Do not state a win probability."
  ],
  "character_context": [],
  "eligible_lore": [],
  "tone": "major-story",
  "max_words": 220
}
```

The prose output should return claim references or a structured claim list to support automated checking.

---

## 12. Validation

Validation occurs after generation and before commissioner review.

### 12.1 Structural validation

Check:

- valid JSON or required output schema;
- story count;
- title and body presence;
- length;
- no duplicate candidate;
- allowed categories;
- correct issue week.

### 12.2 Claim validation

Every number, player, manager, result, record, and historical statement must match an approved fact.

Unsupported claims fail the story.

Do not rely on a second language-model pass as the only fact checker. Use deterministic comparison wherever possible.

### 12.3 Language validation

Check for:

- kicker references;
- prohibited phrases;
- invented quotes;
- protected or sensitive content;
- stale/retired lore;
- cooldown violations;
- excessive repetition;
- references to unreleased features.

### 12.4 Failure behavior

If a story fails:

1. report the exact unsupported claim;
2. attempt one constrained regeneration if configured;
3. revalidate;
4. otherwise remove the story or return it for manual editing.

Never publish an unvalidated fallback.

---

## 13. Human Approval

During the first season, every issue requires commissioner approval.

Admin workflow:

- view ranked candidates;
- inspect score breakdown;
- include/exclude candidates;
- regenerate one story with locked facts;
- edit text;
- view claim validation;
- preview issue;
- approve and publish;
- archive exact published version.

Future automation may reduce manual steps only after a proven accuracy record. The system must retain a manual hold switch permanently.

---

## 14. Observability

Record:

- analysis version;
- data sync version;
- candidate generation run;
- candidate scores;
- selected and rejected candidates;
- generation prompt version;
- model and settings;
- generated output;
- validation errors;
- commissioner edits;
- final published story;
- publication time.

This history is essential for debugging and improving thresholds.

---

## 15. Testing

Use a synthetic league and time machine to test:

- ties;
- stat corrections;
- incomplete weeks;
- trade reversals;
- manager turnover;
- missing projection data;
- Monday lead changes;
- extreme blowouts;
- duplicate syncs;
- no meaningful stories;
- multiple candidates involving one manager;
- missing historical coverage;
- inactive players;
- defense scoring;
- no kickers.

Golden test fixtures should assert both candidate facts and score behavior.

---

## 16. Acceptance Criteria

The Story Engine is ready when:

- re-running analysis is idempotent;
- every candidate is traceable to source records;
- category thresholds are configurable;
- no model is needed to calculate a fantasy fact;
- fact packets contain only approved context;
- historic claims disclose coverage limits;
- duplicate narratives merge;
- candidate rankings are inspectable;
- weak weeks may publish fewer stories;
- commissioner can override selection without altering facts;
- validation blocks unsupported claims;
- the engine correctly understands the league has defenses and no kickers.

---

## 17. Final Principle

The Story Engine does not ask, “What statistics can we mention?”

It asks:

> “What truly happened this week that this league will care about—and can every part of it be proven?”
