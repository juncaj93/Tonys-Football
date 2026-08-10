import { and, asc, eq } from 'drizzle-orm';

import { type Queryable } from '@/lib/db';
import { draftPicks, seasonDrafts, seasonMemberships, seasons, users } from '@/lib/db/schema';
import { activeLeagueManagers } from '@/lib/league/membership';

import { POSITION_ORDER } from './draft-vocabulary';

/**
 * What the paper is allowed to say about the draft — **as data, never as prose**.
 *
 * ## The whole design in one sentence
 *
 * Everything here is read out of `season_drafts` and `draft_picks`, which are
 * Sleeper's, and nothing in this file decides anything about football.
 *
 * The boundary is the one `lib/slice/packet.ts` draws for a weekly issue, and it
 * matters more here: a draft review is the one surface in this product where an
 * opinion and a fact sit in the same paragraph. Tony says the draft was a B+;
 * the paper says three wide receivers went in the first five rounds. The first
 * is editorial and arrives from the commissioner; the second is countable, and
 * this file is the only thing allowed to count it.
 *
 * ## Facts, not sentences
 *
 * `earlyLoad` is `{ position: 'WR', count: 3 }` and not *"Three wide receivers
 * in the first five rounds."* The sentence is `lib/slice/preseason.ts`'s, for
 * the same reason `render.ts` writes the weekly ones: a fact layer that also
 * phrased things would be marking its own homework, and the validator could not
 * tell a curated word from a computed one.
 *
 * ## What is deliberately not computed, and never will be
 *
 * No ADP. No reach, steal, sleeper, bust or value. No projected points, no
 * projected finish, no winner of the draft. Every one needs a comparison source
 * this product does not have, and inventing a plausible one would put a
 * fabricated football fact on the page in the same typeface as a real one.
 * `docs/PRESEASON_SLICE_BOUNDARY.md` records that this is permanent.
 *
 * ## Why the observations are guarded rather than always produced
 *
 * *"Do not generate filler statistics just because they are calculable."* Every
 * league-level observation has a condition, and one whose condition fails is
 * **absent** rather than hedged. A page that says *"one wide receiver went in
 * round one"* has told the reader nothing and cost them a line.
 */

/** A pick, as the paper prints it. */
export interface DraftPickFact {
  readonly id: string;
  /** 1..N across the whole draft. */
  readonly pickNo: number;
  readonly round: number;
  /** `1.01`, `4.07` — round and position within it. What a draft board calls a pick. */
  readonly label: string;
  readonly playerName: string;
  /** `QB` · `RB` · `WR` · `TE` · `DEF`. Null where Sleeper omitted it. */
  readonly position: string | null;
  readonly nflTeam: string | null;
  readonly isKeeper: boolean;
}

export interface PositionCount {
  readonly position: string;
  readonly count: number;
}

/** One manager's draft, entirely from stored picks. */
export interface ManagerDraftFacts {
  readonly userId: string;
  readonly displayName: string;
  readonly rosterId: number;
  /** The board position they picked from. Null when no pick recorded a slot. */
  readonly draftSlot: number | null;
  /** Every pick they made, in order. */
  readonly picks: readonly DraftPickFact[];
  /** How many of each position they took, over the whole draft. */
  readonly byPosition: readonly PositionCount[];
  /**
   * The position they loaded up on early, if there is one.
   *
   * Null unless a single position took at least {@link EARLY_CONCENTRATION} of
   * their first {@link EARLY_ROUNDS} picks — below that it is a coincidence, and
   * printing a coincidence as a pattern is the thing this layer refuses.
   */
  readonly earlyLoad: PositionCount | null;
  /** The round they took a quarterback in. Null if they took none. */
  readonly quarterbackRound: number | null;
  /** How many of their picks were kept from last season. */
  readonly keepers: number;
}

/**
 * A league-wide fact worth a line, as data.
 *
 * A closed union rather than `{ label, value }` strings, so the renderer decides
 * the words and the validator can see every one of them in a curated template.
 */
export type DraftObservation =
  | { readonly kind: 'first-pick'; readonly playerName: string; readonly manager: string }
  | { readonly kind: 'round-one'; readonly position: string; readonly count: number }
  | { readonly kind: 'first-defense'; readonly round: number; readonly manager: string };

export interface DraftFacts {
  readonly season: number;
  readonly sleeperDraftId: string;
  readonly status: string;
  /** `snake` · `linear` · `auction`. */
  readonly type: string;
  readonly rounds: number | null;
  /** When the last pick landed — the draft's real end. */
  readonly completedAt: Date | null;
  readonly totalPicks: number;
  /** Active managers only, in draft-slot order — which is the order a board reads. */
  readonly managers: readonly ManagerDraftFacts[];
  readonly observations: readonly DraftObservation[];
}

/** Why there are no draft facts. */
export type DraftFactsRefusal =
  | 'no-season'
  | 'no-draft'
  | 'draft-incomplete'
  | 'no-picks'
  /** The draft is stored but no active manager holds a seat that picked in it. */
  | 'nobody-publishable';

export interface DraftFactsResult {
  readonly facts: DraftFacts | null;
  readonly refusal: DraftFactsRefusal | null;
}

/** The first five rounds are the ones that decide a team. Beyond that is depth. */
export const EARLY_ROUNDS = 5;

/** A position has to be *loaded* to be worth a sentence, not merely present. */
export const EARLY_CONCENTRATION = 3;

/** `1.01`. Two digits on the pick so a board column lines up. */
export function pickLabel(round: number, indexInRound: number): string {
  return `${String(round)}.${String(indexInRound).padStart(2, '0')}`;
}

/**
 * The stored draft, turned into everything the paper may state about it.
 *
 * Active managers only. A retired manager who drafted in a season they then left
 * is a true fact and not a printable one — the same publication boundary
 * `lib/slice/packet.ts` applies to a scoreboard, applied to a draft board for
 * the same reason.
 */
export async function draftFacts(db: Queryable, seasonYear: number): Promise<DraftFactsResult> {
  const [season] = await db
    .select({ id: seasons.id, year: seasons.year })
    .from(seasons)
    .where(eq(seasons.year, seasonYear))
    .limit(1);

  if (season === undefined) return { facts: null, refusal: 'no-season' };

  const [draft] = await db
    .select({
      id: seasonDrafts.id,
      sleeperDraftId: seasonDrafts.sleeperDraftId,
      status: seasonDrafts.status,
      type: seasonDrafts.type,
      rounds: seasonDrafts.rounds,
      completedAt: seasonDrafts.completedAt,
    })
    .from(seasonDrafts)
    .where(eq(seasonDrafts.seasonId, season.id))
    .limit(1);

  if (draft === undefined) return { facts: null, refusal: 'no-draft' };
  if (draft.status !== 'complete') return { facts: null, refusal: 'draft-incomplete' };

  const picks = await db
    .select({
      id: draftPicks.id,
      pickNo: draftPicks.pickNo,
      round: draftPicks.round,
      draftSlot: draftPicks.draftSlot,
      rosterId: draftPicks.rosterId,
      playerName: draftPicks.playerName,
      position: draftPicks.position,
      nflTeam: draftPicks.nflTeam,
      isKeeper: draftPicks.isKeeper,
    })
    .from(draftPicks)
    .where(eq(draftPicks.draftId, draft.id))
    .orderBy(asc(draftPicks.pickNo));

  if (picks.length === 0) return { facts: null, refusal: 'no-picks' };

  /*
   * Roster → person, for this season only.
   *
   * A roster id means nothing across seasons (`16 §4`), so the join is scoped to
   * the draft's own season and never carried across one.
   */
  const seats = await db
    .select({ rosterId: seasonMemberships.rosterId, userId: users.id })
    .from(seasonMemberships)
    .innerJoin(users, eq(users.id, seasonMemberships.userId))
    .where(and(eq(seasonMemberships.seasonId, season.id), eq(seasonMemberships.isActive, true)));

  const userByRoster = new Map(seats.map((seat) => [seat.rosterId, seat.userId] as const));
  const activeById = new Map(
    (await activeLeagueManagers(db)).map((manager) => [manager.id, manager] as const),
  );

  /* How many picks each round has held so far, for the `1.01` label. */
  const seenInRound = new Map<number, number>();
  const labelled = picks.map((pick) => {
    const index = (seenInRound.get(pick.round) ?? 0) + 1;
    seenInRound.set(pick.round, index);
    return {
      ...pick,
      label: pickLabel(pick.round, index),
      position: pick.position === null ? null : pick.position.toUpperCase(),
    };
  });

  const nameFor = (rosterId: number | null): string | null => {
    if (rosterId === null) return null;
    const userId = userByRoster.get(rosterId);
    if (userId === undefined) return null;
    return activeById.get(userId)?.displayName ?? null;
  };

  const byManager = new Map<string, (typeof labelled)[number][]>();
  for (const pick of labelled) {
    if (pick.rosterId === null) continue;
    const userId = userByRoster.get(pick.rosterId);
    if (userId === undefined || !activeById.has(userId)) continue;
    const bucket = byManager.get(userId);
    if (bucket === undefined) byManager.set(userId, [pick]);
    else bucket.push(pick);
  }

  if (byManager.size === 0) return { facts: null, refusal: 'nobody-publishable' };

  const managers: ManagerDraftFacts[] = [...byManager]
    .map(([userId, theirs]) => {
      const manager = activeById.get(userId)!;
      return managerDraftFacts({
        userId,
        displayName: manager.displayName,
        rosterId: manager.rosterId,
        draftSlot: theirs[0]?.draftSlot ?? null,
        picks: theirs.map((pick) => ({
          id: pick.id,
          pickNo: pick.pickNo,
          round: pick.round,
          label: pick.label,
          playerName: pick.playerName,
          position: pick.position,
          nflTeam: pick.nflTeam,
          isKeeper: pick.isKeeper,
        })),
      });
    })
    /*
     * Draft-slot order, which is the order a draft board is read in. Ties and
     * missing slots fall back to the name, so the order is total and stable
     * rather than whatever the map happened to iterate.
     */
    .sort(
      (a, b) =>
        (a.draftSlot ?? Number.MAX_SAFE_INTEGER) - (b.draftSlot ?? Number.MAX_SAFE_INTEGER) ||
        a.displayName.localeCompare(b.displayName),
    );

  return {
    facts: {
      season: season.year,
      sleeperDraftId: draft.sleeperDraftId,
      status: draft.status,
      type: draft.type,
      rounds: draft.rounds,
      completedAt: draft.completedAt,
      totalPicks: picks.length,
      managers,
      observations: observationsOf(labelled, nameFor),
    },
    refusal: null,
  };
}

/**
 * One manager's countable draft shape, from their picks.
 *
 * Split out so a **fixture** drives the identical derivation the database path
 * does (`MANDATE §8`). The preseason previews in `lib/slice/editions.ts` are
 * scores-and-names in memory, and a demo that ran its own counting would be
 * evidence about the demo — the same reason `assemblePacket` is separable from
 * `factPacket`.
 */
export function managerDraftFacts(input: {
  readonly userId: string;
  readonly displayName: string;
  readonly rosterId: number;
  readonly draftSlot: number | null;
  readonly picks: readonly DraftPickFact[];
}): ManagerDraftFacts {
  const early = countPositions(input.picks.filter((pick) => pick.round <= EARLY_ROUNDS));

  return {
    userId: input.userId,
    displayName: input.displayName,
    rosterId: input.rosterId,
    draftSlot: input.draftSlot,
    picks: input.picks,
    byPosition: countPositions(input.picks),
    earlyLoad: early.find((entry) => entry.count >= EARLY_CONCENTRATION) ?? null,
    quarterbackRound: input.picks.find((pick) => pick.position === 'QB')?.round ?? null,
    keepers: input.picks.filter((pick) => pick.isKeeper).length,
  };
}

/** {@link observationsOf}, for a fixture that has already resolved its names. */
export function draftObservations(
  picks: readonly (DraftPickFact & { readonly rosterId: number | null })[],
  nameFor: (rosterId: number | null) => string | null,
): readonly DraftObservation[] {
  return observationsOf(picks, nameFor);
}

export function countPositions(picks: readonly DraftPickFact[]): readonly PositionCount[] {
  const counts = new Map<string, number>();
  for (const pick of picks) {
    if (pick.position === null) continue;
    counts.set(pick.position, (counts.get(pick.position) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([position, count]) => ({ position, count }))
    .sort((a, b) => {
      /*
       * Most-taken first, then the league's own position order.
       *
       * The count leads because the interesting question is *"what did they take
       * most of"*; the fixed order breaks ties, so two positions at three each
       * do not swap places between renders of the same draft.
       */
      if (a.count !== b.count) return b.count - a.count;
      const ai = POSITION_ORDER.indexOf(a.position);
      const bi = POSITION_ORDER.indexOf(b.position);
      if (ai !== bi) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      return a.position.localeCompare(b.position);
    });
}

/**
 * League-wide facts worth a line, each guarded.
 *
 * Three at most, and each answers a question somebody in the shop would actually
 * ask. A fourth that nobody asks is filler, and filler on a page that is already
 * ten sections long costs the reader more than it gives them.
 */
function observationsOf(
  picks: readonly (DraftPickFact & { readonly rosterId: number | null })[],
  nameFor: (rosterId: number | null) => string | null,
): readonly DraftObservation[] {
  const observations: DraftObservation[] = [];

  /* Who went first. The one pick everybody in the league remembers. */
  const first = picks[0];
  const firstBy = first === undefined ? null : nameFor(first.rosterId);
  if (first !== undefined && firstBy !== null) {
    observations.push({ kind: 'first-pick', playerName: first.playerName, manager: firstBy });
  }

  /*
   * What round one was made of.
   *
   * Only when one position took at least half of it. A round split four ways
   * says nothing, and printing the winner of a four-way split as though it were
   * a trend is the exact filler this file refuses.
   */
  const roundOne = picks.filter((pick) => pick.round === 1);
  const dominant = countPositions(roundOne)[0];
  if (
    dominant !== undefined &&
    roundOne.length > 0 &&
    dominant.count * 2 >= roundOne.length &&
    dominant.count >= EARLY_CONCENTRATION
  ) {
    observations.push({
      kind: 'round-one',
      position: dominant.position,
      count: dominant.count,
    });
  }

  /*
   * The first defense. This league drafts them and has no kickers, so *"when did
   * the run on defenses start"* is a real conversation in this shop and in
   * almost no other.
   */
  const firstDefense = picks.find((pick) => pick.position === 'DEF');
  const defenseBy = firstDefense === undefined ? null : nameFor(firstDefense.rosterId);
  if (firstDefense !== undefined && defenseBy !== null) {
    observations.push({
      kind: 'first-defense',
      round: firstDefense.round,
      manager: defenseBy,
    });
  }

  return observations;
}
