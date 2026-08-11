/**
 * Stories this product cannot prove, and exactly what it would take to prove
 * them.
 *
 * ## Why a registry rather than silence
 *
 * Every entry below is a story somebody will eventually ask for, because each
 * one is *good* — a Monday-night collapse, a traded player burning his old
 * manager, a benching that cost a game. `07` designs all of them. None is
 * derivable from what this database holds, and the failure mode is not that
 * somebody notices: it is that somebody writes a plausible version, it reads
 * perfectly, and nobody can tell.
 *
 * A registry makes the gap **visible and durable**. It says *"we know, here is
 * why, here is the data that would close it"*, so a future session neither
 * rediscovers the gap from scratch nor quietly fills it with a reconstruction.
 *
 * ## The rule each entry encodes
 *
 * `16 §12`: *"Never fabricate. Where a fact is genuinely unavailable, it must
 * stay visibly unavailable."* And `07 §8`, on the one that tempts hardest:
 * *"If reliable snapshots are unavailable, do not reconstruct them from memory or
 * present a comeback as fact."*
 *
 * ## It cannot go stale quietly
 *
 * `unsupported.test.ts` reads `lib/db/schema.ts` and fails if a table an entry
 * names as absent has since been created. An entry that becomes wrong turns the
 * suite red rather than sitting here describing a limitation the product no
 * longer has — which is the failure mode of every "known limitations" document
 * ever written.
 *
 * **This file adds no ingestion and proposes none.** Naming the data that would
 * be needed is not a plan to fetch it; several of these are deliberately
 * deferred elsewhere (`docs/OPEN_ITEMS.md` **E1**).
 */

/** Why the claim cannot be made today. */
export type UnsupportedReason =
  /** The rows do not exist in any table. */
  | 'not-persisted'
  /** The rows exist but do not begin early enough to support the claim. */
  | 'coverage-starts-later'
  /** The data could not distinguish the claim from its opposite. */
  | 'indistinguishable'
  /** It would require a model, and the product has none by rule. */
  | 'requires-a-model';

export interface UnsupportedFact {
  /** Stable key. Cite it when declining a request for the story. */
  readonly id: string;
  /** The story, in the words somebody would ask for it. */
  readonly claim: string;
  /** Where the product design asks for it. */
  readonly designedIn: string;
  readonly reason: UnsupportedReason;
  /** Why, specifically. One or two sentences a reviewer can check. */
  readonly detail: string;
  /**
   * Tables this entry asserts do **not** exist in the schema.
   *
   * The test reads these. An entry claiming a table is missing when it is not is
   * a failing test, which is the whole point of listing them.
   */
  readonly absentTables: readonly string[];
  /** What would have to be ingested and stored. Not a proposal to do it. */
  readonly wouldNeed: readonly string[];
  /**
   * The nearest true thing the product *can* say instead.
   *
   * Every entry has one, deliberately. A registry of refusals with no
   * alternatives becomes a list of reasons to give up, and the substitutes here
   * are all already derivable.
   */
  readonly insteadSay: string;
}

export const UNSUPPORTED_FACTS: readonly UnsupportedFact[] = Object.freeze([
  {
    id: 'trade-revenge',
    claim:
      'A player traded away came back and beat his former manager — the trade, the ' +
      'date, and what it cost.',
    designedIn: '`07 §7.3`',
    reason: 'not-persisted',
    detail:
      'Sleeper transactions are fetched and decoded — 961 of them across 2024 and 2025 — and ' +
      'then discarded at persist (`docs/DATA_AUDIT.md §3`). No table holds a trade, its ' +
      'participants, or which roster a player was on in a given week, so there is no lineage to ' +
      'follow. Reconstructing a trade from current rosters is explicitly refused: a player on a ' +
      'roster today says nothing about how he got there.',
    absentTables: ['fantasy_transactions'],
    wouldNeed: [
      '`fantasy_transactions` — every add, drop, waiver and trade with its week and participants',
      'per-week player-to-roster ownership, so "who had him then" is answerable',
      '`fantasy_player_scores` — what the player actually did in the deciding week',
    ],
    insteadSay:
      'the head-to-head series between the two managers, which is derived and carries its own scope',
  },
  {
    id: 'bench-crime',
    claim: 'A manager left the winning points on his bench.',
    designedIn: '`07 §7.7`',
    reason: 'not-persisted',
    detail:
      'Starter and bench composition and per-player scoring are decoded during import and never ' +
      'stored. `fantasy_matchups` holds two team totals per game and nothing beneath them, so ' +
      'there is no way to know who was benched, what they scored, or whether the swap would even ' +
      'have been legal under the lineup rules. `potentialPoints` is decoded and dropped too ' +
      '(`docs/DATA_AUDIT.md` L4).',
    absentTables: ['fantasy_lineups', 'fantasy_player_scores'],
    wouldNeed: [
      '`fantasy_lineups` — starters and bench per roster per week, with positions',
      '`fantasy_player_scores` — per-player weekly points',
      'position eligibility, so an illegal substitution is not reported as a missed one',
      'injury and inactive status, so a player who could not have played is not counted against anybody',
    ],
    insteadSay: 'the final margin, which is exact, and how it ranks in the recorded era',
  },
  {
    id: 'monday-comeback-historical',
    claim: 'A Monday-night comeback in 2024 or 2025.',
    designedIn: '`07 §8`',
    reason: 'coverage-starts-later',
    detail:
      'Monday comebacks **are** supported, and only from the moment the Sunday snapshot job ' +
      'started running. `week_snapshots` holds a pre-Monday photograph per game and ' +
      '`lib/stats/comeback.ts` derives the flip from it — but every imported historical week ' +
      'predates the job, so the archive has no photographs and `weekSnapshot` returns empty. ' +
      'An empty snapshot must be read as *"this cannot be said"*, never as zero.',
    absentTables: [],
    wouldNeed: [
      'a pre-Monday snapshot for the week in question, which cannot be taken retroactively',
    ],
    insteadSay:
      'the final margin and where it sits in the population — a close game is provable, the ' +
      'shape of how it got close is not',
  },
  {
    id: 'monday-remaining-exposure',
    claim: 'How many starters each manager still had playing on Monday night.',
    designedIn: '`07 §8`',
    reason: 'indistinguishable',
    detail:
      "Sleeper's league API carries no NFL schedule, so nothing says which players were yet to " +
      'play. The available proxy — starters sitting on zero points — cannot tell a player who ' +
      'has not kicked off from one who played and scored nothing. ' +
      '`docs/SUNDAY_SNAPSHOT_BOUNDARY.md` records this as unrecordable rather than unrecorded.',
    absentTables: [],
    wouldNeed: [
      'an NFL game schedule with kickoff times, from a source this product does not read',
      '`fantasy_lineups`, to know who the starters were at all',
    ],
    insteadSay: 'the deficit at the snapshot and the final margin, both of which are subtractions',
  },
  {
    id: 'projection-upset',
    claim: 'The underdog won — somebody beat the team they were projected to lose to.',
    designedIn: '`07 §3`, `07 §7.1`',
    reason: 'requires-a-model',
    detail:
      'No projection is fetched, stored, or computed anywhere in this product, and `16 §9` bans ' +
      'win-probability language from the Slice outright — `lib/slice/validate.ts` refuses ' +
      '"odds", "projected to" and "expected wins" as banned terms. `07 §3` also warns that ' +
      'projection-based stories must be omitted where projection data is unavailable or stale.',
    absentTables: [],
    wouldNeed: [
      'stored weekly projections captured before kickoff, with provenance and a staleness rule',
      'a commissioner ruling reopening `16 §9`, which currently forbids the language regardless',
    ],
    insteadSay:
      'the upset by **record** — the manager with three or more fewer wins won — which ' +
      '`lib/stats/stories.ts` already derives, because the only defensible baseline this product ' +
      'has is what the two of them had already done',
  },
  {
    id: 'playoff-must-win',
    claim: 'This is a must-win — lose and they are eliminated.',
    designedIn: '`07 §7`, `docs/DATA_AUDIT.md §9` row 11',
    reason: 'not-persisted',
    detail:
      'Mathematical elimination needs the remaining schedule enumerated against the tiebreak ' +
      'rules, and the remaining schedule is not stored — `fantasy_matchups` holds games that ' +
      'have been played. A heuristic is explicitly refused: `docs/DATA_AUDIT.md` requires ' +
      '"exhaustive enumeration of remaining schedules — never a heuristic", and a probability is ' +
      'banned outright. **Retrospective elimination is different and is supported** — ' +
      '`lib/stats/stories.ts` derives it from who the bracket has playing next week.',
    absentTables: [],
    wouldNeed: [
      'the unplayed remainder of the season as scheduled pairings',
      "the league's stated tiebreak order, which is not read from Sleeper today",
    ],
    insteadSay:
      'the table as it stands, recomputed from the stored games, and the elimination that ' +
      'actually happened once it has',
  },
  {
    id: 'all-time-record',
    claim: 'The highest score, widest margin or longest streak in league history.',
    designedIn: '`docs/DATA_AUDIT.md §15`',
    reason: 'coverage-starts-later',
    detail:
      "The chain terminates at 2024 with a null `previous_league_id` (`16 §12`), and the league " +
      'is older than that. Every record this product derives is a record of the recorded era. ' +
      'The derivation is right and only the wording can be wrong, which is why ' +
      '`lib/stats/scope.ts` carries the scope on the fact and bans the four overclaim terms ' +
      'rather than leaving the qualifier to whoever writes the sentence.',
    absentTables: [],
    wouldNeed: [
      'league IDs for seasons before 2024, supplied by the commissioner (`16 §12` Tier 2)',
      'or commissioner-entered records stored with `confidence = commissioner_approved` (Tier 3)',
    ],
    insteadSay: 'the same record, qualified — "since 2024", which `describeScope` produces',
  },
  {
    id: 'seasonal-team-name-history',
    claim: 'What a manager called their team in an old season, as part of a story about it.',
    designedIn: '`docs/DATA_AUDIT.md` H3',
    reason: 'not-persisted',
    detail:
      '**Partly closed, and listed because the remaining half is easy to get wrong.** ' +
      '`season_memberships.team_name` now holds the seasonal name, so it is available. But ' +
      '`users.display_name` is newest-name-wins, so a 2024 story that prints the display name is ' +
      'naming who they are now, not who they were then. This library uses display names ' +
      'throughout and deliberately does not attempt period-accurate naming.',
    absentTables: [],
    wouldNeed: [
      'a per-season display-name history, which Sleeper overwrites and does not keep',
    ],
    insteadSay:
      "the manager's permanent canonical name, which is what every other surface uses and is " +
      'never a Sleeper handle',
  },
  {
    id: 'casino-and-collectible-history',
    claim: 'A jackpot, a betting streak, or the first owner of a legendary collectible.',
    designedIn: '`07 §7.8`, `07 §7.9`',
    reason: 'not-persisted',
    detail:
      'The casino is deferred to P10 and is not in v1 (`CLAUDE.md`), so there are no wagers to ' +
      'aggregate. Collectible pulls **are** recorded — `box_openings` is append-only and carries ' +
      'the roll — but no historical claim about them is derived here: this library is about ' +
      'football, and a collectible story reads a different table with different rules.',
    absentTables: [],
    wouldNeed: [
      'the casino, whose games were ruled on 2026-08-11 (blackjack and slots, `docs/CASINO_BOUNDARY.md`) ' +
        'but which is deliberately unbuilt and unauthorized — the Underground is closed',
      'a decision that collectible history belongs in the historical-analysis layer at all',
    ],
    insteadSay: 'nothing — the absence is the deferral working as intended',
  },
]);

/** One entry by id, for a caller declining a request and citing the reason. */
export function unsupportedFact(id: string): UnsupportedFact | null {
  return UNSUPPORTED_FACTS.find((entry) => entry.id === id) ?? null;
}

/** Every table any entry asserts is absent, deduplicated. */
export function tablesAssertedAbsent(): readonly string[] {
  return [...new Set(UNSUPPORTED_FACTS.flatMap((entry) => entry.absentTables))].sort();
}
