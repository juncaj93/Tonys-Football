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
 * **Big Shoulders Display** is the Tonight board, and it is the one place in
 * this product deliberately *not* set in a pixel face. The board is a printed
 * sign hanging in the room rather than part of the room's artwork, so it takes
 * the Slice's editorial logic instead of the shell's.
 *
 * It was chosen by measurement against the board's real field, not by eye. The
 * field is 107 units — **120.4 CSS px at 360**, the narrowest phone supported —
 * and the question is how tall `WEEK ONE` can be while still fitting it:
 *
 * | face | largest fitting size | cap height |
 * |---|---|---|
 * | Silkscreen (incumbent) | 20 | 13 |
 * | Barlow Condensed | 31 | 21 |
 * | Oswald | 29 | 24 |
 * | Saira Extra Condensed | 36 | 25 |
 * | **Big Shoulders Display** | **35** | **28** |
 *
 * Silkscreen is drawn on a grid and spends its width on air; at the only size
 * that fits it gives 13px capitals, which is why the board read as quiet. Big
 * Shoulders gives **28px capitals in the same 120px** — more than twice the
 * letter, same board.
 *
 * **500 and 700 only.** The board sets exactly two lines, one weight each;
 * shipping the other seven would be shipping bytes nothing renders.
 *
 * All three faces are OFL and installed from npm rather than fetched from a
 * CDN: the files are bundled and served from this origin, so there is no
 * third-party request, nothing to block, and no flash of a fallback while a
 * font loads from somewhere else.
 */
/*
 * **No `.css` on these two, and that is the package rather than a slip.**
 * `@fontsource/big-shoulders-display` maps `"./*"` to `"./*.css"` and — unlike
 * `silkscreen` and `vt323` — declares no `"./*.css"` entry beside it, so the
 * spelling used on the lines below resolves to `500.css.css` and fails the
 * build. Adding the extension back for consistency is the obvious edit and it
 * does not compile.
 */
import '@fontsource/big-shoulders-display/500';
import '@fontsource/big-shoulders-display/700';
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
