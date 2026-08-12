import { percentileOf, writePoints, type GameResult, type WeekResult } from './facts';
import { VARIANTS, type Variant } from './model';

/**
 * Tony's Chalkboard — the proposition library.
 *
 * **Commissioner ruling, 2026-08-12 (Rulings 5–10).** The old weekly-high
 * prediction is retired and replaced by a rotating league-wide proposition. Tony
 * makes **one shared call** and the league watches; nobody wagers on it.
 *
 * ## Both halves of a family live here, and that is the point
 *
 * A proposition is two functions that must agree forever: the one that chooses
 * the number and the one that later says whether it happened. Everywhere else in
 * this package those halves are split — `author.ts` builds, `resolve.ts`
 * checks — and that split is right for the line and the bounty, which have one
 * shape each. With four families it is the thing that drifts: a threshold
 * defined as *strictly above* in one file and *at or above* in the other is a
 * settlement nobody can argue with and everybody disagrees with.
 *
 * So `calibrate` and `settle` sit next to each other, per family, and neither
 * touches a database, a clock or a random source.
 *
 * ## Every number is calibrated, and the calibration had to be re-derived
 *
 * `docs/evidence/line-and-call/report.md` swept each family's one knob across
 * the league's real 2024 and 2025 seasons. **Three of its four settings do not
 * hold in the product**, and the reason is a defect in the investigation rather
 * than in the families: `scripts/line-lab.ts` read stored scores directly, so it
 * measured **ten-team weeks**. Everything downstream of `publishableWeek` sees
 * eight — one manager in the archive is not an eligible seat, so one game a week
 * is dropped whole before any number is taken.
 *
 * Fewer games is fewer chances at a close one and fewer scores to clear a
 * threshold, so the investigation's settings ran:
 *
 * | family | reported | through the real pipeline |
 * |---|---|---|
 * | `anybody-breaks`, 96th | 53% | 47% |
 * | `photo-finish`, 6 points | 47% | **35%** |
 * | four teams over the 60th | 53% | **23%** |
 * | `a-hiding`, 50 points | 50% | 44% |
 *
 * A 23% call is not an uncertain question — it is Tony being wrong three times
 * in four. So the knobs were swept again against `WeekResult` itself, which is
 * the verified, publication-bounded sample the product settles from, and the
 * constants below are that sweep's answer. `docs/CHALKBOARD_BOUNDARY.md` carries
 * the full table.
 *
 * The intent is a **genuinely uncertain** question. It is not exactly 50.0% and
 * chasing that would be fake precision: 47–53% over thirty-odd real weeks is
 * inside the noise of the sample it was measured on.
 *
 * ## One family counts, and a count has to know how big the field is
 *
 * *"Do four teams clear the number"* is 53% against an **eight**-team week and
 * about **83%** against a ten-team one, because four of ten clearing a median is
 * far likelier than four of eight. The archive is eight-team and 2026 will be
 * ten, so a fixed four would have shipped calibrated and arrived easy.
 *
 * The count is therefore **half the field**, derived at authoring from the
 * basis's own `teamWeeks / basisWeeks` — a stored fact, not a guess — and
 * printed as the number it came out as. Half the field clearing the median of
 * everything played so far is ~50% by construction at any field size, which is
 * the same structural argument `16 §9` makes for the line.
 *
 * ## Tony always backs the affirmative, and nothing says so out loud
 *
 * Ruling 9. Every question below is phrased so that *yes* is the call, so the
 * board reads `Four teams over 130.90 this week? Tony says yes.` and there is no
 * sentence anywhere explaining the rule. The investigation measured the
 * alternative — a mean-reversion rule that "calls the correction" — at 32–36%,
 * which is a landlord who is wrong twice as often as he is right.
 *
 * ## What a proposition may not need
 *
 * No schedule persistence, no NFL player data, no projections, no trade or bench
 * data, no playoff state. Every family resolves from ordinary finalized matchup
 * rows through `WeekResult`, which has already applied the publication boundary
 * and dropped the disputed weeks.
 */

/** The 96th percentile — `anybody-breaks`. 14 of 30 real weeks, 47%. */
const BREAK_PERCENTILE = 0.96;

/**
 * The median — `half-over`.
 *
 * The 60th the investigation chose was compensating for a count that was too
 * high for the field it was measured against. With the count derived from the
 * field, the plain median is what makes the question even, and it is the same
 * order statistic `16 §9` builds the line on. 16 of 30 real weeks, 53%.
 */
const HALF_OVER_PERCENTILE = 0.5;

/** Ten points, flat — `photo-finish`. 18 of 34 real weeks, 53%. */
const PHOTO_FINISH_CENTS = 1000;

/** Forty-five points, flat — `a-hiding`. 18 of 34 real weeks, 53%. */
const A_HIDING_CENTS = 4500;

/**
 * How many prior weeks a calibrated threshold needs before it means anything.
 *
 * Two, which is where the investigation started reporting a number for the two
 * percentile families and where the report's own week-by-week tables begin. A
 * 96th percentile of one week's ten scores is the highest of ten, which is not a
 * percentile — it is a maximum wearing one as a hat.
 */
export const MIN_PROP_BASIS_WEEKS = 2;

/** What a calibrated proposition froze into its terms. */
export interface Calibration {
  /** Named values, already written the way a reader sees them. */
  readonly values: Readonly<Record<string, string>>;
  /** Every number the claim may print, for the validator's allowed set. */
  readonly numbers: readonly string[];
}

/** How a proposition turned out, with the values its explanation needs. */
export interface Settlement {
  readonly happened: boolean;
  /** Which curated sentence in `copy.ts` explains it. */
  readonly statementKey: string;
  readonly values: Readonly<Record<string, string>>;
  /** Names the explanation prints, which the renderer admits from the evidence. */
  readonly names: readonly string[];
}

/** What a family needs to know about the season so far. */
export interface PropBasis {
  /** Every eligible manager's prior team-weeks, ascending. */
  readonly leagueScores: readonly number[];
  /** How many weeks those scores came from. */
  readonly basisWeeks: number;
}

/**
 * How many teams a week of this league puts on the board, from the basis itself.
 *
 * Publishable team-weeks divided by the weeks they came from — so a suppressed
 * game or a manager who is not a seat is already subtracted, and the number is
 * whatever this league really fields rather than whatever its roster says.
 */
function fieldSize(basis: PropBasis): number {
  if (basis.basisWeeks === 0) return 0;
  return basis.leagueScores.length / basis.basisWeeks;
}

export interface Proposition {
  readonly variant: Variant;
  /**
   * False when the week's own games are enough.
   *
   * Ruling 7 asks for the two history-free families to be preserved, because
   * they are the only thing that can go on the board in week one — and a
   * chalkboard that is blank for the first fortnight of the league's first real
   * season is a feature nobody meets.
   */
  readonly needsHistory: boolean;
  /** The number, frozen into the stake's terms. Null when it cannot be set. */
  readonly calibrate: (basis: PropBasis) => Calibration | null;
  /** Did it happen? Null when the stored terms do not carry what this needs. */
  readonly settle: (
    values: Readonly<Record<string, string>>,
    week: WeekResult,
  ) => Settlement | null;
}

/** A stored value, read back as the number it was written as. */
function cents(written: string | undefined): number | null {
  if (written === undefined) return null;
  const value = Number.parseFloat(written);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100);
}

/** The week's scores, highest first, ties broken by roster id. */
function bestFirst(week: WeekResult): readonly WeekResult['teams'][number][] {
  return [...week.teams].sort((a, b) => b.pointsCents - a.pointsCents || a.rosterId - b.rosterId);
}

/** The week's games, closest first, ties broken by key so it is never query order. */
function closestFirst(week: WeekResult): readonly GameResult[] {
  return [...week.games].sort((a, b) => a.marginCents - b.marginCents || a.key.localeCompare(b.key));
}

/**
 * The four live families, in rotation order.
 *
 * Four rather than the six measured, which is Ruling 7's *"smallest clean
 * library necessary"* applied rather than quoted. The two left out are approved
 * and unbuilt, and both were dropped for how they **read** rather than for how
 * they measured:
 *
 *   - *the league total* asks about a combined figure near 1,200 that no manager
 *     has any feel for, so neither answer is interesting;
 *   - *everybody clears the floor* is a question whose affirmative is a double
 *     negative — *yes, nobody went below* — and Tony's side has to be plainly
 *     readable.
 *
 * Adding either later is this array plus a copy row, and their measured settings
 * are in the report.
 */
export const LIBRARY: readonly Proposition[] = [
  {
    variant: VARIANTS.anybodyBreaks,
    needsHistory: true,
    calibrate: (basis) => {
      if (basis.basisWeeks < MIN_PROP_BASIS_WEEKS) return null;
      const threshold = percentileOf(basis.leagueScores, BREAK_PERCENTILE);
      if (threshold === null) return null;
      const line = writePoints(threshold);
      return { values: { line }, numbers: [line] };
    },
    settle: (values, week) => {
      const threshold = cents(values['line']);
      const best = bestFirst(week)[0];
      if (threshold === null || best === undefined) return null;

      const happened = best.pointsCents > threshold;
      return {
        happened,
        statementKey: happened ? 'break-made' : 'break-missed',
        values: {
          line: writePoints(threshold),
          best: writePoints(best.pointsCents),
          ...(happened ? { subject: best.displayName } : {}),
        },
        names: happened ? [best.displayName] : [],
      };
    },
  },
  {
    variant: VARIANTS.photoFinish,
    needsHistory: false,
    calibrate: () => {
      const margin = writePoints(PHOTO_FINISH_CENTS);
      return { values: { margin }, numbers: [margin] };
    },
    settle: (values, week) => {
      const threshold = cents(values['margin']);
      const closest = closestFirst(week)[0];
      if (threshold === null || closest === undefined) return null;

      /*
       * *"Inside"* is **at or below**, which is the rule the investigation swept
       * and it is stated here rather than left to the operator. A margin exactly
       * on six points is a photo finish by any reading, and the alternative would
       * make the number mean one thing in the sweep and another in a settlement.
       */
      const happened = closest.marginCents <= threshold;
      return {
        happened,
        statementKey: happened ? 'photo-finish-made' : 'photo-finish-missed',
        values: {
          margin: writePoints(threshold),
          closest: writePoints(closest.marginCents),
          ...(happened && closest.winner !== null && closest.loser !== null
            ? { winner: closest.winner.displayName, loser: closest.loser.displayName }
            : {}),
        },
        names:
          happened && closest.winner !== null && closest.loser !== null
            ? [closest.winner.displayName, closest.loser.displayName]
            : [],
      };
    },
  },
  {
    variant: VARIANTS.halfOver,
    needsHistory: true,
    calibrate: (basis) => {
      if (basis.basisWeeks < MIN_PROP_BASIS_WEEKS) return null;
      const threshold = percentileOf(basis.leagueScores, HALF_OVER_PERCENTILE);
      const needed = Math.round(fieldSize(basis) / 2);
      if (threshold === null || needed < 2) return null;

      const line = writePoints(threshold);
      const teams = String(needed);
      return { values: { line, teams }, numbers: [line, teams] };
    },
    settle: (values, week) => {
      const threshold = cents(values['line']);
      const needed = Number.parseInt(values['teams'] ?? '', 10);
      if (threshold === null || !Number.isInteger(needed)) return null;

      const cleared = week.teams.filter((team) => team.pointsCents > threshold).length;
      const happened = cleared >= needed;
      return {
        happened,
        statementKey: happened ? 'half-over-made' : 'half-over-missed',
        values: {
          line: writePoints(threshold),
          cleared: String(cleared),
          teams: String(needed),
        },
        names: [],
      };
    },
  },
  {
    variant: VARIANTS.aHiding,
    needsHistory: false,
    calibrate: () => {
      const margin = writePoints(A_HIDING_CENTS);
      return { values: { margin }, numbers: [margin] };
    },
    settle: (values, week) => {
      const threshold = cents(values['margin']);
      if (threshold === null) return null;

      const widest = [...week.games]
        .filter((game) => !game.tie)
        .sort((a, b) => b.marginCents - a.marginCents || a.key.localeCompare(b.key))[0];
      if (widest === undefined) return null;

      const happened = widest.marginCents > threshold;
      return {
        happened,
        statementKey: happened ? 'hiding-made' : 'hiding-missed',
        values: {
          margin: writePoints(threshold),
          widest: writePoints(widest.marginCents),
          ...(happened && widest.winner !== null && widest.loser !== null
            ? { winner: widest.winner.displayName, loser: widest.loser.displayName }
            : {}),
        },
        names:
          happened && widest.winner !== null && widest.loser !== null
            ? [widest.winner.displayName, widest.loser.displayName]
            : [],
      };
    },
  },
];

/** One family by variant, or nothing. Retired variants are deliberately absent. */
export function propositionFor(variant: Variant): Proposition | null {
  return LIBRARY.find((proposition) => proposition.variant === variant) ?? null;
}
