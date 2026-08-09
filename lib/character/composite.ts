import { toneGrid } from './art';
import {
  BODY_SLUG,
  isKnownOption,
  optionName,
  styleSlug,
  wearable,
  type Wearable,
} from './catalog';
import {
  CHARACTER_ANCHOR,
  CHARACTER_CANVAS,
  TRAIT_LAYER,
  WEARABLE_SLOTS,
  WORN_LAYER,
  inDrawOrder,
  type BaseTrait,
  type LayerName,
  type WearableSlot,
} from './layers';
import {
  fixedColour,
  fixedColours,
  hairColours,
  skinColours,
  topColours,
  type LayerColours,
} from './palette';
import { toRuns, type Run } from './sprite';

/**
 * A character configuration, resolved into pixels.
 *
 * **Pure, and the only place storage and drawing meet.** Everything above it is a
 * row of integers; everything below is rectangles. That split is what lets a
 * preview fixture drive the identical compositor production uses, and what makes
 * the clipping rules testable as arithmetic rather than as screenshots — which
 * matters here more than anywhere, because the lesson recorded in
 * `docs/CHECKPOINT.md` is that *geometry read off a screenshot is wrong* and the
 * eye kept confidently reporting it had measured something it had not.
 */

/**
 * What a manager looks like. Six small integers, and nothing else.
 *
 * Each one is independent of the others. There is no combination this type can
 * express that the system refuses to draw, which is the property that makes
 * validation a question about *each* number rather than about the tuple.
 */
export interface CharacterConfiguration {
  readonly skin: number;
  readonly hair: number;
  readonly hairColour: number;
  readonly facialHair: number;
  readonly top: number;
  readonly topColour: number;
}

/** What is in each slot. A slot with nothing in it is simply absent. */
export type Equipment = Partial<Readonly<Record<WearableSlot, string>>>;

/**
 * The character every manager has before they have chosen anything.
 *
 * Deliberately **not** the first option of everything. All-zeroes would put every
 * manager in the same hoodie in the same red with the same short black hair, and
 * ten identical characters is the state this whole feature exists to avoid — a
 * manager who never opens the customiser should still be distinguishable from
 * one who never opened it either. `defaultCharacterFor` spreads them.
 */
export const DEFAULT_CONFIGURATION: CharacterConfiguration = Object.freeze({
  skin: 1,
  hair: 0,
  hairColour: 1,
  facialHair: 0,
  top: 0,
  topColour: 1,
});

export type ConfigurationProblem =
  | { readonly kind: 'unknown-option'; readonly trait: BaseTrait; readonly index: number }
  | { readonly kind: 'unknown-wearable'; readonly slug: string }
  | { readonly kind: 'wrong-slot'; readonly slug: string; readonly slot: WearableSlot };

const TRAITS: readonly BaseTrait[] = ['skin', 'hair', 'hairColour', 'facialHair', 'top', 'topColour'];

/**
 * Is this a character the system can actually draw?
 *
 * Returns every problem rather than the first, because a customiser showing one
 * error at a time makes a manager fix six things in six round trips.
 *
 * **A legal character is one whose every part exists.** There are deliberately no
 * *taste* rules — no "that hat does not go with that hair". The moment the system
 * has opinions about combinations, every new item has to be checked against every
 * existing one and whoever adds the thirteenth wearable inherits a matrix.
 */
export function validateCharacter(
  configuration: CharacterConfiguration,
  equipment: Equipment,
): readonly ConfigurationProblem[] {
  const problems: ConfigurationProblem[] = [];

  for (const trait of TRAITS) {
    if (!isKnownOption(trait, configuration[trait])) {
      problems.push({ kind: 'unknown-option', trait, index: configuration[trait] });
    }
  }

  for (const slot of WEARABLE_SLOTS) {
    const slug = equipment[slot];
    if (slug === undefined) continue;

    const item: Wearable | null = wearable(slug);
    if (item === null) {
      problems.push({ kind: 'unknown-wearable', slug });
      continue;
    }
    // Owned, real, and still wrong: a jersey in the head slot.
    if (item.slot !== slot) problems.push({ kind: 'wrong-slot', slug, slot });
  }

  return problems;
}

/**
 * Replace anything unrecognised with that trait's default — **per trait**.
 *
 * The system this replaces reset the *whole* character the moment one value did
 * not resolve, so a manager whose hairstyle was retired lost their skin tone,
 * their shirt and their colour too. A retired option should cost the option, not
 * the character.
 *
 * Nothing here writes. The stored row is left exactly as it is until the manager
 * saves, so a value that stops resolving because a deploy is half-rolled-out
 * comes back on its own.
 */
export function repairConfiguration(configuration: CharacterConfiguration): CharacterConfiguration {
  const repaired = { ...configuration };
  for (const trait of TRAITS) {
    if (!isKnownOption(trait, configuration[trait])) repaired[trait] = DEFAULT_CONFIGURATION[trait];
  }
  return repaired;
}

/** Drop anything unwearable or in the wrong slot, keeping the rest. */
export function repairEquipment(equipment: Equipment): Equipment {
  const out: Record<string, string> = {};
  for (const slot of WEARABLE_SLOTS) {
    const slug = equipment[slot];
    if (slug === undefined) continue;
    const item = wearable(slug);
    if (item !== null && item.slot === slot) out[slot] = slug;
  }
  return out;
}

/** How a layer is painted. Resolved from the configuration, never stored. */
export type Paint =
  | { readonly kind: 'skin'; readonly index: number }
  | { readonly kind: 'hair'; readonly index: number }
  | { readonly kind: 'top'; readonly index: number }
  | { readonly kind: 'item'; readonly slug: string };

export interface CompositeLayer {
  readonly layer: LayerName;
  readonly slug: string;
  readonly paint: Paint;
}

export interface Composite {
  readonly layers: readonly CompositeLayer[];
  readonly canvas: typeof CHARACTER_CANVAS;
  readonly anchor: typeof CHARACTER_ANCHOR;
  /** The configuration actually drawn, after repair. Never the stored one. */
  readonly configuration: CharacterConfiguration;
  readonly equipment: Equipment;
}

/**
 * Resolve a configuration to an ordered list of layers.
 *
 * **Never throws, for any input.** A manager whose stored hairstyle was retired,
 * whose row predates a column, or whose equipment names an item that no longer
 * exists sees a character rather than an error page — and the customiser is where
 * they are told, because that is where they can do something about it.
 */
export function composeCharacter(
  configuration: CharacterConfiguration,
  equipment: Equipment = {},
): Composite {
  const safe = repairConfiguration(configuration);
  const worn = repairEquipment(equipment);

  const layers: CompositeLayer[] = [
    { layer: 'base-body', slug: BODY_SLUG, paint: { kind: 'skin', index: safe.skin } },
  ];

  const top = styleSlug('top', safe.top);
  if (top !== null) {
    layers.push({
      layer: TRAIT_LAYER.top,
      slug: top,
      paint: { kind: 'top', index: safe.topColour },
    });
  }

  /*
   * Facial hair takes the **hair** colour rather than a colour of its own. One
   * control fewer, and a manager who has to keep two colours matched by hand
   * will eventually not — which reads as a bug rather than as a choice.
   */
  const facial = styleSlug('facialHair', safe.facialHair);
  if (facial !== null) {
    layers.push({
      layer: TRAIT_LAYER.facialHair,
      slug: facial,
      paint: { kind: 'hair', index: safe.hairColour },
    });
  }

  const hair = styleSlug('hair', safe.hair);
  if (hair !== null) {
    layers.push({
      layer: TRAIT_LAYER.hair,
      slug: hair,
      paint: { kind: 'hair', index: safe.hairColour },
    });
  }

  for (const slot of WEARABLE_SLOTS) {
    const slug = worn[slot];
    if (slug === undefined) continue;
    layers.push({ layer: WORN_LAYER[slot], slug, paint: { kind: 'item', slug } });
  }

  return {
    layers: inDrawOrder(layers),
    canvas: CHARACTER_CANVAS,
    anchor: CHARACTER_ANCHOR,
    configuration: safe,
    equipment: worn,
  };
}

function coloursFor(paint: Paint): LayerColours {
  switch (paint.kind) {
    case 'skin':
      return skinColours(paint.index);
    case 'hair':
      return hairColours(paint.index);
    case 'top':
      return topColours(paint.index);
    case 'item': {
      const item = wearable(paint.slug);
      return item === null
        ? fixedColours('inkSoft', 'ink')
        : fixedColours(item.base, item.shade);
    }
  }
}

/** A flat rectangle of one colour. What the renderer draws, and all it draws. */
export type ColourRun = Run<string>;

/**
 * Flatten a composite to the fewest coloured rectangles that draw it.
 *
 * Every layer's tone grid is cached by slug (`art/index.ts`), so this is a walk
 * over 6,144 cells per layer and a run-length pass — no rasterising, no shading,
 * no allocation of shapes. Measured at a few hundred rectangles for a full
 * character, against 6,144 for one node per pixel.
 */
export function compositeRuns(composite: Composite): readonly ColourRun[] {
  const { width, height } = composite.canvas;
  const grid: (string | null)[][] = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => null),
  );

  for (const layer of composite.layers) {
    const tones = toneGrid(layer.slug);
    // A slug with no artwork draws nothing. It is not an error here — see
    // `toneGrid` — and `art-contract.test.ts` is what stops it happening at all.
    if (tones === null) continue;

    const colours = coloursFor(layer.paint);
    for (let y = 0; y < height; y++) {
      const row = tones[y];
      if (row === undefined) continue;
      for (let x = 0; x < width; x++) {
        const tone = row[x];
        if (tone === null || tone === undefined) continue;
        grid[y]![x] =
          tone === 'outline'
            ? colours.outline
            : tone === 'shade' || tone === 'alt'
              ? colours.shade
              : tone === 'base'
                ? colours.base
                : tone === 'ink'
                  ? colours.outline
                  : fixedColour(tone.slice('fixed:'.length));
      }
    }
  }

  return toRuns(grid);
}

/**
 * A stable identity for a composite, for caching and for screenshot names.
 *
 * Derived from the layers in draw order plus the colours they resolve to, so two
 * configurations that render identically share a key and two that do not, do not.
 * Deliberately readable — a hash would be shorter and would make a failing
 * screenshot impossible to interpret.
 */
export function compositeKey(composite: Composite): string {
  return composite.layers
    .map((layer) => {
      const paint = layer.paint;
      const suffix = paint.kind === 'item' ? '' : `@${paint.kind}${String(paint.index)}`;
      return `${layer.layer}:${layer.slug}${suffix}`;
    })
    .join('|');
}

/**
 * A sentence describing a character, for anybody not looking at it.
 *
 * Built from the same composite the pixels come from, so it cannot describe a
 * character that is not on screen.
 */
export function describeCharacter(composite: Composite): string {
  const { configuration } = composite;
  const parts: string[] = [];

  const hairColourName = optionName('hairColour', configuration.hairColour)?.toLowerCase();
  const hairName = optionName('hair', configuration.hair)?.toLowerCase();
  if (hairName !== undefined && hairColourName !== undefined) {
    parts.push(`${hairColourName} ${hairName} hair`);
  }

  const facial = optionName('facialHair', configuration.facialHair);
  if (facial !== null && configuration.facialHair !== 0) parts.push(`a ${facial.toLowerCase()}`);

  const topColourName = optionName('topColour', configuration.topColour)?.toLowerCase();
  const topName = optionName('top', configuration.top)?.toLowerCase();
  if (topName !== undefined && topColourName !== undefined) {
    parts.push(`a ${topColourName} ${topName}`);
  }

  for (const slot of WEARABLE_SLOTS) {
    const slug = composite.equipment[slot];
    if (slug === undefined) continue;
    const item = wearable(slug);
    if (item !== null) parts.push(item.name.toLowerCase());
  }

  if (parts.length === 0) return 'A pizza-league manager.';
  const last = parts.pop()!;
  const list = parts.length === 0 ? last : `${parts.join(', ')} and ${last}`;
  return `A pizza-league manager with ${list}.`;
}

/**
 * A character for a manager who has never chosen one.
 *
 * Derived from their user id, so it is **stable** — the same manager gets the
 * same character on every device and after every deploy — and **spread**, so ten
 * managers who have never opened the customiser are ten recognisably different
 * people rather than ten copies of the default.
 *
 * It is a starting point and nothing else: no meaning is attached to which one
 * anybody gets, nothing is inferred about them, and the first save replaces it.
 * `03`'s ban on inventing a manager's personality applies to their face too.
 */
export function defaultCharacterFor(userId: string): CharacterConfiguration {
  /*
   * FNV-1a over the id. Chosen for being short, stable across runtimes and
   * obviously not a security primitive; `Math.random` would give a manager a
   * different face on every page load and `hashCode`-style shifts collide badly
   * on uuids, which differ only in the middle.
   */
  let hash = 0x811c9dc5;
  for (let i = 0; i < userId.length; i++) {
    hash ^= userId.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  const pick = (step: number, count: number): number => Math.floor(hash / step) % count;

  return {
    skin: pick(1, 4),
    hair: pick(4, 6),
    hairColour: pick(24, 8),
    facialHair: pick(192, 5),
    top: pick(960, 6),
    topColour: pick(5760, 8),
  };
}
