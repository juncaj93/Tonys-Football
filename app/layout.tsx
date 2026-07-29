import type { Metadata, Viewport } from 'next';

/*
 * The shop's two typefaces, self-hosted.
 *
 * The room is pixel art and the words on top of it were San Francisco, which
 * is the typeface of the phone rather than of the place — the single loudest
 * thing left saying "native app" once the panels stopped being cards.
 *
 * **Silkscreen** is the signage: headings, enamel plates, buttons, the utility
 * bar. Blocky, small, drawn on a grid.
 *
 * **VT323** carries everything that is read rather than glanced at — Tony's
 * dialogue, the notices, the receipt. It is monospaced, which the receipt needs
 * to keep its columns, and it is a terminal face rather than a UI face, so a
 * paragraph of it reads as something a machine in the corner printed.
 *
 * Both are OFL and installed from npm rather than fetched from a CDN: the
 * files are bundled and served from this origin, so there is no third-party
 * request, nothing to block, and no flash of a fallback while a font loads
 * from somewhere else.
 */
import '@fontsource/silkscreen/400.css';
import '@fontsource/silkscreen/700.css';
import '@fontsource/vt323/400.css';

import './globals.css';

export const metadata: Metadata = {
  title: "Tony's Pizza Fantasy",
  description: 'A private clubhouse that remembers.',
  // The site is private. Nothing here should ever be indexed.
  robots: { index: false, follow: false, nocache: true },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Extend under the notch and home indicator; `env(safe-area-inset-*)` then
  // does the real work in layout.
  viewportFit: 'cover',
  // Do NOT set maximumScale or userScalable — pinch-zoom must remain available.
  themeColor: '#1a1214',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
