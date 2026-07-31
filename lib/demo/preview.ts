import { CATALOG_SIZE, RARITIES, type Rarity, catalog } from '@/lib/counter/catalog';
import { PROVISIONAL_ECONOMY } from '@/lib/counter/tokens';
import { resolveAsset } from '@/lib/assets/registry';
import { type AssetResolution } from '@/lib/assets/types';

import { DemoRefused, assertDemoAllowed } from './guard';

/**
 * The reveal, at a rarity you choose, for review.
 *
 * ## The gap this closes
 *
 * The reveal is the moment the whole milestone is built around, and until now
 * **its rarity treatment could not be photographed on purpose.** The roll
 * happens on the server inside `openBox`, driven by
 * `lib/counter/rng.ts` — a process-global override that the demo CLI, running in
 * its own process, cannot reach into the running server to set. So a
 * pre-applied `pull-legendary` leaves the box already opened and the tray empty,
 * and tapping a box live gives whatever the table gives. Reviewing "does
 * legendary read as legendary" meant buying boxes until one came up.
 *
 * `PRODUCT_DELIVERY_MANDATE.md §8` names the answer in so many words —
 * **preview-only query parameters** and **isolated component states** are both
 * sanctioned demo mechanisms. This is the first, and it renders the *real*
 * component in the *real* room at the real geometry, which is the only version
 * worth reviewing.
 *
 * ## It cannot happen in production
 *
 * Same two guards as every other demo path (`guard.ts`), evaluated **on the
 * server**: production is refused outright and everywhere else needs
 * `DEMO_FIXTURES=1`. A manager cannot turn this on by editing a URL, because
 * neither condition is theirs to set.
 *
 * ## It writes nothing
 *
 * The payload is synthesised, not rolled and not stored. No box is consumed, no
 * collectible is minted, no ledger row is written — which is what makes it
 * re-runnable at three widths, and also what makes it **not evidence about the
 * product**. It is evidence about the *rendering*, and only that. The states
 * that prove the loop works are the driven ones in `apply.ts`; this is for
 * looking at a colour.
 */

/** Exactly the shape `CounterTray` receives from `openBoxAction`. */
export interface PreviewReveal {
  readonly slug: string;
  readonly name: string;
  readonly rarity: Rarity;
  readonly replayed: boolean;
  readonly asset: AssetResolution;
  /** Synthetic, like the rest of it — see the note on `previewReveal`. */
  readonly distinct: number;
  readonly total: number;
  /**
   * Tony's offer, synthesised rather than drawn.
   *
   * The real one comes from `content_entries` through `offerAnotherBox`, which
   * logs a use and therefore changes what he would say next. A preview must be
   * repeatable at three widths, so a stage takes a **fixed approved line**
   * rather than consuming a draw. What is being reviewed here is the
   * composition: whether his voice sits under the collection line without
   * crowding it.
   */
  readonly offer: {
    readonly price: number;
    readonly line: string;
    readonly entryKey: string;
  } | null;
}

/**
 * Where in the loop the pull happened — `?preview_stage=first`.
 *
 * The plate has **four compositions**, and until now only one of them could be
 * photographed. They differ in two lines that sit directly under each other, so
 * reviewing one and assuming the rest is exactly the mistake that let
 * `LEGENDARY` ship invisible on cream:
 *
 *   - `first` — their very first collectible, and Tony's "first one was free"
 *   - `mid` — the ordinary middle, `7 of 24`, and the plain offer
 *   - `complete` — the whole shelf, and Tony pointing out it would be a spare
 *   - `broke` — the tab is short, so **there is no offer and no link**, which is
 *     the composition the ruling cares most about being seen: no greyed-out
 *     price, no explanation, nothing
 *
 * `mid` is the default, so an unqualified `?preview_reveal=` behaves as before.
 */
export const PREVIEW_STAGES = ['first', 'mid', 'complete', 'broke'] as const;
export type PreviewStage = (typeof PREVIEW_STAGES)[number];

/**
 * The plate each stage produces, spelled out rather than read off disk.
 *
 * The page that calls this is a server component on the hot path; reaching for
 * the filesystem to render a review-only screenshot would put a synchronous read
 * in front of every parlor load for the sake of a state nobody in production can
 * reach. So the sentences are literals — and `preview.test.ts` asserts each is
 * character-for-character the entry it names in `content/box-offer.md` at the
 * provisional price, so an edit to an approved line fails the build rather than
 * quietly leaving the preview showing an old one.
 */
const STAGES: Record<PreviewStage, { distinct: number; entryKey: string | null; line: string | null }> =
  {
    first: { distinct: 1, entryKey: 'O1', line: "First one was free. Next one's 50." },
    mid: { distinct: 7, entryKey: 'O3', line: '50 tokens gets you another.' },
    complete: {
      distinct: CATALOG_SIZE,
      entryKey: 'O7',
      line: "Shelf's full. Another's 50, and it'd be a spare.",
    },
    broke: { distinct: 7, entryKey: null, line: null },
  };

function isRarity(value: string): value is Rarity {
  return (RARITIES as readonly string[]).includes(value);
}

function isStage(value: string): value is PreviewStage {
  return (PREVIEW_STAGES as readonly string[]).includes(value);
}

/**
 * Resolve `?preview_reveal=legendary&preview_stage=first` to a payload, or null.
 *
 * Null is the answer for every ordinary request, and for every request in an
 * environment where demos are not allowed — the caller renders the room exactly
 * as it would have.
 *
 * The item shown is the **first of the tier in catalog order**, so a screenshot
 * at 390 and one at 360 are the same item and can be compared. An unreadable
 * stage falls back to `mid` rather than refusing: the rarity is what the caller
 * asked for, and a typo in the second parameter should not blank the room.
 */
export function previewReveal(
  raw: string | string[] | undefined,
  env: Record<string, string | undefined>,
  stageRaw?: string | string[] | undefined,
): PreviewReveal | null {
  if (typeof raw !== 'string' || raw === '') return null;

  try {
    assertDemoAllowed(env);
  } catch (error: unknown) {
    // A refusal here is the normal case in production, not an incident. The room
    // renders untouched; anything else would leak that the parameter exists.
    if (error instanceof DemoRefused) return null;
    throw error;
  }

  if (!isRarity(raw)) return null;

  const item = catalog().find((candidate) => candidate.rarity === raw);
  if (item === undefined) return null;

  const stage = STAGES[typeof stageRaw === 'string' && isStage(stageRaw) ? stageRaw : 'mid'];

  /*
   * A fixed point in the loop, chosen rather than counted.
   *
   * These drive the plate's meaning line and its offer, and the point of this
   * route is to review how those *look* — so they are pinned. Nobody's real
   * collection is consulted and nothing is drawn from the content engine: a
   * preview at 390 and one at 360 must show the same plate, and a draw would
   * log a use and change what Tony said next.
   */
  return {
    slug: item.slug,
    name: item.name,
    rarity: item.rarity,
    replayed: false,
    asset: resolveAsset(item.slug),
    distinct: stage.distinct,
    total: CATALOG_SIZE,
    offer:
      stage.entryKey === null || stage.line === null
        ? null
        : {
            price: PROVISIONAL_ECONOMY.standardBoxPriceTokens,
            line: stage.line,
            entryKey: stage.entryKey,
          },
  };
}
