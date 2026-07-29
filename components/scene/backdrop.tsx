/**
 * The air of the shop, on the door screen.
 *
 * A fixed layer behind everything: lit air, haze off the oven, the dark closing
 * in at the edges. Once the parlor became real art, every screen inside the
 * building started using *that* instead — the room dimmed behind a panel, which
 * is both truer and cheaper than lighting a CSS room.
 *
 * This survives on the door, which is the one screen where you are outside the
 * building looking in. The lamp, the wall and the floor that used to live
 * beside it were furniture drawn in gradients, and they are gone with the rest
 * of the CSS shop.
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
