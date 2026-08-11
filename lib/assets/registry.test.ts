import { describe, expect, it } from 'vitest';

import { existsSync } from 'node:fs';
import path from 'node:path';

import inventoryJson from '@/art/assets.inventory.json';

import { assetRegistry, buildRegistry, resolveAsset } from './registry';
import { ASSET_FAMILIES } from './types';

function inventory(assets: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return { assets, ...extra };
}

const validRecord = {
  family: 'collectible',
  canvas: '32x32',
  batch: 'B3',
  art_status: 'placeholder',
  alt: 'A pizza cutter',
};

describe('buildRegistry — parsing', () => {
  it('flattens grouped inventory into a flat slug lookup', () => {
    const reg = buildRegistry(
      inventory({
        _groupOne: { alpha: validRecord },
        _groupTwo: { beta: validRecord },
      }),
    );

    expect(reg.size).toBe(2);
    expect(reg.has('alpha')).toBe(true);
    expect(reg.has('beta')).toBe(true);
  });

  it('ignores $comment documentation keys', () => {
    const reg = buildRegistry(
      inventory({
        _group: { $comment: 'not an asset', alpha: validRecord },
      }),
    );

    expect(reg.size).toBe(1);
    expect(reg.has('$comment')).toBe(false);
  });

  it('records which group a slug came from', () => {
    const reg = buildRegistry(inventory({ _testSet_B0: { alpha: validRecord } }));
    expect(reg.get('alpha')?.group).toBe('_testSet_B0');
  });

  it('carries optional fields through only when present', () => {
    const reg = buildRegistry(
      inventory({
        _g: {
          plain: validRecord,
          rich: {
            ...validRecord,
            family: 'avatar',
            slot: 'body',
            rarity: 'epic',
            suppresses: ['head'],
            priority: true,
          },
          surf: { ...validRecord, family: 'surface', safeArea: [8, 12, 80, 40] },
        },
      }),
    );

    expect(reg.get('plain')).not.toHaveProperty('slot');
    expect(reg.get('rich')?.slot).toBe('body');
    expect(reg.get('rich')?.suppresses).toEqual(['head']);
    expect(reg.get('rich')?.priority).toBe(true);
    expect(reg.get('surf')?.safeArea).toEqual([8, 12, 80, 40]);
  });

  it('reads the provisional zone-canvas flag', () => {
    const reg = buildRegistry(
      inventory({ _g: { alpha: validRecord } }, { provisional: { zoneCanvas: '320x200', settlesAt: 'B0' } }),
    );

    expect(reg.provisional).toEqual({ zoneCanvas: '320x200', settlesAt: 'B0' });
  });
});

describe('buildRegistry — strictness', () => {
  it('rejects a malformed inventory', () => {
    expect(() => buildRegistry(null)).toThrow(/not an object/);
    expect(() => buildRegistry({})).toThrow(/missing an "assets" object/);
  });

  it('rejects an unknown family', () => {
    const bad = { ...validRecord, family: 'spaceship' };
    expect(() => buildRegistry(inventory({ _g: { alpha: bad } }))).toThrow(/unknown family/);
  });

  it('rejects an unknown art_status', () => {
    const bad = { ...validRecord, art_status: 'probably-fine' };
    expect(() => buildRegistry(inventory({ _g: { alpha: bad } }))).toThrow(/unknown art_status/);
  });

  it('rejects an unknown batch', () => {
    const bad = { ...validRecord, batch: 'B99' };
    expect(() => buildRegistry(inventory({ _g: { alpha: bad } }))).toThrow(/unknown batch/);
  });

  it('rejects a missing or empty alt text', () => {
    const missing: Record<string, unknown> = { ...validRecord };
    delete missing['alt'];
    expect(() => buildRegistry(inventory({ _g: { alpha: missing } }))).toThrow(/missing alt text/);

    const empty = { ...validRecord, alt: '   ' };
    expect(() => buildRegistry(inventory({ _g: { alpha: empty } }))).toThrow(/missing alt text/);
  });

  it('rejects a duplicate slug across groups', () => {
    expect(() =>
      buildRegistry(inventory({ _a: { dupe: validRecord }, _b: { dupe: validRecord } })),
    ).toThrow(/Duplicate asset slug/);
  });
});

describe('resolve()', () => {
  it('resolves to a placeholder when art_status is placeholder', () => {
    const reg = buildRegistry(inventory({ _g: { alpha: validRecord } }));
    const result = reg.resolve('alpha');

    expect(result.kind).toBe('placeholder');
    if (result.kind === 'placeholder') {
      expect(result.label).toBe('A pizza cutter');
      expect(result.record.slug).toBe('alpha');
    }
  });

  it('resolves to art once a path exists and status has advanced', () => {
    const approved = {
      ...validRecord,
      art_status: 'approved',
      path: '/assets/collectible/pizza_cutter.png',
    };
    const reg = buildRegistry(inventory({ _g: { alpha: approved } }));
    const result = reg.resolve('alpha');

    expect(result.kind).toBe('art');
    if (result.kind === 'art') {
      expect(result.path).toBe('/assets/collectible/pizza_cutter.png');
    }
  });

  it('falls back to a placeholder when status advanced but the path is absent', () => {
    const approvedNoPath = { ...validRecord, art_status: 'approved' };
    const reg = buildRegistry(inventory({ _g: { alpha: approvedNoPath } }));

    expect(reg.resolve('alpha').kind).toBe('placeholder');
  });

  it('returns missing for an unknown slug rather than throwing', () => {
    const reg = buildRegistry(inventory({ _g: { alpha: validRecord } }));
    const result = reg.resolve('does_not_exist');

    expect(result.kind).toBe('missing');
    expect(result.slug).toBe('does_not_exist');
  });
});

describe('the committed inventory', () => {
  it('parses without error', () => {
    expect(assetRegistry.size).toBeGreaterThan(0);
  });

  it('matches its own declared totalSlugs', () => {
    // The declared total drifted from the real count once already. This guard
    // makes the two disagree loudly rather than silently.
    expect(assetRegistry.size).toBe(inventoryJson.totalSlugs);
  });

  /**
   * The point of the registry is that a slug always resolves to *something*.
   * `missing` is the only failure — it means a component asks for art nobody
   * ever declared, and it renders as a red box rather than as the shop.
   */
  it('resolves every slug to art or a placeholder, never missing', () => {
    for (const record of assetRegistry.all()) {
      expect(resolveAsset(record.slug).kind, record.slug).not.toBe('missing');
    }
  });

  /**
   * Retired slugs are not placeholders waiting for art — they are decisions
   * that were reversed, and they keep their records forever so archived issues
   * and past seasons still resolve (`ASSET_PIPELINE.md §3`).
   *
   * This began life on the navigation branch as "every live asset is a
   * placeholder — no art exists yet". That sentence was true when it was
   * written and is not true now: the shell, Tony, the rack and the champion
   * banner are on disk. The half worth keeping is the distinction between
   * *retired* and *awaiting art*, so that is what it asserts.
   */
  it('counts a retired slug as neither placeholder nor art', () => {
    const retired = assetRegistry.all().filter((record) => record.artStatus === 'retired');
    expect(retired.length, 'the reversed decisions should still be on record').toBeGreaterThan(0);

    for (const record of retired) {
      expect(assetRegistry.byStatus('placeholder'), record.slug).not.toContain(record);
      expect(assetRegistry.byStatus('generated'), record.slug).not.toContain(record);
    }
  });

  /**
   * An asset claiming to have art must actually have the file. Registering a
   * path before the image lands is the one way the placeholder-first contract
   * can break: the fallback stops rendering and nothing replaces it.
   */
  it('has a real file behind every asset that claims to have art', () => {
    for (const record of assetRegistry.byStatus('generated')) {
      expect(record.path, record.slug).not.toBeNull();
      expect(
        existsSync(path.join(process.cwd(), 'public', record.path ?? '')),
        `${record.slug} declares ${record.path ?? 'null'}, which does not exist`,
      ).toBe(true);
    }
  });

  it('accounts for every slug — placeholder, art, or a reversed decision', () => {
    // This used to read `placeholder === size - generated`, which held only
    // while nothing had ever been retired. The navigation ruling retired the
    // superseded zone tiles rather than deleting them, so there is now a third
    // tier and the arithmetic has to name it.
    const withArt = assetRegistry.byStatus('generated').length;
    const retired = assetRegistry.byStatus('retired').length;

    expect(assetRegistry.byStatus('placeholder')).toHaveLength(
      assetRegistry.size - withArt - retired,
    );
    expect(assetRegistry.byStatus('approved'), 'nothing is approved yet').toHaveLength(0);
  });

  it('uses only known families', () => {
    for (const record of assetRegistry.all()) {
      expect(ASSET_FAMILIES).toContain(record.family);
    }
  });

  it('gives every asset non-empty alt text', () => {
    for (const record of assetRegistry.all()) {
      expect(record.alt.trim().length).toBeGreaterThan(0);
    }
  });

  it('contains the seven B0 test-set slugs that lock ART_SPEC', () => {
    const b0 = assetRegistry.byBatch('B0').map((r) => r.slug);

    // Contains, not equals: the batch has since taken on the counter foreground
    // and the clipboard, both cut or generated alongside the original seven.
    expect(b0).toEqual(
      expect.arrayContaining([
        'character_tony_neutral',
        'avatar_base_body',
        'wear_head_ballcap',
        'avatar_body_starter_01',
        'zone_front_counter',
        'collectible_bapple_tree',
        'surface_poster_blank',
      ]),
    );
  });

  /**
   * The room is **one portrait shell plus transparent overlays**, not six
   * composed landscape tiles (`18_PARLOR_NAVIGATION_MAP.md` v2.0 §8).
   *
   * Both branches asserted a zone manifest and both are now partly wrong. The
   * navigation branch listed `zone_parlor_counter_front` as a live shell — it
   * has since been **withdrawn**, because the shell is one image cut at logical
   * y 292 whose lower half *is* the foreground layer. And it expected
   * `zone_parlor_shell` to be a placeholder, which it stopped being when the
   * art landed.
   *
   * The old six are kept rather than deleted. A retired asset keeps its record
   * so past Slice issues and archived seasons render exactly as published, and
   * deleting an approved slug to tidy a count is the one thing the
   * reconciliation principles forbid outright.
   */
  it('has the shell, and keeps the superseded zone tiles on record', () => {
    /*
     * **Both rooms are painted now.** `zone_back_hall_shell` was pinned as a
     * placeholder here until 2026-08-11, when the approved shell landed and the
     * drawn stand-in in `components/scene/back-hall.tsx` was deleted with it.
     *
     * Pinning it as art rather than deleting the assertion is deliberate, and
     * it is the stronger direction: `/back-hall` has no fallback branch any
     * more, so a registry row losing its `path` would stretch a compact
     * placeholder across a whole room. The sibling test *"has a real file
     * behind every asset that claims to have art"* covers the other half.
     */
    expect(assetRegistry.get('zone_parlor_shell')?.artStatus).toBe('generated');
    expect(assetRegistry.get('zone_back_hall_shell')?.artStatus).toBe('generated');

    // Withdrawn, not deleted — the foreground counter is a render step, not an asset.
    expect(assetRegistry.get('zone_parlor_counter_front')?.artStatus).toBe('retired');

    for (const slug of [
      'zone_tonight_board',
      'zone_chalkboard',
      'zone_newspaper_rack',
      'zone_display_case',
      'zone_trophy_wall',
      'zone_menu_board',
      'zone_wall',
    ]) {
      expect(assetRegistry.get(slug), `${slug} was deleted rather than retired`).toBeDefined();
      expect(assetRegistry.get(slug)?.artStatus, slug).toBe('retired');
    }
  });

  /**
   * `ART_SPEC §2.1` left the zone canvas provisional until the B0 composite ran
   * on a real phone. It has now run, and what settled is the **width**: 320, the
   * one-column measure the layout is built on. Height is whatever the tile
   * contains, because the parlor turned out to be one tall portrait room rather
   * than a set of equal panels.
   *
   * **The shell is the documented exception.** `18 §8` authors it at 960 × 1707
   * — exactly 3× the 320 × 569 logical room — because a shell downsampled from
   * 3× keeps its one-pixel bevels and a shell authored at 1× does not. It is
   * still 320 in logical space; 960 is the *source* measure.
   */
  it('holds one width across every zone tile, and 3× only for the shell', () => {
    // Retired records are history, not live assets. `zone_parlor_counter_front`
    // was authored at 3× before it was withdrawn, and holding a reversed
    // decision to the current rule would force it to be edited or deleted —
    // and deleting it is what the reconciliation principles forbid.
    const zones = assetRegistry
      .byFamily('zone')
      .filter((r) => r.slug.startsWith('zone_') && r.artStatus !== 'retired');
    const wide = zones.filter((r) => r.canvas.split('x')[0] !== '320');

    for (const record of zones) {
      expect(['320', '960'], `${record.slug} is ${record.canvas}`).toContain(
        record.canvas.split('x')[0],
      );
    }

    // Only the shells may take the 3× measure, and 960 must be exactly 3 × 320.
    for (const record of wide) {
      expect(record.slug, 'only a shell may be authored at 3×').toMatch(/shell/);
      expect(record.canvas.split('x')[0]).toBe(String(320 * 3));
    }
  });

  /**
   * The room is drawn once and cut at the counter's near edge, so that Tony can
   * be drawn between the two halves and stand *in* the shop rather than on top
   * of a picture of it. The cut is only invisible if the halves add back up to
   * the whole, so that arithmetic is a test rather than a comment.
   */
  it('cuts the parlor into two halves that stack back into one room', () => {
    const rear = assetRegistry.get('zone_front_counter')?.canvas ?? '';
    const front = assetRegistry.get('zone_counter_front')?.canvas ?? '';

    const [rearWidth, rearHeight] = rear.split('x');
    const [frontWidth, frontHeight] = front.split('x');

    expect(rearWidth).toBe(frontWidth);
    expect(Number(rearHeight) + Number(frontHeight)).toBe(569);
  });
});
