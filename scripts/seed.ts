/**
 * Brings a database up to a servable state.
 *
 *   npm run db:seed
 *
 * Six idempotent steps, safe to run on every deploy and safe to run twice:
 *
 *   1. import the league chain from recorded fixtures
 *   2. apply the names Tony uses, from `content/managers.md`
 *   3. seed the Counter Greetings from `content/counter-greetings.md`
 *   4. open each manager's token tab and put one box on their tray
 *   5. store the significance policy a fantasy fact is classified under
 *   6. grant admin to the commissioner named in the environment
 *
 * Fixtures rather than the live API, deliberately (`16 §12`): the import is
 * then offline, repeatable, and identical in every environment, and a Sleeper
 * outage cannot take a deploy down with it.
 *
 * Nothing here is destructive. Re-running reports zero changes.
 */
import { eq } from 'drizzle-orm';

import { now } from '@/lib/clock';
import { readManagerNames, seedManagerNames } from '@/lib/content/managers';
import { SHIPPED_RULES, ensureBlackjackRules } from '@/lib/casino/blackjack-rules';
import {
  SHIPPED_TABLE,
  ensureCasinoTable,
  shippedReturnRate,
} from '@/lib/casino/table';
import { ensureRewardTable, grantBox } from '@/lib/counter/boxes';
import { grantChampionshipRings } from '@/lib/counter/rings';
import { grantSeasonalBoxes } from '@/lib/counter/grants';
import { applyTokenDelta, ensureEconomyConfig, openSeason } from '@/lib/counter/tokens';
import { CATALOG_SIZE } from '@/lib/counter/catalog';
import { standardRewardTable } from '@/lib/counter/rewards';
import { ensureSignificancePolicy, standardPolicy } from '@/lib/stats/significance';
import {
  assertOnlyApprovedGroups,
  readBoxOffers,
  readCounterGreetings,
  readStatsAsides,
  seedBoxOffers,
  seedCounterGreetings,
  seedStatsAsides,
} from '@/lib/content/seed';
import { closePool, getDb } from '@/lib/db';
import { seasonMemberships, users } from '@/lib/db/schema';
import { traverseChain } from '@/lib/sleeper/chain';
import { createFixtureSource } from '@/lib/sleeper/fixtures';
import { persistChain } from '@/lib/sleeper/persist';
import { DRAFT_SYNC_REFUSALS, syncSeasonDraft } from '@/lib/sleeper/persist-draft';

const DEFAULT_LEAGUE_ID = '1385016656425668608';

/**
 * Seasons whose official record is closed.
 *
 * A deliberate list, not a query. Sleeper flips a season to `complete` the
 * moment its final game ends, while NFL stat corrections keep arriving for
 * weeks — 2024's standings and its weekly points disagree to this day because
 * of exactly that. Finalizing on Sleeper's word would freeze a record that was
 * still moving, so a human names the years instead.
 */
const FINALIZED_SEASONS = [2024, 2025] as const;

/**
 * The grant-key prefix for the seeded fixture box.
 *
 * Versioned in the string. If a later slice ever needs to grant a *second*
 * fixture box deliberately, it uses a new prefix — which is a visible, reviewable
 * change, rather than the invisible one where a key is reused and every manager
 * silently gets another box on the next deploy.
 */
const FIXTURE_BOX_GRANT = 'seed:m2s1:standard';

async function main(): Promise<void> {
  if ((process.env['DATABASE_URL'] ?? '') === '') {
    console.error('DATABASE_URL is not set. See .env.example.');
    process.exit(1);
  }

  const db = getDb();

  try {
    // --- 1. League history ------------------------------------------------
    const source = createFixtureSource();
    const leagueId = process.env['SLEEPER_LEAGUE_ID'] ?? DEFAULT_LEAGUE_ID;
    /*
     * Weeks are imported now.
     *
     * They were skipped while nothing read them, and the seed ran on every
     * deploy. `fantasy_matchups` changes that: the stats fact layer derives
     * every publishable claim about a game from a stored row, so the rows have
     * to exist in every environment the moment the layer does.
     *
     * It stays idempotent — a re-import of an unchanged week reports zero
     * records changed, and a re-import that *disagrees* with a finalized season
     * writes nothing and records a conflict.
     */
    const chain = await traverseChain(source, leagueId, { includeWeeks: true });

    if (chain.seasons.length === 0) {
      console.error('The chain produced no seasons; nothing to import.');
      for (const error of chain.errors) console.error(`  ${error}`);
      process.exit(1);
    }

    const imported = await persistChain(db, chain, {
      sourceLabel: source.label,
      // Named explicitly, never derived from Sleeper's `complete` status. Both
      // seasons are closed and their records are verified, so this is where the
      // finalized-immutability guard actually engages in a real environment —
      // without it the trigger exists and never protects anything.
      //
      // 2026 is deliberately absent: it will be finalized when somebody decides
      // its books are closed, not automatically when Sleeper says so.
      finalizeYears: FINALIZED_SEASONS,
    });
    console.log(
      `History  ${String(imported.seasons.length)} seasons · ` +
        `${String(imported.recordsChanged)} records changed · status ${imported.status}`,
    );
    for (const season of imported.seasons.filter((candidate) => candidate.finalized)) {
      console.log(`         ${String(season.year)} finalized — official record now immutable`);
    }

    // --- 1b. The drafts ---------------------------------------------------
    //
    // Read from the same recorded fixtures the history came from, and stored
    // beside it. Two requests a season, idempotent by `(draft_id, pick_no)`, so
    // a redeploy adds nothing.
    //
    // It runs **after** `persistChain` because a draft pick resolves to a
    // manager through `season_memberships`, which persistChain writes. A draft
    // stored first would be ten rows nobody could attribute.
    //
    // 2026 is the one that matters and it is the one that will be empty for a
    // while: the league has not drafted, so Sleeper returns a draft in
    // `pre_draft` with no picks, this stores the status and nothing else, and
    // the preseason issue stays correctly unavailable.
    for (const season of chain.seasons) {
      const draft = await syncSeasonDraft(db, {
        source,
        seasonYear: season.year,
        leagueId: season.leagueId,
      });
      console.log(
        `Draft    ${String(season.year)} · ` +
          (draft.refusal === null
            ? `${String(draft.picksStored)} picks · ${draft.outcome ?? 'unchanged'}`
            : DRAFT_SYNC_REFUSALS[draft.refusal]),
      );
      for (const warning of draft.warnings) console.warn(`         ${warning}`);
    }

    // --- 2. The names Tony uses -------------------------------------------
    //
    // Straight after the import and before anything reads a name: the import
    // seeds a display name from Sleeper once and never touches it again, and
    // this is what turns that username into the person's name (`16 §4`).
    const roster = await seedManagerNames(db, readManagerNames());
    console.log(
      `Names    ${String(roster.renamed.length)} renamed` +
        (roster.renamed.length > 0 ? ` — ${roster.renamed.join(', ')}` : ''),
    );
    if (roster.unmatched.length > 0) {
      console.warn(`Names    not in the database yet: ${roster.unmatched.join(', ')}`);
    }

    // --- 3. Content -------------------------------------------------------
    const parsed = readCounterGreetings();
    const seeded = await seedCounterGreetings(db, parsed);
    console.log(
      `Content  ${String(seeded.keys.length)} Counter Greetings · ` +
        `${String(seeded.inserted)} new · ${String(seeded.updated)} updated · ` +
        `${String(seeded.deactivated)} retired`,
    );

    // The other end of the pizza-box loop: what Tony says when a box has just
    // been opened and another is affordable (`content/box-offer.md`).
    const offers = await seedBoxOffers(db, readBoxOffers());
    console.log(
      `Content  ${String(offers.keys.length)} box offers · ` +
        `${String(offers.inserted)} new · ${String(offers.updated)} updated · ` +
        `${String(offers.deactivated)} retired`,
    );

    // Tony mentioning a result the fact layer verified
    // (`content/counter-stats.md`). Approved 2026-07-31.
    const asides = await seedStatsAsides(db, readStatsAsides());
    console.log(
      `Content  ${String(asides.keys.length)} stats asides · ` +
        `${String(asides.inserted)} new · ${String(asides.updated)} updated · ` +
        `${String(asides.deactivated)} retired`,
    );

    await assertOnlyApprovedGroups(db);

    // --- 4. The tray ------------------------------------------------------
    //
    // The reward table is stored before any box exists to open, because
    // `18 §4.3` requires openings to resolve against a *stored* table — the
    // service refuses to roll against a version this database has never
    // recorded rather than writing one on first use.
    const { version } = await ensureRewardTable(db);
    const table = standardRewardTable();
    console.log(
      `Rewards  table ${version} · ${String(table.entries.length)} items · ` +
        `total weight ${String(table.totalWeight)} · PROVISIONAL until the P3 simulation`,
    );

    //
    // The slot machine's paytable, stored for the same reason and refusing the
    // same way: `spin` will not roll against a version this database has never
    // recorded. `ensureCasinoTable` also refuses to store an *incoherent* table,
    // so a paytable that put a common symbol above a rare one — or breached the
    // per-spin ceiling — could never reach a database at all.
    //
    // Stored even though `underground: false`. A configuration that only appears
    // when a door opens is a configuration nobody has ever seen work.
    const casino = await ensureCasinoTable(db);
    console.log(
      `Casino   slots table ${casino.version} · RTP ${(shippedReturnRate() * 100).toFixed(2)}% · ` +
        `buttons ${SHIPPED_TABLE.wagers.join('/')} · PROVISIONAL — the Underground is shut`,
    );

    //
    // The blackjack rules, versioned the same way and refusing the same way: an
    // odd wager cannot pay 3:2 in whole tokens, so `ensureBlackjackRules` will
    // not store a ladder that contains one.
    //
    const blackjack = await ensureBlackjackRules(db);
    console.log(
      `Casino   blackjack rules ${blackjack.version} · wagers ${SHIPPED_RULES.wagers.join('/')} · ` +
        `natural ${String(SHIPPED_RULES.naturalNumerator)}:${String(SHIPPED_RULES.naturalDenominator)} · ` +
        `dealer stands on ${String(SHIPPED_RULES.dealerStandsOn)} · PROVISIONAL — the table is shut`,
    );

    if (table.entries.length !== CATALOG_SIZE) {
      // Loud and fatal. `16` approves a 24-item catalog; a registry edit that
      // changes the count changes the economy, and it should not be possible to
      // discover that from a screenshot weeks later.
      throw new Error(
        `the catalog holds ${String(table.entries.length)} items, not ${String(CATALOG_SIZE)}. ` +
          'If the change is intended, update CATALOG_SIZE and say so in the pull request. ' +
          'Never delete an approved slug to satisfy an older count.',
      );
    }

    /*
     * The season's opening balance.
     *
     * `03 §4` names 250 as the first-season starting balance, and it is the only
     * token source that can honestly exist today: matchup wins and weekly high
     * scores need a season that has been played, and the two cron jobs that would
     * award them are not built (`16 §4.3`). Inventing a weekly reward that fires
     * on nothing would be fabricated data.
     *
     * Idempotent through the ledger's own key, so every deploy grants it once
     * and never again — including after it has been spent, which is the case that
     * matters. The amount is provisional until the P3 simulation.
     */
    const open = await openSeason(db);
    if (open === null) {
      console.log('Tokens   no open season, so no wallets to open.');
    } else {
      const economy = await ensureEconomyConfig(db, open.id);
      const seated = await db
        .select({ userId: seasonMemberships.userId })
        .from(seasonMemberships)
        .where(eq(seasonMemberships.seasonId, open.id));

      for (const seat of seated) {
        await applyTokenDelta(db, {
          userId: seat.userId,
          seasonId: open.id,
          amount: economy.values.seasonStartTokens,
          reason: 'SEASON_START',
          description: `Tony opens a tab for the ${String(open.year)} season.`,
          idempotencyKey: `season-start:${open.id}:${seat.userId}`,
        });
      }

      console.log(
        `Tokens   ${String(open.year)} · config ${economy.version} · ` +
          `${String(economy.values.seasonStartTokens)} opening tokens x ${String(seated.length)} seats · ` +
          `box ${String(economy.values.standardBoxPriceTokens)} · ` +
          // Every value in the config, not a chosen two. `economyFor` now refuses
          // a config missing a key, and this is where an operator sees which
          // version a deploy actually stored.
          `line ${String(economy.values.weeklyLineStakeTokens)} · ` +
          `bounty ${String(economy.values.bountyRewardTokens)} · ` +
          `win ${String(economy.values.matchupWinTokens)} · ` +
          `high ${String(economy.values.weeklyHighScoreTokens)} · ` +
          `salvage ${String(economy.values.salvageCommonTokens)}/` +
          `${String(economy.values.salvageRareTokens)}/` +
          `${String(economy.values.salvageEpicTokens)}/` +
          `${String(economy.values.salvageLegendaryTokens)} · ` +
          // The P3 simulation has run and the commissioner has ruled
          // (`docs/ECONOMY_SIMULATION.md`). The row stays flagged `provisional`
          // because that column means "these may still be re-versioned", which
          // is true of every economy config and always will be.
          `reviewed at P3 · provisional row`,
      );

      /*
       * The season-opening free box, from the 2026-08-04 economy ruling.
       *
       * Here rather than in the Tuesday job for one reason: *"season-opening"*
       * means before a ball is thrown, and the Tuesday job first runs after week
       * one has been played. The job grants it too — `milestonesDue` is
       * monotonic, so a season that was never seeded still catches up — and both
       * callers write the same `grant_key`, so whichever arrives first is the
       * only one that writes anything.
       *
       * `week: 0` is the season before it starts, so only the opening milestone
       * is due. The midseason box is the Tuesday job's, because only the job
       * knows what week it is.
       */
      const seasonal = await grantSeasonalBoxes(db, { seasonYear: open.year, week: 0 });
      console.log(
        seasonal.refusal !== null
          ? `Grants   none — ${seasonal.refusal}`
          : `Grants   ${String(seasonal.granted)} season-opening boxes granted · ` +
              `${String(seasonal.alreadyGranted)} seats already had theirs · ` +
              `${String(seasonal.seats)} active seats`,
      );
    }

    /*
     * The house's welcome box — one per manager, granted once, ever.
     *
     * This began as a fixture, because slice 1 had no way to acquire a box and one
     * had to come from somewhere. Purchase exists now, so that justification is
     * gone and the grant is kept for a different and better reason: **the first
     * box should not cost anything.** A manager's first visit ends with them
     * opening something rather than doing arithmetic about whether to, and it costs
     * the economy nothing that P3 has to model — it is one box, once, forever.
     *
     * `grantKey` is what keeps it a gift rather than a faucet: the key is stable
     * per manager, so every subsequent deploy grants nothing — **including after
     * the box has been opened**, which is the case that matters. A re-grant of an
     * opened box would be a reroll dressed up as a deployment.
     */
    const managers = await db.select({ id: users.id }).from(users);
    let granted = 0;
    for (const manager of managers) {
      const result = await grantBox(db, {
        userId: manager.id,
        grantKey: `${FIXTURE_BOX_GRANT}:${manager.id}`,
        source: 'seed',
      });
      if (result.granted) granted += 1;
    }
    console.log(
      `Tray     ${String(granted)} welcome boxes granted · ` +
        `${String(managers.length - granted)} managers already had theirs`,
    );

    /*
     * --- Championship rings ----------------------------------------------
     *
     * `16 §368`: historical rings are granted *"once their seasons are verified
     * through any tier"*, and by this point in the seed they are — the import
     * above finalized 2024 and 2025.
     *
     * Run on every seed, and therefore on every deploy, because that is the
     * cheapest possible statement of the guarantee: if the backfill is only ever
     * correct when run once, it is not idempotent, and `collectibles.grant_key`
     * is UNIQUE precisely so that nobody has to remember whether it has already
     * happened. A season finalized later is picked up the next time this runs
     * with no migration and no manual step.
     */
    const rings = await grantChampionshipRings(db);
    console.log(
      `Rings    ${String(rings.granted)} championship rings granted · ` +
        `${String(rings.alreadyHeld)} already held · ${String(rings.titles)} verified titles`,
    );

    /*
     * --- 5. What a margin means ------------------------------------------
     *
     * Stored before anything derives a fact, for the same reason the reward
     * table is stored before a box can be opened: a fact records the policy
     * version it was classified under, so the version has to be a row somebody
     * can look up rather than a constant that was live at the time.
     *
     * Append-only and provisional until the P3 calibration (`16 §8`).
     */
    const significance = await ensureSignificancePolicy(db);
    const policy = standardPolicy();
    console.log(
      `Meaning  significance ${significance.version} · ` +
        `${String(policy.tiers.length)} tiers · edged <= ${String(policy.edgedMaxMargin)} · ` +
        `percentile needs ${String(policy.minPopulation)} games · PROVISIONAL until the P3 calibration`,
    );

    // --- 6. The commissioner ----------------------------------------------
    const commissioner = process.env['COMMISSIONER_SLEEPER_USER_ID'] ?? '';

    if (commissioner === '') {
      console.log('Admin    COMMISSIONER_SLEEPER_USER_ID is unset — nobody is an admin.');
    } else {
      const granted = await db
        .update(users)
        .set({ isAdmin: true, updatedAt: now() })
        .where(eq(users.sleeperUserId, commissioner))
        .returning({ name: users.displayName });

      const name = granted[0]?.name;
      if (name === undefined) {
        // Loud, but not fatal: a wrong ID should not take down a deploy, and
        // the safe outcome — nobody is an admin — is already in force.
        console.warn(
          `Admin    no manager has Sleeper ID ${commissioner}; no admin was granted.`,
        );
      } else {
        console.log(`Admin    ${name}`);
      }
    }
  } finally {
    await closePool();
  }
}

main().catch((error: unknown) => {
  console.error(`\nSeed failed: ${error instanceof Error ? error.message : String(error)}`);
  void closePool().finally(() => {
    process.exit(1);
  });
});
