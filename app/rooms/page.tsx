import { ClosedFixture, EnamelSign } from '@/components/scene/fixtures';
import { Floor, ParlorAir, Wall } from '@/components/scene/backdrop';
import { BottomNav, Page } from '@/components/shell';
import { requireUser } from '@/lib/auth/current-user';

/**
 * The bottom of the stairs, and a door with a chain on it.
 *
 * Basements are v1.1, Phase 6 (`16 §3`), and `16 §7.1` asks for the closed
 * basement door to exist from the start **so the room feels like an arrival
 * when it opens** rather than a tab that appeared one day. A chain and a
 * padlock say "later" in a way a disabled button cannot.
 */

export const dynamic = 'force-dynamic';

export default async function RoomsPage() {
  await requireUser();

  return (
    <>
      <ParlorAir tone="cold" />

      <Page>
        <Wall className="px-4 pt-6 pb-4" wainscot={false}>
          <div className="relative z-10">
            <EnamelSign tone="cream">Downstairs</EnamelSign>
            <h1 className="mt-3 text-2xl leading-tight font-bold text-paper-white">
              The door is chained
            </h1>
            <p className="mt-2 max-w-md text-[15px] leading-relaxed text-ink-100">
              There is a light on down there and the sound of somebody moving boxes. Tony has
              not said what is in them.
            </p>

            <div className="mt-6">
              <ClosedFixture
                slug="dressing_door_basement"
                label="Basement"
                note="A chain, a padlock, and a strip of light along the bottom of the door."
                variant="door"
                artHeight="h-56"
              />
            </div>
          </div>
        </Wall>

        {/* The stairs, falling away into the dark. */}
        <Floor className="h-20 opacity-60" />

        <div className="px-4 pb-8">
          <p className="text-[13px] leading-relaxed text-ink-300">
            Every manager gets a room down here eventually — shelves, a wall, a chair, and
            whatever they have collected. Visitors will be able to come down and look.
          </p>
        </div>
      </Page>

      <BottomNav current="/rooms" />
    </>
  );
}
