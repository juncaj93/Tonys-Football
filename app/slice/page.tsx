import { ClosedFixture, EnamelSign } from '@/components/scene/fixtures';
import { ParlorAir, Pendant, Wall } from '@/components/scene/backdrop';
import { BackToTheCounter, Page } from '@/components/shell';
import { requireUser } from '@/lib/auth/current-user';
import { seasonClock } from '@/lib/parlor/season';

/**
 * The rack by the door, before there is a paper in it.
 *
 * The Slice is V3 (`17 §4`). This is the corner of the shop it will arrive in:
 * the wire rack, the shelf where the stack goes, and a hand-written card taped
 * to the front of it. `05 §8.5` wants empty states in the shop's voice rather
 * than a blank panel, and "the rack is empty" is a fact about a rack.
 */

export const dynamic = 'force-dynamic';

export default async function SlicePage() {
  await requireUser();
  const clock = seasonClock();

  return (
    <>
      <ParlorAir />

      <Page>
        <Wall className="px-4 pt-6 pb-8" wainscot={false}>
          <Pendant className="top-0 left-[24%] z-0" height="h-32" />

          <div className="relative z-10">
            <div className="mb-3">
              <BackToTheCounter />
            </div>

            <EnamelSign tone="red">Tony&rsquo;s Tuesday Slice</EnamelSign>
            <h1 className="mt-3 text-2xl leading-tight font-bold text-paper-white">
              Nothing on the rack
            </h1>
            <p className="mt-2 max-w-md text-[15px] leading-relaxed text-ink-100">
              {clock.daysUntilKickoff === null
                ? 'The first issue prints the Tuesday after week one.'
                : `Nothing has happened worth printing since December. First issue goes on the rack the Tuesday after week one — ${String(clock.daysUntilKickoff)} days out.`}
            </p>

            <div className="mt-6">
              <ClosedFixture
                slug="zone_newspaper_rack"
                label="The rack"
                note="Three shelves, all of them empty, and a price card nobody has updated since the shop opened."
                variant="rack"
                artHeight="h-56"
              />
            </div>

            <p className="mt-6 text-[13px] leading-relaxed text-ink-300">
              When it does print, the whole shop changes on a Tuesday morning: fresh papers here,
              a new line on the menu board, and something different on the wall.
            </p>
          </div>
        </Wall>
      </Page>

    </>
  );
}
