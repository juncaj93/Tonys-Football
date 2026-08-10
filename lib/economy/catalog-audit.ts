import { assetRegistry } from '@/lib/assets/registry';
import { type Rarity, RARITIES, catalog, systemCatalog } from '@/lib/counter/catalog';
import { standardRewardTable } from '@/lib/counter/rewards';
import { PROVISIONAL_ECONOMY, salvageValue } from '@/lib/counter/tokens';
import { SLOTS } from '@/lib/rooms/objects';

/**
 * The collectible catalog, audited — every fact about every item, in one row.
 *
 * ## Why this exists as code rather than as a table in a document
 *
 * The question it answers is *"how much art do we actually need"*, and that
 * question is asked repeatedly: once now, again when a batch lands, again when
 * somebody proposes an item. A Markdown table would be right on the day it was
 * written and wrong on the day a `path` appeared in the registry. Everything
 * below is **read from the systems that own it** —
 *
 * | fact | owner |
 * |---|---|
 * | what exists, its rarity, its art | `art/assets.inventory.json` via the registry |
 * | box-eligible or system-granted | `lib/counter/catalog.ts` (`systemLayer`) |
 * | pull weight | `lib/counter/rewards.ts` |
 * | what a spare is worth | `lib/counter/tokens.ts` |
 * | where it can be displayed | `lib/rooms/objects.ts` |
 *
 * — so a stale row is not reachable. The one thing this module *adds* is
 * {@link ITEM_FORM}, and it is quarantined below with the reasons.
 *
 * ## There is no category axis in the product, and this does not add one
 *
 * `04 §10` asks a room slot to *"validate category compatibility"* and `03 §9`
 * names five categories. **Neither is implemented, deliberately**:
 * `lib/rooms/service.ts` records the decision in full — a catalog entry is a
 * slug, a name and a rarity, every collectible is drawn from the same 46 × 46
 * sprite, and a rule that cannot be seen only ever generates refusals.
 *
 * That decision stands. But *art planning* still needs to know that a manager
 * whose whole collection is small tabletop objects has nothing that reads right
 * in a picture frame — which is a question about **what to draw**, not about
 * what to allow. {@link ITEM_FORM} is that answer and nothing else: it is not
 * read by any runtime path, it gates nothing, and it stores nothing.
 */

/* ------------------------------------------------------------------ form -- */

/**
 * The three shapes a collectible can be, for art planning only.
 *
 * Derived by looking at the twenty-four objects that exist and asking where a
 * person would put each one — not invented to make a spreadsheet balance, and
 * not a taxonomy anybody has to maintain in two places. The room has four
 * places to put something and one of them is **a picture frame**; the only
 * question this axis answers is whether the catalog gives a manager something
 * to put in it.
 *
 * - `wall` — flat, hangs or mounts. Reads right in the frame.
 * - `surface` — stands on a shelf or a desk. The default.
 * - `floor` — furniture-scaled. Reads wrong on a shelf plank at any size,
 *   because a pinball machine is not a thing that sits next to a coffee mug.
 *
 * **Nothing enforces this.** All four slots accept all twenty-four items today
 * and this module does not change that; see the header.
 */
export const ITEM_FORMS = ['wall', 'surface', 'floor'] as const;

export type ItemForm = (typeof ITEM_FORMS)[number];

/**
 * Every catalog slug's form.
 *
 * Exhaustive over the catalog, and `catalog-audit.test.ts` fails if a slug is
 * missing — so a twenty-fifth item cannot be added without somebody deciding
 * what shape it is. That is the only maintenance cost this axis carries, and it
 * is the cost of the question being answerable at all.
 */
export const ITEM_FORM: Readonly<Record<string, ItemForm>> = {
  /* commons — every one of them a tabletop object, which is the finding */
  collectible_arcade_token: 'surface',
  collectible_booth_cushion: 'surface',
  collectible_checkered_cloth: 'surface',
  collectible_coffee_mug: 'surface',
  collectible_ketchup_bottle: 'surface',
  collectible_napkin_dispenser: 'surface',
  collectible_paper_menu: 'surface',
  collectible_parmesan_shaker: 'surface',
  collectible_pizza_cutter: 'surface',
  collectible_receipt_spike: 'surface',

  /* rares */
  collectible_cookie_tote: 'surface',
  collectible_crt_tv: 'surface',
  collectible_freddy_bowl: 'surface',
  collectible_lava_lamp: 'surface',
  collectible_pinball_machine: 'floor',
  collectible_reddiwip: 'surface',
  collectible_revolution_poster: 'wall',
  collectible_singing_fish: 'wall',

  /* epics */
  collectible_arcade_cabinet: 'floor',
  collectible_burn_barrel: 'floor',
  collectible_neon_tony_sign: 'wall',
  collectible_portable_sauna: 'floor',

  /* legendaries */
  collectible_bapple_tree: 'floor',
  collectible_signed_jersey_legend: 'wall',

  /* earned, and not in the catalog — carried so the audit can report it */
  item_championship_ring: 'wall',
};

/* ----------------------------------------------------------------- audit -- */

export interface AuditRow {
  readonly slug: string;
  /** The registry's alt text, which is the item's name (`catalog.ts`). */
  readonly name: string;
  readonly rarity: Rarity;
  /** Planning axis only. See {@link ITEM_FORM}. */
  readonly form: ItemForm;
  readonly batch: string;
  /** `placeholder` · `generated` · `approved` · `retired`, as the registry says. */
  readonly artStatus: string;
  /** A real file exists and is referenced. */
  readonly artExists: boolean;
  /** Draws `placeholder_pizza_box` today. */
  readonly placeholder: boolean;
  /** Marked for finished art at launch in the registry. */
  readonly launchPriority: boolean;
  /** Can come out of a pizza box. */
  readonly boxEligible: boolean;
  /** Granted by the system, never pulled (`systemLayer`). */
  readonly systemLayer: boolean;
  /** The only way to get it is a grant — today, that means a verified title. */
  readonly directGrantOnly: boolean;
  /**
   * Resets or expires at a season boundary.
   *
   * **Always false, and that is a product rule rather than a gap.** Tokens
   * reset; collectibles persist across seasons (`16`'s core rules,
   * `collectibles_undeletable`). Nothing in the schema can express a seasonal
   * item, so no row can claim to be one.
   */
  readonly seasonal: false;
  /** Integer weight in the standard box's table. Zero for a system item. */
  readonly pullWeight: number;
  /** Share of openings that land on this exact item, as a fraction. */
  readonly pullShare: number;
  /** Tokens a spare converts to once its tier is exhausted. */
  readonly salvageTokens: number;
  /** Which room slots accept it. All four, for everything ownable. */
  readonly roomSlots: readonly string[];
  /** Can be put in the Showcase case. */
  readonly showcaseable: boolean;
}

export interface CatalogAudit {
  readonly generatedFrom: {
    readonly rewardTableVersion: string;
    readonly boxPriceTokens: number;
    readonly catalogSize: number;
  };
  /** Everything a box can produce. */
  readonly box: readonly AuditRow[];
  /** Everything the system grants. Reported separately, always. */
  readonly system: readonly AuditRow[];
}

function formOf(slug: string): ItemForm {
  const form = ITEM_FORM[slug];
  if (form === undefined) {
    throw new Error(
      `no form recorded for ${slug}; add it to ITEM_FORM in lib/economy/catalog-audit.ts`,
    );
  }
  return form;
}

/**
 * Build the audit.
 *
 * Pure, deterministic and database-free — it reads the registry, the reward
 * table and the economy constants, all of which are compile-time facts. That is
 * what lets it run in a test, in a script and in CI without a Postgres.
 */
export function auditCatalog(): CatalogAudit {
  const table = standardRewardTable();
  const weightOf = new Map(table.entries.map((entry) => [entry.slug, entry.weight]));

  const row = (
    item: { slug: string; name: string; rarity: Rarity },
    options: { readonly systemLayer: boolean },
  ): AuditRow => {
    const record = assetRegistry.get(item.slug);
    if (record === undefined) {
      // Unreachable: both catalogs are *built* from the registry. Thrown rather
      // than defaulted, because a hole here would be a silently wrong audit.
      throw new Error(`no registry record for catalog slug ${item.slug}`);
    }
    const weight = weightOf.get(item.slug) ?? 0;
    return {
      slug: item.slug,
      name: item.name,
      rarity: item.rarity,
      form: formOf(item.slug),
      batch: record.batch,
      artStatus: record.artStatus,
      artExists: record.path !== null,
      placeholder: record.path === null,
      launchPriority: record.priority === true,
      boxEligible: !options.systemLayer,
      systemLayer: options.systemLayer,
      directGrantOnly: options.systemLayer,
      seasonal: false,
      pullWeight: weight,
      pullShare: table.totalWeight === 0 ? 0 : weight / table.totalWeight,
      salvageTokens: salvageValue(PROVISIONAL_ECONOMY, item.rarity),
      /*
       * Every slot, for everything a manager can own. Not a shrug — it is the
       * shipped rule, stated where the audit can be read against it.
       */
      roomSlots: options.systemLayer ? [] : SLOTS,
      showcaseable: !options.systemLayer,
    };
  };

  return {
    generatedFrom: {
      rewardTableVersion: table.version,
      boxPriceTokens: PROVISIONAL_ECONOMY.standardBoxPriceTokens,
      catalogSize: catalog().length,
    },
    box: catalog().map((item) => row(item, { systemLayer: false })),
    system: systemCatalog().map((item) => row(item, { systemLayer: true })),
  };
}

/* --------------------------------------------------------------- rollups -- */

export interface RarityRollup {
  readonly rarity: Rarity;
  readonly items: number;
  readonly withArt: number;
  readonly placeholder: number;
  /** The tier's share of openings, as a fraction. */
  readonly tierShare: number;
  readonly salvageTokens: number;
}

export function byRarity(audit: CatalogAudit): readonly RarityRollup[] {
  return RARITIES.map((rarity) => {
    const items = audit.box.filter((item) => item.rarity === rarity);
    return {
      rarity,
      items: items.length,
      withArt: items.filter((item) => item.artExists).length,
      placeholder: items.filter((item) => item.placeholder).length,
      tierShare: items.reduce((sum, item) => sum + item.pullShare, 0),
      salvageTokens: items[0]?.salvageTokens ?? 0,
    };
  });
}

export interface FormRollup {
  readonly form: ItemForm;
  readonly items: number;
  readonly withArt: number;
  /** Per-rarity counts, so "no common wall item" is visible rather than implied. */
  readonly byRarity: Readonly<Record<Rarity, number>>;
}

export function byForm(audit: CatalogAudit): readonly FormRollup[] {
  return ITEM_FORMS.map((form) => {
    const items = audit.box.filter((item) => item.form === form);
    const counts = {} as Record<Rarity, number>;
    for (const rarity of RARITIES) {
      counts[rarity] = items.filter((item) => item.rarity === rarity).length;
    }
    return {
      form,
      items: items.length,
      withArt: items.filter((item) => item.artExists).length,
      byRarity: counts,
    };
  });
}

/** The catalog's shape: how many unique items each tier holds. */
export function catalogShape(audit: CatalogAudit): Readonly<Record<Rarity, number>> {
  const shape = {} as Record<Rarity, number>;
  for (const rarity of RARITIES) {
    shape[rarity] = audit.box.filter((item) => item.rarity === rarity).length;
  }
  return shape;
}

/** The reward table's rarity mass, as fractions that sum to 1. */
export function rarityShares(audit: CatalogAudit): Readonly<Record<Rarity, number>> {
  const shares = {} as Record<Rarity, number>;
  for (const rollup of byRarity(audit)) shares[rollup.rarity] = rollup.tierShare;
  return shares;
}
