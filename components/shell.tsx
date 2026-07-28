import Link from 'next/link';

/**
 * The room's furniture: the page shell, the zone tile, and the bottom nav.
 *
 * Every measurement here is a phone measurement. `16 §4.2` and the handoff both
 * make iPhone Safari the primary platform, so:
 *
 *   - tap targets are at least 44px, always
 *   - the page uses `dvh`, not `vh`, so Safari's collapsing toolbar cannot
 *     crop the last row
 *   - `env(safe-area-inset-*)` keeps content clear of the notch and the home
 *     indicator
 *   - nothing depends on hover; every affordance is visible at rest
 *   - the bottom nav sits within thumb reach, which is why it is at the bottom
 */

/** The minimum comfortable tap target. Used as a class, never as a guess. */
export const TAP_TARGET = 'min-h-[44px] min-w-[44px]';

export function Page({
  children,
  withNav = true,
}: {
  children: React.ReactNode;
  withNav?: boolean;
}) {
  return (
    <div
      className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col"
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        // Clearance for the fixed nav plus the home indicator beneath it.
        paddingBottom: withNav
          ? 'calc(env(safe-area-inset-bottom) + 5.5rem)'
          : 'calc(env(safe-area-inset-bottom) + 1.5rem)',
      }}
    >
      {children}
    </div>
  );
}

/**
 * One zone of the parlor.
 *
 * `16 §7.1`: the six zones are authored as **discrete tiles, never one wide
 * background**. Mobile stacks them full-width; desktop composes them into a
 * scene. Same component, same assets, no scaling down — which is why the tile
 * carries its own frame rather than being a crop of something larger.
 */
export function Zone({
  title,
  aside,
  children,
  className = '',
  tone = 'paper',
}: {
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  tone?: 'paper' | 'dark' | 'counter';
}) {
  const tones = {
    paper: 'bg-paper-mid text-ink-900 shadow-[0_2px_0_var(--color-wood-dark)]',
    dark: 'bg-ink-700 text-paper-mid shadow-[0_2px_0_#000]',
    counter: 'bg-wood-mid text-paper-white shadow-[0_3px_0_var(--color-wood-dark)]',
  } as const;

  return (
    <section
      className={`relative overflow-hidden rounded-sm border border-wood-dark ${tones[tone]} ${className}`}
    >
      <header className="flex items-baseline justify-between gap-3 border-b border-wood-dark/40 px-4 py-2.5">
        <h2 className="font-mono text-[11px] font-bold tracking-[0.18em] uppercase opacity-80">
          {title}
        </h2>
        {aside !== undefined && (
          <span className="font-mono text-[11px] tracking-wide opacity-60">{aside}</span>
        )}
      </header>
      <div className="px-4 py-4">{children}</div>
    </section>
  );
}

/**
 * A door that is visibly closed.
 *
 * The handoff is explicit that tokens, collectibles, the Slice, basements and
 * the casino are out of V1 and that **their doors exist and are visibly
 * closed**. An empty page reads as broken; a door with a sign on it reads as a
 * shop that is not finished yet, which is the truth (`05 §8.5`).
 */
export function ClosedDoor({
  what,
  note,
}: {
  what: string;
  note: string;
}) {
  return (
    <div className="border-2 border-dashed border-wood-light/50 bg-ink-700/40 px-5 py-8 text-center">
      <p className="font-mono text-[11px] tracking-[0.2em] text-amber-mid uppercase">Closed</p>
      <p className="mt-2 text-lg font-semibold text-paper-white">{what}</p>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink-100">{note}</p>
    </div>
  );
}

interface NavItem {
  readonly href: string;
  readonly label: string;
  /** Registry slug for the icon that lands with batch B4. */
  readonly iconSlug: string;
  readonly open: boolean;
}

/**
 * `16 §7.1`: "sticky bottom nav of four — Parlor · Slice · Collection · Rooms.
 * Zones are the flavour; the nav is the guarantee."
 *
 * Three of the four are closed in V1 and say so. They are still navigable,
 * because a nav item that does nothing when tapped is indistinguishable from a
 * broken one.
 *
 * Labels carry the meaning. The `ui_icon_*` slugs exist in the registry but
 * every one resolves to a placeholder until batch B4, and a row of taped-up
 * cardboard signs in the navigation would read as damage rather than as
 * character (`17 §13`).
 */
const NAV: readonly NavItem[] = [
  { href: '/', label: 'Parlor', iconSlug: 'ui_icon_parlor', open: true },
  { href: '/slice', label: 'Slice', iconSlug: 'ui_icon_slice', open: false },
  { href: '/collection', label: 'Collection', iconSlug: 'ui_icon_collection', open: false },
  { href: '/rooms', label: 'Rooms', iconSlug: 'ui_icon_rooms', open: false },
];

export function BottomNav({ current }: { current: string }) {
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-wood-dark bg-ink-900/95 backdrop-blur"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="mx-auto flex w-full max-w-5xl">
        {NAV.map((item) => {
          const active = item.href === current;
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`flex ${TAP_TARGET} min-h-[3.5rem] flex-col items-center justify-center gap-0.5 px-1 text-center transition-colors active:bg-ink-700 ${
                  active ? 'text-amber-glow' : 'text-ink-100'
                }`}
              >
                <span className="text-[13px] leading-none font-semibold">{item.label}</span>
                <span
                  className={`text-[10px] leading-none ${active ? 'text-amber-mid' : 'text-ink-300'}`}
                >
                  {item.open ? '·' : 'closed'}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
