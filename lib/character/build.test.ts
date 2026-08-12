import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BODY_HEAD_SLUG, BODY_SLUG, STYLE_TRAITS } from './catalog';
import { HOUSE, SKIN_TONES, TOP_COLOURS } from './palette';

/**
 * The painted-build path, end to end, with a diagnostic mask standing in for art.
 *
 * ## What this file is for, and what it deliberately cannot tell you
 *
 * It proves the **architecture**: that a painted build takes over a top's slug,
 * that the drawn head stays above it, that a manager's skin and garment colours
 * still resolve at render time from one file, and that every top without a mask
 * renders exactly as it did before any of this existed.
 *
 * It says **nothing whatsoever about whether a manager looks good**, and the
 * fixture it runs on is not artwork — it is the drawn figure re-expressed as role
 * keys, built in memory. Commissioner ruling, 2026-08-11: a substitute must never
 * be presented as visual evidence, and the only thing that can answer the quality
 * question is the real T-shirt in the real basement on a real phone.
 */

const TSHIRT = STYLE_TRAITS.top.find((option) => option.name === 'T-shirt')!.slug!;
const HOODIE = STYLE_TRAITS.top.find((option) => option.name === 'Hoodie')!.slug!;

vi.mock('./art/masks', async () => {
  const { encodeMask } = await import('./mask');
  const { fixtureBuildMask, fixtureHeadMask } = await import('./mask.fixture');
  const masks: Record<string, unknown> = {
    [TSHIRT]: encodeMask(TSHIRT, 'build', fixtureBuildMask()),
    avatar_body_head: encodeMask('avatar_body_head', 'head', fixtureHeadMask()),
  };
  return {
    PAINTED_MASKS: masks,
    paintedMask: (slug: string) => masks[slug] ?? null,
    hasBuildMask: (slug: string) =>
      (masks[slug] as { plate?: string } | undefined)?.plate === 'build',
  };
});

const { composeCharacter, compositeRuns, compositeKey } = await import('./composite');

const TSHIRT_INDEX = STYLE_TRAITS.top.findIndex((option) => option.slug === TSHIRT);
const HOODIE_INDEX = STYLE_TRAITS.top.findIndex((option) => option.slug === HOODIE);

const manager = (over: Partial<Record<string, number>> = {}) => ({
  skin: 1,
  hair: 0,
  hairColour: 1,
  facialHair: 0,
  top: TSHIRT_INDEX,
  topColour: 1,
  ...over,
});

describe('a painted top brings its own body', () => {
  it('draws the head plate instead of the whole drawn figure', () => {
    const composite = composeCharacter(manager());
    const base = composite.layers.find((layer) => layer.layer === 'base-body')!;
    expect(base.slug).toBe(BODY_HEAD_SLUG);
  });

  it('leaves every unpainted top drawing exactly as it did', () => {
    /*
     * The property that makes landing one build safe. Five drawn tops and one
     * painted one is the prototype's actual state, and a manager on a drawn top
     * must not be able to tell that any of this happened.
     */
    const composite = composeCharacter(manager({ top: HOODIE_INDEX }));
    const base = composite.layers.find((layer) => layer.layer === 'base-body')!;
    expect(base.slug).toBe(BODY_SLUG);
    expect(base.paint).toEqual({ kind: 'skin', index: 1 });

    const top = composite.layers.find((layer) => layer.layer === 'base-top')!;
    expect(top.paint).toEqual({ kind: 'top', index: 1 });
  });

  it('keeps the layer order and the layer names it always had', () => {
    // A new layer name would have been a change to `LAYER_ORDER`, and every
    // wearable's position is expressed against it.
    expect(composeCharacter(manager()).layers.map((layer) => layer.layer)).toEqual([
      'base-body',
      'base-top',
      'base-hair',
    ]);
  });
});

describe('colour is still a runtime parameter', () => {
  it('paints one mask in all four skin tones', () => {
    /*
     * The whole reason a mask carries roles rather than colours. If this fails,
     * painted art has cost the product three of its four skin tones — which is
     * the failure `ROOMS_BOUNDARY §14.1` priced at 132 files.
     */
    const seen = new Set<string>();
    for (const tone of SKIN_TONES) {
      const runs = compositeRuns(composeCharacter(manager({ skin: tone.index })));
      seen.add(runs.map((run) => `${String(run.x)}.${String(run.y)}.${run.value}`).join('|'));
    }
    expect(seen.size).toBe(SKIN_TONES.length);
  });

  it('paints one mask in all eight top colours', () => {
    const seen = new Set<string>();
    for (const colour of TOP_COLOURS) {
      const runs = compositeRuns(composeCharacter(manager({ topColour: colour.index })));
      seen.add(runs.map((run) => `${String(run.x)}.${String(run.y)}.${run.value}`).join('|'));
    }
    expect(seen.size).toBe(TOP_COLOURS.length);
  });

  it('puts the skin colour on the bare pixels and the garment colour on the rest', () => {
    /*
     * Not "the two renders differ" — *which* pixels moved. A build carries two of
     * the manager's choices in one layer, so the test that matters is that
     * changing the shirt leaves the forearms alone and changing the skin leaves
     * the shirt alone. A single-channel resolution would pass every other test
     * in this file by repainting the whole figure each time.
     */
    const at = (config: ReturnType<typeof manager>): Map<string, string> => {
      const out = new Map<string, string>();
      for (const run of compositeRuns(composeCharacter(config))) {
        for (let y = run.y; y < run.y + run.h; y++) {
          for (let x = run.x; x < run.x + run.w; x++) out.set(`${String(x)}.${String(y)}`, run.value);
        }
      }
      return out;
    };

    const base = at(manager());
    const otherShirt = at(manager({ topColour: 6 }));
    const otherSkin = at(manager({ skin: 3 }));

    let shirtMoved = 0;
    let skinMoved = 0;
    let bothMoved = 0;
    for (const [cell, colour] of base) {
      const shirt = otherShirt.get(cell) !== colour;
      const skin = otherSkin.get(cell) !== colour;
      if (shirt && skin) bothMoved++;
      else if (shirt) shirtMoved++;
      else if (skin) skinMoved++;
    }

    expect(shirtMoved, 'no pixel answers to the garment alone').toBeGreaterThan(200);
    expect(skinMoved, 'no pixel answers to the skin alone').toBeGreaterThan(200);
    // A pixel may legitimately move under both — a contact shadow cast by one
    // channel onto the other — but that must be the exception, not the rule.
    expect(bothMoved).toBeLessThan(shirtMoved + skinMoved);
  });

  it('gives two managers who differ only in skin two different keys', () => {
    expect(compositeKey(composeCharacter(manager({ skin: 0 })))).not.toBe(
      compositeKey(composeCharacter(manager({ skin: 3 }))),
    );
  });
});

describe('the channel prefix never escapes the compositor', () => {
  let colours: readonly string[] = [];

  beforeEach(() => {
    colours = compositeRuns(composeCharacter(manager())).map((run) => run.value);
  });

  it('emits nothing but hex colours', () => {
    /*
     * `skin:` is resolved into the paint map as the layer is written. If one ever
     * reached the colour pass it would fall through to `fixedColour`, which
     * answers an unknown key with **ink** — so the figure would render with dark
     * patches where its bare arms are and every other test here would still pass.
     */
    for (const colour of colours) expect(colour).toMatch(/^#[0-9A-F]{6}$/i);
  });

  it('draws the figure in more than a handful of colours', () => {
    expect(new Set(colours).size).toBeGreaterThanOrEqual(8);
  });
});

describe('a painted head plate, the other layer that carries skin tones', () => {
  /**
   * **The bug this exists for rendered every manager with a black face.**
   *
   * `compositeRuns` strips a `skin:` prefix as it writes a layer, and the first
   * version asked only whether the paint was a `build`. A painted head plate is
   * painted `{ kind: 'skin' }` and emits `skin:` tones too, so its tones fell
   * through unstripped to the colour pass — which answers an unrecognised key with
   * **ink**.
   *
   * Every test above passed throughout, because every one of them ran a *build*.
   * It was found by rendering the head under six hairstyles and looking at it.
   */
  it('draws the head in skin rather than in ink', () => {
    const composite = composeCharacter(manager());
    const base = composite.layers.find((layer) => layer.layer === 'base-body')!;
    expect(base.slug).toBe(BODY_HEAD_SLUG);
    expect(base.paint.kind).toBe('skin');

    const runs = compositeRuns(composite);
    const ink = new Set<string>([HOUSE['ink-900']]);
    const head = runs.filter((run) => run.y >= 30 && run.y < 45 && !ink.has(run.value));
    expect(head.length, 'the head plate drew nothing but outline').toBeGreaterThan(4);

    // And every colour is a real one, which is what ink-through-the-fallback broke.
    for (const run of runs) expect(run.value).toMatch(/^#[0-9A-F]{6}$/i);
  });

  it('recolours the head with the skin the manager chose', () => {
    const at = (skin: number): Set<string> =>
      new Set(
        compositeRuns(composeCharacter(manager({ skin })))
          .filter((run) => run.y >= 30 && run.y < 45)
          .map((run) => run.value),
      );
    expect([...at(0)].sort()).not.toEqual([...at(3)].sort());
  });
});
