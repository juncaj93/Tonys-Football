import Link from 'next/link';

import { signOutAction, signOutEverywhereAction } from '@/app/actions/auth';
import { CharacterView } from '@/components/character/character-view';
import { PanelHeading, PixelPanel, ReturnPlate, SignPlate } from '@/components/scene/panel';
import { RoomBehind } from '@/components/scene/room-behind';
import { Page } from '@/components/shell';
import { requireUser } from '@/lib/auth/current-user';
import { listDevices } from '@/lib/auth/service';
import { characterFor } from '@/lib/character/service';
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

/** Every control on this page is the same slab of painted board. */
const ACTION =
  'pixel-edge flex w-full min-h-[52px] items-center justify-center border-2 px-4 text-center font-display text-[12px] uppercase active:translate-y-px';

export default async function ProfilePage() {
  const { user, session } = await requireUser();
  const db = getDb();
  const [devices, character] = await Promise.all([
    listDevices(db, user.id, session.id),
    characterFor(db, user.id),
  ]);

  return (
    <>
      <RoomBehind />

      <Page>
        <main className="mx-auto w-full max-w-md flex-1 px-4 pt-3 pb-8">
          <PixelPanel tone="paper" className="px-4 pt-4 pb-5">
            <div className="flex flex-wrap items-center gap-2">
              <SignPlate tone="cream">Your keys</SignPlate>
              {user.isAdmin && <SignPlate tone="red">Commissioner</SignPlate>}
            </div>

            {/*
              * Your name beside the person it belongs to.
              *
              * The character is drawn small here rather than large: this page is
              * the key ring, and the character's own page is one tap away. A hero
              * portrait on a page about revoking sessions would be the tail
              * wagging the dog — but a name with nobody attached to it was the
              * thing that made `/profile` read as an account settings screen
              * rather than as somewhere in a pizza parlor.
              */}
            <Link
              href="/profile/character"
              className="mt-3 flex items-center gap-3 outline-none active:translate-y-px"
            >
              <CharacterView composite={character.composite} scale="row" label={user.displayName} />
              <span className="min-w-0 flex-1">
                <PanelHeading>{user.displayName}</PanelHeading>
                <span className="mt-1 block text-[16px] leading-[1.4] text-ink-700">
                  Change how you look
                </span>
              </span>
            </Link>

            {/*
              * The device list, ruled like a docket rather than mounted on the
              * drawn clipboard. `surface_clipboard_blank` is authored at 96×144
              * and was being shown at roughly three times that, which turns a
              * crisp asset into mush — art below its display size is worse than
              * no art. The request for a properly sized board is in the report.
              */}
            <div className="mt-4 border-t-2 border-dashed border-ink-300 pt-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-display text-[12px] text-ink-900 uppercase">
                  Cut for
                </span>
                <span className="font-display text-[11px] text-ink-500">
                  {devices.length} device{devices.length === 1 ? '' : 's'}
                </span>
              </div>

              <ul className="mt-2.5 space-y-2">
                {devices.map((device) => (
                  <li
                    key={device.id}
                    className="flex items-baseline justify-between gap-3 text-[19px]"
                  >
                    <span className="text-ink-900">{device.label}</span>
                    <span className="shrink-0 text-[17px] text-ink-500">
                      {device.current ? 'this one' : formatLastSeen(device.lastSeenAt)}
                    </span>
                  </li>
                ))}
              </ul>

              <p className="mt-4 border-t-2 border-dashed border-ink-300 pt-3 text-[17px] leading-[1.5] text-ink-500">
                Tony leaves the door unlocked for 90 days from your last visit. Come by weekly and
                he will never ask again.
              </p>
            </div>
          </PixelPanel>

          <div className="mt-5 space-y-3">
            {user.isAdmin && (
              <Link
                href="/admin"
                className={`${ACTION} border-wood-dark bg-paper-mid text-ink-900`}
              >
                Commissioner&rsquo;s office
              </Link>
            )}

            <form action={signOutAction}>
              <button type="submit" className={`${ACTION} border-wood-dark bg-[#1c1113] text-paper-mid`}>
                Hang the key back up
              </button>
            </form>

            {devices.length > 1 && (
              <form action={signOutEverywhereAction}>
                <button
                  type="submit"
                  className={`${ACTION} border-red-mid bg-red-dark text-paper-white`}
                >
                  Change the locks everywhere
                </button>
              </form>
            )}
          </div>

          <div className="mt-6">
            <ReturnPlate />
          </div>
        </main>
      </Page>
    </>
  );
}

/** Deliberately coarse. "Which device is this" needs no timestamp. */
function formatLastSeen(at: Date): string {
  return at.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
