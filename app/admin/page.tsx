import Link from 'next/link';

import { resetPinAction } from '@/app/actions/auth';
import { ReviewQueue } from '@/components/admin/review-queue';
import { PanelHeading, PixelPanel, SignPlate } from '@/components/scene/panel';
import { RoomBehind } from '@/components/scene/room-behind';
import { Page, TAP_TARGET } from '@/components/shell';
import { TYPE } from '@/lib/design/type';
import { requireAdmin } from '@/lib/auth/current-user';
import { listDoorManagers } from '@/lib/auth/service';
import { getDb } from '@/lib/db';
import { applyQueuePreview, queuePreview } from '@/lib/publication/preview';
import { commissionerQueue, countPending } from '@/lib/publication/queue';

/**
 * The office out the back, with the key board on the wall.
 *
 * ## What changed, and why it is not the dashboard this file used to forbid
 *
 * The note that stood here said the office had exactly one power — reset a
 * forgotten PIN (`09 §8.3`) — and that folding the press desk into it would make
 * it a dashboard. That was right about the press desk and wrong about the
 * **queue**, and the difference is the whole point:
 *
 * - A *dashboard* shows the state of everything, so nothing on it is a task.
 * - This shows **what is waiting on a decision by the commissioner, and nothing
 *   else**. It is a to-do list with, most weeks, nothing on it.
 *
 * `16 §9` makes commissioner approval mandatory before editorial content reaches
 * the league, and a gate whose door is behind another door gets routed around.
 * So the first thing on the first admin screen answers the only question Alex
 * opens it with — *is there anything for me* — and the press desk stays its own
 * screen for everything that is not that: drafting by hand, the manual hold, the
 * full rack, the refused drafts.
 *
 * The key board keeps its place below, because it is not a task either. It is a
 * power you reach for when somebody texts you.
 *
 * ## A mistaken name at launch
 *
 * "Release name" was technically capable of fixing the most likely launch mistake
 * — somebody claims a league-mate's name on the door — but it described the
 * database implementation instead of the commissioner decision. The real
 * action is **Release name**: revoke the mistaken claimant's sessions and put
 * that name back on the door for its actual manager. It never exposes or chooses
 * a PIN, and the release is written to `admin_audit_logs` in the same
 * transaction.
 *
 * The **mechanism** for that is the key board's, and it now records which
 * decision it was: `resetPin` takes a reason, and the correction writes
 * `identity_release` where the key board writes `pin_reset`. The correction
 * itself lives one screen down, at `/admin/corrections`, because reading what a
 * correction touches has to come before pressing it.
 *
 * `requireAdmin()` answers with `notFound()` rather than a 403: a player
 * probing this URL learns nothing about whether it exists.
 */

export const dynamic = 'force-dynamic';

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { user } = await requireAdmin();
  const db = getDb();
  const query = await searchParams;

  const [managers, full] = await Promise.all([listDoorManagers(db), commissionerQueue(db)]);

  /*
   * `?queue=<band>` — the review-only narrowing, resolved on the **server**
   * behind the demo guard and writing nothing. It filters the real queue and
   * fabricates nothing; `lib/publication/preview.ts` says why the queue needs
   * one when nothing else on this screen does.
   */
  const bands = queuePreview(query['queue'], process.env);
  const outstanding = applyQueuePreview(full.outstanding, bands);
  const queue = {
    outstanding,
    published: applyQueuePreview(full.published, bands),
    /*
     * Counted from what is shown, by the queue's own rule. A filtered list whose
     * count disagreed with it would be a screenshot that contradicts itself.
     */
    pending: bands === null ? full.pending : countPending(outstanding),
  };

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

            {/*
              * The queue, first and above the fold.
              *
              * Not behind the press-desk door. `16 §9`'s approval is the one
              * thing in this product that a person has to do on a schedule, and
              * the press desk's own history is the evidence for putting it here:
              * three desk states photographed byte-identically because what told
              * them apart started below the first screen.
              */}
            <div className="mt-4 border-t-2 border-dashed border-ink-300 pt-3">
              <ReviewQueue
                outstanding={queue.outstanding}
                published={queue.published}
                pending={queue.pending}
              />
            </div>

            {/*
              * The press desk — everything about the Slice that is not a
              * decision waiting to be made: drafting a week by hand, the manual
              * hold, the full rack, the drafts that were refused.
              */}
            <div className="mt-5 border-t-2 border-dashed border-ink-300 pt-3">
              <Link
                href="/admin/slice"
                className={`pixel-edge flex ${TAP_TARGET} w-full flex-col justify-center border-2 border-wood-dark bg-[#1c1113] px-3 py-2.5 active:translate-y-px`}
              >
                <span className={`${TYPE.stamp} text-paper-mid`}>
                  The press desk
                </span>
                <span className={`mt-1 ${TYPE.bodyCompact} text-paper-mid/70`}>
                  Draft a week, stop the press, read the rack
                </span>
              </Link>
            </div>

            <div className="mt-4 border-t-2 border-dashed border-ink-300 pt-3">
              <div className="mb-2 flex items-baseline justify-between gap-3">
                <span className={`${TYPE.eyebrow} text-ink-900`}>
                  Key board
                </span>
                <span className={`${TYPE.metadata} text-ink-500`}>
                  {managers.length} managers
                </span>
              </div>
                <ul className="divide-y divide-ink-300/60">
                  {managers.map((manager) => (
                    <li key={manager.id} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <p className={`truncate ${TYPE.bodyLead} text-ink-900`}>
                          {manager.displayName}
                        </p>
                        <p className={`${TYPE.body} text-ink-500`}>
                          {manager.claimed ? 'key taken' : 'still on the hook'}
                        </p>
                      </div>

                      {manager.claimed && manager.id !== user.id && (
                        <form action={resetPinAction} className="shrink-0">
                          <input type="hidden" name="userId" value={manager.id} />
                          <button
                            type="submit"
                            className={`pixel-edge ${TAP_TARGET} border-2 border-red-dark bg-red-dark/15 px-3 ${TYPE.action} text-red-dark active:translate-y-px`}
                          >
                            Clear PIN
                          </button>
                        </form>
                      )}
                    </li>
                  ))}
                </ul>

              <p className={`mt-4 border-t-2 border-dashed border-ink-300 pt-3 ${TYPE.body} text-ink-500`}>
                  Clearing a PIN signs that manager out everywhere and puts their key back on the
                  hook, ready for a new one. You cannot see anyone&rsquo;s PIN, including your
                  own — and you cannot clear your own from here, because it would sign you out
                  mid-action.
              </p>
            </div>

            {/*
              * Corrections — the drawer, not a fourth control on every row.
              *
              * The key board's one button answers *"they cannot get in."* A
              * correction changes what somebody's identity **is**, so it is a
              * decision to be read before it is a gesture to be made, and it
              * lives on its own screen for the same reason the press desk keeps
              * Approve off the queue row.
              */}
            <div className="mt-4 border-t-2 border-dashed border-ink-300 pt-3">
              <Link
                href="/admin/corrections"
                className={`pixel-edge flex ${TAP_TARGET} w-full flex-col justify-center border-2 border-wood-dark bg-[#1c1113] px-3 py-2.5 active:translate-y-px`}
              >
                <span className={`${TYPE.stamp} text-paper-mid`}>
                  Corrections
                </span>
                <span className={`mt-1 ${TYPE.bodyCompact} text-paper-mid/70`}>
                  Wrong name off the door, or a look saved by accident
                </span>
              </Link>
            </div>
          </PixelPanel>

        </main>
      </Page>

    </>
  );
}
