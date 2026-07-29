import Link from 'next/link';

import { resetPinAction } from '@/app/actions/auth';
import { Clipboard, EnamelSign } from '@/components/scene/fixtures';
import { ParlorAir, Wall } from '@/components/scene/backdrop';
import { BackToTheCounter, Page, TAP_TARGET } from '@/components/shell';
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
      <ParlorAir tone="cold" />

      <Page>
        <Wall className="px-4 pt-6 pb-8" wainscot={false}>
          <div className="relative z-10">
            <div className="mb-3">
              <BackToTheCounter />
            </div>

            <Link
              href="/profile"
              className={`inline-flex ${TAP_TARGET} items-center text-sm text-ink-100 underline underline-offset-4`}
            >
              ← Back
            </Link>

            <div className="mt-4">
              <EnamelSign tone="red">Staff only</EnamelSign>
            </div>
            <h1 className="mt-3 text-2xl leading-tight font-bold text-paper-white">
              The office
            </h1>

            <div className="mt-6">
              <Clipboard title="Key board" aside={`${String(managers.length)} managers`}>
                <ul className="divide-y divide-ink-300/60">
                  {managers.map((manager) => (
                    <li key={manager.id} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-[15px] font-semibold text-ink-900">
                          {manager.displayName}
                        </p>
                        <p className="font-mono text-[11px] text-ink-500">
                          roster {manager.rosterId} ·{' '}
                          {manager.claimed ? 'key taken' : 'still on the hook'}
                        </p>
                      </div>

                      {manager.claimed && manager.id !== user.id && (
                        <form action={resetPinAction} className="shrink-0">
                          <input type="hidden" name="userId" value={manager.id} />
                          <button
                            type="submit"
                            className={`${TAP_TARGET} rounded-[2px] border border-red-dark bg-red-dark/10 px-3 text-[13px] font-semibold text-red-dark active:translate-y-px active:bg-red-dark/20`}
                          >
                            Clear PIN
                          </button>
                        </form>
                      )}
                    </li>
                  ))}
                </ul>

                <p className="mt-4 border-t border-dashed border-ink-300 pt-3 text-[13px] leading-relaxed text-ink-500">
                  Clearing a PIN signs that manager out everywhere and puts their key back on the
                  hook, ready for a new one. You cannot see anyone&rsquo;s PIN, including your
                  own — and you cannot clear your own from here, because it would sign you out
                  mid-action.
                </p>
              </Clipboard>
            </div>
          </div>
        </Wall>
      </Page>

    </>
  );
}
