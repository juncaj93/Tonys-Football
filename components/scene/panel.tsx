import Link from 'next/link';

/**
 * The house surfaces.
 *
 * Every panel, sheet, sign and plate in the product is built from these, and
 * they exist because the room stopped being CSS. Once the parlor became real
 * pixel art, anything drawn beside it with a soft gradient and a 20px blurred
 * shadow read as a different product bolted onto the side — the shelves view
 * was the clearest case, a smooth blue box with an anti-aliased glow sitting
 * under a hand-drawn pizzeria.
 *
 * ## What makes a surface belong here
 *
 * Four rules, and they are the whole style:
 *
 *   1. **Edges are hard.** 2px, one colour, no gradient across them. Corners
 *      are square or 2px at most, because a 12px radius is a curve no pixel
 *      grid can draw.
 *   2. **Depth is stepped, never blurred.** Light on the top and left edge,
 *      dark on the bottom and right, and a hard offset drop — three flat
 *      layers, the way a sprite fakes a bevel. No `blur()`, no `backdrop-filter`.
 *   3. **Colour comes from the room.** Cream paper, dark enamel, oven-warm
 *      wood. The same handful of tones the parlor art was quantized to.
 *   4. **Type is not decoration.** Labels and headings are mono, small, and
 *      letterspaced, which reads as printed signage rather than as a web
 *      heading. **Body copy stays in the body face at a comfortable size** —
 *      the point is a room that feels made of one material, not a phone that
 *      cannot be read at arm's length on a bus.
 */

export type SurfaceTone = 'paper' | 'board' | 'wood';

/*
 * `on-paper` re-points the rarity slots at inks mixed for a light ground
 * (`globals.css`, Rarity). Any `.rarity-*` inside a paper panel inherits them,
 * so a tier label cannot end up as `amber-glow` on cream — which is how the
 * Collection shipped an invisible LEGENDARY row.
 */
const TONES: Record<SurfaceTone, string> = {
  // A photocopied sheet under a warm bulb. Carries most of the reading.
  paper: 'on-paper bg-paper-mid text-ink-900 border-wood-dark',
  // Painted board, the colour of the shop after closing.
  board: 'bg-[#1c1113] text-paper-white border-wood-dark',
  // Varnished counter wood.
  wood: 'surface-wood text-paper-white border-wood-dark',
};

/**
 * A flat panel with a stepped edge.
 *
 * `pixel-edge` in the stylesheet does the bevel: one inset highlight, one inset
 * shadow, one hard offset drop. Nothing here is blurred, so it holds up
 * beside art that was quantized to a fixed palette.
 */
export function PixelPanel({
  tone = 'paper',
  className = '',
  children,
}: {
  tone?: SurfaceTone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`pixel-edge relative border-2 ${TONES[tone]} ${className}`}>{children}</div>
  );
}

/**
 * A screwed-on enamel sign. Used wherever a surface has to name itself.
 *
 * Square, two pixels of border, two screw heads. The old one had a 4px blurred
 * drop shadow, which is a printed sign photographed rather than a printed sign.
 */
export function SignPlate({
  tone = 'cream',
  className = '',
  children,
}: {
  tone?: 'red' | 'blue' | 'cream';
  className?: string;
  children: React.ReactNode;
}) {
  const tones = {
    red: 'bg-red-dark text-paper-white border-red-mid',
    blue: 'bg-blue-deep text-blue-neon border-blue-mid',
    cream: 'bg-paper-mid text-ink-900 border-paper-dark',
  } as const;

  return (
    <span
      className={`relative inline-flex items-center border-2 px-2.5 py-1 font-display text-[11px] leading-[1.5] uppercase shadow-[2px_2px_0_rgba(0,0,0,0.4)] ${tones[tone]} ${className}`}
    >
      <span aria-hidden="true" className="absolute top-[3px] left-[3px] h-[3px] w-[3px] bg-black/40" />
      <span
        aria-hidden="true"
        className="absolute right-[3px] bottom-[3px] h-[3px] w-[3px] bg-black/40"
      />
      {children}
    </span>
  );
}

/**
 * A heading, in the shop's voice.
 *
 * Mono and letterspaced rather than a 30px geometric sans. The sans headings
 * were the single loudest thing saying "web page" on every interior screen —
 * bigger than anything in the art and drawn in a typeface the room has never
 * seen.
 */
export function PanelHeading({ children }: { children: React.ReactNode }) {
  return (
    <h1 className="font-display text-[17px] leading-[1.35] text-ink-900 uppercase">
      {children}
    </h1>
  );
}

/**
 * A door in the shop that is shut, and says so.
 *
 * This replaces four separate CSS dioramas — a wire rack, a glass case, a
 * chained door, a boarded door — each of which was an attempt to draw furniture
 * with gradients next to furniture that had been drawn properly. They could not
 * win that comparison, so they no longer try: the real parlor sits behind,
 * dimmed, and a sheet of paper explains what is behind the door.
 *
 * `05 §8.5` wants empty states in the shop's voice rather than a blank panel.
 * A note taped up by somebody who works here is exactly that, and it is honest
 * about the room being the room you were just standing in.
 */
export function ClosedRoom({
  sign,
  title,
  children,
  footnote,
}: {
  sign: string;
  title: string;
  children: React.ReactNode;
  /** The smaller line underneath: what arrives here later. */
  footnote?: string;
}) {
  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 pt-3 pb-8">
      <PixelPanel tone="paper" className="px-4 pt-4 pb-5">
        <SignPlate tone="red">{sign}</SignPlate>
        <div className="mt-4">
          <PanelHeading>{title}</PanelHeading>
        </div>
        <div className="mt-4 space-y-3 text-[19px] leading-[1.45] text-ink-700">{children}</div>
      </PixelPanel>

      {/*
        * The note about what arrives here later. It needs its own painted
        * backing: set straight onto the parlor it was competing with a wall of
        * pizza boxes, and thirteen-pixel type does not win that fight.
        */}
      {footnote !== undefined && (
        <PixelPanel tone="board" className="mt-4 px-3.5 py-3">
          <p className="text-[17px] leading-[1.5] text-paper-mid/85">{footnote}</p>
        </PixelPanel>
      )}

      <div className="mt-6">
        <ReturnPlate />
      </div>
    </main>
  );
}

/** The way back, at the bottom where a thumb is. */
export function ReturnPlate() {
  return (
    <Link
      href="/"
      className="pixel-edge flex min-h-[48px] w-full items-center justify-center border-2 border-wood-dark bg-[#1c1113] font-display text-[12px] leading-[1.5] text-paper-mid uppercase active:translate-y-px"
    >
      &larr;&nbsp;&nbsp;Back to the counter
    </Link>
  );
}
