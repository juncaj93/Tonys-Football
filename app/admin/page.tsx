import Link from 'next/link';

import { resetPinAction } from '@/app/actions/auth';
import { BottomNav, Page, TAP_TARGET, Zone } from '@/components/shell';
import { requireAdmin } from '@/lib/auth/current-user';
import { listDoorManagers } from '@/lib/auth/service';
import { getDb } from '@/lib/db';

/**
 * The commissioner's office.
 *
 * V1 gives it exactly one power: **reset a forgotten PIN** (`09 §8.3`). Not a
 * dashboard, not a settings screen — the admin surface grows with the systems
 * that need administering, and there is only one of those so far.
 *
 * The reset clears the hash rather than setting a new one, so the commissioner
 * can never see or choose somebody's PIN. Every existing session for that
 * manager is revoked, and the action is written to `admin_audit_logs` in the
 * same transaction, so it cannot happen unrecorded.
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
      <Page>
        <header className="px-4 pt-5 pb-3">
          <Link
            href="/profile"
            className={`inline-flex ${TAP_TARGET} items-center text-sm text-ink-100 underline underline-offset-4`}
          >
            ← Back
          </Link>
          <h1 className="mt-3 text-2xl leading-tight font-bold text-paper-white">
            Commissioner&rsquo;s office
          </h1>
        </header>

        <div className="grid gap-4 px-4">
          <Zone title="Keys" tone="dark" aside={`${String(managers.length)} managers`}>
            <ul className="divide-y divide-ink-500/60">
              {managers.map((manager) => (
                <li
                  key={manager.id}
                  className="flex items-center justify-between gap-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-semibold text-paper-mid">
                      {manager.displayName}
                    </p>
                    <p className="font-mono text-[11px] text-ink-300">
                      roster {manager.rosterId} · {manager.claimed ? 'has a PIN' : 'no PIN yet'}
                    </p>
                  </div>

                  {manager.claimed && manager.id !== user.id && (
                    <form action={resetPinAction} className="shrink-0">
                      <input type="hidden" name="userId" value={manager.id} />
                      <button
                        type="submit"
                        className={`${TAP_TARGET} rounded-sm border border-red-dark px-3 text-[13px] font-semibold text-red-light active:bg-red-dark/20`}
                      >
                        Clear PIN
                      </button>
                    </form>
                  )}
                </li>
              ))}
            </ul>

            <p className="mt-4 text-[13px] leading-relaxed text-ink-300">
              Clearing a PIN signs that manager out everywhere and lets them set a new one from
              the door. You cannot see anyone&rsquo;s PIN, including your own — and you cannot
              clear your own from here, because it would sign you out mid-action.
            </p>
          </Zone>
        </div>
      </Page>

      <BottomNav current="/" />
    </>
  );
}
