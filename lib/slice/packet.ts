import { type Queryable } from '@/lib/db';
import { activeManagerIds } from '@/lib/league/membership';
import { finalizedMarginsCents, seasonFacts, type MatchupFact } from '@/lib/stats/facts';

/**
 * The fact packet — everything one issue of the Slice is allowed to say.
 *
 * `16 §9` draws the pipeline as:
 *
 * ```
 * sync → story detection → scoring → selection → FACT PACKET
 *                                                  ├─→ Template renderer (deterministic, free)
 *                                                  └─→ LLM renderer (optional, per story)
 *                                                        ↓
 *                            deterministic validation → review → publish
 * ```
 *
 * Everything upstream of the packet is `lib/stats`. Everything downstream reads
 * **only** the packet. That boundary is the whole design, and it is what makes
 * `16 §9`'s *"every number and proper noun must match an allowed value in the
 * fact packet"* checkable rather than aspirational: the validator does not need
 * to know what is true, it needs to know what was allowed.
 *
 * ## Why the allowed sets are built here and not in the validator
 *
 * If the validator derived its own allowed values it would be marking its own
 * homework — the same failure `MANDATE §10` names for a narrative layer that
 * calculates and approves its own claims. So the packet states, up front and as
 * data, exactly which numbers and which names may appear in prose about it. A
 * renderer that produces anything else is wrong by construction, whether it is a
 * template or a language model.
 *
 * ## The publication boundary is applied here, once
 *
 * A fact naming a retired manager is a true fact and stays in the fact layer
 * (`lib/stats/board.ts` records why). It may not be **published**, so it is
 * filtered on the way into the packet — the single place every renderer,
 * template or generated, has to pass through.
 */

/** A week that has something to print. */
export interface SliceStory {
  readonly fact: MatchupFact;
  /** Why this one led, in the packet rather than invented by a renderer. */
  readonly reason: string;
}

export type PacketRefusal =
  /** The season is not in the database, or holds no finalized games. */
  | 'no-season'
  /** The week exists but every game in it was suppressed. */
  | 'no-story'
  /** Every story in the week names somebody who may not be published. */
  | 'nobody-publishable';

export interface FactPacket {
  readonly season: number;
  readonly week: number;
  /** The week's games are final and will not move. */
  readonly finalized: boolean;

  /** Highest-scoring publishable story first. */
  readonly stories: readonly SliceStory[];

  /**
   * Every number a renderer may put in prose about this packet.
   *
   * Points and margins as they are *written* — one decimal place — because that
   * is the form a reader sees and therefore the form a validator has to compare.
   * Weeks and seasons as integers.
   */
  readonly allowedNumbers: readonly string[];

  /**
   * Every proper noun a renderer may use.
   *
   * Manager display names only. Not Sleeper handles, not team names — a Slice
   * that calls somebody by their Sleeper username has got the person right and
   * the identity wrong (`16 §4`).
   */
  readonly allowedNames: readonly string[];

  /** Why there is nothing to print, when there is nothing to print. */
  readonly refusal: PacketRefusal | null;
}

/**
 * A score, as a reader sees it. `154.42` → `"154.42"`.
 *
 * **Takes points, not cents.** `fantasy_matchups` stores integer cents so a
 * margin is exact, but `MatchupFact` has already converted — `factFor` calls
 * `fromCents` on its way out (`lib/stats/facts.ts`). Everything downstream of
 * the fact layer is in points.
 *
 * This divided by 100 a second time, and the Slice printed *"Matty B obliterated
 * Ryan, 1.84 to 1.10"* — a real matchup with the decimal point two places wrong.
 * **Every test passed.** The packet's allowed-number list and the renderer's
 * prose were produced by this same function, so they agreed with each other
 * perfectly while both were wrong, and the validator confirmed it. That is
 * exactly the failure `MANDATE §10` names — a layer marking its own homework —
 * arriving through a units conversion rather than through a claim.
 *
 * What caught it was looking at the page. What stops it returning is
 * `slice.test.ts` asserting a real week's scores land in a plausible range,
 * which is a check the shared-helper symmetry cannot satisfy.
 */
export function points(value: number): string {
  return value.toFixed(2);
}

/**
 * One decimal, which is how a margin is spoken.
 *
 * `50.51` is a measurement; *"beat him by fifty and a half"* is a sentence. The
 * Slice writes margins to one place, so one place is what the validator allows.
 * Points, like `points()` above.
 */
export function margin(value: number): string {
  return value.toFixed(1);
}

/**
 * Build the packet for one week.
 *
 * Returns a packet with `refusal` set rather than throwing or returning null: a
 * week with nothing in it is a real editorial state, and the rack has to be able
 * to say so in the shop's voice (`05 §8.5`).
 */
export async function factPacket(
  db: Queryable,
  input: { readonly season: number; readonly week: number },
): Promise<FactPacket> {
  const empty = (refusal: PacketRefusal): FactPacket => ({
    season: input.season,
    week: input.week,
    finalized: false,
    stories: [],
    allowedNumbers: [],
    allowedNames: [],
    refusal,
  });

  const margins = await finalizedMarginsCents(db);
  const season = await seasonFacts(db, {
    year: input.season,
    historicalMarginsCents: margins,
  });

  if (season.facts.length === 0) return empty('no-season');

  const inWeek = season.facts.filter((fact) => fact.week === input.week);
  if (inWeek.length === 0) return empty('no-story');

  /*
   * The publication boundary.
   *
   * `lib/league/membership.ts`: a retired manager appears in **no** structured
   * surface, and a published Slice story is as structured as a surface gets. The
   * fact itself is untouched — it stays in the layer, the audit trail and the
   * history, because Ryan beating Berardo by 140.72 is the largest margin on
   * record and deleting it would be falsifying the record to hide a person.
   */
  const publishable = await activeManagerIds(db);
  const allowed = inWeek.filter(
    (fact) => publishable.has(fact.winnerManagerId) && publishable.has(fact.loserManagerId),
  );

  if (allowed.length === 0) return empty('nobody-publishable');

  const stories = [...allowed]
    .sort((a, b) => b.selectionScore - a.selectionScore)
    .map((fact) => ({ fact, reason: fact.reasonSelected }));

  const numbers = new Set<string>([String(input.season), String(input.week)]);
  const names = new Set<string>();

  for (const { fact } of stories) {
    numbers.add(points(fact.winnerPoints));
    numbers.add(points(fact.loserPoints));
    numbers.add(margin(fact.margin));
    // Also the margin written to two places, because a renderer may quote a
    // margin the same way it quotes a score and both are the same true number.
    numbers.add(points(fact.margin));
    names.add(fact.winnerDisplayName);
    names.add(fact.loserDisplayName);
  }

  return {
    season: input.season,
    week: input.week,
    finalized: season.finalized,
    stories,
    allowedNumbers: [...numbers].sort(),
    allowedNames: [...names].sort(),
    refusal: null,
  };
}
