'use client';

import { useEffect, useId, useRef } from 'react';

import { TYPE } from '@/lib/design/type';

/**
 * What a room object opens into. One implementation, two materials.
 *
 * ## Why this exists
 *
 * There were two of these, written a milestone apart and diverging quietly.
 * `Sheet` in `room-object.tsx` and `ChampionPanel` in `banner-rail.tsx` both
 * built a fixed full-screen layer, a scrim, a focus-trapped `role="dialog"`, a
 * `useId` heading and an Escape handler — and disagreed on the scrim's opacity
 * (0.60 against 0.55), the outer padding (`px-4` against `p-6`), the maximum
 * width (312px against 300px) and the close control. None of those differences
 * was a decision; they are what two hands produce given the same brief.
 *
 * That is `MANDATE §6`'s *"deliberate placement"* failing quietly: a manager who
 * taps the receipt and then a banner gets two panels that land in slightly
 * different places, and nothing in the build notices.
 *
 * ## The slots
 *
 * The contract is presentation only. A caller supplies **what the words are**;
 * this supplies **where they sit and how they behave**.
 *
 *   title      the masthead — one short line, always the display face
 *   children   the content
 *   actions    the foreground row, if the panel leads anywhere
 *   material   which of the room's two surfaces this is made of
 *
 * It owns the scrim, the placement, the sizing, the focus, the Escape key, the
 * dismissal and the accessible naming. It owns **no** data, routing,
 * permissions, ownership, statistics or navigation — a caller that needs a link
 * puts a link in `actions`, and this never learns where it goes. That is what
 * lets the room's material be redesigned without touching a single domain
 * module.
 *
 * ## Two materials, because the room has two surfaces
 *
 * `paper` is the cream order-pad stock every printed surface in the shop is made
 * of. `enamel` is the dark panel the champion banner opens into, which reads as
 * the wall the banners hang on rather than as something printed. Both are the
 * shop's own palette with pixel-aligned borders; neither is a default dialog.
 *
 * ## It is centred in the viewport, not in the room
 *
 * The room is `max-w-[430px]` and centred, so at every supported width the two
 * are the same column — but a panel is a thing you are holding, not a thing at a
 * coordinate in the shell, and pinning it to the artwork would make it drift the
 * day the shell's maximum width changes.
 */

export type PanelMaterial = 'paper' | 'enamel';

const MATERIAL: Record<PanelMaterial, { readonly panel: string; readonly heading: string; readonly rule: string }> = {
  paper: {
    /*
     * `on-paper` re-points the rarity slots at inks mixed for a light ground
     * (`globals.css`, Rarity), so a `.rarity-*` anywhere inside this panel
     * inherits them.
     *
     * **It was missing, and the visual gate found it the first time a paper
     * panel ever printed a rarity word** — the basement's slot panel, at
     * `common`, **1.54:1** against cream. `PixelPanel`'s own `paper` tone has
     * carried `on-paper` since the Collection shipped an invisible LEGENDARY
     * row; this panel was written a milestone later and did not, and nothing
     * noticed because no caller had put a tier in one.
     *
     * That is the same defect twice, on two surfaces, found by the same gate —
     * which is the argument for the gate running everywhere rather than on the
     * state it was written for.
     */
    panel: 'on-paper border-wood-dark bg-paper-mid text-ink-900',
    heading: 'text-ink-700',
    rule: 'bg-amber-mid/45',
  },
  enamel: {
    panel: 'border-amber-mid bg-ink-900 text-paper-mid',
    heading: 'text-amber-mid',
    rule: 'bg-amber-mid/45',
  },
};

export function RoomPanel({
  title,
  material = 'paper',
  onClose,
  actions,
  children,
}: {
  /** One short line, in the display face. The panel's accessible name. */
  title: string;
  material?: PanelMaterial | undefined;
  onClose: () => void;
  /** The foreground row: where this panel leads, if anywhere. */
  actions?: React.ReactNode | undefined;
  children: React.ReactNode;
}) {
  const headingId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const skin = MATERIAL[material];

  useEffect(() => {
    panel.current?.focus();

    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      {/*
        * Putting the thing down again. Deliberately not a button and not in the
        * tab order: the panel already has a real Close control and Escape.
        */}
      <div aria-hidden="true" onClick={onClose} className="absolute inset-0 bg-ink-900/60" />

      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        tabIndex={-1}
        data-room-panel={material}
        className={`panel-rise pixel-edge relative w-full max-w-[19.5rem] border-2 outline-none ${skin.panel}`}
      >
        <span aria-hidden="true" className={`absolute inset-x-0 top-0 h-[2px] ${skin.rule}`} />

        <div className="flex items-start justify-between gap-3 px-3.5 pt-3.5 pb-2.5">
          <h2 id={headingId} className={`${TYPE.eyebrow} ${skin.heading}`}>
            {title}
          </h2>
          {/*
            * A pixel cross, not a labelled button. The panel is small enough
            * that a word-sized `CLOSE` control was the second-loudest thing in
            * it; Escape and the scrim do the same job without the furniture.
            * 44px of hit area around a 12px mark.
            */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mt-2.5 -mr-2 flex h-11 w-11 shrink-0 items-center justify-center active:translate-y-px"
          >
            <span aria-hidden="true" className="relative block h-3 w-3 opacity-70">
              <span className={`absolute top-1/2 left-0 h-[2px] w-full rotate-45 ${material === 'paper' ? 'bg-ink-700' : 'bg-paper-mid'}`} />
              <span className={`absolute top-1/2 left-0 h-[2px] w-full -rotate-45 ${material === 'paper' ? 'bg-ink-700' : 'bg-paper-mid'}`} />
            </span>
          </button>
        </div>

        <div
          className="max-h-[52dvh] overflow-y-auto px-3.5 pb-4"
          // The home-indicator gutter. Half of it, because the panel is centred
          // rather than pinned to the bottom edge — it needs clearance, not the
          // whole inset.
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) * 0.5 + 1rem)' }}
        >
          {children}
          {actions !== undefined && <div className="mt-4 flex items-center gap-3">{actions}</div>}
        </div>
      </div>
    </div>
  );
}
