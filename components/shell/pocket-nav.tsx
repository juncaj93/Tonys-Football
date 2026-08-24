'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { TYPE } from '@/lib/design/type';

const destinations = [
  { href: '/', label: 'Home', glyph: 'H', matches: (path: string) => path === '/' },
  { href: '/slice', label: 'Slice', glyph: 'S', matches: (path: string) => path.startsWith('/slice') },
  { href: '/counter', label: 'Boxes', glyph: 'B', matches: (path: string) => path.startsWith('/counter') },
  { href: '/rooms', label: 'Room', glyph: 'R', matches: (path: string) => path.startsWith('/rooms') || path.startsWith('/profile') },
  { href: '/underground', label: 'Games', glyph: 'G', matches: (path: string) => path.startsWith('/underground') },
] as const;

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
  if (pathname.startsWith('/admin') || pathname.startsWith('/door') || pathname.startsWith('/dev') || pathname.startsWith('/underground')) {
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
              <span aria-hidden="true" className="pocket-nav__glyph">{destination.glyph}</span>
              <span>{destination.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
