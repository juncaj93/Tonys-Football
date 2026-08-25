import { CasinoFloor } from '@/components/underground/casino-floor';
import { Page } from '@/components/shell';
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
      <main className="mx-auto w-full max-w-[440px] px-4 pt-4 pb-[calc(env(safe-area-inset-bottom)+5.5rem)]">
        <CasinoFloor balance={purse?.balance ?? null} />
      </main>
    </Page>
  );
}
