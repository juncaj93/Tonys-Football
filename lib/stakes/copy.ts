import { VARIANTS, type EntryOutcome, type Presentation, type Variant } from './model';

/**
 * Every curated string the weekly-stakes surfaces can print.
 *
 * ## One home, because the validator has to be able to see all of it
 *
 * `lib/slice/validate.ts` distinguishes a manager's name from ordinary English by
 * asking whether a capitalised word appears in the **curated source** the prose
 * was rendered from — `houseWords()` does exactly this for the Slice's own
 * tables. That only works if the checker can reach the whole vocabulary, so the
 * whole vocabulary lives in one module that computes nothing and imports only
 * types.
 *
 * It also settles a question that would otherwise be decided twice. `resolve.ts`
 * produces the sentence explaining *why* a stake settled, and `render.ts`
 * produces the claim itself. If each held its own strings, the evidence sentence
 * would end up validated against templates it supplied — a layer marking its own
 * homework, which is the failure `MANDATE §10` names.
 *
 * ## No digits, anywhere in this file
 *
 * Every number a manager reads arrives by substitution from a stored fact.
 * `stakes.test.ts` fails the build for a template containing one. The Slice
 * shipped the opposite once: a quiet week that said *"Five results"* over a board
 * showing four, because a count had been written into curated prose.
 */

/**
 * The claim, per variant. What goes on the board when the stake is live.
 *
 * No sportsbook language, and that is enforced rather than intended: the Slice's
 * banned-term scan already refuses `odds`, `win probability`, `likely`,
 * `favourite to` and `on pace for`, and these strings go through it.
 */
export const CLAIMS: Readonly<Record<Variant, string>> = {
  [VARIANTS.seasonMedian]: 'Tony has the week at {line}. Over or under — your call.',
  [VARIANTS.weekScore]:
    'Beat {target} in a single week and the board is yours. {holder} set it.',
  [VARIANTS.nobodyClearsRecord]: 'Tony says nobody touches {record} this week.',
  [VARIANTS.leaderHolds]: 'Tony says {subject} wins again. He has been saying it a while.',
  [VARIANTS.bottomClubLoses]: 'Tony says {subject} loses this one too. He is not being cruel.',
};

/**
 * The verdict, keyed `KIND:outcome`.
 *
 * Every combination the database will let a resolution hold, so a settled stake
 * always has something to say. `stakes.test.ts` asserts the mapping is total
 * against the same table the migration's trigger enforces — a missing key would
 * be a silently blank board on the one screen where the answer is the point.
 */
export const VERDICTS: Readonly<Record<string, string>> = {
  'CHALKBOARD:hit': 'He called it.',
  'CHALKBOARD:missed': 'He ate that one.',
  'BOUNTY:hit': 'Somebody took it off the board.',
  'BOUNTY:unclaimed': 'Nobody got near it. Board wiped.',
  'TONYS_LINE:settled': 'The line is settled.',
  'TONYS_LINE:push': 'Everybody landed on the number. Tabs squared.',
};

/** What a manager's own pick did, once the market settled. */
export const ENTRY_VERDICTS: Readonly<Record<EntryOutcome, string>> = {
  won: 'You had it. Paid.',
  lost: 'You did not have it.',
  push: 'Right on the number. Your stake came back.',
};

/**
 * Why it settled the way it did — the recomputable half of the audit trail.
 *
 * `resolve.ts` chooses the key and supplies the values; nothing there writes a
 * sentence. That separation is what lets the evidence be validated by the same
 * gate as everything else instead of being trusted because the server produced
 * it.
 */
export const EVIDENCE: Readonly<Record<string, string>> = {
  'line-settled': 'The line was {line}. {over} cleared it, {under} did not.',
  'bounty-claimed': '{claimant} put up {scored} in week {week}, past {target}.',
  'bounty-unclaimed': 'Nobody cleared {target} before the board came down.',
  'record-stood': 'Best of the week was {best}. The {record} stands.',
  'record-broken': '{subject} went past it with {best}.',
  'subject-result': 'Tony had {subject} down to {expected}. They {result}, on {points}.',
};

/**
 * What the board says while there is nothing to say yet.
 *
 * Two waiting sentences, because there are two honest reasons and a manager can
 * tell them apart: nothing has been played, or something has and it has not
 * settled. The terminal states are null — a resolved stake has a verdict.
 */
export const WAITING: Readonly<Record<Presentation, string | null>> = {
  'awaiting-week': 'Nothing settled yet. Tuesday tells.',
  'awaiting-final': 'Still being counted.',
  rolling: 'Nobody has got there yet. It stays up.',
  resolved: null,
  expired: null,
  void: null,
};

/**
 * The two words a subject-result prediction substitutes for what Tony called.
 *
 * In this table rather than built in `resolve.ts`, because they are prose: a verb
 * chosen in a resolver is a curated string that escaped the file the validator
 * reads.
 */
export const EXPECTED_VERB: Readonly<Record<'wins' | 'loses', string>> = {
  wins: 'win',
  loses: 'lose',
};

/** How a subject's week actually went. Prose, for the same reason. */
export const RESULT_WORD: Readonly<Record<'won' | 'lost' | 'tied', string>> = {
  won: 'won',
  lost: 'lost',
  tied: 'tied',
};

/**
 * Substitute `{name}` from a record of already-written values.
 *
 * Refuses on a missing key rather than leaving the brace in. A chalkboard reading
 * *"Tony has the week at {line}"* is worse than a blank one, and it is exactly
 * what a half-populated fact produces.
 */
export function fill(
  template: string,
  values: Readonly<Record<string, string>>,
): string | null {
  let missing = false;
  const out = template.replace(/\{(\w+)\}/g, (_match, key: string) => {
    const value = values[key];
    if (value === undefined) {
      missing = true;
      return '';
    }
    return value;
  });
  return missing ? null : out;
}

/**
 * The whole curated vocabulary, for the validator's ordinary-word set.
 *
 * `houseWords()`'s rule applied here: *if the renderer can print it, the checker
 * has to be able to see it.* Passing every template — not only the one a given
 * sentence came from — is deliberate, because the alternative is validating a
 * sentence against the strings it supplied.
 */
export function houseTemplates(): readonly string[] {
  return [
    ...Object.values(CLAIMS),
    ...Object.values(VERDICTS),
    ...Object.values(ENTRY_VERDICTS),
    ...Object.values(EVIDENCE),
    ...Object.values(WAITING).filter((line): line is string => line !== null),
  ];
}
