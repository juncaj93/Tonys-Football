import Link from 'next/link';

import { signOutAction, signOutEverywhereAction } from '@/app/actions/auth';
import { BottomNav, Page, TAP_TARGET, Zone } from '@/components/shell';
import { requireUser } from '@/lib/auth/current-user';
import { listDevices } from '@/lib/auth/service';
import { getDb } from '@/lib/db';

/**
 * Your key ring.
 *
 * `16 §11` asks for a device list in the profile and a "sign out everywhere".
 * Both exist because a session that cannot be ended is not really a session —
 * a phone left in a taxi should be revocable from another one.
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
      <Page>
        <header className="px-4 pt-5 pb-3">
          <Link
            href="/"
            className={`inline-flex ${TAP_TARGET} items-center text-sm text-ink-100 underline underline-offset-4`}
          >
            ← Back to the parlor
          </Link>
          <h1 className="mt-3 text-2xl leading-tight font-bold text-paper-white">
            {user.displayName}
          </h1>
          {user.isAdmin && (
            <p className="mt-1 font-mono text-[11px] tracking-[0.2em] text-amber-mid uppercase">
              Commissioner
            </p>
          )}
        </header>

        <div className="grid gap-4 px-4">
          <Zone title="Signed in on" tone="dark" aside={`${String(devices.length)}`}>
            <ul className="space-y-2">
              {devices.map((device) => (
                <li
                  key={device.id}
                  className="flex items-baseline justify-between gap-3 text-[15px]"
                >
                  <span className="text-paper-mid">{device.label}</span>
                  <span className="shrink-0 font-mono text-[11px] text-ink-300">
                    {device.current ? 'this one' : formatLastSeen(device.lastSeenAt)}
                  </span>
                </li>
              ))}
            </ul>

            <p className="mt-4 text-[13px] leading-relaxed text-ink-300">
              Tony keeps the door unlocked for 90 days from your last visit. Come by weekly and
              you will never be asked again.
            </p>
          </Zone>

          {user.isAdmin && (
            <Link
              href="/admin"
              className={`flex ${TAP_TARGET} min-h-[3.25rem] items-center justify-center rounded-sm border border-wood-dark bg-paper-mid px-5 font-semibold text-ink-900 active:bg-paper-dark`}
            >
              Commissioner&rsquo;s office
            </Link>
          )}

          <form action={signOutAction}>
            <button
              type="submit"
              className={`flex w-full ${TAP_TARGET} min-h-[3.25rem] items-center justify-center rounded-sm border border-wood-mid px-5 font-semibold text-paper-mid active:bg-ink-700`}
            >
              Sign out
            </button>
          </form>

          {devices.length > 1 && (
            <form action={signOutEverywhereAction}>
              <button
                type="submit"
                className={`flex w-full ${TAP_TARGET} min-h-[3.25rem] items-center justify-center rounded-sm border border-red-dark px-5 font-semibold text-red-light active:bg-red-dark/20`}
              >
                Sign out everywhere
              </button>
            </form>
          )}
        </div>
      </Page>

      <BottomNav current="/" />
    </>
  );
}

/** Deliberately coarse. "Which device is this" needs no timestamp. */
function formatLastSeen(at: Date): string {
  return at.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
