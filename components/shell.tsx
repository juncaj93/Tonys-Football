import Link from 'next/link';

/**
 * The page shell and the navigation.
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
 *   - the nav sits at the bottom, within thumb reach
 */

/** The minimum comfortable tap target. Used as a class, never as a guess. */
export const TAP_TARGET = 'min-h-[44px] min-w-[44px]';

/**
 * The room's width.
 *
 * Narrow enough that a phone gets the whole space edge to edge, wide enough
 * that a desktop composes the counter, the board, the rack and the case into a
 * scene rather than a column (`16 §7.1`). The lighting layer behind it fills
 * the viewport either way, so the room never ends at a hard edge.
 */
export function Page({
  children,
  withNav = true,
}: {
  children: React.ReactNode;
  withNav?: boolean;
}) {
  return (
    <div
      className="relative mx-auto flex min-h-dvh w-full max-w-3xl flex-col shadow-[0_0_80px_rgba(0,0,0,0.6)]"
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
 * Built as part of the room rather than as a tab bar: a strip of enamel signage
 * screwed along the bottom of the wall, lit from the counter, with the current
 * room's plate glowing. Three of the four are shut in V1 and say so — a nav
 * item that does nothing when tapped is indistinguishable from a broken one, so
 * each still leads somewhere and explains itself when it gets there.
 *
 * Labels carry the meaning. The `ui_icon_*` slugs exist in the registry but
 * every one resolves to a placeholder until batch B4.
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
      className="fixed inset-x-0 bottom-0 z-40 border-t-2 border-wood-dark bg-gradient-to-b from-[#241a1c] to-ink-900"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {/* The strip catches a little of the counter light along its top edge. */}
      <div aria-hidden="true" className="h-px w-full bg-amber-glow/25" />

      <ul className="mx-auto flex w-full max-w-3xl">
        {NAV.map((item) => {
          const active = item.href === current;
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`relative flex ${TAP_TARGET} min-h-[3.5rem] flex-col items-center justify-center gap-1 px-1 text-center transition-colors active:bg-wood-dark/40`}
              >
                <span
                  className={`text-[13px] leading-none font-semibold ${
                    active ? 'neon-warm' : 'text-paper-mid/80'
                  }`}
                >
                  {item.label}
                </span>
                <span
                  className={`font-mono text-[9px] leading-none tracking-[0.12em] uppercase ${
                    active ? 'text-amber-mid/90' : 'text-ink-300'
                  }`}
                >
                  {item.open ? 'open' : 'shut'}
                </span>
                {active && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-4 bottom-1 h-0.5 rounded-full bg-amber-glow shadow-[0_0_8px_2px_rgba(255,217,138,0.5)]"
                  />
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
