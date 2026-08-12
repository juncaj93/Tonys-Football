import { eq } from 'drizzle-orm';

import { type Database } from '@/lib/db';
import {
  fantasyMatchups,
  lootBoxes,
  seasonMemberships,
  seasons,
  sliceIssueVersions,
  sliceIssues,
  stakeResolutions,
  tokenTransactions,
  users,
  weekFinalizations,
  weekSnapshots,
  weeklyRewards,
  weeklyStakes,
} from '@/lib/db/schema';
import { importHistory } from '@/lib/sleeper/midseason-season';
import { approveVersion, publishVersion } from '@/lib/slice/publication';
import { runSundayJob, type SundayOutcome } from '@/lib/slice/sunday';
import { runTuesday, type TuesdayReport } from '@/lib/slice/tuesday';
import { openSeason } from '@/lib/counter/tokens';

import {
  scriptedSeason,
  type ScriptedFault,
  type ScriptedPhase,
  type ScriptedSource,
  type SeasonScript,
} from './script';

/**
 * The lifecycle rehearsal harness.
 *
 * ## What it is for
 *
 * Every step of the Sunday-to-Tuesday chain has tests. The chain does not, in
 * the sense that matters operationally: the question the commissioner actually
 * has is *"if this were the first real week of the season, would Tony's get from
 * Sunday to Tuesday without corrupting data, skipping a manager, double-paying a
 * reward, printing something untrue, or leaving the shop in a state that
 * contradicts itself?"* — and no unit test answers that, because the failure
 * modes it is asking about live **between** the steps.
 *
 * So this is a driver, not a simulator. It fabricates no behaviour: every phase
 * calls the same function the deployed cron calls, with the Sleeper source
 * injected at the seam the routes already have. The only things it supplies are
 * a written season (`./script.ts`) and a way to look at the whole database
 * afterwards ({@link observe}).
 *
 * ## Why it lives in `lib/`
 *
 * The same standing `lib/db/test-helpers.ts` and `lib/sleeper/test-source.ts`
 * hold: nothing in `app/` imports it, so it is not in any bundle, and two
 * suites — Week 1 now, Week 8 and the playoffs later — need one definition of
 * what a rehearsed week is rather than a copy each.
 *
 * ## The interface is deliberately four verbs
 *
 * `seed` · `sunday` · `tuesday` · `observe`. A later rehearsal that needs to
 * express *"the playoffs"* should do it by writing a different season, not by
 * adding a fifth verb — the point of the harness is that the lifecycle is one
 * shape and the scenarios are data. {@link approve} and {@link publish} are the
 * two human actions and sit beside them for the same reason: the cron cannot
 * perform either, and the rehearsal has to prove that as well as use it.
 */

export interface RehearsalOptions {
  readonly db: Database;
  readonly script: SeasonScript;
  /**
   * Seasons whose books are shut before the rehearsal starts.
   *
   * The rehearsed season must **not** be in this list. A finalized season
   * refuses every write — that is the whole point of finalization — so a
   * rehearsal of a closed season would be a rehearsal of the refusals.
   */
  readonly finalizeYears?: readonly number[];
}

/** What a Sunday leg of the rehearsal did. */
export interface SundayLeg {
  readonly outcome: SundayOutcome;
  /** Endpoints the job actually asked for. The request budget, observable. */
  readonly requests: number;
}

export interface SundayInput {
  /** `?week=` — omit to make the job resolve the week from Sleeper's `state`. */
  readonly week?: number;
  readonly at: Date;
  /** Weeks the upstream admits to having played. Defaults to `week`. */
  readonly played?: number;
  /**
   * What Sleeper's `state` reports as the week in progress.
   *
   * Defaults to `played`, which is the ordinary Sunday: the week being played is
   * the week whose scores are on the board. Set it to `0` to rehearse the
   * preseason, where the recorded fixture genuinely says so.
   */
  readonly currentWeek?: number;
  readonly capturedAt?: Date;
  readonly fault?: ScriptedFault;
}

export interface TuesdayInput {
  /** `?week=` — omit to make the job resolve the week after its own sync. */
  readonly week?: number;
  readonly at: Date;
  /** Weeks the upstream admits to having played. */
  readonly played: number;
  readonly capturedAt?: Date;
  readonly fault?: ScriptedFault;
  /**
   * Serve the week as Sleeper serves an unplayed one — every row at zero.
   *
   * The state between the draft and the opener, and the one whose consequences
   * cannot be undone: five 0.00–0.00 rows stored as ties and finalized would put
   * a week nobody played into an append-only table.
   */
  readonly scheduledOnly?: boolean;
  /**
   * Run with no Sleeper at all.
   *
   * Not the same as {@link ScriptedFault}'s `unreachable`: this is the shape of a
   * job invoked without a source, which the report distinguishes from one whose
   * source refused. Both are legitimate and they read differently.
   */
  readonly withoutSleeper?: boolean;
  readonly env?: NodeJS.ProcessEnv;
}

/* -------------------------------------------------------------------------
 * Observation
 * ---------------------------------------------------------------------- */

export interface ObservedGame {
  readonly week: number;
  readonly weekType: string;
  readonly matchupId: number;
  readonly rosterA: number;
  readonly rosterB: number;
  readonly pointsA: number;
  readonly pointsB: number;
  readonly winner: number | null;
  readonly disputed: boolean;
}

export interface ObservedSnapshot {
  readonly week: number;
  readonly matchupId: number;
  readonly rosterA: number;
  readonly rosterB: number;
  readonly pointsA: number;
  readonly pointsB: number;
}

export interface ObservedReward {
  readonly week: number;
  readonly manager: string;
  readonly rosterId: number;
  readonly reason: string;
  readonly amount: number;
}

export interface ObservedLedgerRow {
  readonly manager: string;
  readonly reason: string;
  readonly amount: number;
  readonly idempotencyKey: string | null;
}

export interface ObservedVersion {
  readonly season: number;
  readonly week: number;
  readonly version: number;
  readonly status: string;
  readonly publishable: boolean;
}

/**
 * The whole database, as far as the lifecycle is concerned.
 *
 * One read, so an assertion and the commissioner's report are looking at exactly
 * the same picture — a report generated from a second query could disagree with
 * the test that passed, and the disagreement would be invisible.
 */
export interface LifecycleState {
  readonly season: { readonly year: number; readonly finalized: boolean } | null;
  readonly seats: readonly { readonly manager: string; readonly rosterId: number; readonly balance: number }[];
  readonly games: readonly ObservedGame[];
  readonly snapshots: readonly ObservedSnapshot[];
  readonly finalizations: readonly { readonly week: number; readonly games: number }[];
  readonly rewards: readonly ObservedReward[];
  readonly ledger: readonly ObservedLedgerRow[];
  /**
   * Every stake the season authored.
   *
   * Widened on 2026-08-12 from four fields to nine, so a scenario can observe
   * *what was offered and to whom* rather than only that something was. Tony's
   * Line became personal that day — up to ten rows a week, one manager each —
   * and the Chalkboard became watch-only, and neither property is visible in a
   * key and a status. Purely additive: nothing the harness does changed.
   */
  readonly stakes: readonly {
    readonly stakeKey: string;
    readonly kind: string;
    readonly variant: string;
    readonly week: number;
    readonly status: string;
    /** The eligibility snapshot. Exactly one manager on a personal line. */
    readonly eligibleUserIds: readonly string[];
    /** Null on anything nobody stakes tokens on. */
    readonly stakeTokens: number | null;
    readonly rewardTokens: number | null;
    /** Whom the claim may name. Empty on a league-wide question. */
    readonly allowedNames: readonly string[];
    /** The stake's own written numbers, as it froze them. */
    readonly factRefs: { readonly values: Readonly<Record<string, string>> };
  }[];
  readonly resolutions: readonly { readonly stakeKey: string; readonly outcome: string }[];
  readonly versions: readonly ObservedVersion[];
  readonly boxes: number;
}

export interface SeedInput {
  /**
   * A defect present in the league itself, before a single week is played.
   *
   * `unknown-owner` has to be injected here rather than at sync time:
   * `persistChain` leaves an existing membership alone, so a roster that was
   * seeded correctly and *then* went unresolvable keeps its seat and the
   * rehearsal proves nothing.
   */
  readonly fault?: ScriptedFault;
  /** When the seed read happened. The clock the staleness guard compares to. */
  readonly capturedAt?: Date;
}

export interface Rehearsal {
  readonly db: Database;
  readonly season: number;
  /** Bring the league into the database, exactly as a deploy does. */
  seed(input?: SeedInput): Promise<void>;
  /** `16 §4.3`'s first cron, through the route's own job function. */
  sunday(input: SundayInput): Promise<SundayLeg>;
  /** `16 §4.3`'s second cron, through the job the route calls. */
  tuesday(input: TuesdayInput): Promise<TuesdayReport>;
  /** The commissioner approving a draft. Never a cron. */
  approve(input: { readonly versionId: string; readonly actorUserId: string }): Promise<void>;
  /** The commissioner publishing an approved draft. Never a cron. */
  publish(input: { readonly versionId: string; readonly actorUserId: string }): Promise<void>;
  observe(): Promise<LifecycleState>;
  /** Any manager's id, by display name — for the human halves of the chain. */
  managerIdNamed(displayName: string): Promise<string | null>;
}

const CENTS = 100;

/**
 * When the seed read Sleeper — the preseason, before any week was played.
 *
 * Fixed rather than taken from the clock so the staleness guard has a stored
 * value every rehearsal can reason about: a later read is fresh, a July read is
 * stale, and neither depends on when the suite happened to run.
 */
const SEEDED_AT = new Date('2026-08-01T00:00:00Z');

export function createRehearsal(options: RehearsalOptions): Rehearsal {
  const { db, script } = options;
  const finalizeYears = [...(options.finalizeYears ?? [])];

  if (finalizeYears.includes(script.year)) {
    throw new Error(
      `the rehearsed season (${String(script.year)}) cannot be finalized — a closed ` +
        'season refuses every write, so the rehearsal would only exercise the refusals',
    );
  }

  function source(input: {
    readonly played: number;
    readonly phase: ScriptedPhase;
    readonly capturedAt: Date;
    readonly currentWeek?: number;
    readonly fault?: ScriptedFault;
  }): ScriptedSource {
    return scriptedSeason({
      script,
      played: input.played,
      phase: input.phase,
      capturedAt: input.capturedAt,
      ...(input.currentWeek === undefined ? {} : { currentWeek: input.currentWeek }),
      ...(input.fault === undefined ? {} : { fault: input.fault }),
    });
  }

  return {
    db,
    season: script.year,

    async seed(input?: SeedInput): Promise<void> {
      /*
       * The deploy, reproduced — through the **Week 8 rehearsal's own**
       * `importHistory` rather than a second, thinner copy of it.
       *
       * That is the reconciliation the ownership ruling asks for, at the one
       * place a second harness genuinely existed. The first version of this
       * method seeded the chain, the names and the economy, which is what
       * `lib/slice/tuesday.test.ts` needs — and `importHistory` is what a
       * *deploy* leaves behind: the content every spoken surface draws from, the
       * reward table a box cannot open without, the season's tabs, the opening
       * box, the welcome box, the rings and the significance policy. A rehearsal
       * that starts from less than a deploy leaves behind is rehearsing a state
       * production never has.
       *
       * It is read through the **scripted** source at `played: 0` rather than
       * through the raw fixtures, for two reasons that both matter. It fixes the
       * capture time, so the staleness rehearsal has a stored clock to be older
       * than. And it is the only place a roster-ownership fault can be injected:
       * an owner this league has never seen has to be wrong *before* the seats
       * are created, because `persistChain` leaves an existing membership alone.
       */
      await importHistory(db, {
        finalizeYears,
        leagueId: script.leagueId,
        source: scriptedSeason({
          script,
          played: 0,
          phase: 'final',
          capturedAt: input?.capturedAt ?? SEEDED_AT,
          ...(input?.fault === undefined ? {} : { fault: input.fault }),
        }),
      });
    },

    async sunday(input: SundayInput): Promise<SundayLeg> {
      const played = input.played ?? input.week ?? 0;
      const scripted = source({
        played,
        // The photograph is taken before Monday night, so it reads the earlier
        // of a game's two score lines. That difference is the only thing that
        // makes a comeback sayable at all (`07 §8`).
        phase: 'pre-monday',
        capturedAt: input.capturedAt ?? input.at,
        ...(input.currentWeek === undefined ? {} : { currentWeek: input.currentWeek }),
        ...(input.fault === undefined ? {} : { fault: input.fault }),
      });

      const outcome = await runSundayJob(db, {
        source: scripted,
        at: input.at,
        requestedWeek: input.week ?? null,
      });

      return { outcome, requests: scripted.requests.length };
    },

    async tuesday(input: TuesdayInput): Promise<TuesdayReport> {
      /*
       * The route's own two lines, reproduced because they are the route's:
       * it resolves the open season and passes `?week=` through. Everything
       * below that is `runTuesday`, unmodified.
       */
      const open = await openSeason(db);
      const season = open?.year ?? script.year;

      const scripted = input.withoutSleeper === true
        ? null
        : source({
            played: input.played,
            phase: input.scheduledOnly === true ? 'scheduled' : 'final',
            capturedAt: input.capturedAt ?? input.at,
            ...(input.fault === undefined ? {} : { fault: input.fault }),
          });

      return runTuesday(db, {
        season,
        ...(input.week === undefined ? {} : { week: input.week }),
        at: input.at,
        ...(scripted === null ? {} : { sleeper: scripted }),
        ...(input.env === undefined ? {} : { env: input.env }),
      });
    },

    async approve(input): Promise<void> {
      await approveVersion(db, input);
    },

    async publish(input): Promise<void> {
      await publishVersion(db, input);
    },

    async managerIdNamed(displayName: string): Promise<string | null> {
      const [row] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.displayName, displayName))
        .limit(1);
      return row?.id ?? null;
    },

    async observe(): Promise<LifecycleState> {
      const [season] = await db
        .select({ id: seasons.id, year: seasons.year, finalizedAt: seasons.finalizedAt })
        .from(seasons)
        .where(eq(seasons.year, script.year))
        .limit(1);

      if (season === undefined) {
        return {
          season: null,
          seats: [],
          games: [],
          snapshots: [],
          finalizations: [],
          rewards: [],
          ledger: [],
          stakes: [],
          resolutions: [],
          versions: [],
          boxes: 0,
        };
      }

      const seats = await db
        .select({
          manager: users.displayName,
          rosterId: seasonMemberships.rosterId,
          balance: seasonMemberships.tokenBalance,
          membershipId: seasonMemberships.id,
        })
        .from(seasonMemberships)
        .innerJoin(users, eq(users.id, seasonMemberships.userId))
        .where(eq(seasonMemberships.seasonId, season.id));

      const membershipNames = new Map(seats.map((seat) => [seat.membershipId, seat.manager]));

      const games = await db
        .select({
          week: fantasyMatchups.week,
          weekType: fantasyMatchups.weekType,
          matchupId: fantasyMatchups.sleeperMatchupId,
          rosterA: fantasyMatchups.rosterAId,
          rosterB: fantasyMatchups.rosterBId,
          pointsA: fantasyMatchups.pointsACents,
          pointsB: fantasyMatchups.pointsBCents,
          winner: fantasyMatchups.winnerRosterId,
          disputed: fantasyMatchups.disputed,
        })
        .from(fantasyMatchups)
        .where(eq(fantasyMatchups.seasonId, season.id));

      const snapshots = await db
        .select({
          week: weekSnapshots.week,
          matchupId: weekSnapshots.sleeperMatchupId,
          rosterA: weekSnapshots.rosterAId,
          rosterB: weekSnapshots.rosterBId,
          pointsA: weekSnapshots.pointsACents,
          pointsB: weekSnapshots.pointsBCents,
        })
        .from(weekSnapshots)
        .where(eq(weekSnapshots.seasonId, season.id));

      const finalizations = await db
        .select({ week: weekFinalizations.week, games: weekFinalizations.games })
        .from(weekFinalizations)
        .where(eq(weekFinalizations.seasonId, season.id));

      const rewards = await db
        .select({
          week: weeklyRewards.week,
          membershipId: weeklyRewards.seasonMembershipId,
          rosterId: weeklyRewards.rosterId,
          reason: weeklyRewards.reason,
          amount: weeklyRewards.amount,
        })
        .from(weeklyRewards)
        .where(eq(weeklyRewards.seasonId, season.id));

      /*
       * The ledger is keyed by **seat**, not by user: `token_transactions` holds
       * a `season_membership_id`, which is what makes a balance a seasonal fact
       * (`11 §2`). Joining out to the person is this reader's job, not the
       * table's.
       */
      const ledger = await db
        .select({
          manager: users.displayName,
          reason: tokenTransactions.reasonCode,
          amount: tokenTransactions.amount,
          idempotencyKey: tokenTransactions.idempotencyKey,
        })
        .from(tokenTransactions)
        .innerJoin(
          seasonMemberships,
          eq(seasonMemberships.id, tokenTransactions.seasonMembershipId),
        )
        .innerJoin(users, eq(users.id, seasonMemberships.userId))
        .where(eq(seasonMemberships.seasonId, season.id));

      const stakes = await db
        .select({
          id: weeklyStakes.id,
          stakeKey: weeklyStakes.stakeKey,
          kind: weeklyStakes.kind,
          variant: weeklyStakes.variant,
          week: weeklyStakes.week,
          status: weeklyStakes.status,
          eligibleUserIds: weeklyStakes.eligibleUserIds,
          stakeTokens: weeklyStakes.stakeTokens,
          rewardTokens: weeklyStakes.rewardTokens,
          allowedNames: weeklyStakes.allowedNames,
          factRefs: weeklyStakes.factRefs,
        })
        .from(weeklyStakes)
        .where(eq(weeklyStakes.seasonId, season.id));

      const stakeKeys = new Map(stakes.map((stake) => [stake.id, stake.stakeKey]));

      const resolutions = await db
        .select({ stakeId: stakeResolutions.stakeId, outcome: stakeResolutions.outcome })
        .from(stakeResolutions);

      const versions = await db
        .select({
          season: seasons.year,
          week: sliceIssues.week,
          version: sliceIssueVersions.version,
          status: sliceIssueVersions.status,
          publishable: sliceIssueVersions.publishable,
        })
        .from(sliceIssueVersions)
        .innerJoin(sliceIssues, eq(sliceIssues.id, sliceIssueVersions.issueId))
        .innerJoin(seasons, eq(seasons.id, sliceIssues.seasonId));

      /*
       * Boxes belong to a **person**, not to a season — a collectible persists
       * across seasons and `16 §8` is explicit that only tokens reset. So this
       * counts every box in the database rather than filtering by season, which
       * is the honest shape for "did the Tuesday job hand any out".
       */
      const boxes = await db.select({ id: lootBoxes.id }).from(lootBoxes);

      return {
        season: { year: season.year, finalized: season.finalizedAt !== null },
        seats: seats
          .map((seat) => ({
            manager: seat.manager,
            rosterId: seat.rosterId,
            balance: seat.balance,
          }))
          .sort((a, b) => a.rosterId - b.rosterId),
        games: games
          .map((game) => ({
            ...game,
            pointsA: game.pointsA / CENTS,
            pointsB: game.pointsB / CENTS,
          }))
          .sort((a, b) => a.week - b.week || a.matchupId - b.matchupId),
        snapshots: snapshots
          .map((row) => ({
            ...row,
            pointsA: row.pointsA / CENTS,
            pointsB: row.pointsB / CENTS,
          }))
          .sort((a, b) => a.week - b.week || a.matchupId - b.matchupId),
        finalizations: [...finalizations].sort((a, b) => a.week - b.week),
        rewards: rewards
          .map((row) => ({
            week: row.week,
            manager: membershipNames.get(row.membershipId) ?? '(unknown seat)',
            rosterId: row.rosterId,
            reason: row.reason,
            amount: row.amount,
          }))
          .sort((a, b) => a.week - b.week || a.reason.localeCompare(b.reason) || a.rosterId - b.rosterId),
        ledger: [...ledger].sort(
          (a, b) => a.manager.localeCompare(b.manager) || (a.idempotencyKey ?? '').localeCompare(b.idempotencyKey ?? ''),
        ),
        stakes: stakes
          .map((stake) => ({
            stakeKey: stake.stakeKey,
            kind: stake.kind,
            variant: stake.variant,
            week: stake.week,
            status: stake.status,
            eligibleUserIds: stake.eligibleUserIds,
            stakeTokens: stake.stakeTokens,
            rewardTokens: stake.rewardTokens,
            allowedNames: stake.allowedNames,
            factRefs: stake.factRefs as { values: Record<string, string> },
          }))
          .sort((a, b) => a.week - b.week || a.stakeKey.localeCompare(b.stakeKey)),
        resolutions: resolutions
          .map((row) => ({
            stakeKey: stakeKeys.get(row.stakeId) ?? '(another season)',
            outcome: row.outcome,
          }))
          .sort((a, b) => a.stakeKey.localeCompare(b.stakeKey)),
        versions: [...versions].sort(
          (a, b) => a.season - b.season || a.week - b.week || a.version - b.version,
        ),
        boxes: boxes.length,
      };
    },
  };
}

/**
 * A database whose transactions all roll back at the last moment.
 *
 * ## What this rehearses, and why nothing else can
 *
 * *"The process died at a meaningful boundary"* is the one failure a normal test
 * cannot stage. Every other injection in this suite is a state the world can
 * produce — an unreachable upstream, a malformed payload, a week nobody played —
 * but a transaction that does all of its work and then fails to commit is a
 * property of the machine, and it is the exact failure that a single-transaction
 * claim exists to survive.
 *
 * So the work is done for real, against real Postgres, and the commit is taken
 * away: the callback runs to completion and then this throws, which is what
 * makes the driver roll the whole thing back. If `awardWeek` were paying outside
 * its transaction — or paying half a league per transaction — this is what would
 * show it, because the ledger would keep what the report claims it did not.
 *
 * Everything except `transaction` is the real database, untouched.
 */
export function abortingCommits(db: Database): Database {
  type Transact = (callback: (tx: unknown) => Promise<unknown>, ...rest: unknown[]) => Promise<unknown>;

  return new Proxy(db, {
    get(target, property, receiver): unknown {
      if (property !== 'transaction') return Reflect.get(target, property, receiver) as unknown;

      // Bound to the real handle: drizzle's `transaction` reads its own session
      // off `this`, so an unbound call would fail for a reason that has nothing
      // to do with what is being rehearsed.
      const transact = (target.transaction as unknown as Transact).bind(target);

      return (callback: (tx: unknown) => Promise<unknown>, ...rest: unknown[]) =>
        transact(async (tx: unknown) => {
          await callback(tx);
          throw new Error('injected: the process died before the commit');
        }, ...rest);
    },
  });
}
