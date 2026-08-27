import { assetRegistry } from '@/lib/assets/registry';

import { type CompositeLayer } from './composite';

/**
 * The concrete raster for one resolved character layer.
 *
 * A layer's registry row owns the variant template; the composite owns the
 * selected paint index. This is deliberately pure so a preview and a room
 * character cannot accidentally choose different artwork for the same config.
 */
export function characterLayerArtPath(layer: CompositeLayer): string | null {
  const resolution = assetRegistry.resolve(layer.slug);
  if (resolution.kind !== 'art') return null;

  const variant = resolution.record.variants;
  if (
    variant !== undefined &&
    layer.paint.kind !== 'item' &&
    variant.paint === layer.paint.kind
  ) {
    return variant.pathTemplate.replace('{index}', String(layer.paint.index));
  }

  return resolution.path;
}
