import Link from 'next/link';

import { ReceiptSlip } from '@/components/receipt';
import { BottomNav, Page, TAP_TARGET, Zone } from '@/components/shell';
import { TonyCounter } from '@/components/tony';
import { AssetView } from '@/lib/assets/placeholder';
import { requireUser } from '@/lib/auth/current-user';
import { listDoorManagers } from '@/lib/auth/service';
import { greetingFor } from '@/lib/content/greeting';
import { getDb } from '@/lib/db';
import { receiptFor } from '@/lib/parlor/receipt';
import { seasonClock } from '@/lib/parlor/season';
import { tonightBoard } from '@/lib/parlor/tonight';
import { resolveAsset } from '@/lib/assets/registry';
import { loadTags } from '@/lib/tags/repository';

/**
 * Tony's Pizza Parlor — the six zones (`16 §7.1`).
 *
 * | Zone            | Role                                    |
 * |-----------------|-----------------------------------------|
 * | Front counter   | Tony, the greeting, your receipt        |
 * | Tonight at Tony's | What matters now, ≤4 lines            |
 * | Menu board      | Featured rotator + chalkboard prediction |
 * | Newspaper rack  | Latest Slice + archive                  |
 * | Display case    | New items, spotlights, Showcases        |
 * | Wall            | Three dressing slots                    |
 *
 * Four of the six have nothing real in them yet, and every one of those says
 * why in the shop's own voice rather than sitting empty. That is the offseason
 * dressing the handoff asks for: **the shop reads as closed for the summer,
 * deliberately** — not as software that has not loaded.
 *
 * Mobile stacks the zones full-width in priority order. Desktop composes them
 * into a room. Same components, same assets, no scaling down (`16 §7.1`).
 */

// The greeting is chosen per manager and logged on every visit, so this page is
// never static and never cached.
export const dynamic = 'force-dynamic';

export default async function ParlorPage() {
  const { user } = await requireUser();
  const db = getDb();
  const clock = seasonClock();

  const [tags, managers, receipt, tonight] = await Promise.all([
    loadTags(db),
    listDoorManagers(db),
    receiptFor(db, user.id),
    tonightBoard(db),
  ]);

  const greeting = await greetingFor(db, {
    userId: user.id,
    displayName: user.displayName,
    tags: tags.get(user.id) ?? new Set<string>(),
    leagueTags: managers.map((manager) => tags.get(manager.id) ?? new Set<string>()),
    daysUntilKickoff: clock.daysUntilKickoff,
  });

  return (
    <>
      <Page>
        <header className="px-4 pt-5 pb-3">
          <div className="flex items-baseline justify-between gap-3">
            <p className="font-mono text-[11px] tracking-[0.22em] text-amber-mid uppercase">
              {clock.phase === 'offseason' ? 'Offseason' : 'Season'} ·{' '}
              {clock.daysUntilKickoff === null
                ? 'Week one'
                : `${String(clock.daysUntilKickoff)} days out`}
            </p>
            <Link
              href="/profile"
              className={`${TAP_TARGET} flex items-center font-mono text-[11px] tracking-wide text-ink-100 underline decoration-dotted underline-offset-4`}
            >
              {user.displayName}
            </Link>
          </div>
          <h1 className="mt-1 text-2xl leading-tight font-bold text-paper-white">
            Tony&rsquo;s Pizza
          </h1>
        </header>

        <div className="grid gap-4 px-4 lg:grid-cols-[1.15fr_1fr] lg:items-start">
          {/* ---- Front counter ------------------------------------------- */}
          <Zone
            title="Front counter"
            aside={greeting === null ? undefined : greeting.expression}
            tone="counter"
            className="lg:row-span-2"
          >
            <TonyCounter
              slug={greeting?.tonySlug ?? 'character_tony_neutral'}
              line={greeting?.text ?? null}
              name={user.displayName}
            />

            <div className="mt-5">
              <ReceiptSlip receipt={receipt} name={user.displayName} />
            </div>
          </Zone>

          {/* ---- Tonight at Tony's --------------------------------------- */}
          <Zone title="Tonight at Tony's" tone="dark" aside="the board">
            {tonight.length === 0 ? (
              <p className="text-sm text-ink-100">Nothing on the board.</p>
            ) : (
              <ul className="space-y-2.5">
                {tonight.map((line) => (
                  <li key={line.key} className="flex gap-2.5 text-[15px] leading-snug">
                    <span aria-hidden="true" className="text-amber-mid">
                      —
                    </span>
                    <span className="text-paper-mid">{line.text}</span>
                  </li>
                ))}
              </ul>
            )}
          </Zone>

          {/* ---- Menu board ---------------------------------------------- */}
          <Zone title="Menu board" aside="offseason">
            <AssetView resolution={resolveAsset('zone_menu_board')} className="min-h-20" />
            <p className="mt-3 text-sm leading-relaxed text-ink-700">
              No specials until the season starts. Tony&rsquo;s chalkboard prediction goes up
              here the first Tuesday that matters.
            </p>
          </Zone>

          {/* ---- Newspaper rack ------------------------------------------ */}
          <Zone title="Newspaper rack" aside="empty">
            <AssetView resolution={resolveAsset('zone_newspaper_rack')} className="min-h-20" />
            <p className="mt-3 text-sm leading-relaxed text-ink-700">
              The rack is empty. The first Slice prints the Tuesday after week one.
            </p>
            <Link
              href="/slice"
              className={`mt-3 inline-flex ${TAP_TARGET} items-center text-sm font-semibold text-red-dark underline underline-offset-4`}
            >
              Look at the rack anyway
            </Link>
          </Zone>

          {/* ---- Display case -------------------------------------------- */}
          <Zone title="Display case" aside="empty">
            <AssetView resolution={resolveAsset('zone_display_case')} className="min-h-20" />
            <p className="mt-3 text-sm leading-relaxed text-ink-700">
              Glass is clean, shelves are bare. Nothing to collect until the season opens.
            </p>
          </Zone>

          {/* ---- The wall ------------------------------------------------ */}
          <Zone title="The wall" aside="3 slots" tone="dark" className="lg:col-span-2">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <WallSlot
                slug="surface_poster_blank"
                caption="Closed for the summer. Back in September."
              />
              <WallSlot
                slug="dressing_door_boarded"
                caption="Back door, boarded up. Tony says it has always been like that."
              />
              <WallSlot
                slug="dressing_door_basement"
                caption="Basement door, shut. Nothing down there yet."
              />
            </div>
          </Zone>
        </div>
      </Page>

      <BottomNav current="/" />
    </>
  );
}

function WallSlot({ slug, caption }: { slug: string; caption: string }) {
  return (
    <div>
      <AssetView resolution={resolveAsset(slug)} className="min-h-24" />
      <p className="mt-2 text-[13px] leading-snug text-ink-100">{caption}</p>
    </div>
  );
}
