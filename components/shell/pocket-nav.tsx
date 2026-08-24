'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { TYPE } from '@/lib/design/type';

const destinations = [
  { href: '/', label: 'Home', icon: 'home', matches: (path: string) => path === '/' },
  { href: '/slice', label: 'Slice', icon: 'slice', matches: (path: string) => path.startsWith('/slice') },
  { href: '/counter', label: 'Boxes', icon: 'box', matches: (path: string) => path.startsWith('/counter') },
  { href: '/rooms', label: 'Room', icon: 'room', matches: (path: string) => path.startsWith('/rooms') || path.startsWith('/profile') },
  { href: '/underground', label: 'Games', icon: 'cards', matches: (path: string) => path.startsWith('/underground') },
] as const;

type PocketIcon = (typeof destinations)[number]['icon'];

/**
 * Five tiny glyphs drawn directly on the same hard pixel grid as the rest of
 * the game. These are wayfinding objects — house, slice, box, room and cards —
 * rather than keyboard initials dressed up as a toolbar.
 */
function PocketGlyph({ icon }: { icon: PocketIcon }) {
  const common = { fill: 'currentColor' };

  switch (icon) {
    case 'home':
      return <svg viewBox="0 0 16 16" aria-hidden="true"><path {...common} d="M1 7h2v-2h2V3h2V1h2v2h2v2h2v2h2v2h-2v6h-4v-4H6v4H2V9H0V7h1Z" /></svg>;
    case 'slice':
      return <svg viewBox="0 0 16 16" aria-hidden="true"><path {...common} d="M2 2h10v2h2v8h-2v2H4v-2H2V2Zm3 3v2h2V5H5Zm4 2v2h2V7H9Zm-3 3v2h2v-2H6Z" /></svg>;
    case 'box':
      return <svg viewBox="0 0 16 16" aria-hidden="true"><path {...common} d="M1 4h2V2h10v2h2v10h-2v2H3v-2H1V4Zm3 2v6h8V6H4Zm2 1h4v2H6V7Z" /></svg>;
    case 'room':
      return <svg viewBox="0 0 16 16" aria-hidden="true"><path {...common} d="M1 2h14v11h-2v2h-2v-2H5v2H3v-2H1V2Zm2 3v5h10V5H3Zm2 1h2v2H5V6Zm4 0h2v2H9V6Z" /></svg>;
    case 'cards':
      return <svg viewBox="0 0 16 16" aria-hidden="true"><path {...common} d="M1 3h9v2h2v2h2v7h-2v2H5v-2H3V5H1V3Zm4 4v5h7V7H5Zm2 1h2v1h1v2H9v1H7v-1H6V9h1V8Z" /></svg>;
  }
}

/**
 * The pocket menu is deliberately a short, physical-looking rail instead of a
 * browser-shaped tab bar. It is fixed to Safari's visual viewport, above both
 * the home indicator and the expanded URL controls, so an interior can never
 * strand its exit below browser chrome.
 */
export function PocketNav() {
  const pathname = usePathname();

  // Staff and draft-review surfaces already have their own dense, task-specific
  // controls. The pocket rail is for the public clubhouse; rendering it over a
  // commissioner worksheet would make both surfaces worse.
  if (pathname.startsWith('/admin') || pathname.startsWith('/door') || pathname.startsWith('/dev')) {
    return null;
  }

  return (
    <nav aria-label="Pocket menu" className="pocket-nav">
      <div className="pocket-nav__rail pixel-edge">
        {destinations.map((destination) => {
          const active = destination.matches(pathname);

          return (
            <Link
              key={destination.href}
              href={destination.href}
              aria-current={active ? 'page' : undefined}
              className={`pocket-nav__item ${TYPE.eyebrow} ${active ? 'pocket-nav__item--active' : ''}`}
            >
              <span aria-hidden="true" className="pocket-nav__glyph"><PocketGlyph icon={destination.icon} /></span>
              <span>{destination.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
