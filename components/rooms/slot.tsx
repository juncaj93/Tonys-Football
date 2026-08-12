'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { clearSlotAction, placeInSlotAction } from '@/app/actions/rooms';
import { attempt, UNREACHABLE_LINE } from '@/lib/reliability/attempt';
import { RoomDisplay } from '@/components/scene/room-object';
import { AssetView } from '@/lib/assets/placeholder';
import { type AssetResolution } from '@/lib/assets/types';
import { type Rarity } from '@/lib/counter/catalog';
import { TYPE } from '@/lib/design/type';
import { roomObject, SLOT_EMPTY, SLOT_NAMES, type Slot } from '@/lib/rooms/objects';

/**
 * Putting something down, and taking it back.
 *
 * ## The whole interaction is two taps and there is no dragging
 *
 * `06 §6.2`: *"placement is curated and slot-based. Do not implement
 * unrestricted drag-and-drop furnishing."* `00 §11` gives the phone reason:
 * **no complex free-form placement**. So the gesture is *tap the place, pick the
 * thing* — which is also the only gesture that works with a keyboard and with a
 * screen reader, and the only one where a mis-tap costs nothing.
 *
 * ## No optimistic state
 *
 * The server owns what is in a slot, and a trigger refuses an item that is not
 * yours. So the sequence is ask, then re-read: `router.refresh()` is the
 * confirmation. Same reasoning as the Showcase picker, and it matters more here
 * because a room is a thing other managers walk into — what is on the screen
 * should be what they would see.
 *
 * ## Tapping what is already there takes it down
 *
 * One gesture, not two controls. The same shape the Showcase uses, and it keeps
 * the empty state reachable: a bare shelf is a legitimate thing to want and
 * `18 §4` has nothing to lose by it.
 */

export interface SlotChoice {
  readonly collectibleId: string;
  readonly name: string;
  readonly rarity: Rarity;
  readonly asset: AssetResolution;
  /** Where it is now, if anywhere. Moving it empties that place. */
  readonly placedIn: Slot | null;
}

export interface SlotOccupant {
  readonly collectibleId: string;
  readonly name: string;
  readonly rarity: Rarity;
  readonly asset: AssetResolution;
}

export function SlotDisplay({
  slot,
  occupant,
  choices,
}: {
  slot: Slot;
  /** What is in it now, or null. */
  occupant: SlotOccupant | null;
  /** Everything this manager could put here. */
  choices: readonly SlotChoice[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [refused, setRefused] = useState<string | null>(null);

  const put = (collectibleId: string): void => {
    if (pending) return;
    setRefused(null);

    // Tapping what is already here takes it down.
    const clearing = collectibleId === occupant?.collectibleId;

    startTransition(async () => {
      const outcome = await attempt(() =>
        clearing ? clearSlotAction(slot) : placeInSlotAction(slot, collectibleId),
      );

      /*
       * Nothing moved, and the shelf on screen is still the truth.
       *
       * Worth separating from a refusal: `place()` is idempotent and the
       * database owns ownership, so tapping again is always safe — which is
       * exactly what the sentence tells the manager to do.
       */
      if (!outcome.ok) {
        setRefused(UNREACHABLE_LINE);
        return;
      }
      if (!outcome.value.ok) {
        setRefused('Tony can’t put that one there.');
        return;
      }
      router.refresh();
    });
  };

  return (
    <RoomDisplay spec={roomObject(slot)} title={SLOT_NAMES[slot]}>
      {occupant === null ? (
        <p className={`${TYPE.body} text-ink-700`}>{SLOT_EMPTY[slot]}</p>
      ) : (
        <p className={TYPE.body}>
          <span className={`rarity-${occupant.rarity} rarity-word ${TYPE.eyebrow}`}>
            {occupant.rarity}
          </span>
          <span className="mt-1 block text-ink-900">{occupant.name}</span>
        </p>
      )}

      {choices.length === 0 ? (
        <p className={`mt-3 ${TYPE.body} text-ink-700`}>
          Nothing to put here yet. Open a box and whatever you pull can come
          downstairs.
        </p>
      ) : (
        <>
          <p className={`mt-4 ${TYPE.ledgerLabel} text-ink-700`}>
            {occupant === null ? 'Put something here' : 'Or put something else here'}
          </p>

          {/*
            * A list rather than a grid of thumbnails.
            *
            * Twelve of the twenty-four collectibles have no art yet and draw the
            * same stand-in carton (`ASSET_PIPELINE §5`, by design at launch), so
            * a grid of pictures would be a grid of identical pictures with no
            * room for a name beside them. A row can carry the sprite, the full
            * name at body size and where the thing currently is — and it is
            * trivially 44px tall.
            */}
          <ul className="mt-2 divide-y divide-wood-dark/25">
            {choices.map((choice) => {
              const here = choice.collectibleId === occupant?.collectibleId;
              /*
               * Where it is *now*, said on the row rather than left for a
               * manager to discover by moving it. A room with four places and
               * one arcade cabinet has to be able to say "that one is on the
               * bench" — otherwise putting it on the shelf looks like it
               * duplicated and the bench looks like it broke.
               */
              const elsewhere = !here && choice.placedIn !== null;

              return (
                <li key={choice.collectibleId}>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      put(choice.collectibleId);
                    }}
                    aria-pressed={here}
                    aria-label={
                      here
                        ? `Take ${choice.name} down`
                        : elsewhere
                          ? `Move ${choice.name} here, from ${SLOT_NAMES[choice.placedIn!]}`
                          : `Put ${choice.name} here`
                    }
                    className="flex min-h-[52px] w-full items-center gap-2.5 py-1.5 text-left active:translate-y-px disabled:opacity-60"
                  >
                    <span
                      aria-hidden="true"
                      className={`block h-9 w-9 shrink-0 border-2 p-[2px] ${
                        here ? 'border-amber-deep bg-paper-white' : 'border-wood-dark/50 bg-paper-mid'
                      }`}
                    >
                      <AssetView resolution={choice.asset} compact placeholder="collectible" />
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className={`block truncate ${TYPE.body} text-ink-900`}>
                        {choice.name}
                      </span>
                      {(here || elsewhere) && (
                        <span className={`block ${TYPE.ledgerLabel} text-ink-700`}>
                          {here ? 'here' : SLOT_NAMES[choice.placedIn!]}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          {occupant !== null && (
            <p className={`mt-3 ${TYPE.body} text-ink-700`}>
              Tap the one that is here to take it down.
            </p>
          )}
        </>
      )}

      {refused !== null && (
        <p className={`mt-3 ${TYPE.body} text-red-dark`} role="status" aria-live="polite">
          {refused}
        </p>
      )}
    </RoomDisplay>
  );
}
