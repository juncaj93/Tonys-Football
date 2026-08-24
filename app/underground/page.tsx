import Link from 'next/link';

import { CasinoFloor } from '@/components/underground/casino-floor';
import { Page } from '@/components/shell';
import { TYPE } from '@/lib/design/type';
import { requireUser } from '@/lib/auth/current-user';
import { openSeason, wallet } from '@/lib/counter/tokens';
import { getDb } from '@/lib/db';

/** The room behind the curtained doorway. Fictional tokens only. */
export const dynamic = 'force-dynamic';

export default async function UndergroundPage() {
  const { user } = await requireUser();
  const db = getDb();
  const season = await openSeason(db);
  const purse = season === null ? null : await wallet(db, { userId: user.id, seasonId: season.id });

  return (
    <Page>
      <main className="mx-auto w-full max-w-[440px] px-4 pt-4 pb-10">
        <CasinoFloor balance={purse?.balance ?? null} />

        <Link
          href="/back-hall"
          className={`pixel-edge mt-5 mb-28 flex min-h-[52px] items-center justify-center border-2 border-ink-500 bg-paper-mid px-4 ${TYPE.action} text-ink-900 active:translate-y-px`}
        >
          Back through the curtain
        </Link>
      </main>
    </Page>
  );
}
