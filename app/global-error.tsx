'use client';

import { PixelPanel, PanelHeading, SignPlate } from '@/components/scene/panel';
import { TAP_TARGET } from '@/components/shell';
import { TYPE } from '@/lib/design/type';

import './globals.css';

/**
 * The last thing standing.
 *
 * `app/error.tsx` catches a failure *inside* the shop. This catches a failure in
 * the root layout itself — the one case where there is no shop to draw, because
 * the thing that draws it is what threw. Next replaces the entire document here,
 * so this file supplies its own `<html>` and `<body>`, and imports the
 * stylesheet the layout would otherwise have brought.
 *
 * ## It uses the type case like everything else
 *
 * An earlier draft wrote every size inline, on the reasoning that a boundary
 * should not depend on the thing that failed. That reasoning does not survive
 * being checked: what fails here is the layout **component**, not the
 * stylesheet, which Next links into the document for this route independently.
 * So there is nothing to be gained by hand-sizing, and a great deal to lose —
 * `lib/design/typography.test.ts` exists because sixteen font sizes accumulated
 * across two hundred call sites exactly this way, one reasonable exception at a
 * time. `TEXT_SURFACE_BOUNDARY §8` keeps the exemption list at one entry
 * deliberately, and this is not a second one.
 *
 * If the stylesheet genuinely were missing, this degrades to browser defaults —
 * a paragraph and two controls, unstyled but legible and operable, which is the
 * whole job.
 *
 * It should be almost impossible to reach: the root layout fetches nothing and
 * computes nothing. It is here so that the one time it happens, a manager sees a
 * sentence and a way back rather than
 * `Application error: a client-side exception has occurred`.
 */
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">
        <main
          className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-8"
          data-error-boundary="global"
        >
          <PixelPanel tone="paper" className="px-4 pt-4 pb-5">
            <SignPlate tone="red">Back in a moment</SignPlate>

            <PanelHeading>Tony&rsquo;s is shut for a second</PanelHeading>

            <p className={`mt-3 ${TYPE.body} text-ink-700`}>
              Nothing you have is lost. Try that again, or go back through to the
              shop.
            </p>

            <button
              type="button"
              onClick={reset}
              data-error-retry
              className={`pixel-edge mt-5 flex w-full ${TAP_TARGET} min-h-[52px] items-center justify-center border-2 border-ink-900 bg-amber-mid px-4 ${TYPE.action} text-ink-900 active:translate-y-px`}
            >
              Try that again
            </button>

            {/*
              * A real anchor rather than `<Link>`, and the lint rule is
              * suppressed deliberately rather than worked around.
              *
              * `<Link>` navigates through the client router, and this boundary
              * renders when the tree that owns the router has failed. A full
              * document load is the one navigation that cannot depend on the
              * thing that is broken — which is the entire job of this file.
              * Prefetching, the rule's other benefit, is worthless on a screen
              * nobody should ever see.
              */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/"
              data-error-home
              className={`pixel-edge mt-3 flex w-full ${TAP_TARGET} min-h-[52px] items-center justify-center border-2 border-wood-dark bg-paper-mid px-4 ${TYPE.action} text-ink-900 active:translate-y-px`}
            >
              Back to the parlor
            </a>
          </PixelPanel>
        </main>
      </body>
    </html>
  );
}
