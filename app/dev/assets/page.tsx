import type { Metadata } from 'next';

import { assetRegistry } from '@/lib/assets/registry';

import { AssetExplorer } from './explorer';

export const metadata: Metadata = {
  title: "Asset inventory · Tony's Pizza Fantasy",
  robots: { index: false, follow: false },
};

/**
 * Developer view of the asset registry.
 *
 * Proves the placeholder-first architecture before any artwork exists: every
 * slug resolves, every screen renders, and swapping in final art will be a
 * registry change rather than a code change.
 *
 * This grows into the `/admin/assets` screen described in
 * `art/ASSET_PIPELINE.md §2`.
 *
 * The registry is read on the server so the inventory JSON never ships to the
 * client; only the flattened records cross the boundary.
 */
export default function DevAssetsPage() {
  return <AssetExplorer records={assetRegistry.all()} />;
}
