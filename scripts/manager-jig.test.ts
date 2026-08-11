import { readFileSync } from 'node:fs';
import path from 'node:path';

import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import {
  ARM,
  AXIS,
  CANVAS,
  FACE,
  HEAD,
  NECK,
  SHOE,
  TORSO,
} from '../lib/character/art/geometry';
import { BUILD_REGISTRATION, paintedKeys } from '../lib/character/mask';

/**
 * The jig is committed art-direction material, and this is what stops it going stale.
 *
 * A registration jig that disagrees with the geometry it was generated from is
 * **worse than no jig**: the art comes back drawn to the wrong shoulder and looks
 * almost right, which is the expensive kind of wrong because nothing fails. So
 * the committed files are re-read here and checked against the production
 * constants — change `geometry.ts` without running `npm run art:jig` and this
 * goes red with the command in the failure.
 */

const JIGS = path.join(process.cwd(), 'art', 'jigs');

interface JigFile {
  readonly canvas: { readonly width: number; readonly height: number };
  readonly axis: number;
  readonly registration: typeof BUILD_REGISTRATION;
  readonly landmarks: readonly {
    readonly key: string;
    readonly kind: 'binding' | 'advisory';
    readonly row?: number;
    readonly column?: number;
    readonly box?: readonly [number, number, number, number];
  }[];
  readonly palette: readonly { readonly index: number; readonly hex: string }[];
}

const jig = JSON.parse(
  readFileSync(path.join(JIGS, 'manager_registration_jig.json'), 'utf8'),
) as JigFile;

const landmark = (key: string) => jig.landmarks.find((mark) => mark.key === key);

describe('the committed jig agrees with the production coordinate system', () => {
  it('is the sprite canvas', () => {
    expect(jig.canvas).toEqual({ width: CANVAS.width, height: CANVAS.height });
    expect(jig.axis).toBe(AXIS);
  });

  it('carries the registration the validator enforces', () => {
    expect(jig.registration).toEqual(BUILD_REGISTRATION);
  });

  it.each([
    ['head_clear', HEAD.bottom],
    ['eye_line', FACE.eyeY],
    ['neck_closed', NECK.bottom - 1],
    ['shoulders', TORSO.top],
    ['wrist', ARM.bottom],
    ['ankle', SHOE.top],
    ['contact', CANVAS.height - 1],
  ])('puts %s on row %i', (key, row) => {
    expect(landmark(key)?.row).toBe(row);
  });

  it('draws the neck where the neck is', () => {
    expect(landmark('neck')?.box).toEqual([NECK.left, NECK.top, NECK.width, NECK.bottom - NECK.top]);
  });

  it('keeps the pose free', () => {
    /*
     * The advisory half is the redesign. If the arms, hands, legs or stance ever
     * become binding, the painted builds go back to being one mannequin in six
     * shirts — which is the construction commissioner ruling R2 exists to escape.
     */
    for (const key of ['wrist', 'hands', 'knees', 'ankle', 'shoulders', 'torso', 'axis']) {
      expect(landmark(key)?.kind, `${key} must stay advisory`).toBe('advisory');
    }
  });

  it('binds only what another layer actually depends on', () => {
    const binding = jig.landmarks.filter((mark) => mark.kind === 'binding').map((mark) => mark.key);
    expect([...binding].sort()).toEqual(
      ['canvas', 'contact', 'eye_line', 'head_clear', 'neck', 'neck_closed', 'skull'].sort(),
    );
  });

  it('publishes the same fourteen colours the decoder reads', () => {
    expect(jig.palette.map((key) => key.hex)).toEqual(paintedKeys().map((key) => key.hex));
  });
});

describe('the plates', () => {
  it('emits the machine plate at exactly the sprite canvas', async () => {
    const meta = await sharp(path.join(JIGS, 'manager_registration_jig.png')).metadata();
    expect(meta.width).toBe(CANVAS.width);
    expect(meta.height).toBe(CANVAS.height);
  });

  it('emits a readable plate with room for its labels', async () => {
    const meta = await sharp(path.join(JIGS, 'manager_registration_jig@6x.png')).metadata();
    expect(meta.width).toBeGreaterThan(CANVAS.width * 6);
    expect(meta.height).toBeGreaterThan(CANVAS.height * 6);
  });

  it('emits a paint-over plate at a whole multiple of the canvas', async () => {
    /*
     * Two plates rather than one, and this test is the reason there are two. The
     * annotated plate carries a gutter of labels; a file painted over *it* comes
     * back at a size the conversion step refuses — after the painting is done.
     */
    const meta = await sharp(path.join(JIGS, 'manager_paintover_672x1008.png')).metadata();
    expect(meta.width! % CANVAS.width).toBe(0);
    expect(meta.height! % CANVAS.height).toBe(0);
    expect(meta.width! / CANVAS.width).toBe(meta.height! / CANVAS.height);
    expect(meta.width! / CANVAS.width).toBe(6);
  });
});
