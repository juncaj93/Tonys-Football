import type { Metadata, Viewport } from 'next';

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
