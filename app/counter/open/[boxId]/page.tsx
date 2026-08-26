import { notFound } from 'next/navigation';

import { LootBoxReveal } from '@/components/counter/loot-box-reveal';
import { Page } from '@/components/shell';
import { requireUser } from '@/lib/auth/current-user';
import { resolveAsset } from '@/lib/assets/registry';
import { boxBelongsToUser } from '@/lib/counter/boxes';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function BoxOpeningPage({ params }: { params: Promise<{ boxId: string }> }) {
  const { boxId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(boxId)) notFound();

  const { user } = await requireUser();
  if (!(await boxBelongsToUser(getDb(), user.id, boxId))) notFound();

  return (
    <Page>
      <LootBoxReveal boxId={boxId} boxAsset={resolveAsset('object_box_reveal')} />
    </Page>
  );
}
