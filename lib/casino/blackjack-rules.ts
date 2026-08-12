import { createHash } from 'node:crypto';

import { desc, eq } from 'drizzle-orm';

import { type Queryable } from '@/lib/db';
import { casinoTables } from '@/lib/db/schema';

/**
 * The blackjack rules, versioned like every other economy value in this product.
 *
 * ## Why these are stored rather than constants
 *
 * A hand recorded in October must still mean in March what it meant when it was
 * played. `casino_tables` already gives that for slots — a content hash, an
 * append-only row, and a foreign key from the record to the version — and
 * blackjack gets it for the same reason and through the same mechanism. If the
 * wager buttons ever move, old hands keep pointing at the buttons they were
 * actually played on.
 *
 * ## The rules themselves are the commissioner's
 *
 * Ruling of 2026-08-12: hit · stand · natural · bust · dealer draw · push;
 * **dealer stands on all 17**; natural pays **3:2**; no double, split, surrender
 * or insurance; wagers **20 / 40 / 80**. The measured house edge under exactly
 * these rules is **2.03%** (`docs/CASINO_BOUNDARY.md §3`).
 *
 * Do not tune them. There is no simulation here that would justify it, and the
 * approved edge is a fact about this rule set.
 */

export interface BlackjackRules {
  /** The buttons. Even, so a 3:2 natural is always whole tokens. */
  readonly wagers: readonly number[];
  /** A natural pays `numerator / denominator` of the wager, on top of it. */
  readonly naturalNumerator: number;
  readonly naturalDenominator: number;
  /** The dealer draws below this and stands on it. **All** 17, hard or soft. */
  readonly dealerStandsOn: number;
}

export const SHIPPED_RULES: BlackjackRules = {
  wagers: [20, 40, 80],
  naturalNumerator: 3,
  naturalDenominator: 2,
  dealerStandsOn: 17,
};

/**
 * What a finished hand returns to the manager, in tokens.
 *
 * **Gross, not net.** A win returns the wager *and* the winnings, because the
 * wager left the tab when the hand was dealt — R13's two distinct movements. A
 * push returns exactly the wager, which is the ruling's *"wager debit, wager
 * return"* and is also the only representation the ledger accepts: a net-zero
 * delta is refused by `apply_token_delta` outright.
 */
export function payoutFor(
  outcome: 'player_natural' | 'dealer_natural' | 'push' | 'win' | 'loss' | 'bust',
  wager: number,
  rules: BlackjackRules = SHIPPED_RULES,
): number {
  switch (outcome) {
    case 'player_natural': {
      const winnings = (wager * rules.naturalNumerator) / rules.naturalDenominator;
      if (!Number.isInteger(winnings)) {
        /*
         * Unreachable with the approved even wagers, and loud rather than
         * rounded if it ever becomes reachable. Rounding a 3:2 payout is how a
         * casino quietly becomes a 6:5 casino, which the commissioner refused by
         * name.
         */
        throw new Error(
          `a ${String(wager)}-token natural pays ${String(winnings)}, which is not whole tokens`,
        );
      }
      return wager + winnings;
    }
    case 'win':
      return wager * 2;
    case 'push':
      return wager;
    case 'dealer_natural':
    case 'loss':
    case 'bust':
      return 0;
  }
}

/** Content hash of the rules. Two environments seeding the same rules agree. */
export function rulesVersion(rules: BlackjackRules = SHIPPED_RULES): string {
  const canonical = [
    'game:blackjack',
    `wagers:${rules.wagers.join(',')}`,
    `natural:${String(rules.naturalNumerator)}/${String(rules.naturalDenominator)}`,
    `stands:${String(rules.dealerStandsOn)}`,
  ].join('|');
  return createHash('sha256').update(canonical).digest('hex').slice(0, 16);
}

/**
 * The rules a paytable must satisfy to be offerable.
 *
 * Returns the failures. The wager check is the load-bearing one: an odd wager
 * makes a 3:2 natural fractional, and tokens are integers.
 */
export function auditRules(rules: BlackjackRules): readonly string[] {
  const problems: string[] = [];

  if (rules.wagers.length === 0) problems.push('there are no wager buttons');

  for (const wager of rules.wagers) {
    if (!Number.isInteger(wager) || wager <= 0) {
      problems.push(`${String(wager)} is not a positive whole number of tokens`);
      continue;
    }
    if ((wager * rules.naturalNumerator) % rules.naturalDenominator !== 0) {
      problems.push(
        `a ${String(wager)}-token wager cannot pay ` +
          `${String(rules.naturalNumerator)}:${String(rules.naturalDenominator)} in whole tokens`,
      );
    }
  }

  if (rules.naturalNumerator <= rules.naturalDenominator) {
    problems.push('a natural must pay more than even money');
  }
  // 6:5 is refused by name in the ruling; anything below 3:2 is the same grab.
  if (rules.naturalNumerator / rules.naturalDenominator < 1.5) {
    problems.push('a natural pays less than 3:2, which the commissioner refused');
  }
  if (rules.dealerStandsOn !== 17) {
    problems.push('the dealer must stand on all 17');
  }

  return problems;
}

/**
 * Store the shipped rules if they are not already stored.
 *
 * Refuses an incoherent set for the reason `ensureCasinoTable` refuses an
 * incoherent paytable: a configuration is the one place where being loud beats
 * being tolerant, because the alternative is a game that is wrong in a way only
 * a player notices.
 */
export async function ensureBlackjackRules(
  db: Queryable,
  rules: BlackjackRules = SHIPPED_RULES,
): Promise<{ version: string }> {
  const problems = auditRules(rules);
  if (problems.length > 0) {
    throw new Error(
      `the blackjack rules are incoherent and will not be stored:\n  - ${problems.join('\n  - ')}`,
    );
  }

  const version = rulesVersion(rules);

  await db
    .insert(casinoTables)
    .values({ version, game: 'blackjack', config: rules, provisional: true })
    .onConflictDoNothing({ target: casinoTables.version });

  return { version };
}

/** The rules in force, read from the database. A missing row is a seeding failure. */
export async function blackjackRulesFor(
  db: Queryable,
): Promise<{ version: string; rules: BlackjackRules }> {
  const rows = await db
    .select({ version: casinoTables.version, config: casinoTables.config })
    .from(casinoTables)
    .where(eq(casinoTables.game, 'blackjack'))
    .orderBy(desc(casinoTables.createdAt))
    .limit(1);

  const row = rows[0];
  if (row === undefined) {
    throw new Error(
      'no blackjack rules are stored; run npm run db:seed before the table can take a hand',
    );
  }

  const config = row.config as Partial<BlackjackRules>;
  const complete =
    Array.isArray(config.wagers) &&
    typeof config.naturalNumerator === 'number' &&
    typeof config.naturalDenominator === 'number' &&
    typeof config.dealerStandsOn === 'number';

  if (!complete) {
    throw new Error(`blackjack rules ${row.version} are stored but incomplete. Run npm run db:seed.`);
  }

  return { version: row.version, rules: config as BlackjackRules };
}
