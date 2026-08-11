import { notFound } from 'next/navigation';

import { SlotMachine } from '@/components/casino/slot-machine';
import { RoomDisplay, RoomDoor } from '@/components/scene/room-object';
import { RoomStage } from '@/components/scene/room-stage';
import { UndergroundScene } from '@/components/scene/underground';
import { Page } from '@/components/shell';
import { requireUser } from '@/lib/auth/current-user';
import { casinoTableFor } from '@/lib/casino/table';
import { recentSpins } from '@/lib/casino/slots';
import { COVERED_LINES, UNDERGROUND, undergroundObject } from '@/lib/casino/objects';
import { openSeason, wallet } from '@/lib/counter/tokens';
import { getDb } from '@/lib/db';
import { TYPE } from '@/lib/design/type';
import { featureFlags } from '@/lib/flags';

/**
 * The Underground.
 *
 * **The route exists and the door is shut.** `lib/flags.ts` has
 * `underground: false`, so every real manager gets `notFound()` — and that is
 * the correct behaviour rather than a placeholder for it. R11: both games ready
 * before the curtain goes up, and blackjack is W2.
 *
 * ## Why the route exists before the door opens
 *
 * `lib/backhall/objects.ts` records the rule from the other side: *a feature
 * flag says a feature shipped; it cannot make a page exist*. `openTo()` throws
 * if a flag opens a door with nothing behind it, which is why
 * `back-hall-both-open` has been unphotographable since the hall was built. This
 * page is what closes that — the flag can now be opened in review, the hall's
 * both-open state can be captured, and the day the commissioner announces the
 * opening it is one line rather than a milestone.
 *
 * ## A 404 rather than a message
 *
 * The same shape `requireAdmin()` uses. A shut destination that rendered *"not
 * yet"* would be a countdown, which `18 §6` forbids on locked doors — and it
 * would also confirm to anybody probing that there is something here. The joke
 * in the Back Hall is *"Don't worry about it."*, and a page that explained
 * itself would spend it.
 */

export const dynamic = 'force-dynamic';

export default async function UndergroundPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { user } = await requireUser();

  const query = await searchParams;
  const flags = featureFlags(process.env, query['open']);

  // Shut is the production state. Nothing below this line runs for a real
  // manager, and the action checks the same two flags for itself.
  if (!flags.underground) notFound();

  const db = getDb();
  const season = await openSeason(db);
  const seat = season === null ? null : await wallet(db, { userId: user.id, seasonId: season.id });

  const { table } = await casinoTableFor(db);
  const history = await recentSpins(db, user.id, 5);

  return (
    <Page oneScreen>
      <main
        className="relative flex min-h-0 flex-1 justify-center overflow-hidden"
        // The cellar's own dark, so a viewport taller than the room reads as
        // more cellar rather than as a letterbox. Same treatment as the parlor.
        style={{ backgroundColor: '#0d0a0c' }}
        data-room="underground"
      >
        <div
          className="relative w-full max-w-[430px] self-start"
          style={{ aspectRatio: `${String(UNDERGROUND.width)} / ${String(UNDERGROUND.height)}` }}
        >
          <RoomStage>
            <UndergroundScene slotsLit={flags.slotMachine} tableLit={flags.blackjackTable} />

            <SlotMachine
              spec={undergroundObject('slots')}
              wagers={table.wagers}
              balance={seat?.balance ?? 0}
              live={flags.slotMachine}
              coveredLine={COVERED_LINES['slots'] ?? ''}
            />

            {/*
              * The table, drawn from the first day and shut until W2.
              *
              * `18 §6.1`: a locked destination is a closed door, never a hidden
              * one. Hiding it would make the room look finished when it is not,
              * and would make the day blackjack arrives read as a new room
              * rather than as a dealer turning up.
              */}
            <RoomDisplay spec={undergroundObject('blackjack')} title="The table" material="enamel">
              <p className={`${TYPE.dialogue} text-paper-mid`}>{COVERED_LINES['blackjack']}</p>
            </RoomDisplay>

            {/*
              * The cash desk — a manager's own tab and their own last few pulls.
              *
              * **Theirs only.** R10 makes casino history private in v1: no
              * leaderboard, no feed, no public volume. `recentSpins` takes a user
              * id and there is deliberately no function that reads anybody
              * else's.
              */}
            <RoomDisplay spec={undergroundObject('desk')} title="Your tab" material="paper">
              <p className={`${TYPE.ledgerValue} text-ink-900`}>{seat?.balance ?? 0} tokens</p>
              {history.length === 0 ? (
                <p className={`${TYPE.body} text-ink-700`}>You have not played down here yet.</p>
              ) : (
                <ul className="mt-2 flex flex-col gap-1">
                  {history.map((row, index) => (
                    <li
                      key={`${row.at.toISOString()}:${String(index)}`}
                      className={`${TYPE.ledgerNote} flex justify-between gap-4 text-ink-700`}
                    >
                      <span>{row.symbols.join(' · ')}</span>
                      <span className={TYPE.ledgerValue}>
                        {row.payout > 0 ? `+${String(row.payout - row.stake)}` : `−${String(row.stake)}`}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </RoomDisplay>

            {/* The way back is a door in the world, not the browser's back button. */}
            <RoomDoor spec={undergroundObject('return')} />
          </RoomStage>
        </div>
      </main>
    </Page>
  );
}
