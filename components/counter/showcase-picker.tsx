'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { setShowcaseAction } from '@/app/actions/counter';
import { attempt, UNREACHABLE_LINE } from '@/lib/reliability/attempt';
import { TYPE } from '@/lib/design/type';
import { AssetView } from '@/lib/assets/placeholder';
import { type AssetResolution } from '@/lib/assets/types';
import { type Rarity } from '@/lib/counter/catalog';

/**
 * Choosing what the league sees.
 *
 * ## No optimistic state
 *
 * The picker does not paint the new choice and then confirm it. The server owns
 * which item is shown — a trigger will refuse an item that is not yours — so the
 * honest sequence is: ask, then re-read. `router.refresh()` is the confirmation.
 *
 * Optimism here would buy a few hundred milliseconds and cost the one property
 * that matters on a page ten people can see: what is on the screen is what the
 * league is looking at.
 *
 * ## Selecting the current pick clears it
 *
 * Taking your item back off the shelf is a thing a manager wants to do, and it is
 * the same gesture rather than a second control — tap the one that is already
 * chosen. `18 §4` allows no levels or clout, so there is nothing lost by having
 * nothing shown, and an empty shelf must be reachable.
 */

export interface PickerChoice {
  readonly collectibleId: string;
  readonly name: string;
  readonly rarity: Rarity;
  readonly asset: AssetResolution;
}

export function ShowcasePicker({
  choices,
  chosenId,
}: {
  choices: readonly PickerChoice[];
  /** What is currently shown, or null. */
  chosenId: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [refused, setRefused] = useState<string | null>(null);

  const choose = (collectibleId: string): void => {
    if (pending) return;
    setRefused(null);

    // Tapping the current pick takes it off the shelf.
    const next = collectibleId === chosenId ? null : collectibleId;

    startTransition(async () => {
      const outcome = await attempt(() => setShowcaseAction(next));
      if (!outcome.ok) {
        setRefused(UNREACHABLE_LINE);
        return;
      }
      const result = outcome.value;
      if (!result.ok) {
        setRefused('Tony can’t put that one out.');
        return;
      }
      router.refresh();
    });
  };

  if (choices.length === 0) {
    return (
      <p className={`mt-1.5 ${TYPE.body} text-ink-700`}>
        Nothing to put out yet. Open a box and whatever you pull can go on the shelf.
      </p>
    );
  }

  return (
    <>
      <ul className="mt-3 grid grid-cols-3 gap-2.5">
        {choices.map((choice) => {
          const chosen = choice.collectibleId === chosenId;
          return (
            <li key={choice.collectibleId}>
              <button
                type="button"
                onClick={() => {
                  choose(choice.collectibleId);
                }}
                aria-pressed={chosen}
                aria-label={
                  chosen
                    ? `${choice.name}, ${choice.rarity}. Currently shown — take it off the shelf.`
                    : `${choice.name}, ${choice.rarity}. Show this one.`
                }
                disabled={pending}
                className={`rarity-frame rarity-${choice.rarity} pixel-edge flex w-full flex-col items-center gap-1.5 border-2 px-1.5 pt-2.5 pb-2 active:translate-y-px disabled:opacity-70 ${
                  chosen ? 'border-amber-mid bg-paper-white' : 'border-wood-dark bg-paper-mid'
                }`}
              >
                <span aria-hidden="true" className="flex h-12 w-full items-center justify-center">
                  <span className="block h-12 w-12">
                    <AssetView resolution={choice.asset} compact placeholder="collectible" />
                  </span>
                </span>

                <span className={`text-center ${TYPE.bodyCompact} text-ink-900`}>
                  {choice.name}
                </span>

                {/*
                  * The chosen one says so in words, not only by its border — the
                  * same rule rarity follows. A state carried by colour alone is a
                  * state some people cannot read.
                  */}
                <span
                  className={`${TYPE.eyebrow} ${
                    chosen ? 'text-red-dark' : 'text-ink-700/55'
                  }`}
                >
                  {chosen ? 'On the shelf' : 'Show this'}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {refused !== null && (
        <p aria-live="polite" className={`mt-2 ${TYPE.bodyCompact} text-ink-700`}>
          {refused}
        </p>
      )}
    </>
  );
}
