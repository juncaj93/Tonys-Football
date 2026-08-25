import Link from 'next/link';
import { redirect } from 'next/navigation';

import { SignPlate } from '@/components/scene/panel';
import { DoorLedgerBackdrop, DoorLedgerHeader } from '@/components/scene/door-ledger';
import { Page, TAP_TARGET } from '@/components/shell';
import { TYPE } from '@/lib/design/type';
import { viewer } from '@/lib/auth/current-user';
import { listDoorManagers } from '@/lib/auth/service';
import { getDb } from '@/lib/db';

/**
 * The door.
 *
 * `16 §11`: "pick your name from ten, enter PIN. Two taps."
 *
 * This is the first thing anybody ever sees, so it is the first place the shop
 * has to exist: the window with the gold leaf reading backwards, the CLOSED
 * card still swinging, and the names on the key hooks behind the counter.
 *
 * Listing the names is deliberate. In a private ten-person league the roster is
 * common knowledge — it is on Sleeper — so hiding it would buy nothing and cost
 * the two-tap login the plan asks for. Guessing is stopped by the rate limiter,
 * not by secrecy about who plays.
 */

export const dynamic = 'force-dynamic';

export default async function DoorPage() {
  if ((await viewer()) !== null) redirect('/');

  /*
   * The league, and only the league.
   *
   * `listDoorManagers` is derived from `lib/league/membership.ts` now, so there
   * is nothing to filter here — and deliberately no second group. A "still on
   * the wall" section shipped for a few hours this morning and the commissioner
   * ruled it out absolutely: a retired manager does not appear labelled,
   * disabled, or explained. There is no alumni page and this is not one.
   */
  const managers = await listDoorManagers(getDb());

  return (
    <>
      <DoorLedgerBackdrop />

      <Page>
        <DoorLedgerHeader label="KEY RING" />

        <main className="door-ledger-page mx-auto w-full max-w-md flex-1 px-5 pt-7">
          <SignPlate tone="red">Keys</SignPlate>
          <h1 className={`mt-4 ${TYPE.headlineQuiet} text-paper-white`}>
            Who&rsquo;s asking?
          </h1>
          <p className={`mt-2 ${TYPE.bodyLead} text-ink-100`}>
            Ten hooks behind the counter. Take yours down, set six digits, and the door stays
            open for you.
          </p>

          {managers.length === 0 ? (
            <p className={`mt-8 border border-wood-dark bg-ink-700 px-4 py-5 ${TYPE.body} text-ink-100`}>
              No keys on the board yet. The league still needs to be imported.
            </p>
          ) : (
            // The key rail: a strip of wood with hooks, and a tag on each.
            <div className="relative mt-7">
              <div
                aria-hidden="true"
                className="surface-wood absolute inset-x-0 top-0 h-2 rounded-[2px] shadow-[0_2px_5px_rgba(0,0,0,0.6)]"
              />
              <ul className="space-y-2 pt-4">
                {managers.map((manager) => (
                  <li key={manager.id}>
                    <Link
                      href={`/door/${manager.id}`}
                      className={`flex ${TAP_TARGET} min-h-[3.5rem] items-center justify-between gap-3 pixel-edge border-2 border-wood-dark bg-paper-mid px-4 text-ink-900 active:translate-y-px active:bg-paper-dark`}
                    >
                      <span className="flex min-w-0 items-center gap-2.5">
                        {/* The hook the tag hangs on. */}
                        <span
                          aria-hidden="true"
                          className="h-2.5 w-2.5 shrink-0 rounded-full border border-ink-500/60 bg-ink-100/40"
                        />
                        <span className={`truncate ${TYPE.bodyLead}`}>
                          {manager.displayName}
                        </span>
                      </span>
                      <span className={`shrink-0 ${TYPE.eyebrow} text-ink-500`}>
                        {manager.claimed ? 'taken' : 'on the hook'}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className={`mt-8 pb-6 ${TYPE.body} text-ink-300`}>
            Lost your PIN? The commissioner can put your key back on the hook, and you set a new
            one from this same screen.
          </p>
        </main>
      </Page>
    </>
  );
}
