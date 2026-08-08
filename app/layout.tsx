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
 * **Micro 5** is the Tonight board, and choosing it was two decisions in a row.
 *
 * The board needed far more letter than Silkscreen can give it. Its text field
 * is 107 shell units — **120.4 CSS px at 360** — and Silkscreen is drawn on a
 * grid that spends its width on air: at the only size `WEEK ONE` fits, it gives
 * **13px capitals**, which is why the board read as the quietest object in the
 * room.
 *
 * A smooth condensed face measured much better and was **rejected on sight**.
 * Big Shoulders Display gives 28px capitals in the same width, and the board
 * built with it looked like a modern poster pasted into a pixel-art room —
 * commissioner ruling, 2026-08-08: Slice-level hierarchy, executed in Tony's
 * pixel-art language.
 *
 * So the search was re-run over pixel faces only. Handjet is the tallest at 25px
 * capitals but draws in one-pixel strokes — tall and *thin*, the opposite of
 * dominant. Pixelify Sans wraps `WEEK ONE` onto two lines before it gets big
 * enough. Jacquard 12 is blackletter. Micro 5 is the heaviest condensed pixel
 * face that fits: **17px capitals at 37px**, a third taller than the incumbent
 * and far heavier in stroke, and unmistakably native to the room.
 *
 * **One weight, and that is the whole file.** Micro 5 ships a single weight, so
 * there is nothing to choose and nothing to synthesise.
 *
 * All three faces are OFL and installed from npm rather than fetched from a
 * CDN: the files are bundled and served from this origin, so there is no
 * third-party request, nothing to block, and no flash of a fallback while a
 * font loads from somewhere else.
 */
/*
 * **No `.css` on this one, and that is the package rather than a slip.**
 * `@fontsource/micro-5` maps `"./*"` to `"./*.css"` and — unlike `silkscreen`
 * and `vt323` — declares no `"./*.css"` entry beside it, so the spelling used on
 * the lines below resolves to `index.css.css` and fails the build. Making it
 * consistent with its neighbours is the obvious edit and it does not compile.
 */
import '@fontsource/micro-5';
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
