import Link from 'next/link';
import { redirect } from 'next/navigation';

import { Page, TAP_TARGET } from '@/components/shell';
import { viewer } from '@/lib/auth/current-user';
import { listDoorManagers } from '@/lib/auth/service';
import { getDb } from '@/lib/db';

/**
 * The door: pick your name.
 *
 * `16 §11`: "New device: **pick your name from ten, enter PIN.** Two taps. The
 * Sleeper ID is never requested again after setup."
 *
 * The names are on the door on purpose. In a private ten-person league the
 * roster is common knowledge — it is on Sleeper — so hiding it would buy
 * nothing and cost the two-tap login the plan asks for. Guessing is stopped by
 * the rate limiter, not by secrecy about who plays.
 */

export const dynamic = 'force-dynamic';

export default async function DoorPage() {
  if ((await viewer()) !== null) redirect('/');

  const managers = await listDoorManagers(getDb());

  return (
    <Page withNav={false}>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 pt-10">
        <p className="font-mono text-[11px] tracking-[0.22em] text-amber-mid uppercase">
          Tony&rsquo;s Pizza
        </p>
        <h1 className="mt-2 text-3xl leading-tight font-bold text-paper-white">
          Who&rsquo;s asking?
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-100">
          Pick your name. Six digits and you&rsquo;re in.
        </p>

        {managers.length === 0 ? (
          <p className="mt-8 border border-wood-dark bg-ink-700 px-4 py-5 text-sm text-ink-100">
            Nobody is on the board yet. The league still needs to be imported.
          </p>
        ) : (
          <ul className="mt-7 space-y-2">
            {managers.map((manager) => (
              <li key={manager.id}>
                <Link
                  href={`/door/${manager.id}`}
                  className={`flex ${TAP_TARGET} min-h-[3.5rem] items-center justify-between gap-3 rounded-sm border border-wood-dark bg-paper-mid px-4 text-ink-900 transition-colors active:bg-paper-dark`}
                >
                  <span className="truncate text-[17px] font-semibold">
                    {manager.displayName}
                  </span>
                  <span className="shrink-0 font-mono text-[11px] tracking-wide text-ink-500">
                    {manager.claimed ? 'has a key' : 'new key'}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        <p className="mt-8 pb-6 text-[13px] leading-relaxed text-ink-300">
          Forgotten your PIN? The commissioner can clear it, and you set a new one from this
          same screen.
        </p>
      </main>
    </Page>
  );
}
