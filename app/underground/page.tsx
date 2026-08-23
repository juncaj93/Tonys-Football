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
        <div className="pixel-edge border-2 border-red-mid bg-ink-900 px-4 pt-5 pb-4 text-paper-mid">
          <p className={TYPE.eyebrow}>Behind the curtain</p>
          <h1 className={`mt-1 ${TYPE.boardHero} text-amber-glow`}>The Underground</h1>
          <p className={`mt-3 ${TYPE.body} text-paper-mid/85`}>
            Nothing but fictional Tony Tokens. No cash, no credit, no miracles.
          </p>
          <CasinoFloor balance={purse?.balance ?? null} />
        </div>

        <Link
          href="/back-hall"
          className={`pixel-edge mt-5 flex min-h-[52px] items-center justify-center border-2 border-ink-500 bg-paper-mid px-4 ${TYPE.action} text-ink-900 active:translate-y-px`}
        >
          Back through the curtain
        </Link>
      </main>
    </Page>
  );
}
