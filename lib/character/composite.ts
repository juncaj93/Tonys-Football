import {
  BASE_VARIANTS,
  PALETTES,
  variantSlug,
  wearable,
  type Wearable,
} from './catalog';
import {
  BASE_LAYERS,
  BASE_LAYER_POSITION,
  CHARACTER_ANCHOR,
  CHARACTER_CANVAS,
  LAYER_ORDER,
  WEARABLE_SLOTS,
  WORN_LAYER,
  inDrawOrder,
  type BaseLayer,
  type LayerName,
  type WearableSlot,
} from './layers';

/**
 * A configuration plus what is worn, resolved into a list of layers to draw.
 *
 * **Pure, and the only place the two halves meet.** Everything above it is
 * storage; everything below is pixels. That split is what lets a preview fixture
 * drive the identical compositor production uses, and what makes the clipping
 * rules testable as arithmetic rather than as screenshots — which matters here
 * more than anywhere, because the lesson recorded in `docs/CHECKPOINT.md` is that
 * *geometry read off a screenshot is wrong* and the eye kept confidently
 * reporting it had measured something it had not.
 */

/**
 * A manager's base appearance. Three small integers, and nothing else.
 *
 * There is no `face`: the registry's starter set has no base face layer, because
 * the base body carries one. `face` is a **worn** slot only — shades, a fake
 * mustache. The stored column exists and is always zero, so the shape of the row
 * does not change if a base face layer is ever authored.
 */
export interface CharacterConfiguration {
  readonly body: number;
  readonly hair: number;
  readonly palette: number;
}

/** What is in each slot. A slot with nothing in it is simply absent. */
export type Equipment = Partial<Readonly<Record<WearableSlot, string>>>;

export interface CompositeLayer {
  readonly layer: LayerName;
  readonly slug: string;
  /** Base layers take the manager's palette; a wearable keeps its own colours. */
  readonly palette: number | null;
}

export interface Composite {
  readonly layers: readonly CompositeLayer[];
  readonly canvas: typeof CHARACTER_CANVAS;
  readonly anchor: typeof CHARACTER_ANCHOR;
}

/** The character every manager has before they have chosen anything. */
export const DEFAULT_CONFIGURATION: CharacterConfiguration = Object.freeze({
  body: 0,
  hair: 0,
  palette: 0,
});

export type ConfigurationProblem =
  | { readonly kind: 'unknown-variant'; readonly layer: BaseLayer; readonly index: number }
  | { readonly kind: 'unknown-palette'; readonly index: number }
  | { readonly kind: 'unknown-wearable'; readonly slug: string }
  | { readonly kind: 'wrong-slot'; readonly slug: string; readonly slot: WearableSlot };

/**
 * Is this a character the system can actually draw?
 *
 * Returns every problem rather than the first, because a customiser showing one
 * error at a time makes a manager fix four things in four round trips.
 *
 * **A legal combination is one whose every part exists.** There are deliberately
 * no *taste* rules here — no "that hat does not go with that hair". The moment
 * the system starts having opinions about combinations, every new item has to be
 * checked against every existing one, and the person who adds the thirteenth
 * wearable inherits a matrix.
 */
export function validateCharacter(
  configuration: CharacterConfiguration,
  equipment: Equipment,
): readonly ConfigurationProblem[] {
  const problems: ConfigurationProblem[] = [];

  for (const layer of BASE_LAYERS) {
    if (variantSlug(layer, configuration[layer]) === null) {
      problems.push({ kind: 'unknown-variant', layer, index: configuration[layer] });
    }
  }

  if (!PALETTES.some((palette) => palette.index === configuration.palette)) {
    problems.push({ kind: 'unknown-palette', index: configuration.palette });
  }

  for (const slot of WEARABLE_SLOTS) {
    const slug = equipment[slot];
    if (slug === undefined) continue;

    const item: Wearable | null = wearable(slug);
    if (item === null) {
      problems.push({ kind: 'unknown-wearable', slug });
      continue;
    }
    // Owned, real, and still wrong: a legendary jersey in the head slot.
    if (item.slot !== slot) problems.push({ kind: 'wrong-slot', slug, slot });
  }

  return problems;
}

/**
 * Resolve to an ordered list of layers.
 *
 * An **invalid** configuration composites to the default rather than throwing.
 * A manager whose stored hairstyle was retired should see a character, not an
 * error page — and the customiser is where they are told, because that is where
 * they can do something about it. Nothing silently *persists* the fallback: the
 * stored row is left alone until they save.
 */
export function composeCharacter(
  configuration: CharacterConfiguration,
  equipment: Equipment = {},
): Composite {
  const safe =
    validateCharacter(configuration, equipment).length === 0
      ? { configuration, equipment }
      : { configuration: DEFAULT_CONFIGURATION, equipment: {} as Equipment };

  const layers: CompositeLayer[] = [];

  for (const layer of BASE_LAYERS) {
    const slug = variantSlug(layer, safe.configuration[layer]);
    /*
     * `Balding` is a real choice and it is a real slug, so it draws — an authored
     * PNG rather than a missing layer. A skipped layer would make *"balding"* and
     * *"the hair file failed to load"* the same state, and only one of those is
     * somebody's decision.
     */
    if (slug !== null) {
      layers.push({
        layer: BASE_LAYER_POSITION[layer],
        slug,
        palette: safe.configuration.palette,
      });
    }
  }

  for (const slot of WEARABLE_SLOTS) {
    const slug = safe.equipment[slot];
    if (slug === undefined) continue;
    layers.push({ layer: WORN_LAYER[slot], slug, palette: null });
  }

  return {
    layers: inDrawOrder(layers),
    canvas: CHARACTER_CANVAS,
    anchor: CHARACTER_ANCHOR,
  };
}

/**
 * A stable identity for a composite, for caching and for screenshot names.
 *
 * Derived from the layers in draw order, so two configurations that render
 * identically share a key and two that do not, do not. Deliberately readable —
 * a hash would be shorter and would make a failing screenshot impossible to
 * interpret.
 */
export function compositeKey(composite: Composite): string {
  return composite.layers
    .map((layer) => `${layer.layer}:${layer.slug}${layer.palette === null ? '' : `@${String(layer.palette)}`}`)
    .join('|');
}

/** Every layer the system could ever draw, for the registry contract test. */
export function everyLayerName(): readonly LayerName[] {
  return Object.keys(LAYER_ORDER) as LayerName[];
}

/** Base variants, for the customiser. Grouped, in stored-index order. */
export function customiserOptions(): Readonly<Record<BaseLayer, readonly { index: number; name: string }[]>> {
  const group = (layer: BaseLayer) =>
    BASE_VARIANTS.filter((variant) => variant.layer === layer)
      .map((variant) => ({ index: variant.index, name: variant.name }))
      .sort((x, y) => x.index - y.index);

  return { body: group('body'), hair: group('hair') };
}
