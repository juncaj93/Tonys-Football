
import { resetPinAction } from '@/app/actions/auth';
import { PanelHeading, PixelPanel, ReturnPlate, SignPlate } from '@/components/scene/panel';
import { RoomBehind } from '@/components/scene/room-behind';
import { Page, TAP_TARGET } from '@/components/shell';
import { requireAdmin } from '@/lib/auth/current-user';
import { listDoorManagers } from '@/lib/auth/service';
import { getDb } from '@/lib/db';

/**
 * The office out the back, with the key board on the wall.
 *
 * V1 gives it exactly one power: **reset a forgotten PIN** (`09 §8.3`). Not a
 * dashboard, not a settings screen — the admin surface grows with the systems
 * that need administering, and there is only one of those so far.
 *
 * The reset clears the hash rather than setting a new one, so the commissioner
 * can never see or choose somebody's PIN. Every session for that manager is
 * revoked, and the action is written to `admin_audit_logs` in the same
 * transaction, so it cannot happen unrecorded.
 *
 * `requireAdmin()` answers with `notFound()` rather than a 403: a player
 * probing this URL learns nothing about whether it exists.
 */

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const { user } = await requireAdmin();
  const managers = await listDoorManagers(getDb());

  return (
    <>
      <RoomBehind />

      <Page>
        <main className="mx-auto w-full max-w-md flex-1 px-4 pt-3 pb-8">
          <PixelPanel tone="paper" className="px-4 pt-4 pb-5">
            <SignPlate tone="red">Staff only</SignPlate>
            <div className="mt-3">
              <PanelHeading>The office</PanelHeading>
            </div>

            <div className="mt-4 border-t-2 border-dashed border-ink-300 pt-3">
              <div className="mb-2 flex items-baseline justify-between gap-3">
                <span className="font-display text-[12px] text-ink-900 uppercase">
                  Key board
                </span>
                <span className="font-display text-[11px] text-ink-500">
                  {managers.length} managers
                </span>
              </div>
                <ul className="divide-y divide-ink-300/60">
                  {managers.map((manager) => (
                    <li key={manager.id} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-[19px] text-ink-900">
                          {manager.displayName}
                        </p>
                        <p className="text-[17px] text-ink-500">
                          {manager.claimed ? 'key taken' : 'still on the hook'}
                        </p>
                      </div>

                      {manager.claimed && manager.id !== user.id && (
                        <form action={resetPinAction} className="shrink-0">
                          <input type="hidden" name="userId" value={manager.id} />
                          <button
                            type="submit"
                            className={`pixel-edge ${TAP_TARGET} border-2 border-red-dark bg-red-dark/15 px-3 font-display text-[11px] text-red-dark uppercase active:translate-y-px`}
                          >
                            Clear PIN
                          </button>
                        </form>
                      )}
                    </li>
                  ))}
                </ul>

              <p className="mt-4 border-t-2 border-dashed border-ink-300 pt-3 text-[17px] leading-[1.5] text-ink-500">
                  Clearing a PIN signs that manager out everywhere and puts their key back on the
                  hook, ready for a new one. You cannot see anyone&rsquo;s PIN, including your
                  own — and you cannot clear your own from here, because it would sign you out
                  mid-action.
              </p>
            </div>
          </PixelPanel>

          <div className="mt-6">
            <ReturnPlate />
          </div>
        </main>
      </Page>

    </>
  );
}
