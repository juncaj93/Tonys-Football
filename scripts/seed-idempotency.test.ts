import { execFileSync } from 'node:child_process';

import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closePool, getDb } from '@/lib/db';
import { resetDatabase } from '@/lib/db/test-helpers';

/**
 * The seed runs on **every production deploy**, and it must be able to.
 *
 * `docs/DEPLOYMENT.md`: `vercel-build` is `migrate → seed → build`. So the seed
 * is not a one-off that somebody runs carefully on an empty database — it runs
 * again on a database that already holds a season of real ledger entries, real
 * collectibles and real openings, every time anybody merges to `main`.
 *
 * That makes idempotency a **production safety property** rather than a tidiness
 * one, and it is the kind that fails quietly: a second run that inserted a
 * duplicate content entry would not error, would not fail a gate, and would show
 * up weeks later as Tony repeating himself twice as often as his cooldown allows.
 *
 * ## What this actually runs
 *
 * The real `scripts/seed.ts`, twice, in a subprocess — not a helper that
 * approximates it. A test that reimplemented the sequence would be testing the
 * reimplementation, and the sequence is exactly what a deploy executes.
 *
 * ## What it asserts
 *
 * That the **second run changes nothing**: identical row counts across every
 * table the seed touches, and identical content in the ones where a duplicate
 * would be invisible in a count.
 */

const hasDatabase = (process.env['DATABASE_URL'] ?? '') !== '';

if (process.env['CI'] === 'true' && !hasDatabase) {
  throw new Error('DATABASE_URL must be set in CI so integration tests actually run.');
}

const db = hasDatabase ? getDb() : null;

/**
 * Every table a deploy's seed writes to.
 *
 * Named rather than discovered, so a new table that the seed starts writing has
 * to be added here on purpose. A count over `information_schema` would silently
 * start covering it and silently stop the moment somebody renamed something.
 */
const SEEDED_TABLES = [
  'users',
  'seasons',
  'season_memberships',
  'fantasy_matchups',
  'content_entries',
  'reward_tables',
  'economy_configs',
  'significance_policies',
  'loot_boxes',
  'token_transactions',
] as const;

async function counts(): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const table of SEEDED_TABLES) {
    const result = await db!.execute<{ n: number }>(
      sql.raw(`select count(*)::int as n from ${table}`),
    );
    out[table] = Number((result.rows[0] as { n: number } | undefined)?.n ?? 0);
  }
  return out;
}

/**
 * The deploy's own command, with the two values a deploy always has.
 *
 * Supplied here rather than assumed from the shell: CI sets `DATABASE_URL` and
 * nothing else, and a test that silently skipped because a variable was missing
 * would be the least useful possible outcome for a check about deploys.
 */
function runSeed(): void {
  execFileSync('npx', ['tsx', 'scripts/seed.ts'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      SESSION_SECRET:
        process.env['SESSION_SECRET'] ?? 'local_throwaway_secret_thirty_two_chars_min',
      SLEEPER_LEAGUE_ID: process.env['SLEEPER_LEAGUE_ID'] ?? '1385016656425668608',
    },
    stdio: 'pipe',
  });
}

describe.skipIf(!hasDatabase)('the deploy seed', () => {
  let first: Record<string, number>;
  let second: Record<string, number>;
  let firstContent: string;
  let secondContent: string;

  beforeAll(async () => {
    await resetDatabase(db!);

    runSeed();
    first = await counts();
    firstContent = await contentFingerprint();

    // Exactly what the next merge to `main` does.
    runSeed();
    second = await counts();
    secondContent = await contentFingerprint();
  }, 300_000);

  afterAll(async () => {
    if (hasDatabase) await closePool();
  });

  it('inserts something the first time', () => {
    // A seed that no-oped would satisfy every assertion below.
    expect(first['users']).toBeGreaterThan(0);
    expect(first['content_entries']).toBeGreaterThan(0);
    expect(first['fantasy_matchups']).toBeGreaterThan(0);
  });

  it('changes no row count the second time', () => {
    expect(second).toEqual(first);
  });

  it('leaves every content entry exactly as it was', () => {
    /*
     * The count alone is not enough here.
     *
     * `seedSurface` deactivates a line that has left the file and updates one
     * whose text has changed, so a bug that rewrote every entry on each run would
     * keep the count identical and reset every cooldown in the league. The
     * fingerprint covers the fields a manager would notice.
     */
    expect(secondContent).toBe(firstContent);
  });

  it('grants no second welcome box', async () => {
    /*
     * The most expensive thing a non-idempotent seed could do.
     *
     * `box_openings.box_id UNIQUE` stops a box being *opened* twice; nothing
     * stops one being *granted* twice except the grant being idempotent. A
     * duplicate welcome box on every deploy would be free loot proportional to
     * how often anybody merged.
     */
    const result = await db!.execute<{ n: number }>(
      sql.raw(
        `select count(*)::int as n from (
           select user_id from loot_boxes group by user_id having count(*) > 1
         ) duplicated`,
      ),
    );
    expect(Number((result.rows[0] as { n: number } | undefined)?.n ?? 0)).toBe(0);
  });
});

/** Content as a manager would experience it: key, text, active, cooldown. */
async function contentFingerprint(): Promise<string> {
  const result = await db!.execute<{ line: string }>(
    sql.raw(
      `select key || '|' || surface || '|' || template_text || '|' || active::text
              || '|' || cooldown_days::text as line
         from content_entries order by surface, key`,
    ),
  );
  return (result.rows as { line: string }[]).map((row) => row.line).join('\n');
}
