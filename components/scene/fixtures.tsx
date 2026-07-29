import { AssetView } from '@/lib/assets/placeholder';
import { resolveAsset } from '@/lib/assets/registry';

/**
 * What is left of the drawn shop.
 *
 * This file used to hold fourteen fixtures — a counter, a menu board, a
 * corkboard, a wall clock, booths, an arcade cabinet, a wire rack, a glass
 * case, a chained door, a boarded door — every one of them furniture rendered
 * in CSS gradients. They were the right call while the parlor was a drawing
 * waiting to happen. They became the wrong call the moment the parlor arrived:
 * a case drawn in gradients loses to a case drawn properly, and both were on
 * screen one tap apart.
 *
 * All of them are gone. What survives is the small amount that is not
 * pretending to be furniture: the asset boundary, and the shopfront on the door
 * screen, which is the one place in the product where you are outside the
 * building.
 *
 * They are deleted rather than left unused on purpose. Dead code that draws the
 * old style is an invitation to reintroduce it.
 */

/**
 * Renders real art when the registry has it, and a drawn stand-in until then.
 *
 * The placeholder-first contract from `17 §13`. A missing slug still renders
 * loudly, because a typo should be obvious in development rather than
 * invisible.
 */
export function SceneSurface({
  slug,
  children,
  className = '',
}: {
  slug: string;
  children: React.ReactNode;
  className?: string;
}) {
  const resolution = resolveAsset(slug);

  if (resolution.kind === 'art' || resolution.kind === 'missing') {
    return <AssetView resolution={resolution} className={className} />;
  }

  return (
    <div className={className} role="img" aria-label={resolution.record.alt}>
      {children}
    </div>
  );
}

/**
 * The shop window, seen from the street on a July evening.
 *
 * The door is the one screen where you are outside. Painted lettering on the
 * glass rather than neon — the brand belongs to the room, and a lit sign bolted
 * above the page competes with it. Glass, a street light two doors down, and
 * gold leaf that has been on that window since the shop opened.
 */
export function ShopWindow() {
  return (
    <div aria-hidden="true" className="relative h-full w-full overflow-hidden">
      {/* Evening, and a street light two doors down. */}
      <div className="absolute inset-0 bg-gradient-to-b from-blue-deep via-[#101724] to-ink-900" />

      {/* Rain-flecked glass. */}
      <div
        className="absolute inset-0 opacity-25"
        style={{
          backgroundImage:
            'radial-gradient(circle at 18% 30%, rgba(216,244,255,0.35) 0.5px, transparent 1.5px),' +
            'radial-gradient(circle at 72% 62%, rgba(216,244,255,0.3) 0.5px, transparent 1.5px),' +
            'radial-gradient(circle at 44% 84%, rgba(216,244,255,0.25) 0.5px, transparent 1.5px)',
          backgroundSize: '40px 40px, 55px 55px, 33px 33px',
        }}
      />

      {/* Gold leaf, applied on the inside of the glass, so it reads reversed. */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="font-mono text-[13px] tracking-[0.42em] text-amber-mid/70"
          style={{ transform: 'scaleX(-1)' }}
        >
          TONY&rsquo;S
        </span>
        <span
          className="mt-1 font-mono text-[9px] tracking-[0.3em] text-paper-mid/45"
          style={{ transform: 'scaleX(-1)' }}
        >
          PIZZA
        </span>
      </div>

      {/* The warmth of the room leaking out under the door. */}
      <div className="absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-amber-deep/25 to-transparent" />
    </div>
  );
}

/** A card hanging in the window on a suction cup, still swinging slightly. */
export function HangingSign({ top, bottom }: { top: string; bottom: string }) {
  return (
    <div className="anim-sway absolute top-0 right-4 z-10 origin-top">
      <div aria-hidden="true" className="mx-auto h-4 w-px bg-ink-300" />
      <div className="pixel-edge border-2 border-red-dark bg-paper-white px-2.5 py-1 text-center">
        <span className="block font-display text-[11px] leading-[1.4] text-red-dark">
          {top}
        </span>
        <span className="mt-0.5 block font-display text-[8px] leading-[1.5] text-ink-500">
          {bottom}
        </span>
      </div>
    </div>
  );
}
