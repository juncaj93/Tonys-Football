import Link from 'next/link';

import { PixelPanel, PanelHeading, SignPlate } from '@/components/scene/panel';
import { Page, TAP_TARGET } from '@/components/shell';
import { TYPE } from '@/lib/design/type';

/**
 * A door that is not there.
 *
 * ## The 404 is intentional and stays a 404
 *
 * `requireAdmin()` answers `notFound()` rather than a 403 so that a manager
 * probing `/admin` learns nothing about whether it exists, and `/rooms/[userId]`
 * does the same so that probing addresses teaches nothing about who plays. That
 * is a **security decision** and this file does not touch it: rendering a
 * `not-found` boundary changes what is drawn, never the status code, and the
 * response is still `404` for every caller.
 *
 * What was wrong was only the drawing. Next's built-in fallback is
 *
 *     404 · This page could not be found.
 *
 * in black on `#fff`, with no link on it. In a product that is a dark pixel-art
 * pizza parlor, a manager who taps a room they cannot visit, or opens a bookmark
 * from a Safari tab restored three weeks later, got a white screen belonging to
 * a different application and **no way back** — the definition of stranded.
 *
 * ## It says the same thing to everyone
 *
 * A commissioner-only address and a mistyped one produce identical text. That is
 * the point of answering `notFound()` in the first place, and a helpful *"you
 * are not the commissioner"* here would give away exactly what the 404 was
 * chosen to withhold.
 */
export default function NotFound() {
  return (
    <Page>
      <main
        className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-8"
        data-not-found=""
      >
        <PixelPanel tone="paper" className="px-4 pt-4 pb-5">
          <SignPlate tone="cream">No such door</SignPlate>

          <PanelHeading>Tony doesn&rsquo;t have that one</PanelHeading>

          <p className={`mt-3 ${TYPE.body} text-ink-700`}>
            Whatever used to be here, it isn&rsquo;t. The shop is where it always
            was.
          </p>

          <Link
            href="/"
            data-not-found-home
            className={`pixel-edge mt-5 flex w-full ${TAP_TARGET} min-h-[52px] items-center justify-center border-2 border-wood-dark bg-amber-mid px-4 ${TYPE.action} text-ink-900 active:translate-y-px`}
          >
            Back to the parlor
          </Link>
        </PixelPanel>
      </main>
    </Page>
  );
}
