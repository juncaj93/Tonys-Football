import Link from 'next/link';

import { signOutAction, signOutEverywhereAction } from '@/app/actions/auth';
import { Clipboard, EnamelSign } from '@/components/scene/fixtures';
import { ParlorAir, Wall } from '@/components/scene/backdrop';
import { BackToTheCounter, Page, TAP_TARGET } from '@/components/shell';
import { requireUser } from '@/lib/auth/current-user';
import { listDevices } from '@/lib/auth/service';
import { getDb } from '@/lib/db';

/**
 * Your key ring, on the clipboard by the office door.
 *
 * `16 §11` asks for a device list and a "sign out everywhere". Both exist
 * because a session that cannot be ended is not really a session — a phone left
 * in a taxi should be revocable from another one.
 *
 * There is no PIN-change flow yet. It needs its own session-revocation path and
 * belongs with the auth work it would extend; adding it here would be absorbing
 * scope rather than proposing it.
 */

export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const { user, session } = await requireUser();
  const devices = await listDevices(getDb(), user.id, session.id);

  return (
    <>
      <ParlorAir />

      <Page>
        <Wall className="px-4 pt-6 pb-8" wainscot={false}>
          <div className="relative z-10">
            <div className="mb-3">
              <BackToTheCounter />
            </div>

            <Link
              href="/"
              className={`inline-flex ${TAP_TARGET} items-center text-sm text-ink-100 underline underline-offset-4`}
            >
              ← Back to the counter
            </Link>

            <div className="mt-4 flex items-center gap-2">
              <EnamelSign tone="cream">Your keys</EnamelSign>
              {user.isAdmin && <EnamelSign tone="red">Commissioner</EnamelSign>}
            </div>

            <h1 className="mt-3 text-2xl leading-tight font-bold text-paper-white">
              {user.displayName}
            </h1>

            <div className="mt-6">
              <Clipboard title="Cut for" aside={`${String(devices.length)} device${devices.length === 1 ? '' : 's'}`}>
                <ul className="space-y-2">
                  {devices.map((device) => (
                    <li
                      key={device.id}
                      className="flex items-baseline justify-between gap-3 text-[15px]"
                    >
                      <span className="text-ink-900">{device.label}</span>
                      <span className="shrink-0 font-mono text-[11px] text-ink-500">
                        {device.current ? 'this one' : formatLastSeen(device.lastSeenAt)}
                      </span>
                    </li>
                  ))}
                </ul>

                <p className="mt-4 border-t border-dashed border-ink-300 pt-3 text-[13px] leading-relaxed text-ink-500">
                  Tony leaves the door unlocked for 90 days from your last visit. Come by weekly
                  and he will never ask again.
                </p>
              </Clipboard>
            </div>

            <div className="mt-6 space-y-3">
              {user.isAdmin && (
                <Link
                  href="/admin"
                  className={`flex ${TAP_TARGET} min-h-[3.25rem] items-center justify-center rounded-[3px] border border-wood-dark bg-paper-mid px-5 font-semibold text-ink-900 shadow-[0_2px_6px_rgba(0,0,0,0.5)] active:translate-y-px active:bg-paper-dark`}
                >
                  Commissioner&rsquo;s office
                </Link>
              )}

              <form action={signOutAction}>
                <button
                  type="submit"
                  className={`flex w-full ${TAP_TARGET} min-h-[3.25rem] items-center justify-center rounded-[3px] border border-wood-mid bg-ink-900/70 px-5 font-semibold text-paper-mid active:translate-y-px active:bg-wood-dark/40`}
                >
                  Hang the key back up
                </button>
              </form>

              {devices.length > 1 && (
                <form action={signOutEverywhereAction}>
                  <button
                    type="submit"
                    className={`flex w-full ${TAP_TARGET} min-h-[3.25rem] items-center justify-center rounded-[3px] border border-red-dark bg-red-dark/15 px-5 font-semibold text-red-light active:translate-y-px active:bg-red-dark/30`}
                  >
                    Change the locks everywhere
                  </button>
                </form>
              )}
            </div>
          </div>
        </Wall>
      </Page>

    </>
  );
}

/** Deliberately coarse. "Which device is this" needs no timestamp. */
function formatLastSeen(at: Date): string {
  return at.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
