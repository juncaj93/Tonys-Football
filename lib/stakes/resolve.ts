import { EVIDENCE, EXPECTED_VERB, RESULT_WORD, fill } from './copy';
import { writePoints, type WeekResult } from './facts';
import {
  VARIANTS,
  type EntryOutcome,
  type Evidence,
  type FactRefs,
  type Side,
  type StakeOutcome,
  type Variant,
} from './model';

/**
 * Resolution — checking a claim against finalized results.
 *
 * ## Pure, and the return value *is* the audit trail
 *
 * Nothing here touches a database, a clock or a random source. It takes the
 * stake's stored facts and a finalized week and returns an outcome plus the
 * evidence for it. That is what makes *"audit history explains why it resolved"*
 * a property of the code rather than a logging convention — the explanation is
 * the return value, not a side effect somebody remembered to write.
 *
 * The evidence carries **a curated template key and the values**, not a sentence
 * this file wrote. `copy.ts` owns every string, so the explanation goes through
 * the same validator as everything else instead of being trusted because the
 * server produced it.
 *
 * ## Finality is checked here, once, and refused loudly
 *
 * Every resolver goes through {@link resolveStake}, which refuses a week that is
 * not final before any comparison happens. There is no path from a provisional
 * score to a token movement: `lib/stats/finality.ts` owns the predicate and this
 * is the only caller that spends money on it.
 *
 * ## Client code decides nothing
 *
 * This module is reached only by the service and by tests. A browser cannot
 * import it, and the surfaces render an outcome that was already written to
 * `stake_resolutions`.
 */

/** A resolution, or a stated reason there is not one yet. */
export type ResolveResult =
  | { readonly settled: true; readonly outcome: StakeOutcome; readonly evidence: Evidence }
  | { readonly settled: false; readonly why: ResolveRefusal };

export type ResolveRefusal =
  /** The week is not final — `lib/stats/finality.ts` said so. */
  | 'not-final'
  /** The week produced no publishable game, so there is nothing to check. */
  | 'no-publishable-games'
  /** The stake's stored facts do not carry what its resolver needs. */
  | 'incomplete-facts'
  /** The subject of the prediction did not play a publishable game. */
  | 'subject-did-not-play'
  /** Nobody cleared the bounty this week, and the window is still open. */
  | 'still-rolling';

const refuse = (why: ResolveRefusal): ResolveResult => ({ settled: false, why });

/**
 * Build the evidence, or refuse.
 *
 * A template that will not fill means a resolver supplied fewer values than the
 * explanation needs, which is a defect in the resolver rather than something to
 * paper over with a partial sentence. `stakes.test.ts` renders every evidence key
 * so that never reaches a manager.
 */
function evidence(
  key: keyof typeof EVIDENCE | string,
  values: Readonly<Record<string, string>>,
  gameKeys: readonly string[],
): Evidence | null {
  const template = EVIDENCE[key];
  if (template === undefined) return null;
  const statement = fill(template, values);
  if (statement === null) return null;
  return { statementKey: key, statement, gameKeys, values };
}

/**
 * A stored value, read back as the number it was written as.
 *
 * Stakes store numbers **as written** — `"118.44"`, not `11844` — because that is
 * the form the validator compares and the form a manager reads. Parsing back to
 * cents for a comparison is the one conversion this file performs, and it is done
 * in one place so a rounding error cannot appear in three resolvers.
 */
function cents(written: string | undefined): number | null {
  if (written === undefined) return null;
  const value = Number.parseFloat(written);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100);
}

/**
 * Resolve one stake against one week.
 *
 * `week` is the week being checked, which is not always the stake's own: a bounty
 * opened in week three and claimed in week nine resolves from week nine.
 */
export function resolveStake(input: {
  readonly variant: Variant;
  readonly factRefs: FactRefs;
  readonly week: WeekResult;
  /** Only a bounty needs this — the last week it may still be claimed in. */
  readonly expiresAfterWeek?: number | null;
}): ResolveResult {
  const { week } = input;

  if (!week.finality.final) return refuse('not-final');
  if (week.teams.length === 0) return refuse('no-publishable-games');

  switch (input.variant) {
    case VARIANTS.seasonMedian:
      return resolveLine(input.factRefs, week);
    case VARIANTS.weekScore:
      return resolveBounty(input.factRefs, week, input.expiresAfterWeek ?? null);
    case VARIANTS.nobodyClearsRecord:
      return resolveNobodyClearsRecord(input.factRefs, week);
    case VARIANTS.leaderHolds:
      return resolveSubjectResult(input.factRefs, week, 'wins');
    case VARIANTS.bottomClubLoses:
      return resolveSubjectResult(input.factRefs, week, 'loses');
  }
}

/**
 * Tony's Line.
 *
 * The stake-level outcome is `settled` — the reference number was published and
 * every entry pays from it. `push` is reserved for the case where **every**
 * publishable team landed exactly on the line, the only situation in which the
 * market as a whole had nothing to say. A single manager landing on the number is
 * that manager's push, decided per entry by {@link settleEntry}.
 */
function resolveLine(factRefs: FactRefs, week: WeekResult): ResolveResult {
  const line = cents(factRefs.values['line']);
  if (line === null) return refuse('incomplete-facts');

  const over = week.teams.filter((team) => team.pointsCents > line).length;
  const under = week.teams.filter((team) => team.pointsCents < line).length;

  const built = evidence(
    'line-settled',
    {
      line: writePoints(line),
      over: String(over),
      under: String(under),
      week: String(week.week),
    },
    week.gameKeys,
  );
  if (built === null) return refuse('incomplete-facts');

  return { settled: true, outcome: over === 0 && under === 0 ? 'push' : 'settled', evidence: built };
}

/**
 * A bounty, against one week.
 *
 * The earliest week wins, which is the caller's job — this answers *"was it done
 * in this week"*. Inside a week, the **highest score** claims it and a genuine tie
 * is broken by roster id, stated rather than discovered. Two managers posting an
 * identical score to the cent has never happened in this league's recorded
 * history, and the rule still has to exist: the alternative is a claim decided by
 * query order.
 */
function resolveBounty(
  factRefs: FactRefs,
  week: WeekResult,
  expiresAfterWeek: number | null,
): ResolveResult {
  const target = cents(factRefs.values['target']);
  if (target === null) return refuse('incomplete-facts');

  const winner = week.teams
    .filter((team) => team.pointsCents > target)
    .sort((a, b) => b.pointsCents - a.pointsCents || a.rosterId - b.rosterId)[0];

  if (winner === undefined) {
    if (expiresAfterWeek === null || week.week < expiresAfterWeek) return refuse('still-rolling');

    const built = evidence(
      'bounty-unclaimed',
      { target: writePoints(target), lastWeek: String(week.week) },
      week.gameKeys,
    );
    if (built === null) return refuse('incomplete-facts');
    return { settled: true, outcome: 'unclaimed', evidence: built };
  }

  const built = evidence(
    'bounty-claimed',
    {
      target: writePoints(target),
      scored: writePoints(winner.pointsCents),
      week: String(week.week),
      claimant: winner.displayName,
      claimantId: winner.managerId,
    },
    week.gameKeys,
  );
  if (built === null) return refuse('incomplete-facts');

  return { settled: true, outcome: 'hit', evidence: built };
}

/** Tony said nobody would clear the record. Did anybody? */
function resolveNobodyClearsRecord(factRefs: FactRefs, week: WeekResult): ResolveResult {
  const record = cents(factRefs.values['record']);
  if (record === null) return refuse('incomplete-facts');

  const ordered = [...week.teams].sort(
    (a, b) => b.pointsCents - a.pointsCents || a.rosterId - b.rosterId,
  );
  const highest = ordered[0];
  if (highest === undefined) return refuse('no-publishable-games');

  if (highest.pointsCents <= record) {
    const built = evidence(
      'record-stood',
      {
        record: writePoints(record),
        best: writePoints(highest.pointsCents),
        week: String(week.week),
      },
      week.gameKeys,
    );
    if (built === null) return refuse('incomplete-facts');
    return { settled: true, outcome: 'hit', evidence: built };
  }

  const built = evidence(
    'record-broken',
    {
      record: writePoints(record),
      best: writePoints(highest.pointsCents),
      week: String(week.week),
      subject: highest.displayName,
    },
    week.gameKeys,
  );
  if (built === null) return refuse('incomplete-facts');
  return { settled: true, outcome: 'missed', evidence: built };
}

/**
 * The two table predictions, which are the same check with the sign flipped.
 *
 * A **tie is a miss** for both. Tony said somebody would win, or that somebody
 * would lose; neither happened. Scoring a tie as a hit would be the resolver
 * quietly widening the claim after the fact, which is the one move a settlement
 * layer must never be able to make.
 *
 * A subject who did not play — a bye, or a week whose game was suppressed — is not
 * a miss either. The stake stays open and says so.
 */
function resolveSubjectResult(
  factRefs: FactRefs,
  week: WeekResult,
  expected: 'wins' | 'loses',
): ResolveResult {
  const rosterId = Number.parseInt(factRefs.values['rosterId'] ?? '', 10);
  const subject = factRefs.values['subject'];
  if (!Number.isInteger(rosterId) || subject === undefined) return refuse('incomplete-facts');

  const team = week.teams.find((candidate) => candidate.rosterId === rosterId);
  if (team === undefined) return refuse('subject-did-not-play');

  const happened = expected === 'wins' ? team.won === true : team.won === false;
  const result = team.won === null ? 'tied' : team.won ? 'won' : 'lost';

  const built = evidence(
    'subject-result',
    {
      subject,
      expected: EXPECTED_VERB[expected],
      result: RESULT_WORD[result],
      points: writePoints(team.pointsCents),
      week: String(week.week),
    },
    week.gameKeys,
  );
  if (built === null) return refuse('incomplete-facts');

  return { settled: true, outcome: happened ? 'hit' : 'missed', evidence: built };
}

/**
 * One manager's verdict on a settled market, and what they are paid.
 *
 * Separate from {@link resolveStake} because they answer different questions and
 * only one of them moves money. This is arithmetic on two stored numbers — the
 * side they took and the score their team posted — and it deliberately cannot see
 * a balance, a wallet or a ledger.
 *
 * **Exactly on the line is a push.** The line is a real score to the cent, so a
 * manager landing on it is possible, and either verdict would be the house
 * inventing a tiebreak for or against itself. The stake comes back.
 *
 * A manager with **no publishable game** that week is also a push. They were
 * charged for a market they were never given a chance to win.
 */
export function settleEntry(input: {
  readonly side: Side;
  readonly stakedTokens: number;
  readonly rewardTokens: number;
  readonly lineCents: number;
  readonly team: { readonly pointsCents: number } | null;
}): { readonly outcome: EntryOutcome; readonly payoutTokens: number } {
  if (input.team === null) return { outcome: 'push', payoutTokens: input.stakedTokens };
  if (input.team.pointsCents === input.lineCents) {
    return { outcome: 'push', payoutTokens: input.stakedTokens };
  }

  const cleared = input.team.pointsCents > input.lineCents;
  const won = input.side === 'over' ? cleared : !cleared;

  return won
    ? { outcome: 'won', payoutTokens: input.rewardTokens }
    : { outcome: 'lost', payoutTokens: 0 };
}

/** The line a settled market was resolved against, read back from its facts. */
export function lineCentsOf(factRefs: FactRefs): number | null {
  return cents(factRefs.values['line']);
}
