import { AssetView } from '@/lib/assets/placeholder';
import { resolveAsset } from '@/lib/assets/registry';
import { TYPE } from '@/lib/design/type';
import { type HeldRing } from '@/lib/counter/rings';

/**
 * The championship shelf.
 *
 * Rings are **earned, never pulled** — excluded from the box, from purchase,
 * from duplicate salvage and from the reveal pool, because `systemLayer` in the
 * asset registry keeps them out of `catalog()` and every acquisition path in the
 * product reads `catalog()`. So they cannot live among the twenty-four slots
 * below: a shelf that mixes "you pulled this" with "you won this" makes the
 * second one look like luck.
 *
 * ## One ring per title, and the year is the point
 *
 * A manager who wins twice holds two rings, and each carries its season. The
 * year is the largest word in the plate for that reason — the ring art is
 * identical for every championship forever (`art/assets.inventory.json`: *"the
 * season year is rendered as text at runtime, so one asset serves every
 * championship"*), so the **year is the only thing that distinguishes one title
 * from another** and it cannot be the quiet part.
 *
 * ## It computes nothing
 *
 * Every value is handed over already decided. This component does no arithmetic
 * on a season, does not sort by anything it works out itself, and does not know
 * what makes somebody a champion — `lib/counter/rings.ts` reads the season
 * record and this prints the answer. `MANDATE §9` and the same boundary
 * `components/slice/presentation.test.tsx` holds for the Slice.
 *
 * ## The empty state says what is true
 *
 * Not "no rings yet" with a row of locked silhouettes. There is nothing to
 * unlock and no progress bar to fill: you win a season or you do not. A shelf of
 * greyed placeholders would imply a chase that does not exist, which `16 §8`
 * lists among the explicit non-goals.
 */
export function Championships({ rings }: { rings: readonly HeldRing[] }) {
  return (
    <section data-championships={String(rings.length)} className="mt-6">
      <h2 className={`${TYPE.sectionHeading} text-paper-mid/75`}>Championships</h2>

      {rings.length === 0 ? (
        <p className={`mt-2 ${TYPE.body} text-paper-mid/70`}>
          No titles yet. A ring is won, not pulled — it is the one thing in here no box will ever
          give you.
        </p>
      ) : (
        <ul className="mt-2 flex flex-col gap-2">
          {rings.map((ring) => (
            <li
              key={`${String(ring.year)}-${ring.slug}`}
              data-championship-year={String(ring.year)}
              className="pixel-edge flex items-center gap-3 border-2 border-wood-dark bg-paper-white/50 px-3 py-2.5"
            >
              {/*
                * `compact` and the collectible stand-in, exactly as the twenty
                * four slots below do it.
                *
                * Without them `AssetView` draws `PlaceholderSign` — the taped-up
                * card built for a wall — and `min-h-24` wins inside a 46px box,
                * so the slug wraps to four lines and spills over the paragraph
                * beneath. That is the same defect `PlaceholderObject` was written
                * for when `object_box_owned` first rendered at object scale, and
                * a screenshot is the only thing that catches it: every gate
                * passed the broken version.
                */}
              <span className="relative block h-[46px] w-[46px] shrink-0">
                <AssetView resolution={resolveAsset(ring.slug)} compact placeholder="collectible" />
              </span>

              <span className="flex flex-col">
                {/*
                  * The year leads, at headline size. One ring asset serves every
                  * championship, so the year is the only thing telling two titles
                  * apart — it is the name of the thing, not its metadata.
                  */}
                <span className={`${TYPE.headlineQuiet} text-ink-900`}>{ring.year}</span>
                <span className={`${TYPE.eyebrow} text-wood-mid`}>Champion</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
