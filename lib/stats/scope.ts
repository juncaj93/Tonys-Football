/**
 * How far back a claim reaches, as a typed value rather than as a turn of
 * phrase.
 *
 * ## The problem this solves
 *
 * This league's recorded history starts in **2024**, because that is where
 * `previous_league_id` terminates (`16 §12`). The league itself is older. So
 * every superlative the product can honestly derive is a superlative *of the
 * recorded era*, and the difference between
 *
 * > the highest score since 2024
 *
 * and
 *
 * > the highest score ever
 *
 * is the difference between a fact and a fabrication — with no visible
 * distinction in the derivation, the evidence, or the number. The two sentences
 * are produced by exactly the same query. Only the wording is wrong, which is
 * why wording cannot be left to whoever writes the sentence.
 *
 * `16 §12` states the rule directly: *"Never fabricate. Where a fact is
 * genuinely unavailable, it must stay visibly unavailable — Tony says 'highest
 * since we started recording,' never pretends to know."*
 *
 * ## So the scope travels with the fact
 *
 * Every derived historical fact carries a {@link HistoricalScope}: which seasons
 * were in the population, how many observations it was measured against, and the
 * approved wording for saying so. A renderer does not decide how far back a
 * record reaches — it reads {@link HistoricalScope.label} and prints it.
 *
 * ## And the four overclaims are mechanical
 *
 * `docs/DATA_AUDIT.md §15` listed `all-time`, `ever`, `in league history` and
 * `franchise record` as **banned historical overclaims**, and recorded them as
 * *"documented, not built"* — the banned-phrase validator did not exist on
 * 2026-07-29, so the four terms were written down and left to discipline.
 * {@link HISTORICAL_OVERCLAIMS} is that list made mechanical, and
 * `lib/slice/validate.ts` scans for it beside the terms `16 §9` names.
 *
 * ## Pure
 *
 * No clock, no database, no randomness. A scope is a description of a
 * population, and two runs over the same population describe it identically.
 */

/** What a claim was measured against. */
export type ScopeKind =
  /** One week of one season. */
  | 'week'
  /** One complete, finalized season. */
  | 'season'
  /** One season up to and including a week — the shape a mid-season claim needs. */
  | 'season-to-date'
  /**
   * Every finalized season the database holds.
   *
   * **Not "all time."** The tracked era is 2024 onward and the league predates
   * it; {@link describeScope} is the only approved way to say how far it goes.
   */
  | 'tracked-era';

export interface HistoricalScope {
  readonly kind: ScopeKind;
  /** Every season in the population, ascending. Never empty for a real claim. */
  readonly seasons: readonly number[];
  readonly firstSeason: number;
  readonly lastSeason: number;
  /** Set on `week` and `season-to-date`; null otherwise. */
  readonly throughWeek: number | null;
  /**
   * How many rows the claim was measured against — games, team-weeks, meetings.
   *
   * Part of the claim rather than metadata about it: *"the widest margin of
   * three meetings"* and *"the widest margin of forty"* are different
   * statements, and the number is the only thing that separates them.
   */
  readonly observations: number;
  /**
   * Structural, and always true.
   *
   * An open season's numbers can still move (`facts.ts` gives the reasoning),
   * so a historical population is finalized seasons only and a scope cannot be
   * constructed that says otherwise. The field exists so a reader of the fact
   * does not have to know that.
   */
  readonly finalizedOnly: true;
  /** Approved wording. `since 2024` · `in the 2025 season`. See {@link describeScope}. */
  readonly label: string;
}

/**
 * The wording `16 §12` and `docs/DATA_AUDIT.md §15` approve, and nothing else.
 *
 * Exported so a surface that wants to phrase a scope differently has to add to
 * this list — where the addition is visible — rather than writing a sentence.
 */
export const APPROVED_ERA_WORDING: readonly string[] = Object.freeze([
  'since 2024',
  'since we started recording',
]);

/**
 * Build a scope over a population.
 *
 * `seasons` must be the finalized seasons the population actually came from —
 * not the seasons that exist. A record measured over 2024 and 2025 while 2023
 * sits unfinalized in the database is a record over two seasons, and saying
 * otherwise is the overclaim in miniature.
 */
export function scopeOf(input: {
  readonly kind: ScopeKind;
  readonly seasons: readonly number[];
  readonly observations: number;
  readonly throughWeek?: number;
}): HistoricalScope {
  const seasons = [...new Set(input.seasons)].sort((a, b) => a - b);
  if (seasons.length === 0) {
    throw new Error('a historical scope over no seasons describes nothing');
  }

  const firstSeason = seasons[0]!;
  const lastSeason = seasons[seasons.length - 1]!;
  const throughWeek = input.throughWeek ?? null;

  if ((input.kind === 'week' || input.kind === 'season-to-date') && throughWeek === null) {
    throw new Error(`a ${input.kind} scope needs the week it reaches`);
  }
  if (input.kind !== 'tracked-era' && seasons.length !== 1) {
    throw new Error(`a ${input.kind} scope covers exactly one season`);
  }

  return {
    kind: input.kind,
    seasons,
    firstSeason,
    lastSeason,
    throughWeek,
    observations: input.observations,
    finalizedOnly: true,
    label: describeScope({ kind: input.kind, firstSeason, lastSeason, throughWeek }),
  };
}

/**
 * The approved way to say how far a claim reaches.
 *
 * The era wording is `since {firstSeason}` rather than `since we started
 * recording` — both are approved and the concrete one is better, because a
 * reader can check it. The vaguer form stays approved for Tony's own voice,
 * where a year in the middle of a sentence reads like a citation.
 *
 * Nothing here can produce a superlative. It produces the *qualifier* a
 * superlative needs, and {@link HISTORICAL_OVERCLAIMS} refuses the sentence that
 * omits it.
 */
export function describeScope(input: {
  readonly kind: ScopeKind;
  readonly firstSeason: number;
  readonly lastSeason: number;
  readonly throughWeek: number | null;
}): string {
  switch (input.kind) {
    case 'week':
      return `in week ${String(input.throughWeek ?? 0)} of ${String(input.lastSeason)}`;
    case 'season':
      return `in the ${String(input.lastSeason)} season`;
    case 'season-to-date':
      return `in ${String(input.lastSeason)} through week ${String(input.throughWeek ?? 0)}`;
    case 'tracked-era':
      return `since ${String(input.firstSeason)}`;
  }
}

/**
 * Terms that claim more history than this league has recorded.
 *
 * `docs/DATA_AUDIT.md §15`, verbatim: *"banned historical overclaims:
 * `all-time`, `ever`, `in league history`, `franchise record`. Approved wording
 * is `since 2024` or `since we started recording`."*
 *
 * Four terms, exactly the four that were listed. The list is deliberately not
 * extended by judgement here — a fifth term is a ruling, and it belongs in the
 * document rather than in a regular expression somebody added on a Tuesday.
 *
 * `\bever\b` does not match `never`, `however` or `whenever`: the word boundary
 * requires the `e` to start a word.
 */
export const HISTORICAL_OVERCLAIMS: readonly {
  readonly pattern: RegExp;
  readonly why: string;
}[] = Object.freeze([
  {
    pattern: /\ball[- ]time\b/i,
    why: 'the recorded league starts in 2024 and predates it, so no claim is all-time (`16 §12`)',
  },
  {
    pattern: /\bever\b/i,
    why: '"ever" reaches past the recorded era; say "since 2024" (`docs/DATA_AUDIT.md §15`)',
  },
  {
    pattern: /\bin league history\b/i,
    why: 'league history predates the record; the claim is only about what was recorded',
  },
  {
    pattern: /\bfranchise record\b/i,
    why: 'a franchise record implies a complete history the chain does not reach back through',
  },
]);

export interface Overclaim {
  readonly term: string;
  readonly why: string;
}

/**
 * Every overclaim in a piece of prose.
 *
 * Returns them all rather than the first, because a sentence that overclaims
 * once usually overclaims twice and reporting one at a time turns a review into
 * a queue.
 */
export function findOverclaims(text: string): readonly Overclaim[] {
  const found: Overclaim[] = [];
  for (const { pattern, why } of HISTORICAL_OVERCLAIMS) {
    // A fresh regex per call: the shared literals carry no `g` flag, so there is
    // no `lastIndex` to leak between calls, and `exec` on a non-global pattern
    // always starts at zero. Stated because the opposite bug is silent.
    const match = pattern.exec(text);
    if (match !== null) found.push({ term: match[0], why });
  }
  return found;
}
