'use client';

import Link from 'next/link';

import { PixelPanel, PanelHeading, SignPlate } from '@/components/scene/panel';
import { Page, TAP_TARGET } from '@/components/shell';
import { TYPE } from '@/lib/design/type';

/**
 * When something goes wrong, the manager is still in a pizza parlor.
 *
 * ## There was no error boundary anywhere in this application
 *
 * Not at the root, not on a segment. Next's fallback is what a manager got, and
 * on a production build it is one line of grey text on white:
 *
 *     Application error: a client-side exception has occurred
 *     (see the browser console for more information)
 *
 * No heading, no link, no gesture — and *"see the browser console"* on an iPhone
 * is an instruction to nobody. The parlor is a dark room in pixel art; this
 * arrived as a white screen with a sentence about a console on it, and the only
 * way out was to retype the URL.
 *
 * It was reachable by ordinary means. A dropped request during a server action
 * put every mutation surface here — measured, on the real build, at 390px.
 * `lib/reliability/attempt.ts` is the repair for that specific path; **this is
 * the floor underneath it**, and the two are deliberately not the same
 * mechanism: `attempt` keeps a manager's work by never leaving the screen, and
 * this catches everything nobody predicted, including the next defect.
 *
 * ## Two ways out, and the first one is free
 *
 * `reset()` re-renders the segment without a reload — for a transient failure,
 * which is what a phone mostly produces, the manager taps once and is back where
 * they were with their place kept. The parlor link is the guarantee that they
 * are never stranded, and it is a plain link so it works even if the router is
 * the thing that is broken.
 *
 * ## What it deliberately does not do
 *
 * **No error text, no digest, no stack.** A digest is a server-log correlation
 * id; printing it here would put a hex string in front of a manager who cannot
 * use it, on the one screen where confidence matters most. Nothing here is
 * actionable to a league member except *try again* and *go back to the shop*, so
 * nothing else is offered.
 *
 * **No automatic retry.** A boundary that re-ran itself would loop invisibly on
 * a persistent failure and turn one bad screen into a hot phone.
 */
export default function ParlorError({ reset }: { error: Error; reset: () => void }) {
  return (
    <Page>
      <main
        className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-8"
        data-error-boundary="segment"
      >
        <PixelPanel tone="paper" className="px-4 pt-4 pb-5">
          <SignPlate tone="red">Back in a moment</SignPlate>

          <PanelHeading>Tony dropped something</PanelHeading>

          <p className={`mt-3 ${TYPE.body} text-ink-700`}>
            He is picking it up. Nothing you have is lost — try that again, or go
            back through to the shop.
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
            * A plain link, not `router.push`. If the client router is what
            * failed, a navigation through it fails too — and this is the control
            * that must not have a way of not working.
            */}
          <Link
            href="/"
            data-error-home
            className={`pixel-edge mt-3 flex w-full ${TAP_TARGET} min-h-[52px] items-center justify-center border-2 border-wood-dark bg-paper-mid px-4 ${TYPE.action} text-ink-900 active:translate-y-px`}
          >
            Back to the parlor
          </Link>
        </PixelPanel>
      </main>
    </Page>
  );
}
