import { sql } from 'drizzle-orm';

import { type Database } from './index';

/**
 * `resetDatabase`, alone, so it can be used outside vitest.
 *
 * It lived in `test-helpers.ts` beside `expectPgError`, which imports `expect`
 * from vitest — and a vitest import is unloadable from a plain `tsx` script.
 * `scripts/week8-rehearsal.ts` needs exactly this function and none of the
 * assertion helpers, so the split is along the line the dependency already
 * drew. `test-helpers.ts` re-exports it, so every existing caller is unchanged
 * and there is still **one** list of tables.
 */

/**
 * Empty every application table.
 *
 * One statement, listing the tables by name, rather than each test file
 * deleting the handful it happens to know about. The foreign keys are
 * `RESTRICT` by design — a person is never deleted out from under their own
 * history — so a file that truncates `users` while another table still
 * references a row fails, and it fails in whichever test file happens to run
 * first rather than in the one that added the table.
 *
 * `CASCADE` here follows the constraint graph within the truncation itself; it
 * cannot reach anything outside this list.
 *
 * **Add new tables to this list.** A missing table means a test starting from
 * a state some earlier file left behind.
 *
 * On finalized seasons: `TRUNCATE` does not fire the row-level triggers that
 * make a finalized season's memberships immutable, so this works without
 * un-finalizing anything first. That is not a hole in the guarantee —
 * `TRUNCATE` needs table ownership, which no application code path holds, and
 * the guard exists to stop an UPDATE or DELETE that an importer, a script, or a
 * hand-run statement could plausibly issue. A test harness that owns the
 * database is outside that threat model by construction.
 */
export async function resetDatabase(db: Database): Promise<void> {
  await db.execute(
    sql`truncate table
      content_usage_log,
      content_entries,
      admin_audit_logs,
      auth_attempts,
      sessions,
      -- Manager rooms. Listed before collectibles because a placement holds a
      -- RESTRICT reference to one; the cascade would reach it either way, and
      -- naming it is the rule this list's own header states.
      room_placements,
      rooms,
      collectibles,
      box_openings,
      loot_boxes,
      reward_tables,
      -- Listed rather than left to the cascade. fantasy_matchups is reached
      -- transitively through seasons, so omitting it happened to work; and
      -- significance_policies has no foreign key at all, so it would have
      -- survived every reset. A table that empties only by accident is a table
      -- that stops emptying the moment its constraints change.
      fantasy_matchups,
      significance_policies,
      -- Weekly stakes, listed for the reason above: every one of these tables
      -- refuses DELETE by trigger, so a test file that tried to clean up after
      -- itself would fail rather than leave rows behind. TRUNCATE is how a
      -- harness that owns the database resets an append-only table.
      stake_resolutions,
      stake_entries,
      weekly_stakes,
      week_finalizations,
      -- The pre-Monday snapshot, listed for the same reason: it refuses DELETE
      -- by trigger, and it protects a fact rather than an audit trail — the
      -- score before Monday is unrecoverable once Monday has happened.
      week_snapshots,
      weekly_rewards,
      -- The Slice review chain, listed for the same reason: versions, reviews
      -- and holds all refuse DELETE by trigger. slice_issues and
      -- slice_issue_versions reference each other, so both must be named in
      -- one TRUNCATE rather than emptied in sequence.
      slice_reviews,
      slice_publication_holds,
      slice_issue_versions,
      slice_issues,
      -- The draft and Tony's judgment of it. draft_picks refuses UPDATE and
      -- DELETE by trigger — a completed draft does not change — so TRUNCATE is
      -- again the only way a harness that owns the database resets it. The
      -- reviews are listed before the picks they reference.
      slice_draft_reviews,
      draft_picks,
      season_drafts,
      token_transactions,
      economy_configs,
      season_memberships,
      seasons,
      sync_runs,
      users
    restart identity cascade`,
  );
}
