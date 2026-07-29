import Link from 'next/link';

import { AssetView } from '@/lib/assets/placeholder';
import { resolveAsset } from '@/lib/assets/registry';

/**
 * The things in the room.
 *
 * Each of these is a physical object first and a UI element second: a board
 * bolted to a wall, a case with glass in front of it, a door with a chain
 * across it. `16 §7.1` asks for the six zones to be **discrete tiles, never one
 * wide background** — these are those tiles, drawn rather than photographed,
 * and they compose into a scene on desktop and stack into one on a phone
 * without changing size or losing their edges.
 *
 * Every fixture that stands in for a registry asset goes through
 * `SceneSurface`, so the day a zone tile is drawn it replaces the CSS without a
 * code change (`art/ASSET_PIPELINE.md`).
 */

export const TAP = 'min-h-[44px] min-w-[44px]';

/**
 * Renders real art when the registry has it, and the drawn fixture until then.
 *
 * This is the placeholder-first contract from `17 §13`, one level up from the
 * taped-cardboard sign: the fallback for a zone is now the zone, built in CSS.
 * A missing slug still renders loudly, because a typo should be obvious.
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

  if (resolution.kind === 'art') {
    return <AssetView resolution={resolution} className={className} />;
  }

  if (resolution.kind === 'missing') {
    return <AssetView resolution={resolution} className={className} />;
  }

  return (
    <div className={className} role="img" aria-label={resolution.record.alt}>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Signage
// ---------------------------------------------------------------------------

/** The window sign, seen from inside — so the neon reads back to front. */
export function WindowNeon() {
  return (
    <div aria-hidden="true" className="relative h-full w-full overflow-hidden">
      {/* Night, and a street light two doors down. */}
      <div className="absolute inset-0 bg-gradient-to-b from-blue-deep via-[#0d1524] to-ink-900" />
      <div className="absolute -top-6 left-1/4 h-24 w-40 rounded-full bg-blue-light/10 blur-2xl" />

      {/* Rain-flecked glass. */}
      <div
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            'radial-gradient(circle at 18% 30%, rgba(216,244,255,0.35) 0.5px, transparent 1.5px),' +
            'radial-gradient(circle at 72% 62%, rgba(216,244,255,0.3) 0.5px, transparent 1.5px),' +
            'radial-gradient(circle at 44% 84%, rgba(216,244,255,0.25) 0.5px, transparent 1.5px)',
          backgroundSize: '40px 40px, 55px 55px, 33px 33px',
        }}
      />

      <div className="anim-neon absolute inset-0 flex flex-col items-center justify-center">
        <span className="neon-warm font-mono text-[13px] tracking-[0.42em]" style={{ transform: 'scaleX(-1)' }}>
          TONY&rsquo;S
        </span>
        <span className="neon-pink mt-1 font-mono text-[9px] tracking-[0.3em]" style={{ transform: 'scaleX(-1)' }}>
          PIZZA
        </span>
      </div>
    </div>
  );
}

/** A card hanging in the window on a suction cup, still swinging slightly. */
export function HangingSign({ top, bottom }: { top: string; bottom: string }) {
  return (
    <div className="anim-sway absolute top-0 right-4 z-10 origin-top">
      <div aria-hidden="true" className="mx-auto h-4 w-px bg-ink-300" />
      <div className="rounded-[2px] border-2 border-red-dark bg-paper-white px-2.5 py-1 text-center shadow-[0_3px_6px_rgba(0,0,0,0.55)]">
        <span className="block font-mono text-[10px] leading-none font-bold tracking-[0.18em] text-red-dark">
          {top}
        </span>
        <span className="mt-0.5 block font-mono text-[8px] leading-none tracking-[0.12em] text-ink-500">
          {bottom}
        </span>
      </div>
    </div>
  );
}

/** A screwed-on enamel plate. Used wherever the room needs to name itself. */
export function EnamelSign({
  children,
  tone = 'red',
  className = '',
}: {
  children: React.ReactNode;
  tone?: 'red' | 'blue' | 'cream';
  className?: string;
}) {
  const tones = {
    red: 'bg-red-dark text-paper-white border-red-mid',
    blue: 'bg-blue-deep text-blue-neon border-blue-mid',
    cream: 'bg-paper-mid text-ink-900 border-paper-dark',
  } as const;

  return (
    <span
      className={`relative inline-flex items-center rounded-[2px] border px-2.5 py-1 font-mono text-[10px] font-bold tracking-[0.2em] uppercase shadow-[0_2px_4px_rgba(0,0,0,0.45)] ${tones[tone]} ${className}`}
    >
      <span aria-hidden="true" className="absolute top-1 left-1 h-1 w-1 rounded-full bg-black/40" />
      <span aria-hidden="true" className="absolute right-1 bottom-1 h-1 w-1 rounded-full bg-black/40" />
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// The counter
// ---------------------------------------------------------------------------

/**
 * The front counter: a back bar, a work surface, and a front that Tony stands
 * behind.
 *
 * The occlusion is the whole trick. `behind` is drawn first and clipped by the
 * counter front, so Tony is *in* the room rather than pasted on top of it —
 * `17 §3`'s "Tony is at the counter as the page paints".
 */
export function Counter({
  behind,
  onTop,
}: {
  behind: React.ReactNode;
  onTop: React.ReactNode;
}) {
  return (
    <section className="relative">
      {/* Everything behind the counter, cropped where the counter begins. */}
      <div className="relative overflow-hidden px-4 pt-3 pb-0">{behind}</div>

      {/* The counter top, catching the pendant light. */}
      <div
        aria-hidden="true"
        className="surface-counter relative h-5 w-full shadow-[0_-10px_24px_rgba(0,0,0,0.55)]"
      >
        <div className="absolute inset-x-0 top-0 h-px bg-amber-glow/50" />
      </div>

      {/* The front of the counter, and whatever is resting on the top. */}
      <div className="surface-wood relative border-y border-wood-dark px-4 pt-4 pb-6">
        {/* Stainless kick rail. */}
        <div
          aria-hidden="true"
          className="absolute inset-x-0 bottom-2 h-1.5 bg-gradient-to-b from-ink-100/30 to-ink-500/10"
        />
        {onTop}
      </div>
    </section>
  );
}

/** The menu board over the back bar. Letters get pulled in the offseason. */
export function MenuBoard({ lines }: { lines: readonly string[] }) {
  return (
    <SceneSurface
      slug="zone_menu_board"
      className="surface-slate relative rounded-[3px] border-[3px] border-wood-dark px-2 py-1.5 shadow-[0_6px_18px_rgba(0,0,0,0.6),inset_0_0_24px_rgba(0,0,0,0.5)]"
    >
      <div aria-hidden="true" className="absolute inset-x-2 top-1.5 h-px bg-paper-white/15" />
      <p className="neon-warm text-center font-mono text-[8px] tracking-[0.28em]">MENU</p>
      <div className="mt-1.5 space-y-0.5">
        {lines.map((line) => (
          <p
            key={line}
            className="text-center font-mono text-[9px] leading-snug tracking-wide text-paper-mid/85"
          >
            {line}
          </p>
        ))}
      </div>
    </SceneSurface>
  );
}

/**
 * The back bar behind Tony: a shelf, and the shapes of a working kitchen.
 *
 * Pure silhouette — stacked boxes, a shaker, a jug, the oven mouth glowing.
 * It costs nothing and it is most of why the space behind the counter reads as
 * depth rather than as a brown wall.
 */
export function BackBar() {
  return (
    <div aria-hidden="true" className="absolute inset-x-0 bottom-0 top-0">
      {/*
       * The oven mouth, set into the back wall at counter height — low enough
       * that the counter crops it, which is what makes the wall read as having
       * something behind it rather than being a painted backdrop.
       */}
      <div className="absolute bottom-0 left-[46%] h-9 w-16 rounded-t-[4px] border-2 border-b-0 border-ink-900 bg-black/80 shadow-[inset_0_0_14px_rgba(0,0,0,0.95)]">
        <div className="anim-lamp absolute inset-1 rounded-t-[2px] bg-gradient-to-t from-amber-deep via-amber-mid to-amber-glow/60 opacity-60 shadow-[0_0_22px_8px_rgba(242,169,75,0.28)]" />
        {/* The bar across the oven door. */}
        <div className="absolute inset-x-1.5 top-1/2 h-[3px] rounded bg-ink-900/80" />
      </div>

      {/* The shelf, and what is stacked on it. */}
      <div className="absolute inset-x-0 top-3 h-px bg-wood-light/50" />
      <div className="absolute inset-x-0 top-[13px] h-1 bg-black/45" />
      <div className="absolute inset-x-2 top-0 flex items-end gap-1.5">
        <span className="h-3 w-6 rounded-[1px] bg-ink-900/80" />
        <span className="h-2 w-5 rounded-[1px] bg-ink-900/70" />
        <span className="h-3.5 w-2 rounded-t-full bg-ink-900/75" />
        <span className="h-2.5 w-2.5 rounded-full bg-ink-900/70" />
        <span className="h-3 w-7 rounded-[1px] bg-ink-900/80" />
      </div>
    </div>
  );
}

/** The clock every pizzeria has, running about four minutes fast. */
export function WallClock({ className = '' }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`h-11 w-11 rounded-full border-[3px] border-red-dark bg-paper-white shadow-[0_3px_8px_rgba(0,0,0,0.55)] ${className}`}
    >
      <div className="relative h-full w-full">
        {/* Hands, stopped at the hour the shop closed for the summer. */}
        <span className="absolute top-1/2 left-1/2 h-[1.5px] w-3 origin-left -translate-y-1/2 rotate-[-58deg] bg-ink-900" />
        <span className="absolute top-1/2 left-1/2 h-[1.5px] w-4 origin-left -translate-y-1/2 rotate-[112deg] bg-ink-700" />
        <span className="absolute top-1/2 left-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-mid" />
      </div>
    </div>
  );
}

/** Tony's dialogue: an order-window plate, lit from above, high contrast. */
export function SpeechPlate({
  speaker,
  mood,
  children,
}: {
  speaker: string;
  mood: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative rounded-[3px] border border-wood-light/70 bg-ink-900/85 px-3.5 pt-3.5 pb-3 shadow-[0_6px_20px_rgba(0,0,0,0.6)] backdrop-blur-[2px]">
      <div className="absolute -top-2.5 left-3 flex items-center gap-1.5">
        <EnamelSign tone="red">{speaker}</EnamelSign>
        <span className="font-mono text-[9px] tracking-[0.2em] text-amber-mid/80 uppercase">
          {mood}
        </span>
      </div>
      <div className="pt-1.5">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The wall
// ---------------------------------------------------------------------------

/** Tonight at Tony's: a corkboard, and what is pinned to it this week. */
export function Corkboard({
  title,
  notes,
}: {
  title: string;
  notes: readonly { key: string; text: string }[];
}) {
  const tilts = ['-1.4deg', '0.9deg', '-0.6deg', '1.2deg'];

  return (
    <SceneSurface
      slug="zone_tonight_board"
      className="surface-cork relative rounded-[3px] border-[5px] border-wood-dark px-3 pt-3 pb-4 shadow-[0_8px_20px_rgba(0,0,0,0.55),inset_0_0_30px_rgba(0,0,0,0.35)]"
    >
      <p className="mb-2.5 text-center font-mono text-[10px] font-bold tracking-[0.24em] text-wood-dark uppercase">
        {title}
      </p>

      <ul className="space-y-2">
        {notes.map((note, index) => (
          <li
            key={note.key}
            className="relative bg-paper-white px-3 py-2 shadow-[0_2px_5px_rgba(0,0,0,0.45)]"
            style={{ transform: `rotate(${tilts[index % tilts.length] ?? '0deg'})` }}
          >
            {/* The pin. */}
            <span
              aria-hidden="true"
              className="absolute -top-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rounded-full bg-red-mid shadow-[0_1px_2px_rgba(0,0,0,0.6),inset_0_-1px_0_rgba(0,0,0,0.35)]"
            />
            <p className="text-[14px] leading-snug text-ink-900">{note.text}</p>
          </li>
        ))}
      </ul>
    </SceneSurface>
  );
}

/**
 * A part of the shop that is shut.
 *
 * The handoff says the doors of the features V1 does not open must **exist and
 * be visibly closed**. A greyed-out panel is a disabled button; a rack with
 * nothing in it, or a door with a chain across it, is a shop that is not
 * finished — which is the truth, and reads as deliberate (`05 §8.5`).
 */
export function ClosedFixture({
  slug,
  href,
  label,
  note,
  variant,
  artHeight = 'h-24',
}: {
  slug: string;
  href?: string;
  label: string;
  note: string;
  variant: 'rack' | 'case' | 'door' | 'boarded';
  /** Taller when the fixture is the whole point of the screen. */
  artHeight?: string;
}) {
  const body = (
    <SceneSurface
      slug={slug}
      className="relative block h-full overflow-hidden rounded-[3px] border border-wood-dark bg-ink-900/70 shadow-[0_6px_16px_rgba(0,0,0,0.5)]"
    >
      <div className={`relative ${artHeight}`}>
        {variant === 'rack' && <RackArt />}
        {variant === 'case' && <CaseArt />}
        {variant === 'door' && <DoorArt />}
        {variant === 'boarded' && <BoardedArt />}
      </div>

      <div className="border-t border-wood-dark/70 bg-ink-900/80 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <EnamelSign tone={href === undefined ? 'cream' : 'blue'}>{label}</EnamelSign>
          {href !== undefined && (
            <span aria-hidden="true" className="font-mono text-[10px] text-blue-neon/70">
              →
            </span>
          )}
        </div>
        <p className="mt-1.5 text-[13px] leading-snug text-ink-100">{note}</p>
      </div>
    </SceneSurface>
  );

  if (href === undefined) return body;

  return (
    <Link href={href} className={`block ${TAP} transition-opacity active:opacity-80`}>
      {body}
    </Link>
  );
}

/** Empty wire rack: shelves, and the shadow where the papers should be. */
function RackArt() {
  return (
    <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-b from-[#2b2023] to-ink-900">
      {/* Light from the shop falls across the rack, or it reads as a black box. */}
      <div className="absolute inset-0 bg-[radial-gradient(70%_60%_at_30%_0%,rgba(255,217,138,0.16),transparent_70%)]" />

      {[0, 1, 2].map((shelf) => (
        <div key={shelf} className="absolute inset-x-3" style={{ top: `${16 + shelf * 29}%` }}>
          {/* The lip of the shelf, catching the light. */}
          <div className="h-px bg-amber-glow/40" />
          <div className="h-1 rounded-b bg-black/55" />
          {/* Wire fingers, seen slightly from above. */}
          <div
            className="mt-0.5 flex justify-between opacity-70"
            style={{ transform: 'perspective(70px) rotateX(30deg)' }}
          >
            {Array.from({ length: 12 }, (_, wire) => (
              <span key={wire} className="h-2.5 w-px bg-ink-100/35" />
            ))}
          </div>
        </div>
      ))}

      {/* The price card nobody has updated since the shop opened. */}
      <div className="absolute bottom-2 left-3 rotate-[-3deg] bg-paper-white/85 px-1.5 py-0.5">
        <span className="font-mono text-[7px] tracking-wider text-ink-900">FREE — TAKE ONE</span>
      </div>
    </div>
  );
}

/** Lit glass case with nothing on the shelves. */
function CaseArt() {
  return (
    <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-b from-[#101c2a] to-ink-900">
      <div className="absolute inset-x-2 top-2 bottom-2 rounded-[2px] border border-blue-mid/40">
        <div className="absolute inset-x-0 top-1/2 h-px bg-blue-light/25" />
        <div className="absolute inset-x-0 bottom-2 h-px bg-blue-light/20" />
        {/* Strip light along the top of the case. */}
        <div className="absolute inset-x-4 top-0 h-0.5 bg-blue-neon/60 shadow-[0_0_10px_2px_rgba(127,212,240,0.4)]" />
      </div>
      <div className="surface-glass absolute inset-0" />
    </div>
  );
}

/** The basement door, shut, with a chain and a padlock. */
function DoorArt() {
  return (
    <div aria-hidden="true" className="absolute inset-0 bg-ink-900">
      <div className="surface-wood absolute inset-x-6 top-1 bottom-0 rounded-t-[3px] border-x border-t border-wood-dark shadow-[inset_0_0_20px_rgba(0,0,0,0.6)]">
        {/* Two recessed panels. */}
        <div className="absolute inset-x-2 top-2 h-7 border border-wood-dark/70 bg-black/15" />
        <div className="absolute inset-x-2 top-11 bottom-2 border border-wood-dark/70 bg-black/15" />
        {/* Knob. */}
        <div className="absolute top-1/2 right-2.5 h-2 w-2 rounded-full bg-amber-mid/70 shadow-[0_0_4px_rgba(255,217,138,0.5)]" />
      </div>
      {/* The chain. */}
      <div className="absolute inset-x-4 top-[52%] h-1 rounded bg-ink-100/25 shadow-[0_1px_2px_rgba(0,0,0,0.7)]" />
      <div className="absolute top-[48%] left-1/2 h-3 w-2.5 -translate-x-1/2 rounded-[2px] bg-ink-100/40" />
    </div>
  );
}

/** The back door, boarded over. Tony says it has always been like that. */
function BoardedArt() {
  return (
    <div aria-hidden="true" className="absolute inset-0 bg-ink-900">
      <div className="absolute inset-x-6 top-1 bottom-0 bg-black/70" />
      {[-14, 6, -4].map((angle, index) => (
        <div
          key={angle}
          className="surface-wood absolute inset-x-2 h-5 border-y border-wood-dark shadow-[0_2px_5px_rgba(0,0,0,0.6)]"
          style={{ top: `${16 + index * 26}%`, transform: `rotate(${String(angle / 4)}deg)` }}
        >
          <span className="absolute top-1/2 left-3 h-1 w-1 -translate-y-1/2 rounded-full bg-black/50" />
          <span className="absolute top-1/2 right-3 h-1 w-1 -translate-y-1/2 rounded-full bg-black/50" />
        </div>
      ))}
    </div>
  );
}

/**
 * A clipboard off the hook by the office door.
 *
 * The back-of-house surfaces — your keys, the commissioner's office — are
 * paperwork, so they look like paperwork: hardboard, a steel clip, and a sheet
 * that has been photocopied more than once. It keeps those screens inside the
 * shop instead of dropping into a settings panel from a different application.
 */
export function Clipboard({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: string;
  children: React.ReactNode;
}) {
  const board = resolveAsset('surface_clipboard_blank');

  // With art registered, the sheet is the drawn clipboard and the text is laid
  // into its safe area — the region the surface was authored to keep flat and
  // even so rendered type stays legible on it (`prompts/surface.md`). Nothing
  // is baked in: the clipboard is blank and every word on it comes from the
  // database at request time.
  if (board.kind === 'art') {
    return (
      <div className="relative mx-auto w-full max-w-[19rem]">
        <AssetView resolution={board} className="drop-shadow-[0_8px_16px_rgba(0,0,0,0.55)]" />
        {/*
          * The paper inside the drawn clipboard, measured off the processed
          * asset rather than guessed: the sheet runs 16%-87% across and
          * 17%-81% down the canvas, and the rest is board, clip and the
          * transparent margin around it.
          */}
        <div className="absolute inset-x-[18%] top-[19%] bottom-[21%] overflow-y-auto text-ink-900">
          <div className="mb-2 flex items-baseline justify-between gap-3 border-b border-dashed border-ink-300 pb-1.5">
            <h2 className="font-mono text-[10px] font-bold tracking-[0.18em] uppercase">
              {title}
            </h2>
            {aside !== undefined && (
              <span className="font-mono text-[9px] tracking-wide text-ink-500">{aside}</span>
            )}
          </div>
          {children}
        </div>
      </div>
    );
  }

  return (
    <div className="relative rounded-[4px] bg-[#3b2b22] p-2 shadow-[0_8px_20px_rgba(0,0,0,0.55)]">
      {/* The steel clip. */}
      <div
        aria-hidden="true"
        className="absolute -top-2 left-1/2 h-4 w-16 -translate-x-1/2 rounded-[2px] bg-gradient-to-b from-ink-100/70 to-ink-300/40 shadow-[0_2px_4px_rgba(0,0,0,0.6)]"
      />
      <div className="rounded-[2px] bg-paper-white px-3.5 pt-5 pb-4 text-ink-900 shadow-[inset_0_1px_0_rgba(0,0,0,0.08)]">
        <div className="mb-3 flex items-baseline justify-between gap-3 border-b border-dashed border-ink-300 pb-2">
          <h2 className="font-mono text-[11px] font-bold tracking-[0.2em] text-ink-900 uppercase">
            {title}
          </h2>
          {aside !== undefined && (
            <span className="font-mono text-[10px] tracking-wide text-ink-500">{aside}</span>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The back of the room
// ---------------------------------------------------------------------------

/**
 * Booths, receding into the dark, with the chairs still up on the tables.
 *
 * `16 §7.4` keeps eliminated managers in the booths rather than deleting them.
 * In the offseason there is nobody to seat, and an empty room in July is the
 * point — the shop is closed, and it looks closed.
 */
export function Booths() {
  return (
    <div aria-hidden="true" className="relative h-24 overflow-hidden">
      {[
        { left: '2%', width: '30%', scale: 1, dim: 'opacity-90' },
        { left: '35%', width: '26%', scale: 0.86, dim: 'opacity-70' },
        { left: '64%', width: '22%', scale: 0.74, dim: 'opacity-55' },
      ].map((booth) => (
        <div
          key={booth.left}
          className={`absolute bottom-0 ${booth.dim}`}
          style={{ left: booth.left, width: booth.width }}
        >
          {/* Seat backs. */}
          <div
            className="mx-auto rounded-t-[4px] bg-red-dark shadow-[inset_0_6px_10px_rgba(0,0,0,0.5)]"
            style={{ height: `${String(46 * booth.scale)}px` }}
          />
          <div className="surface-check h-1.5 w-full opacity-70" />
          {/* Table, chairs up. */}
          <div className="mx-auto h-1.5 w-3/4 bg-wood-mid shadow-[0_2px_4px_rgba(0,0,0,0.6)]" />
          <div className="mx-auto h-5 w-1 bg-wood-dark" />
        </div>
      ))}
    </div>
  );
}

/** The arcade cabinet in the corner, still running its attract loop. */
export function ArcadeCabinet({ className = '' }: { className?: string }) {
  // No `relative` here: the caller positions it, and shipping both `relative`
  // and `absolute` in one class list leaves the winner to stylesheet order
  // rather than to intent — which put the cabinet on the wrong side of the room.
  return (
    <div aria-hidden="true" className={`w-16 ${className}`}>
      <div className="h-3 rounded-t-[3px] bg-violet-deep" />
      <div className="relative h-10 bg-ink-700 shadow-[inset_0_0_10px_rgba(0,0,0,0.7)]">
        <div className="anim-arcade absolute inset-1.5 rounded-[2px] bg-gradient-to-br from-magenta-neon/70 via-blue-neon/50 to-violet-deep shadow-[0_0_14px_3px_rgba(224,96,176,0.35)]" />
      </div>
      <div className="h-2 bg-red-dark" />
      <div className="h-8 bg-ink-700" />
    </div>
  );
}
