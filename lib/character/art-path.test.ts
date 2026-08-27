import { describe, expect, it } from 'vitest';

import { characterLayerArtPath } from './art-path';
import { composeCharacter } from './composite';

describe('characterLayerArtPath', () => {
  it('selects the matching anchored raster for every painted starter layer', () => {
    const composite = composeCharacter({
      skin: 3,
      hair: 4,
      hairColour: 6,
      facialHair: 2,
      top: 5,
      topColour: 7,
    });

    const paths = new Map(
      composite.layers.map((layer) => [layer.slug, characterLayerArtPath(layer)]),
    );

    expect(paths.get('avatar_body_base')).toBe('/assets/avatar/manager-v2/base/3.png');
    expect(paths.get('avatar_hair_05')).toBe('/assets/avatar/manager-v2/hair/05/6.png');
    expect(paths.get('avatar_face_hair_02')).toBe('/assets/avatar/manager-v2/face/02/6.png');
    expect(paths.get('avatar_body_starter_07')).toBe('/assets/avatar/manager-v2/top/07/7.png');
  });
});
