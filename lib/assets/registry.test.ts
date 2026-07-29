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

  it('leaves everything without art on the placeholder tier', () => {
    const withArt = assetRegistry.byStatus('generated').length;
    expect(assetRegistry.byStatus('placeholder')).toHaveLength(assetRegistry.size - withArt);
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

  it('contains the six shop zones', () => {
    const zones = assetRegistry.byFamily('zone').filter((r) => r.slug.startsWith('zone_'));

    expect(zones.map((r) => r.slug)).toEqual(
      expect.arrayContaining([
        'zone_front_counter',
        'zone_tonight_board',
        'zone_menu_board',
        'zone_newspaper_rack',
        'zone_display_case',
        'zone_wall',
      ]),
    );
  });

  /**
   * `ART_SPEC §2.1` left the zone canvas provisional until the B0 composite ran
   * on a real phone. It has now run. What settled is the **width**: every zone
   * tile is 320, which is the one-column measure the layout is built on. Height
   * is whatever the tile contains, because the parlor turned out to be one tall
   * portrait room rather than a set of equal panels.
   */
  it('holds one width across every zone tile', () => {
    const zones = assetRegistry.byFamily('zone').filter((r) => r.slug.startsWith('zone_'));
    const widths = new Set(zones.map((r) => r.canvas.split('x')[0]));

    expect([...widths]).toEqual(['320']);
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
