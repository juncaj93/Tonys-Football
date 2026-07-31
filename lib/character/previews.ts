import { DemoRefused, assertDemoAllowed } from '@/lib/demo/guard';

import { WEARABLES } from './catalog';
import { composeCharacter, type CharacterConfiguration, type Composite, type Equipment } from './composite';

/**
 * Named characters, reachable by name — `?character=tallest`.
 *
 * ## What this is for, and what it is not for
 *
 * These are the **geometry** cases: the combinations a reviewer has to look at to
 * believe nothing clips, floats or loses its floor. `figure.test.ts` already
 * proves each of them arithmetically over every combination — this is how a
 * person *sees* the ones that matter, which is a different question and the one
 * `MANDATE §7` is about.
 *
 * They are deliberately **not** the customiser's states. An empty wardrobe, a
 * staged-but-unsaved change and a refused save are states of a manager and of a
 * session, and they are produced by the demo system against a reserved seat
 * where they belong. A fixture that faked them would be photographing a mock.
 *
 * ## Three guards, the same three the Slice's editions have
 *
 * 1. A key declared here and not implemented **throws** rather than rendering a
 *    plausible default — the false green that has happened three times in this
 *    repository (nine reveal states, the `slice` state, and the driver's own
 *    missing `case`).
 * 2. The page stamps `data-character-preview`, so a server without
 *    `DEMO_FIXTURES=1` cannot photograph an ordinary page under a preview's name.
 * 3. `driver-coverage.test.ts` fails the build for a preview the driver would
 *    never photograph — never photographed being the failure that leaves no trace.
 */

export const CHARACTER_PREVIEWS = [
  'default',
  'tallest',
  'widest',
  'balding-visor',
  'every-slot',
  'long-hair-apron',
] as const;

export type CharacterPreviewKey = (typeof CHARACTER_PREVIEWS)[number];

export const CHARACTER_PREVIEW_DESCRIPTIONS: Readonly<Record<CharacterPreviewKey, string>> =
  Object.freeze({
    default: 'What every manager starts as, before they have chosen anything.',
    tallest: 'The tallest silhouette the system can draw — curly hair under a bobbled beanie.',
    widest: 'The widest silhouette — a ponytail on one side, a pizza peel on the other.',
    'balding-visor': 'The pair the hat-floating rule exists for: the lowest hair under a visor.',
    'every-slot': 'All four worn slots filled at once, over the button-up shirt.',
    'long-hair-apron': 'Hair that falls past the shoulder under a body item that covers them.',
  });

export interface CharacterPreview {
  readonly key: CharacterPreviewKey;
  readonly description: string;
  readonly configuration: CharacterConfiguration;
  readonly equipment: Equipment;
  readonly composite: Composite;
}

interface Fixture {
  readonly configuration: CharacterConfiguration;
  readonly equipment: Equipment;
}

/**
 * The fixtures.
 *
 * Every slug is written out rather than derived from "the tallest one", so that
 * changing the artwork makes a *test* fail — `figure.test.ts` asserts which item
 * is actually the extreme — instead of silently repointing the fixture at
 * something else and photographing the wrong case under the right name.
 */
const FIXTURES: Readonly<Record<CharacterPreviewKey, Fixture>> = Object.freeze({
  default: {
    configuration: { body: 0, hair: 0, palette: 0 },
    equipment: {},
  },
  tallest: {
    configuration: { body: 0, hair: 3, palette: 1 },
    equipment: { head: 'wear_head_beanie_winter' },
  },
  widest: {
    configuration: { body: 0, hair: 5, palette: 2 },
    equipment: { hand: 'wear_hand_pizza_peel' },
  },
  'balding-visor': {
    configuration: { body: 1, hair: 4, palette: 3 },
    equipment: { head: 'wear_head_pizza_visor', face: 'wear_face_shades' },
  },
  'every-slot': {
    configuration: { body: 1, hair: 0, palette: 0 },
    equipment: {
      head: 'wear_head_paper_hat',
      face: 'wear_face_mustache_fake',
      body: 'wear_body_apron_tony',
      hand: 'wear_hand_slice',
    },
  },
  'long-hair-apron': {
    configuration: { body: 0, hair: 2, palette: 2 },
    equipment: { body: 'wear_body_jersey_blank', hand: 'wear_hand_trophy_mini' },
  },
});

export function isCharacterPreviewKey(value: string): value is CharacterPreviewKey {
  return (CHARACTER_PREVIEWS as readonly string[]).includes(value);
}

/**
 * Build one named preview.
 *
 * Exported without the guard, exactly as `resolveEdition` is: the guard belongs
 * to the route, where an untrusted request arrives. A test that had to set an
 * environment variable to render its own fixtures would be testing the guard.
 */
export function resolveCharacterPreview(key: CharacterPreviewKey): CharacterPreview {
  const fixture = FIXTURES[key];
  if (fixture === undefined) {
    throw new Error(
      `character preview "${key}" is declared in CHARACTER_PREVIEWS and not implemented in FIXTURES.`,
    );
  }

  // Every slug a fixture names must be real. A fixture referencing a retired or
  // mistyped slug would otherwise composite to the *default* character
  // (`composeCharacter` falls back rather than throwing) and photograph a
  // perfectly good picture of the wrong thing under the right name.
  for (const [slot, slug] of Object.entries(fixture.equipment)) {
    const item = WEARABLES.find((candidate) => candidate.slug === slug);
    if (item === undefined) {
      throw new Error(`character preview "${key}" names ${String(slug)}, which is not a wearable`);
    }
    if (item.slot !== slot) {
      throw new Error(`character preview "${key}" puts ${item.slug} in the ${slot} slot`);
    }
  }

  return {
    key,
    description: CHARACTER_PREVIEW_DESCRIPTIONS[key],
    configuration: fixture.configuration,
    equipment: fixture.equipment,
    composite: composeCharacter(fixture.configuration, fixture.equipment),
  };
}

/**
 * Resolve `?character=tallest`, or null.
 *
 * Null for every ordinary request and for every environment where demos are not
 * allowed — the caller renders the manager's own character exactly as it would
 * have. Anything else would leak that the parameter exists.
 */
export function previewCharacter(
  raw: string | string[] | undefined,
  env: Record<string, string | undefined>,
): CharacterPreview | null {
  if (typeof raw !== 'string' || raw === '') return null;

  try {
    assertDemoAllowed(env);
  } catch (error: unknown) {
    if (error instanceof DemoRefused) return null;
    throw error;
  }

  if (!isCharacterPreviewKey(raw)) return null;
  return resolveCharacterPreview(raw);
}
