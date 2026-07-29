/**
 * The room the page is standing in.
 *
 * A fixed layer behind everything: the wall, the light falling on it, the haze
 * off the oven. Because it does not scroll with the content, the fixtures
 * sliding over it read as furniture in a space rather than as cards on a page —
 * which is the entire difference between a themed dashboard and a place
 * (`16 §1`).
 *
 * `position: fixed` rather than `background-attachment: fixed`, which iOS
 * Safari has never handled properly.
 *
 * Every element here is decoration and is hidden from assistive technology.
 * The room is atmosphere; the words are the content, and they live in the
 * fixtures on top.
 */
export function ParlorAir({ tone = 'warm' }: { tone?: 'warm' | 'cold' }) {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {/* The lit air of the room. */}
      <div className={`parlor-air absolute inset-0 ${tone === 'cold' ? 'opacity-80' : ''}`} />

      {/* Oven haze. Two blobs, different speeds, never quite lining up. */}
      <div
        className="anim-haze absolute -top-10 left-[8%] h-56 w-56 rounded-full bg-amber-glow/12 blur-3xl"
      />
      <div
        className="anim-haze absolute top-[38%] right-[4%] h-72 w-72 rounded-full bg-amber-deep/10 blur-3xl"
        style={{ animationDelay: '-13s', animationDuration: '46s' }}
      />

      {/* The scanline of a room lit by old fluorescent tubes and older CRTs. */}
      <div
        className="absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            'repeating-linear-gradient(0deg, rgba(0,0,0,0.9) 0 1px, transparent 1px 3px)',
        }}
      />

      {/* The dark closes in at the edges: you are inside, and it is late. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(120% 80% at 50% 40%, transparent 40%, rgba(18,13,14,0.75) 100%)',
        }}
      />
    </div>
  );
}

/**
 * A pendant lamp on a flex, and the cone of light under it.
 *
 * Placed by the caller, because where the light falls is a composition
 * decision: one over Tony, one further back over the booths.
 */
export function Pendant({
  className = '',
  height = 'h-40',
}: {
  className?: string;
  height?: string;
}) {
  return (
    <div aria-hidden="true" className={`pointer-events-none absolute ${className}`}>
      <div className="mx-auto h-6 w-px bg-ink-500" />
      {/* The shade. */}
      <div className="anim-lamp mx-auto h-3 w-12 rounded-t-[3px] bg-red-dark shadow-[0_2px_0_#5c1416]" />
      <div className="anim-lamp mx-auto h-1.5 w-14 rounded-b-[2px] bg-red-mid" />
      {/* The bulb, and what it throws. */}
      <div className="anim-lamp mx-auto -mt-0.5 h-1.5 w-3 rounded-full bg-amber-glow shadow-[0_0_12px_4px_rgba(255,217,138,0.65)]" />
      <div className={`lamp-cone anim-lamp mx-auto -mt-1 w-44 ${height}`} />
    </div>
  );
}

/**
 * The wall behind everything in a given band, with its tiled wainscot.
 *
 * Takes children so a fixture can be mounted *on* the wall rather than floating
 * in front of it.
 */
export function Wall({
  children,
  className = '',
  wainscot = true,
}: {
  children?: React.ReactNode;
  className?: string;
  wainscot?: boolean;
}) {
  return (
    <div className={`relative ${className}`}>
      {wainscot && (
        <>
          <div aria-hidden="true" className="surface-tile absolute inset-x-0 bottom-0 h-16" />
          {/* The trim rail where tile meets paint. */}
          <div
            aria-hidden="true"
            className="absolute inset-x-0 bottom-16 h-2 bg-red-dark shadow-[0_1px_0_rgba(0,0,0,0.5)]"
          />
        </>
      )}
      <div className="relative">{children}</div>
    </div>
  );
}

/**
 * The floor, running away from you into the back of the shop.
 *
 * Black-and-white check on a perspective transform. It is only ever glimpsed —
 * under the booths, past the counter — which is exactly how much of the floor
 * you see standing in a pizzeria.
 */
export function Floor({ className = '' }: { className?: string }) {
  return (
    <div aria-hidden="true" className={`pointer-events-none overflow-hidden ${className}`}>
      <div className="surface-floor h-full w-full opacity-45" />
    </div>
  );
}
