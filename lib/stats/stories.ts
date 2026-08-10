import { comebackFor } from './comeback';
import { classify, percentileOf, type Intensity, type SignificancePolicy } from './significance';
import { type WeekSnapshotMap } from './snapshot';
import { standingsThrough, winStreak, type StandingRow } from './standings';
import { type StoredWeekGame, type TeamWeek, type WeekGame, type WeekRecord } from './week';

/**
 * What happened, and how much of a deal it was — the only place either question
 * is answered.
 *
 * `MANDATE §9`: the interface never derives a fantasy fact for itself, and *"how
 * big a deal was this"* is a fantasy fact. `significance.ts` already owns that
 * judgement for a **margin**. This file extends the same discipline to every
 * other shape of story the commissioner asked for — scores, streaks, movement,
 * upsets, brackets — so that a renderer downstream is only ever choosing words
 * for a decision that was already made and evidenced here.
 *
 * ## Every candidate carries three things, and the third is the point
 *
 * 1. a **typed payload**, so a renderer cannot read a field the story does not have
 * 2. a **significance**, so ranking is arithmetic rather than taste
 * 3. its own **allowed numbers and names**, so the fact packet can be assembled by
 *    union rather than by a packet that knows every payload shape
 *
 * The third is what keeps the validator honest as story kinds are added. A new
 * kind that forgets to declare its numbers does not sneak them past the
 * validator — it gets refused, loudly, the first time it renders.
 *
 * ## Gates before drama, everywhere
 *
 * Every kind above the floor needs a reason that is not *"it was the biggest one
 * this week"*. The largest margin of a quiet week is not a blowout; the highest
 * score of a low-scoring week is not a big score. Each gate below compares
 * against the finalized league population, the same mechanism
 * `significance.ts` uses and for the same reason: a percentile alone makes a
 * quiet week produce a headline, and a floor alone imports somebody else's
 * league.
 *
 * ## Deterministic
 *
 * Pure. No clock, no randomness, no database. Same inputs, same candidates, same
 * order — which is what lets a frozen fixture drive the real pipeline in a demo
 * and what makes a published claim recomputable months later.
 */

export type StoryKind =
  | 'championship'
  | 'record-margin'
  | 'record-score'
  | 'blowout'
  | 'nail-biter'
  | 'tie'
  | 'high-score'
  | 'low-score'
  | 'elimination'
  | 'upset'
  | 'streak'
  | 'standings-move'
  | 'monday-comeback';

/** The typed payload. A renderer switches on `kind` and reads only its own fields. */
export type StoryDetail =
  | {
      readonly kind: 'championship' | 'blowout' | 'nail-biter' | 'elimination';
      readonly winner: string;
      readonly loser: string;
      readonly winnerPoints: number;
      readonly loserPoints: number;
      readonly margin: number;
      readonly intensity: Intensity;
    }
  | {
      readonly kind: 'record-margin';
      readonly winner: string;
      readonly loser: string;
      readonly winnerPoints: number;
      readonly loserPoints: number;
      readonly margin: number;
      readonly intensity: Intensity;
    }
  | {
      readonly kind: 'tie';
      readonly a: string;
      readonly b: string;
      readonly points: number;
    }
  | {
      readonly kind: 'record-score' | 'high-score' | 'low-score';
      readonly manager: string;
      readonly points: number;
      readonly opponent: string;
      readonly opponentPoints: number;
      readonly won: boolean;
      /** Where the score sits in the finalized population, 0–100. */
      readonly percentile: number;
    }
  | {
      readonly kind: 'upset';
      readonly winner: string;
      readonly loser: string;
      readonly winnerPoints: number;
      readonly loserPoints: number;
      /** Wins each side carried into the week. The defensible baseline. */
      readonly winnerWins: number;
      readonly loserWins: number;
    }
  | {
      readonly kind: 'streak';
      readonly manager: string;
      readonly length: number;
    }
  | {
      readonly kind: 'standings-move';
      readonly manager: string;
      readonly from: number;
      readonly to: number;
      readonly climbed: boolean;
    }
  | {
      /**
       * Somebody was behind before Monday and was not behind at the end.
       *
       * Every number here comes from `lib/stats/comeback.ts`, which is two
       * subtractions on a stored pre-Monday snapshot and a finalized result. No
       * projection, no win probability, no model — `16 §9` bans all three from
       * the paper, and this is the story most likely to tempt one in.
       */
      readonly kind: 'monday-comeback';
      readonly winner: string;
      readonly loser: string;
      /** How far the winner was behind on Sunday night. Always positive. */
      readonly deficit: number;
      /** What the game finished on. */
      readonly margin: number;
      /** Deficit plus final margin: how far the game moved. */
      readonly swing: number;
    };

export interface StoryCandidate {
  /** `2025-w14-blowout`. Stable, derivable, unique per week and kind. */
  readonly id: string;
  readonly kind: StoryKind;
  readonly season: number;
  readonly week: number;
  /** Higher leads. Deterministic; every contribution is documented at its gate. */
  readonly significance: number;
  /** The game this is about, for duplicate suppression. Null when it is not about one. */
  readonly gameKey: string | null;
  /** Manager ids, the story's subject first. Drives manager-diversity balancing. */
  readonly subjects: readonly string[];
  /** Everything a reader would need to check the claim. Never rendered. */
  readonly evidence: readonly string[];
  readonly detail: StoryDetail;
  /** Numbers this story may put in prose, as written. */
  readonly allowedNumbers: readonly string[];
  /** Proper nouns this story may put in prose. */
  readonly allowedNames: readonly string[];
}

/** A score as a reader sees it. Points, never cents — see `packet.ts`. */
function two(value: number): string {
  return value.toFixed(2);
}

/** A margin as it is spoken. One place. */
function one(value: number): string {
  return value.toFixed(1);
}

/** Below this a story is not worth a manager's attention, whatever the week held. */
export const STORY_FLOOR = 340;

/** A story must clear this to lead an edition. Below it, the week is quiet. */
export const LEAD_FLOOR = 460;

/**
 * Gates, in one table so they can be read and argued with in one place.
 *
 * Every one of these is provisional in exactly the sense `significance.ts` means:
 * simulation-gated, changed by editing here and nowhere else, never inlined into
 * a renderer or a component.
 */
export const STORY_GATES = Object.freeze({
  /** A high score has to beat this share of every finalized team-week on record. */
  highScorePercentile: 95,
  /** A low score has to be under this share. */
  lowScorePercentile: 5,
  /** Consecutive regular-season wins before a run is a story. Three is common here. */
  minStreak: 4,
  /** Places moved in one week before movement is a story. */
  minStandingsMove: 3,
  /**
   * The first week a table position means anything.
   *
   * Under this, the table is mostly the points-for tiebreak: after two games
   * everybody is 1-1 or 2-0 and a manager "falling from 4th to 8th" has lost one
   * game like four other people. The old gate published exactly that, twice, and
   * it read as a paper inventing a narrative out of noise.
   */
  minStandingsWeek: 5,
  /** Wins of separation before beating somebody is an upset. */
  minUpsetGap: 3,
  /**
   * Points behind on Sunday night before a Monday recovery is a story.
   *
   * A flipped result alone is not enough. Almost every game moves on Monday, and
   * a manager who was 0.4 behind and won by 2 did not come back from anything —
   * publishing that as a comeback is the *"do not call every ordinary Monday
   * scoring change a comeback"* failure, in the one place the paper is most
   * tempted to.
   *
   * Ten points is a starter's afternoon. Below it the swing is inside the noise
   * of a single stat correction; above it somebody had to actually outscore
   * somebody. Provisional in the sense `significance.ts` means — changed here and
   * nowhere else.
   */
  minComebackDeficit: 10,
});

export interface StoryInput {
  readonly week: WeekRecord;
  /** Every stored game of the season — standings and streaks need the whole run. */
  readonly seasonRows: readonly StoredWeekGame[];
  readonly roster: ReadonlyMap<number, { userId: string; displayName: string }>;
  /** Every finalized margin on record, cents, ascending. */
  readonly marginPopulationCents: readonly number[];
  /** Every finalized team-week score on record, cents, ascending. */
  readonly scorePopulationCents: readonly number[];
  readonly policy: SignificancePolicy;
  /** Final league placement by roster, where the season produced one. */
  readonly finalRanks: ReadonlyMap<number, number>;
  /**
   * Rosters that reached the winners bracket.
   *
   * `season_memberships.made_playoffs`, which is derived at import from the
   * bracket itself and never inferred from seed or record. Elimination needs it:
   * Sleeper keeps every roster playing through the playoff weeks — the ones that
   * missed are in a consolation game — so *"had no game the following week"* is
   * true of nobody and would publish nothing.
   */
  readonly playoffRosters: ReadonlySet<number>;
  /**
   * What the scores were before Monday, keyed by `sleeperMatchupId`.
   *
   * Optional, and its absence is meaningful rather than empty: every historical
   * season this league imported predates the snapshot job, so those weeks have
   * none and simply produce no comeback candidate. A week that *was*
   * photographed and produced no comeback and a week that was never photographed
   * are both silent here — `lib/stats/comeback.ts` keeps them distinguishable
   * for anyone who needs to know which.
   */
  readonly snapshots?: WeekSnapshotMap;
}

/**
 * Every story this week could support, strongest first.
 *
 * Selection — which of these actually print — is a separate decision and lives in
 * `lib/slice/select.ts`. Keeping derivation and selection apart is what makes a
 * suppression reportable: the candidate existed, it was ranked, and something
 * beat it.
 */
export function deriveStories(input: StoryInput): readonly StoryCandidate[] {
  const { week } = input;
  const out: StoryCandidate[] = [];

  const playable = week.games.filter((game) => game.publishable);
  if (playable.length === 0) return out;

  const id = (kind: StoryKind): string =>
    `${String(week.season)}-w${String(week.week).padStart(2, '0')}-${kind}`;

  const decided = playable.filter((game) => !game.tie);

  /* ---- margin-shaped stories ------------------------------------------- */

  const byMargin = [...decided].sort(
    (x, y) => y.marginCents - x.marginCents || x.sleeperMatchupId - y.sleeperMatchupId,
  );
  const widest = byMargin[0];
  const closest = byMargin[byMargin.length - 1];

  if (widest !== undefined) {
    const percentile = percentileOf(
      input.marginPopulationCents,
      widest.marginCents,
      input.policy.minPopulation,
    );
    const isRecord =
      input.marginPopulationCents.length > 0 &&
      widest.marginCents >= input.marginPopulationCents[input.marginPopulationCents.length - 1]!;

    const intensity = classify(input.policy, {
      margin: widest.margin,
      percentile,
      isSeasonLargest: false,
    });

    if (isRecord) {
      out.push(
        marginStory({
          id: id('record-margin'),
          kind: 'record-margin',
          week,
          game: widest,
          intensity,
          percentile,
          // The widest margin the league has ever finalized. Nothing outranks it
          // except a title, and a title is about a season rather than a game.
          significance: 950,
          note: 'widest finalized margin in the recorded league',
        }),
      );
    } else if (intensity === 'crushed' || intensity === 'obliterated') {
      out.push(
        marginStory({
          id: id('blowout'),
          kind: 'blowout',
          week,
          game: widest,
          intensity,
          percentile,
          // Tier first, margin only as a tiebreak inside it — the same shape
          // `scoreOf` uses in `facts.ts`, for the same reason.
          significance: round((intensity === 'obliterated' ? 780 : 600) + widest.margin / 10),
          note: `classified ${intensity}, so it is a blowout rather than the biggest of a quiet week`,
        }),
      );
    }
  }

  if (closest !== undefined && closest !== widest) {
    const percentile = percentileOf(
      input.marginPopulationCents,
      closest.marginCents,
      input.policy.minPopulation,
    );
    const intensity = classify(input.policy, {
      margin: closest.margin,
      percentile,
      isSeasonLargest: false,
    });
    if (intensity === 'edged') {
      out.push(
        marginStory({
          id: id('nail-biter'),
          kind: 'nail-biter',
          week,
          game: closest,
          intensity,
          percentile,
          // Closer is a better story, bounded by the tier's own ceiling so a
          // nail-biter can never outrank a record.
          significance: round(600 + (input.policy.edgedMaxMargin - closest.margin) * 18),
          note: `decided by ${one(closest.margin)}, inside the edged threshold of ${String(input.policy.edgedMaxMargin)}`,
        }),
      );
    }
  }

  const tied = playable.find((game) => game.tie);
  if (tied !== undefined && tied.a.displayName !== null && tied.b.displayName !== null) {
    out.push({
      id: id('tie'),
      kind: 'tie',
      season: week.season,
      week: week.week,
      significance: 660,
      gameKey: tied.key,
      subjects: [tied.a.managerId, tied.b.managerId].filter(isString),
      evidence: [
        `stored game ${tied.key}`,
        `${tied.a.displayName} ${two(tied.a.points)} — ${tied.b.displayName} ${two(tied.b.points)}`,
        'no winner recorded, so no claim picks one',
      ],
      detail: {
        kind: 'tie',
        a: tied.a.displayName,
        b: tied.b.displayName,
        points: tied.a.points,
      },
      allowedNumbers: [two(tied.a.points), two(tied.b.points)],
      allowedNames: [tied.a.displayName, tied.b.displayName],
    });
  }

  /* ---- score-shaped stories -------------------------------------------- */

  const sides = playable.flatMap((game) =>
    [
      { team: game.a, other: game.b, game },
      { team: game.b, other: game.a, game },
    ].filter((side) => side.team.displayName !== null && side.other.displayName !== null),
  );

  const byScore = [...sides].sort(
    (x, y) =>
      y.team.pointsCents - x.team.pointsCents ||
      x.game.sleeperMatchupId - y.game.sleeperMatchupId ||
      x.team.rosterId - y.team.rosterId,
  );

  const best = byScore[0];
  const worst = byScore[byScore.length - 1];

  if (best !== undefined) {
    const percentile = percentileOf(
      input.scorePopulationCents,
      best.team.pointsCents,
      input.policy.minPopulation,
    );
    const isRecord =
      input.scorePopulationCents.length > 0 &&
      best.team.pointsCents >= input.scorePopulationCents[input.scorePopulationCents.length - 1]!;

    if (isRecord) {
      out.push(
        scoreStory({
          id: id('record-score'),
          kind: 'record-score',
          week,
          side: best,
          percentile: percentile ?? 100,
          significance: 940,
          note: 'highest finalized team score in the recorded league',
        }),
      );
    } else if (percentile !== null && percentile >= STORY_GATES.highScorePercentile) {
      out.push(
        scoreStory({
          id: id('high-score'),
          kind: 'high-score',
          week,
          side: best,
          percentile,
          significance: round(
            480 + (percentile - STORY_GATES.highScorePercentile) * 20,
          ),
          note: `${String(percentile)}th percentile of every finalized team-week on record`,
        }),
      );
    }
  }

  if (worst !== undefined && worst !== best) {
    const percentile = percentileOf(
      input.scorePopulationCents,
      worst.team.pointsCents,
      input.policy.minPopulation,
    );
    if (percentile !== null && percentile <= STORY_GATES.lowScorePercentile) {
      out.push(
        scoreStory({
          id: id('low-score'),
          kind: 'low-score',
          week,
          side: worst,
          percentile,
          significance: round(400 + (STORY_GATES.lowScorePercentile - percentile) * 8),
          note: `${String(percentile)}th percentile of every finalized team-week on record`,
        }),
      );
    }
  }

  /* ---- bracket-shaped stories ------------------------------------------ */

  if (week.weekType === 'playoff') {
    for (const game of decided) {
      const winnerRank = input.finalRanks.get(game.winner!.rosterId);
      const loserRank = input.finalRanks.get(game.loser!.rosterId);
      // The title game is the one whose two participants finished first and
      // second. Derived from the placement the bracket produced, never from a
      // matchup id — `lib/sleeper/placements.ts` records what goes wrong when a
      // placement is inferred from position instead of read.
      if (winnerRank === 1 && loserRank === 2) {
        out.push(
          marginStory({
            id: id('championship'),
            kind: 'championship',
            week,
            game,
            intensity: classify(input.policy, {
              margin: game.margin,
              percentile: percentileOf(
                input.marginPopulationCents,
                game.marginCents,
                input.policy.minPopulation,
              ),
              isSeasonLargest: false,
            }),
            percentile: null,
            significance: 900,
            note: 'the two finalists, by recorded placement — first against second',
          }),
        );
      }
    }

    /*
     * Knocked out of the title race — the loser cannot finish first or second
     * and the winner does.
     *
     * ## The previous rule could not fire, and that was measured
     *
     * It read *"still alive = plays another playoff team in a later week"*, and
     * inferred elimination from the loser having no such game. That is true of a
     * bracket that simply drops its losers, and **this league's bracket does not
     * have one**: Sleeper's six-team draw sends the two first-round losers to a
     * fifth-place game in the semifinal week and the two semifinal losers to a
     * third-place game in the final week. Every playoff loser meets another
     * playoff team the following week, so `stillAlive` always contained them and
     * the candidate was never built.
     *
     * Checked rather than reasoned: across the six playoff weeks of the two
     * recorded seasons, `elimination` appears nowhere — not as a lead, not in
     * `rest`, not suppressed, not demoted. It was dead code on real data.
     * `lib/stats/playoff-stories.test.ts` fails on the old rule.
     *
     * ## Why the new rule is the recorded placement and not another inference
     *
     * `finalRanks` is `season_memberships.final_rank`, derived at import from the
     * bracket's own placement games (`lib/sleeper/placements.ts`) and never from
     * a matchup position. So *"the winner finished first or second"* is a fact
     * the bracket wrote down, exactly like the championship story above it, and
     * *"the loser did not"* is the same fact about the other side. When it fires
     * it is true; when the ranks are not in it does not fire at all.
     *
     * ## What it therefore cannot do, stated rather than implied
     *
     * It is **retrospective**. Ranks one and two exist only once the final has
     * been played and synced, so the paper printed on the Tuesday of the
     * semifinal week cannot carry this story — it can only appear in a later
     * rendering of that week. Making it live needs the bracket itself persisted,
     * which nothing in this product stores today; that is a feature, and it is
     * reported rather than invented here.
     */
    const knockedOut = decided.find((game) => {
      if (game.loser === null || game.loser.displayName === null) return false;
      if (!input.playoffRosters.has(game.loser.rosterId)) return false;
      if (!input.playoffRosters.has(game.winner!.rosterId)) return false;

      const winnerRank = input.finalRanks.get(game.winner!.rosterId);
      const loserRank = input.finalRanks.get(game.loser.rosterId);
      if (winnerRank === undefined || loserRank === undefined) return false;

      return winnerRank <= 2 && loserRank > 2;
    });

    if (knockedOut !== undefined) {
      out.push(
        marginStory({
          id: id('elimination'),
          kind: 'elimination',
          week,
          game: knockedOut,
          intensity: classify(input.policy, {
            margin: knockedOut.margin,
            percentile: percentileOf(
              input.marginPopulationCents,
              knockedOut.marginCents,
              input.policy.minPopulation,
            ),
            isSeasonLargest: false,
          }),
          percentile: null,
          significance: 470,
          note: 'the winner reached the final by recorded placement; the loser did not',
        }),
      );
    }
  }

  /* ---- season-shaped stories ------------------------------------------- */

  if (week.weekType === 'regular') {
    const before = standingsThrough({
      rows: input.seasonRows,
      throughWeek: week.week - 1,
      roster: input.roster,
    });
    const after = standingsThrough({
      rows: input.seasonRows,
      throughWeek: week.week,
      roster: input.roster,
    });

    const rankBefore = new Map(before.map((row) => [row.rosterId, row]));

    /*
     * Early weeks have no table worth reporting movement in.
     *
     * Week one has no "before" at all, and weeks two to four have a table that is
     * mostly the points-for tiebreak — see `STORY_GATES.minStandingsWeek`.
     */
    if (week.week >= STORY_GATES.minStandingsWeek) {
      const moves = after
        .map((row) => ({ row, from: rankBefore.get(row.rosterId)?.rank ?? row.rank }))
        .filter(
          (move) =>
            move.row.displayName !== null &&
            Math.abs(move.from - move.row.rank) >= STORY_GATES.minStandingsMove,
        )
        .sort(
          (x, y) =>
            Math.abs(y.from - y.row.rank) - Math.abs(x.from - x.row.rank) ||
            x.row.rosterId - y.row.rosterId,
        );

      const move = moves[0];
      if (move !== undefined) {
        const distance = Math.abs(move.from - move.row.rank);
        out.push({
          id: id('standings-move'),
          kind: 'standings-move',
          season: week.season,
          week: week.week,
          significance: round(340 + distance * 25),
          gameKey: null,
          subjects: [move.row.managerId].filter(isString),
          evidence: [
            `table recomputed from the stored regular-season games, weeks 1 to ${String(week.week)}`,
            `${move.row.displayName ?? ''} ${String(move.from)} to ${String(move.row.rank)}`,
            `record after week ${String(week.week)}: ${String(move.row.wins)}-${String(move.row.losses)}`,
            `wins, then points for, then roster id — the tiebreak is stated in standings.ts`,
          ],
          detail: {
            kind: 'standings-move',
            manager: move.row.displayName ?? '',
            from: move.from,
            to: move.row.rank,
            climbed: move.row.rank < move.from,
          },
          allowedNumbers: [String(move.from), String(move.row.rank)],
          allowedNames: [move.row.displayName ?? ''],
        });
      }
    }

    const streaks = [...input.roster.keys()]
      .map((rosterId) => ({
        rosterId,
        length: winStreak({ rows: input.seasonRows, rosterId, throughWeek: week.week }),
      }))
      .filter((entry) => entry.length >= STORY_GATES.minStreak)
      .sort((x, y) => y.length - x.length || x.rosterId - y.rosterId);

    const run = streaks[0];
    const runSeat = run === undefined ? undefined : input.roster.get(run.rosterId);
    // Only if they actually played this week — a bye or an unpaired roster keeps
    // its streak alive but did not do anything on Sunday, and a paper reporting
    // it would be reporting the absence of a game.
    const runPlayed =
      run !== undefined && playable.some((game) => game.winner?.rosterId === run.rosterId);

    if (run !== undefined && runSeat !== undefined && runPlayed) {
      out.push({
        id: id('streak'),
        kind: 'streak',
        season: week.season,
        week: week.week,
        significance: round(360 + run.length * 25),
        gameKey: playable.find((game) => game.winner?.rosterId === run.rosterId)?.key ?? null,
        subjects: [runSeat.userId],
        evidence: [
          `consecutive regular-season wins counted back from week ${String(week.week)}`,
          `${runSeat.displayName}: ${String(run.length)} in a row`,
          `a tie ends a run rather than extending it — see standings.ts`,
        ],
        detail: { kind: 'streak', manager: runSeat.displayName, length: run.length },
        allowedNumbers: [String(run.length)],
        allowedNames: [runSeat.displayName],
      });
    }

    const upset = pickUpset(decided, rankBefore);
    if (upset !== null) out.push({ ...upset, id: id('upset') });
  }

  /* ---- what Monday did ------------------------------------------------- */

  const comeback = pickComeback(playable, input.snapshots);
  if (comeback !== null) out.push({ ...comeback, id: id('monday-comeback') });

  return out.sort((x, y) => y.significance - x.significance || x.id.localeCompare(y.id));
}

/**
 * The week's biggest Monday recovery, or nothing.
 *
 * ## Two conditions, and the second is what keeps it honest
 *
 * `lib/stats/comeback.ts` reports the flip; this decides whether a flip is worth
 * a headline. **The result must have flipped and the deficit must have been
 * real.** A manager who was 0.4 behind on Sunday night and won by 2 did not come
 * back from anything, and a paper that says they did has spent its credibility
 * on noise.
 *
 * ## Its significance is the deficit, not the margin
 *
 * Every other margin-shaped story here scores on how the game *ended*. This one
 * scores on how far back somebody was, because that is the whole claim — a
 * one-point win after being forty behind is a bigger story than a one-point win
 * after being one behind, and the final margin cannot tell them apart.
 *
 * ## A week with no snapshot produces nothing, silently
 *
 * Which is correct rather than convenient. Every historical season predates the
 * job, so `no-snapshot` is the normal state of most of the archive, and a story
 * that appeared for some weeks and not others with no explanation would be worse
 * than one that appears only where the evidence exists.
 */
function pickComeback(
  playable: readonly WeekGame[],
  snapshots: WeekSnapshotMap | undefined,
): Omit<StoryCandidate, 'id'> | null {
  if (snapshots === undefined || snapshots.size === 0) return null;

  const found = playable
    .map((game) => ({ game, fact: comebackFor(game, snapshots) }))
    .filter((entry) => entry.fact.outcome === 'comeback')
    .filter((entry) => entry.fact.deficitCents >= STORY_GATES.minComebackDeficit * 100)
    // Deepest hole first; the matchup id only breaks an exact tie.
    .sort(
      (x, y) =>
        y.fact.deficitCents - x.fact.deficitCents ||
        x.game.sleeperMatchupId - y.game.sleeperMatchupId,
    );

  const top = found[0];
  if (top === undefined) return null;

  const { game, fact } = top;
  const winner = fact.winner;
  const loser = fact.loser;
  if (winner === null || loser === null) return null;

  const deficit = fact.deficitCents / 100;
  const margin = fact.finalMarginCents / 100;
  const swing = fact.swingCents / 100;

  return {
    kind: 'monday-comeback',
    season: game.season,
    week: game.week,
    /*
     * 400 clears `STORY_FLOOR` (340) but not `LEAD_FLOOR` (460) on its own, so a
     * modest recovery is printed and does not lead. Two points of significance
     * per point of deficit puts a thirty-point hole at 460 — the size of hole
     * that should lead a quiet week and should still lose to a record margin.
     */
    significance: round(400 + deficit * 2),
    gameKey: game.key,
    subjects: [game.winner?.managerId ?? null, game.loser?.managerId ?? null].filter(isString),
    evidence: [
      `stored game ${game.key}`,
      `pre-Monday snapshot for matchup ${String(fact.sleeperMatchupId)}, week ${String(game.week)}`,
      `${winner} trailed by ${one(deficit)} at the snapshot and won by ${one(margin)}`,
      `swing of ${one(swing)}, which is the deficit plus the final margin`,
      'both numbers are stored rows subtracted — the snapshot and the finalized game',
    ],
    detail: { kind: 'monday-comeback', winner, loser, deficit, margin, swing },
    allowedNumbers: [one(deficit), one(margin), one(swing)],
    allowedNames: [winner, loser],
  };
}

/**
 * The week's biggest upset by record, or nothing.
 *
 * **A defensible baseline or no story.** The only baseline this product has is
 * what the two managers had already done — wins on the board before Sunday. It
 * has no projections, no power ranking and no market, and `16 §9` bans
 * win-probability language precisely because implying one is a lie about the
 * product. So an upset is *"the manager with three fewer wins won"*, and when
 * that is not true there is no upset rather than a softer one.
 */
function pickUpset(
  decided: readonly WeekGame[],
  rankBefore: ReadonlyMap<number, StandingRow>,
): Omit<StoryCandidate, 'id'> | null {
  const candidates = decided
    .map((game) => {
      const winner = rankBefore.get(game.winner!.rosterId);
      const loser = rankBefore.get(game.loser!.rosterId);
      if (winner === undefined || loser === undefined) return null;
      return { game, gap: loser.wins - winner.wins, winner, loser };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .filter((entry) => entry.gap >= STORY_GATES.minUpsetGap)
    .sort((x, y) => y.gap - x.gap || x.game.sleeperMatchupId - y.game.sleeperMatchupId);

  const top = candidates[0];
  if (top === undefined) return null;

  const w = top.game.winner!;
  const l = top.game.loser!;
  if (w.displayName === null || l.displayName === null) return null;

  return {
    kind: 'upset',
    season: top.game.season,
    week: top.game.week,
    significance: round(430 + top.gap * 20),
    gameKey: top.game.key,
    subjects: [w.managerId, l.managerId].filter(isString),
    evidence: [
      `stored game ${top.game.key}`,
      `records carried into the week: ${w.displayName} ${String(top.winner.wins)}-${String(top.winner.losses)}, ` +
        `${l.displayName} ${String(top.loser.wins)}-${String(top.loser.losses)}`,
      `${String(top.gap)} wins of separation, recomputed from the stored games`,
      'the baseline is the record, never a projection — the product has none',
    ],
    detail: {
      kind: 'upset',
      winner: w.displayName,
      loser: l.displayName,
      winnerPoints: w.points,
      loserPoints: l.points,
      winnerWins: top.winner.wins,
      loserWins: top.loser.wins,
    },
    allowedNumbers: [
      two(w.points),
      two(l.points),
      String(top.winner.wins),
      String(top.loser.wins),
    ],
    allowedNames: [w.displayName, l.displayName],
  };
}

function marginStory(input: {
  readonly id: string;
  readonly kind: 'championship' | 'blowout' | 'nail-biter' | 'elimination' | 'record-margin';
  readonly week: WeekRecord;
  readonly game: WeekGame;
  readonly intensity: Intensity;
  readonly percentile: number | null;
  readonly significance: number;
  readonly note: string;
}): StoryCandidate {
  const w = input.game.winner!;
  const l = input.game.loser!;

  return {
    id: input.id,
    kind: input.kind,
    season: input.week.season,
    week: input.week.week,
    significance: input.significance,
    gameKey: input.game.key,
    subjects: [w.managerId, l.managerId].filter(isString),
    evidence: [
      `stored game ${input.game.key}`,
      `${w.displayName ?? ''} ${two(w.points)} — ${l.displayName ?? ''} ${two(l.points)}`,
      `margin ${two(input.game.margin)}, exact from integer cents`,
      input.percentile === null
        ? 'no margin percentile applied to this kind'
        : `${String(input.percentile)}th percentile of every finalized margin on record`,
      `classified ${input.intensity}`,
      input.note,
    ],
    detail: {
      kind: input.kind,
      winner: w.displayName ?? '',
      loser: l.displayName ?? '',
      winnerPoints: w.points,
      loserPoints: l.points,
      margin: input.game.margin,
      intensity: input.intensity,
    },
    allowedNumbers: [two(w.points), two(l.points), one(input.game.margin), two(input.game.margin)],
    allowedNames: [w.displayName ?? '', l.displayName ?? ''],
  };
}

function scoreStory(input: {
  readonly id: string;
  readonly kind: 'record-score' | 'high-score' | 'low-score';
  readonly week: WeekRecord;
  readonly side: { readonly team: TeamWeek; readonly other: TeamWeek; readonly game: WeekGame };
  readonly percentile: number;
  readonly significance: number;
  readonly note: string;
}): StoryCandidate {
  const { team, other, game } = input.side;

  return {
    id: input.id,
    kind: input.kind,
    season: input.week.season,
    week: input.week.week,
    significance: input.significance,
    gameKey: game.key,
    subjects: [team.managerId, other.managerId].filter(isString),
    evidence: [
      `stored game ${game.key}`,
      `${team.displayName ?? ''} ${two(team.points)} against ${other.displayName ?? ''} ${two(other.points)}`,
      `${String(input.percentile)}th percentile of the finalized team-week population`,
      input.note,
    ],
    detail: {
      kind: input.kind,
      manager: team.displayName ?? '',
      points: team.points,
      opponent: other.displayName ?? '',
      opponentPoints: other.points,
      won: game.winner?.rosterId === team.rosterId,
      percentile: input.percentile,
    },
    allowedNumbers: [two(team.points), two(other.points)],
    allowedNames: [team.displayName ?? '', other.displayName ?? ''],
  };
}

function isString(value: string | null): value is string {
  return value !== null;
}

/** Two decimals. A significance is only ever compared; more precision buys flake. */
function round(value: number): number {
  return Math.round(value * 100) / 100;
}
