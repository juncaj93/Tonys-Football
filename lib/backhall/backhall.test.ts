import { describe, expect, it } from 'vitest';

import { BACK_HALL, BACK_HALL_OBJECTS, LOCKABLE, LOCKED_LINES, backHallObject } from './objects';
import { FEATURE_KEYS, featureFlags } from '@/lib/flags';
import { overlaps } from '@/lib/parlor/objects';

/**
 * The back hall's map, and the rules `18 §5`–`§6` fix about it.
 *
 * Every assertion here corresponds to a sentence in the navigation map rather
 * than to a preference. Where one does not, it says which defect it is written
 * against.
 */

/** The narrowest supported viewport. Room units are scaled to it. */
const NARROWEST = 360;
const toCss = (units: number): number => (units / BACK_HALL.width) * NARROWEST;

describe('the back hall map', () => {
  it('has exactly three objects, all of them doors', () => {
    // `18 §5`: two environmental choices plus an in-world return. Not four, and
    // not a fourth thing added later without a ruling.
    expect(BACK_HALL_OBJECTS).toHaveLength(3);
    expect(BACK_HALL_OBJECTS.map((o) => o.id).sort()).toEqual(['curtain', 'return', 'stairs']);
    expect(BACK_HALL_OBJECTS.every((o) => o.kind === 'door')).toBe(true);
  });

  it('shares the parlor’s coordinate system', () => {
    // `zone_back_hall_shell` is registered at 320 x 569, identical to the
    // parlor's shell and to every room shell on disk. Walking through the rear
    // doorway must not change the size of the world.
    expect(BACK_HALL).toEqual({ width: 320, height: 569 });
  });

  it('keeps every hit region inside the room', () => {
    for (const object of BACK_HALL_OBJECTS) {
      const [x, y, width, height] = object.rect;
      expect(x, object.id).toBeGreaterThanOrEqual(0);
      expect(y, object.id).toBeGreaterThanOrEqual(0);
      expect(x + width, object.id).toBeLessThanOrEqual(BACK_HALL.width);
      expect(y + height, object.id).toBeLessThanOrEqual(BACK_HALL.height);
    }
  });

  it('never lets two objects share a tap', () => {
    // The gate the parlor's map has had since V1. Neighbours that overlap steal
    // each other's taps, and the symptom is a door that "sometimes" works.
    for (const a of BACK_HALL_OBJECTS) {
      for (const b of BACK_HALL_OBJECTS) {
        if (a.id === b.id) continue;
        expect(overlaps(a, b), `${a.id} overlaps ${b.id}`).toBe(false);
      }
    }
  });

  it('gives every object a 44 CSS px target on the narrowest supported phone', () => {
    for (const object of BACK_HALL_OBJECTS) {
      const [, , width, height] = object.rect;
      expect(toCss(width), object.id).toBeGreaterThanOrEqual(44);
      // Height scales on the same factor: the container is aspect-locked.
      expect(toCss(height), object.id).toBeGreaterThanOrEqual(44);
    }
  });

  it('keeps every object inside the band a phone actually shows', () => {
    /*
     * The room is anchored to the top of the viewport and aspect-locked, so a
     * taller phone loses the bottom rather than the middle. At 390 — the widest
     * supported and therefore the tallest render — the viewport shows
     * `664 x 320 / 390 = 544.8` room units, so rows 545–568 are cropped.
     *
     * Measured on a production build, not derived: `docs/evidence/back-hall/`.
     */
    const VISIBLE_AT_390 = (664 * BACK_HALL.width) / 390;

    for (const object of BACK_HALL_OBJECTS) {
      const [, y, , height] = object.rect;
      expect(y + height, object.id).toBeLessThanOrEqual(VISIBLE_AT_390);
    }
  });

  it('leaves a shut door room to be heard', () => {
    /*
     * **Visual debt 19**, as a rule rather than a repair.
     *
     * `ShutDoor` renders its in-world answer 8 units below the door's own
     * rectangle, and the answer is up to 68 CSS px tall. The stairs used to end
     * at `y 542`, which put that line's top at 670px inside a 664px viewport at
     * 390 — `18 §6.3` requires a locked door to answer in world, and an answer
     * below the fold is no answer.
     *
     * 68 CSS px at 390 is `68 x 320 / 390 = 55.8` room units, plus the 8-unit
     * offset, inside the 544.8 the phone shows. Anything lockable must end
     * above that.
     */
    const LINE_UNITS = (68 * BACK_HALL.width) / 390;
    const ceiling = (664 * BACK_HALL.width) / 390 - LINE_UNITS - 8;

    expect(ceiling).toBeGreaterThan(460);

    for (const id of LOCKABLE) {
      const [, y, , height] = backHallObject(id).rect;
      expect(y + height, id).toBeLessThanOrEqual(ceiling);
    }
  });

  it('spells every label as something spoken, never as a route', () => {
    for (const object of BACK_HALL_OBJECTS) {
      expect(object.label, object.id).not.toMatch(/^\//);
      expect(object.label.length, object.id).toBeGreaterThan(3);
    }
  });

  it('throws for an object that is not in the hall', () => {
    expect(() => backHallObject('basement')).toThrow(/no back-hall object/);
  });
});

describe('the two shut doors', () => {
  it('names exactly the two destinations that can be shut', () => {
    // The return door is deliberately absent. It is not a feature and it never
    // closes; a list that included it would invite somebody to flag it.
    expect([...LOCKABLE]).toEqual(['stairs', 'curtain']);
    expect(LOCKABLE).not.toContain('return');
  });

  it('keeps the Underground’s line verbatim from `18 §5`', () => {
    // Fixed copy. It is the joke and it is the reveal, and rewording it costs
    // both, so it is pinned rather than described.
    expect(LOCKED_LINES.curtain).toBe('Don’t worry about it.');
  });

  it('never says what is behind the curtain', () => {
    // `18 §5`: never labelled CASINO on first discovery. Checked across every
    // string this route can render for that door, not just the obvious one.
    const spoken = [LOCKED_LINES.curtain, backHallObject('curtain').label, backHallObject('curtain').destination ?? ''];

    for (const text of spoken) {
      expect(text).not.toMatch(/casino|blackjack|slots?|roulette|gambl/i);
    }
  });

  it('promises no date on a shut door', () => {
    // `18 §6`: no countdown timers on locked doors. The single honest countdown
    // in this product is the end-of-season spend-down; a door that opens "in
    // three days" manufactures urgency and a door that is simply shut does not.
    for (const line of Object.values(LOCKED_LINES)) {
      expect(line).not.toMatch(/\d/);
      expect(line).not.toMatch(/soon|coming|weeks?|days?|month|later this|shortly/i);
    }
  });

  it('says something rather than apologising', () => {
    for (const line of Object.values(LOCKED_LINES)) {
      expect(line).not.toMatch(/sorry|unavailable|not available|error|locked|disabled/i);
      expect(line.length).toBeGreaterThan(10);
    }
  });
});

describe('feature flags', () => {
  it('ships with the rooms and the commissioner-approved Underground open', () => {
    /*
     * `rooms` was opened on 2026-08-09 when the basement was built
     * (`docs/ROOMS_BOUNDARY.md`). `18 §6`: a door opens for everyone at once,
     * which is what a deploy-time flag does.
     *
     * The 2026-08-23 commissioner ruling opened the completed Blackjack and
     * Slots route for everyone. A deployment is still the only way to change
     * that real-world state; preview parameters merely photograph reversions.
     */
    const flags = featureFlags({});

    expect(flags.rooms).toBe(true);
    expect(flags.underground).toBe(true);
  });

  it('shuts everything again for `none`, which is what a revert looks like', () => {
    /*
     * Shutting `rooms` is one line in `V1`. The state that produces was
     * unreachable from any parameter the moment the default flipped, and it is
     * the state where being wrong is least recoverable — so it is photographed.
     */
    const flags = featureFlags({ DEMO_FIXTURES: '1' }, 'none');

    expect(flags).toEqual({
      rooms: false,
      underground: false,
      roulette: false,
      tonysLine: false,
    });
  });

  it('will not shut anything in production either', () => {
    // Symmetry with the opening override: neither direction is reachable from a
    // URL in production, because what is open is a property of the deploy.
    expect(featureFlags({ VERCEL_ENV: 'production', DEMO_FIXTURES: '1' }, 'none')).toEqual(
      featureFlags({}),
    );
  });

  it('ships v1 with the market shut, because there is no season to run one on', () => {
    /*
     * `18 §3.4`: *"V1: Tony's weekly prediction only. Later, behind the approved
     * feature flag — Tony's Line."* Shut is also the only honest state today —
     * the line is a season median and the 2026 season has no games.
     */
    expect(featureFlags({}).tonysLine).toBe(false);
    expect(featureFlags({ DEMO_FIXTURES: '1' }, 'tonysLine').tonysLine).toBe(true);
  });

  it('will not open the market in production either', () => {
    expect(
      featureFlags({ VERCEL_ENV: 'production', DEMO_FIXTURES: '1' }, 'tonysLine').tonysLine,
    ).toBe(false);
  });

  it('declares exactly the keys this product has', () => {
    expect([...FEATURE_KEYS].sort()).toEqual([
      'rooms',
      'roulette',
      'tonysLine',
      'underground',
    ]);
  });

  it('never opens roulette, by any route', () => {
    /*
     * `16`: "Roulette is never built. A reserved feature-flag key is the entire
     * required scaffolding." The key exists so the decision has somewhere to
     * live where somebody adding a game will read it — not so it can be turned
     * on. Not even the preview override reaches it.
     */
    const everything = featureFlags({
      DEMO_FIXTURES: '1',
      OPEN_FEATURES: 'rooms,underground,roulette',
    });

    expect(everything.rooms).toBe(true);
    expect(everything.underground).toBe(true);
    expect(everything.roulette).toBe(false);
  });

  it('refuses an Underground reversion from a production query', () => {
    const flags = featureFlags({
      NODE_ENV: 'production',
      VERCEL_ENV: 'production',
      DEMO_FIXTURES: '1',
      OPEN_FEATURES: 'none',
    });

    expect(flags.underground).toBe(true);
  });

  it('refuses a reversion without the demo opt-in', () => {
    const flags = featureFlags({ OPEN_FEATURES: 'none' });

    expect(flags.underground).toBe(true);
  });

  it('opens one destination without opening the other', () => {
    // From the shut floor, so this measures the override rather than the default.
    const flags = featureFlags({
      DEMO_FIXTURES: '1',
      OPEN_FEATURES: 'none,rooms',
    });

    expect(flags.rooms).toBe(true);
    expect(flags.underground).toBe(false);
  });

  it('opens from a preview query parameter, so both states can be photographed', () => {
    const demo = { DEMO_FIXTURES: '1' };

    expect(featureFlags(demo, 'rooms')).toEqual({
      rooms: true,
      underground: true,
      roulette: false,
      tonysLine: false,
    });
    expect(featureFlags(demo, 'rooms,underground')).toEqual({
      rooms: true,
      underground: true,
      roulette: false,
      tonysLine: false,
    });
    // Repeated parameters arrive as an array, and a stale one must not throw.
    expect(featureFlags(demo, ['none', 'basement'])).toEqual({
      rooms: false,
      underground: false,
      roulette: false,
      tonysLine: false,
    });
  });

  it('refuses the reversion query parameter in production', () => {
    const flags = featureFlags({ VERCEL_ENV: 'production', DEMO_FIXTURES: '1' }, 'none');

    expect(flags.underground).toBe(true);
  });

  it('ignores a key it does not recognise rather than throwing', () => {
    // A stale value in an environment variable should not take a preview down.
    const flags = featureFlags({
      DEMO_FIXTURES: '1',
      OPEN_FEATURES: 'none,basement, ,vending',
    });

    expect(flags).toEqual({
      rooms: false,
      underground: false,
      roulette: false,
      tonysLine: false,
    });
  });
});
