import { RARITIES, type Rarity, catalog } from '@/lib/counter/catalog';
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
}

function isRarity(value: string): value is Rarity {
  return (RARITIES as readonly string[]).includes(value);
}

/**
 * Resolve `?preview_reveal=legendary` to a payload, or null.
 *
 * Null is the answer for every ordinary request, and for every request in an
 * environment where demos are not allowed — the caller renders the room exactly
 * as it would have.
 *
 * The item shown is the **first of the tier in catalog order**, so a screenshot
 * at 390 and one at 360 are the same item and can be compared.
 */
export function previewReveal(
  raw: string | string[] | undefined,
  env: Record<string, string | undefined>,
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

  return {
    slug: item.slug,
    name: item.name,
    rarity: item.rarity,
    replayed: false,
    asset: resolveAsset(item.slug),
  };
}
