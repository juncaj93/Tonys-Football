'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';

import { openBoxAction, type RevealPayload } from '@/app/actions/counter';
import { RoomDoor, roomObjectAttributes } from '@/components/scene/room-object';
import { AssetView } from '@/lib/assets/placeholder';
import { type AssetResolution } from '@/lib/assets/types';
import {
  TRAY_BOX,
  TRAY_REVEAL,
  place,
  placePlate,
  type RoomObjectSpec,
} from '@/lib/parlor/objects';

/**
 * The tray, and the moment.
 *
 * ## One object, two behaviours
 *
 * The tray is a **Door**. With nothing on it, it goes to `/counter` — the route
 * for browsing stock. With a box on it, tapping **opens the box where it sits**.
 *
 * `18 §4.1` is unusually direct about why: *"Routing to `/counter` first inserts
 * a navigation step into the most exciting moment in the product. The route is
 * for browsing; the tray is for the moment."* So the owned state does not link
 * anywhere, and there is no ninth object — the box is a state of the tray, and
 * the same single hit region takes the tap either way (`objects.ts`).
 *
 * ## The client decides nothing
 *
 * It sends a box id. The server rolls, records and returns. There is no reward
 * table in this bundle and no way for the browser to influence the outcome
 * (`18 §4.3`). What arrives back includes the already-resolved asset, so even the
 * art reference stays a server-side registry lookup.
 *
 * ## The sequence, and why each beat is the length it is
 *
 * ```
 *   tap        the box shudders — something is happening, and it is happening
 *              to the box, on the tray, not to a new screen
 *   1100ms     minimum anticipation. Long enough to be a beat, short enough
 *              that a manager opening their fourth box is not being taxed
 *   then       the collectible rises out of the box and the plate is set down
 * ```
 *
 * The reveal waits for **both** the beat and the server's answer, whichever is
 * slower. A fast answer still gets its moment; a slow one never truncates it.
 *
 * **Skippable**: a tap during the shudder ends the beat immediately. Nothing is
 * lost by skipping — the roll already happened on the server, so the item is the
 * same item.
 *
 * **`prefers-reduced-motion`**: the beat is *zero*, not a zero-duration
 * animation of it. Somebody who asked for less movement gets the collectible
 * straight away rather than watching a box hold still for a second. The
 * information is identical; only the theatre is gone.
 *
 * **A second look is not a moment**: if the server reports the box was already
 * open — a refresh mid-reveal, a duplicate tap that lost the race — the
 * anticipation is skipped and the same collectible is shown. It is still true
 * that you opened a box and this was inside it.
 *
 * ## The tray's destination is conditional, and `/counter` stays reachable
 *
 * With a box on the tray there is no navigation, so `/counter` cannot be reached
 * by tapping it. That would leave a route unreachable for as long as a manager
 * held an unopened box, and an unreachable route is the same class of defect as
 * the `<Link href="/underground">` the gates were built to catch.
 *
 * So the reveal plate carries the onward step — to **`/counter/collection`**, the
 * shelf, which is where the thing you just pulled now lives. That is the honest
 * next thought after a pull, and it is one tap from the counter itself.
 *
 * `/counter` is reachable in every state: with an empty tray by tapping it, and
 * with a box on it by opening the box — one tap, and the thing the manager came to
 * do anyway. Since purchase landed, managers also arrive there to buy, so the tray
 * is no longer its only entrance.
 *
 * ## No scrim
 *
 * An earlier draft dimmed the room. It was withdrawn: "opens at the tray, in
 * place" means the room stays lit and the box opens where it is, and a scrim
 * turns exactly that into the modal the ruling was written against. Focus comes
 * from the motion and from the rarity treatment, which is what they are for.
 */

/** Long enough to be a beat. See the note above. */
const ANTICIPATION_MS = 1100;

type Phase = 'idle' | 'anticipation' | 'reveal' | 'lost';

export function CounterTray({
  spec,
  ownedBoxId,
  boxAsset,
}: {
  spec: RoomObjectSpec;
  /** The oldest unopened box, or null. Resolved on the server every render. */
  ownedBoxId: string | null;
  /** `object_box_owned`, resolved through the registry on the server. */
  boxAsset: AssetResolution;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('idle');
  const [reveal, setReveal] = useState<RevealPayload | null>(null);
  /** The anticipation beat is over — elapsed, skipped, or never ran. */
  const [beatOver, setBeatOver] = useState(false);
  const [, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Promote to the reveal once the beat is over AND the server has answered.
  // Two independent conditions rather than a chained timeout, so neither one can
  // cut the other short.
  useEffect(() => {
    if (phase === 'anticipation' && beatOver && reveal !== null) setPhase('reveal');
  }, [phase, beatOver, reveal]);

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  if (ownedBoxId === null && phase === 'idle') {
    // Nothing on the tray: the plain Door, exactly as before.
    return <RoomDoor spec={spec} />;
  }

  const openIt = (): void => {
    if (phase !== 'idle' || ownedBoxId === null) return;

    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    setPhase('anticipation');
    setBeatOver(still);
    if (!still) {
      timer.current = setTimeout(() => {
        setBeatOver(true);
      }, ANTICIPATION_MS);
    }

    startTransition(async () => {
      const result = await openBoxAction(ownedBoxId);
      if (!result.ok) {
        // The box is not there any more. Say so in the room's voice and re-read
        // the truth from the server rather than guessing at a recovery.
        setPhase('lost');
        return;
      }
      // A replay is not a moment — skip whatever is left of the beat.
      if (result.reveal.replayed) setBeatOver(true);
      setReveal(result.reveal);
    });
  };

  /** Cut the beat short. Nothing is lost; the roll already happened. */
  const skip = (): void => {
    setBeatOver(true);
  };

  const done = (): void => {
    setPhase('idle');
    setReveal(null);
    setBeatOver(false);
    // The tray's state lives on the server: the box is opened and the collectible
    // is owned. Re-read it rather than modelling the transition on the client.
    router.refresh();
  };

  const opening = phase === 'anticipation';

  return (
    <>
      {/*
        * The box on the tray.
        *
        * An overlay with its own alpha, which is the whole reason it can glow:
        * `18 §9.4` derives affordance from `filter: drop-shadow()` on the
        * overlay's own alpha channel, so the light follows the box's silhouette
        * because it *is* the box's silhouette — and it keeps following it when
        * the placeholder is swapped for final art.
        *
        * This is also the first time the tray Door has had anything to say, and
        * therefore the first time it glows. Before this slice both baked Doors
        * were correctly silent.
        */}
      {(phase === 'idle' || opening) && (
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute z-[22] ${opening ? 'box-opening' : 'box-owned'}`}
          style={place(TRAY_BOX)}
        >
          {/*
            * `compact`: this is a 44 x 30 object, not a wall. The surface-scale
            * placeholder does not shrink — its min-height wins and a white slab
            * with a slug printed on it stands on the counter.
            */}
          <AssetView resolution={boxAsset} compact />
        </div>
      )}

      {/*
        * The tap region — the same rectangle the Door used, in the same place.
        *
        * A button rather than an anchor, because this one does not navigate. It
        * carries the Door's own `data-room-*` marker, so the object-map gate
        * still counts three Doors: the tray is one object whose behaviour
        * depends on what is on it, not two objects taking turns.
        */}
      {phase === 'idle' && (
        <button
          type="button"
          onClick={openIt}
          aria-label="Open your pizza box — here, on the tray"
          style={place(spec.rect)}
          className="room-shape absolute z-30 outline-none"
          {...roomObjectAttributes(spec)}
        />
      )}

      {/*
        * While it is opening, the same rectangle skips the beat.
        *
        * Deliberately the tray's own region rather than a full-screen catcher: a
        * transparent layer over the whole room would sit on top of every other
        * object, and the overlap gate would be right to complain.
        */}
      {opening && (
        <button
          type="button"
          onClick={skip}
          aria-label="Skip ahead and see what is in the box"
          style={place(spec.rect)}
          className="room-shape absolute z-30 outline-none"
          {...roomObjectAttributes(spec)}
        />
      )}

      {phase === 'reveal' && reveal !== null && (
        <Revealed reveal={reveal} spec={spec} onDone={done} />
      )}

      {phase === 'lost' && <Lost spec={spec} onDone={done} />}
    </>
  );
}

/**
 * What came out.
 *
 * ## Rarity is never colour alone
 *
 * `globals.css` states the rule where the tokens are defined: *"Rarity
 * reinforces frame geometry and a text label — never color alone."* So each tier
 * carries three signals, and the two non-colour ones do the work for anyone who
 * cannot tell the tokens apart:
 *
 *   - the **word** — `COMMON`, `RARE`, `EPIC`, `LEGENDARY`, printed
 *   - the **frame** — a plain edge, then corner ticks, then a doubled edge, then
 *     both
 *   - the colour, third and least
 *
 * ## The treatment is runtime CSS, never baked into the art
 *
 * `ASSET_PIPELINE.md §7`: the same sprite serves every rarity, and the tier is
 * drawn around it at render time. Baking a gold frame into a legendary's PNG
 * would make rarity un-rebalanceable — and rebalancing is precisely what P3's
 * simulation is expected to do.
 */
function Revealed({
  reveal,
  spec,
  onDone,
}: {
  reveal: RevealPayload;
  spec: RoomObjectSpec;
  onDone: () => void;
}) {
  const heading = useRef<HTMLDivElement>(null);

  useEffect(() => {
    heading.current?.focus();

    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onDone();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
    };
  }, [onDone]);

  return (
    <>
      {/* The collectible, risen out of the box, at the tray. */}
      <div
        aria-hidden="true"
        className={`reveal-rise pointer-events-none absolute z-[24] rarity-${reveal.rarity}`}
        style={place(TRAY_REVEAL)}
      >
        {/* 42 x 42 in room units — object scale, so the same rule applies. */}
        <AssetView resolution={reveal.asset} compact />
      </div>

      {/*
        * The plate, set down on the counter.
        *
        * `role="status"` rather than a dialog: nothing is blocked, the room is
        * still live, and this is an announcement of something that already
        * happened. `tabIndex={-1}` so focus can be sent here for a screen
        * reader without adding a tab stop.
        */}
      <div
        ref={heading}
        role="status"
        tabIndex={-1}
        className={`panel-rise pixel-edge absolute z-[26] border-2 border-wood-dark bg-paper-mid px-3 pt-2 pb-2.5 text-ink-900 outline-none rarity-frame rarity-${reveal.rarity}`}
        style={placePlate()}
      >
        {/*
          * Rarity: the word first, because the word is the signal that survives a
          * greyscale screenshot and a colour-blind reader. The colour is third.
          * `replayed` rides along here in signage type rather than earning its own
          * line — it is a footnote about the tap, not about the item.
          */}
        <p className="rarity-word font-display text-[9px] leading-none tracking-[0.14em] uppercase">
          {reveal.rarity}
          {reveal.replayed && <span className="text-ink-700/60"> · already yours</span>}
        </p>

        {/*
          * The name, at 17px — the body floor, and the only body copy here. The
          * plate has no fixed height, so a long name gets a second line instead
          * of being shrunk to fit. That is the rule: size the container to the
          * type, never the type to the container.
          */}
        <p className="mt-1.5 text-[17px] leading-[1.3] text-ink-900">{reveal.name}</p>

        {/*
          * The way on to the counter.
          *
          * It is here because the tray's destination is conditional: while a box
          * is on it, tapping opens the box rather than navigating, so this is
          * where `/counter` is reached from without waiting for the tray to be
          * empty. It is also the honest next thought after a pull — *where does
          * this live?*
          *
          * A text link rather than a plate-within-a-plate: a second bevelled
          * surface inside a surface this size would be the loudest thing in the
          * room. It names its destination, so its accessible name is a
          * destination rather than a mood.
          */}
        <Link
          href="/counter/collection"
          className="mt-1 flex min-h-[26px] items-center font-display text-[10px] tracking-wide text-ink-700/80 uppercase underline decoration-ink-700/30 underline-offset-2 active:translate-y-px"
        >
          Put it on the shelf
        </Link>
      </div>

      {/*
        * Putting it away. On the tray's own region, where the box was — the same
        * place the finger already is, and it inherits the Door's marker so the
        * object map is unchanged mid-reveal.
        */}
      <button
        type="button"
        onClick={onDone}
        aria-label={`${reveal.name}, ${reveal.rarity}. Put it away.`}
        style={place(spec.rect)}
        className="room-shape absolute z-30 outline-none"
        {...roomObjectAttributes(spec)}
      />
    </>
  );
}

/**
 * The box was gone by the time we asked.
 *
 * Two taps racing, or a second tab that already opened it and a stale page.
 * `05 §8.5` wants empty and error states in the shop's voice rather than a
 * blank panel or a toast, and the honest in-world sentence is that the tray is
 * empty — because it is. Closing re-reads the server, which is where the truth
 * about what was in it already lives.
 */
function Lost({ spec, onDone }: { spec: RoomObjectSpec; onDone: () => void }) {
  return (
    <>
      <div
        role="status"
        className="panel-rise pixel-edge absolute z-[26] border-2 border-wood-dark bg-paper-mid px-3 py-2.5 text-ink-900"
        style={placePlate()}
      >
        <p className="text-[17px] leading-[1.35]">
          Tony looks at the tray. There&rsquo;s nothing on it.
        </p>
      </div>

      <button
        type="button"
        onClick={onDone}
        aria-label="Look at the counter again"
        style={place(spec.rect)}
        className="room-shape absolute z-30 outline-none"
        {...roomObjectAttributes(spec)}
      />
    </>
  );
}
