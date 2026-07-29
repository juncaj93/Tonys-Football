import { ClosedFixture, EnamelSign } from '@/components/scene/fixtures';
import { ParlorAir, Pendant, Wall } from '@/components/scene/backdrop';
import { BottomNav, Page } from '@/components/shell';
import { requireUser } from '@/lib/auth/current-user';

/**
 * The display case, lit, with nothing on the shelves.
 *
 * Collectibles, tokens and the loot box are V4 (`17 §4`). Nothing here shows a
 * number or a balance: `16 §8` keeps every economy figure simulation-gated, and
 * a "0 tokens" counter would be a number the product has not earned yet.
 */

export const dynamic = 'force-dynamic';

export default async function CollectionPage() {
  await requireUser();

  return (
    <>
      <ParlorAir />

      <Page>
        <Wall className="px-4 pt-6 pb-8" wainscot={false}>
          <Pendant className="top-0 right-[26%] z-0" height="h-32" />

          <div className="relative z-10">
            <EnamelSign tone="blue">The case</EnamelSign>
            <h1 className="mt-3 text-2xl leading-tight font-bold text-paper-white">
              Shelves are bare
            </h1>
            <p className="mt-2 max-w-md text-[15px] leading-relaxed text-ink-100">
              The strip light is on and the glass has been wiped. Tony has not put anything in
              it yet.
            </p>

            <div className="mt-6">
              <ClosedFixture
                slug="zone_display_case"
                label="Display case"
                note="Two shelves, a light along the top, and a smear where somebody leaned on the glass."
                variant="case"
                artHeight="h-56"
              />
            </div>

            <p className="mt-6 text-[13px] leading-relaxed text-ink-300">
              Collectibles, championship rings, and the tokens to open a box with all arrive
              together — once there is a season to earn them in.
            </p>
          </div>
        </Wall>
      </Page>

      <BottomNav current="/collection" />
    </>
  );
}
