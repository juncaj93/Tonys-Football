import { notFound } from 'next/navigation';

import { LootBoxReveal } from '@/components/counter/loot-box-reveal';
import { Page } from '@/components/shell';
import { resolveAsset } from '@/lib/assets/registry';
import { previewReveal } from '@/lib/demo/preview';

/** Review-only route: a real reveal composition without consuming a real box. */
export default async function PreviewBoxOpeningPage({
  searchParams,
}: {
  searchParams: Promise<{ preview_reveal?: string; preview_stage?: string }>;
}) {
  const query = await searchParams;
  const preview = previewReveal(query.preview_reveal, process.env, query.preview_stage);
  if (preview === null) notFound();

  return (
    <Page>
      <LootBoxReveal boxId={null} boxAsset={resolveAsset('object_box_reveal')} preview={preview} />
    </Page>
  );
}
