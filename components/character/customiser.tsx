"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { saveCharacterAction } from "@/app/actions/character";
import { PixelPanel } from "@/components/scene/panel";
import { COLOUR_TRAITS, STYLE_TRAITS } from "@/lib/character/catalog";
import {
  composeCharacter,
  type CharacterConfiguration,
} from "@/lib/character/composite";
import { BASE_TRAITS, WEARABLE_SLOTS, type BaseTrait, type WearableSlot } from "@/lib/character/layers";
import { HOUSE } from "@/lib/character/palette";
import { TYPE } from "@/lib/design/type";

import { CharacterView } from "./character-view";

/**
 * The mirror in the back of the shop.
 *
 * ## One category at a time, and the character is always the biggest thing
 *
 * The screen this replaces was a **wall of twelve buttons**: every option of
 * every trait, stacked, with the preview pushed to the top and the Save button
 * below the fold. Six traits at that density would have been thirty-seven.
 *
 * So the traits become a row of tabs and only the open one shows its options.
 * The character keeps the top third of the screen at every width, which is the
 * point of the screen — a manager is choosing how they look, not filling in a
 * form about it.
 *
 * ## Preview is local; truth is the server
 *
 * Every tap changes what is drawn and **writes nothing**. `composeCharacter` is
 * pure and runs identically in the browser and on the server, so the preview is
 * not an approximation of the saved result — it is the same function, given the
 * same inputs, producing the same layers.
 *
 * That is what makes preview-before-save honest here in a way the Showcase
 * picker deliberately refused. The Showcase changes what *ten other people* see,
 * so it asks and re-reads and never paints ahead of the server. This changes what
 * **you** see, nothing is public until you save, and a manager trying on a hat
 * should not wait for a round trip per tap.
 *
 * ## Cancel has to exist because preview exists
 *
 * The moment a screen can be in a state that is not stored, there has to be a way
 * back to the stored one that is not *"remember what it was and put it back"*.
 */

export interface OwnedItem {
  readonly collectibleId: string;
  readonly slug: string;
  readonly name: string;
  readonly slot: WearableSlot;
}

export interface CustomiserProps {
  readonly configuration: CharacterConfiguration;
  /** Collectible id per slot, as stored. */
  readonly equipped: Partial<Record<WearableSlot, string>>;
  readonly owned: readonly OwnedItem[];
  /** Has this manager ever saved? Changes what the status line says, only. */
  readonly chosen: boolean;
}

/** What a tab says. Short enough that seven of them fit a 360 without wrapping. */
const TRAIT_TABS: Readonly<Record<BaseTrait, string>> = {
  skin: "Skin",
  hair: "Hair",
  hairColour: "Colour",
  facialHair: "Beard",
  top: "Top",
  topColour: "Shirt",
};

const SLOT_NAMES: Readonly<Record<WearableSlot, string>> = {
  head: "your head",
  face: "your face",
  body: "over your clothes",
  hand: "your hand",
};

/**
 * A uniform roll in `[0, max)`, from the browser's own generator.
 *
 * **Not `Math.random`**, and not because this needs to be unguessable — it is a
 * shirt colour. `Math.random` is banned repository-wide (`eslint.config.mjs`)
 * because a render that calls it is a hydration mismatch waiting to happen, and
 * a lint rule that has to distinguish "in a render" from "in a click handler"
 * would be a rule with a hole in it. `lib/counter/rng.ts` is the server's answer
 * and imports `node:crypto`, so it cannot come here.
 *
 * Rejection sampling rather than `% max`: modulo over a 32-bit draw makes low
 * values very slightly likelier, and the same reasoning is already written down
 * one module over about a rarity table. It costs a loop that almost never runs
 * twice.
 */
function rollBelow(max: number): number {
  const limit = Math.floor(0x1_0000_0000 / max) * max;
  const draw = new Uint32Array(1);
  do {
    crypto.getRandomValues(draw);
  } while (draw[0]! >= limit);
  return draw[0]! % max;
}

/** "a, b and c" — an Oxford-comma-free list, because Tony would not use one. */
function readableList(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]!}`;
}

/**
 * A control is a slab of painted board, exactly as `/profile`'s are.
 *
 * 48px minimum rather than the 44 WCAG asks for: these sit in a scrolling row
 * under a thumb, and the extra four pixels are the difference between a row that
 * reads as buttons and one that reads as a list of links.
 */
const CHIP =
  `pixel-edge flex min-h-[48px] shrink-0 items-center justify-center gap-2 border-2 px-3.5 text-center active:translate-y-px`;
const CHOSEN = "border-ink-900 bg-amber-mid text-ink-900";
const UNCHOSEN = "border-ink-500 bg-paper-mid text-ink-700";

export function Customiser({ configuration, equipped, owned, chosen }: CustomiserProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [refused, setRefused] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [draft, setDraft] = useState<CharacterConfiguration>(configuration);
  const [worn, setWorn] = useState<Partial<Record<WearableSlot, string>>>(equipped);
  const [tab, setTab] = useState<BaseTrait | "worn">("skin");

  /** Slug per slot, for the compositor. Derived, never stored twice. */
  const wornSlugs = useMemo(() => {
    const out: Record<string, string> = {};
    for (const slot of WEARABLE_SLOTS) {
      const id = worn[slot];
      if (id === undefined) continue;
      const item = owned.find((candidate) => candidate.collectibleId === id);
      if (item !== undefined) out[item.slot] = item.slug;
    }
    return out;
  }, [worn, owned]);

  const composite = useMemo(() => composeCharacter(draft, wornSlugs), [draft, wornSlugs]);

  const dirty =
    BASE_TRAITS.some((trait) => draft[trait] !== configuration[trait]) ||
    WEARABLE_SLOTS.some((slot) => (worn[slot] ?? null) !== (equipped[slot] ?? null));

  const touch = (): void => {
    setSaved(false);
    setRefused(null);
  };

  const change = (trait: BaseTrait, index: number): void => {
    touch();
    setDraft((current) => ({ ...current, [trait]: index }));
  };

  /** Tapping what is already worn takes it off — the same gesture, not a second control. */
  const toggle = (slot: WearableSlot, collectibleId: string): void => {
    touch();
    setWorn((current) => ({
      ...current,
      [slot]: current[slot] === collectibleId ? undefined : collectibleId,
    }));
  };

  /**
   * Roll the whole free set at once.
   *
   * The fastest way to a character that is not the one you started with, and the
   * one control on the screen that is purely for fun. It touches **only** the six
   * free traits: rolling somebody's earned wearables off their character would be
   * a destructive act dressed up as a toy.
   */
  const surprise = (): void => {
    touch();
    setDraft({
      skin: rollBelow(COLOUR_TRAITS.skin.length),
      hair: rollBelow(STYLE_TRAITS.hair.length),
      hairColour: rollBelow(COLOUR_TRAITS.hairColour.length),
      facialHair: rollBelow(STYLE_TRAITS.facialHair.length),
      top: rollBelow(STYLE_TRAITS.top.length),
      topColour: rollBelow(COLOUR_TRAITS.topColour.length),
    });
  };

  const cancel = (): void => {
    setDraft(configuration);
    setWorn(equipped);
    setRefused(null);
    setSaved(false);
  };

  const save = (): void => {
    if (pending) return;
    setRefused(null);

    const equipment: Record<string, string | null> = {};
    for (const slot of WEARABLE_SLOTS) equipment[slot] = worn[slot] ?? null;

    startTransition(async () => {
      const result = await saveCharacterAction({ ...draft, equipment });
      if (!result.ok) {
        setRefused(result.reason);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  };

  const emptySlots = WEARABLE_SLOTS.filter((slot) => !owned.some((item) => item.slot === slot));
  const hasWardrobe = owned.length > 0;

  const status =
    refused !== null
      ? refused
      : pending
        ? "Saving…"
        : saved
          ? "Saved. That is you now."
          : dirty
            ? "Not saved yet."
            : chosen
              ? "This is you."
              : "Tony guessed. Change anything you like.";

  return (
    <div data-character-customiser="" data-character-dirty={dirty ? "yes" : "no"}>
      {/*
        * **One panel, not a page of loose controls.**
        *
        * An earlier build put the preview on paper and every option row straight
        * onto the room, and the walk found what that costs: a `PanelHeading` is
        * `ink-900`, the room behind it is dark wood, and *every section title was
        * invisible*. Twenty painted slabs floating on a photograph of a room is
        * "a website component" however legible the labels are. A mirror propped
        * against the wall with the rail beside it is one object, so it is one
        * surface.
        */}
      <PixelPanel tone="paper" className="px-4 pt-5 pb-4">
        {/*
          * The character stands on the floor of the panel rather than floating in
          * the middle of it — bottom-centre anchoring is only meaningful if there
          * is something to stand on.
          */}
        {/*
          * **The character is pinned.**
          *
          * The whole screen is taller than a phone — six categories of controls
          * and two buttons under a figure drawn at 3x — so scrolling to the Save
          * button used to take the character off the top of the screen, and the
          * first sweep photographed exactly that: a save confirmed under a set of
          * legs. A customiser whose preview you cannot see while you use it is a
          * form.
          *
          * Sticky rather than shorter. The alternative was drawing at 2x, and a
          * smaller character is the wrong thing to trade away on the one screen
          * whose subject is the character.
          */}
        <div className="sticky top-0 z-10 -mx-4 -mt-5 border-b-2 border-dashed border-ink-300/60 bg-paper-mid px-4 pt-5">
          <div className="flex flex-col items-center">
            <CharacterView composite={composite} scale="customiser" idle />
            <div aria-hidden="true" className="mt-1 h-[3px] w-[70%] bg-ink-900/25" />
          </div>

          <p
            className={`mt-3 min-h-[26px] pb-2 text-center ${TYPE.bodyCompact} text-ink-700`}
            aria-live="polite"
          >
            {status}
          </p>
        </div>

        {/*
          * The tabs. A scrolling row rather than a wrapping grid, so the
          * character never moves up or down when a longer word lands in it —
          * a preview that jumps as you browse is the thing you were looking at.
          *
          * The rule between this and the character is on the **pinned** block
          * rather than here, so it travels with it. Without that, a line of body
          * text passing behind the pinned block was cut through the middle of its
          * glyphs and read as a rendering fault; under a hard rule the same line
          * reads as scrolling under a header.
          */}
        <div className="mt-3">
          <Strip label="What to change">
            {BASE_TRAITS.map((trait) => (
              <button
                key={trait}
                type="button"
                onClick={() => {
                  setTab(trait);
                }}
                aria-pressed={tab === trait}
                data-trait-tab={trait}
                className={`${CHIP} ${TYPE.action} ${tab === trait ? CHOSEN : UNCHOSEN}`}
              >
                {TRAIT_TABS[trait]}
              </button>
            ))}
            {hasWardrobe && (
              <button
                type="button"
                onClick={() => {
                  setTab("worn");
                }}
                aria-pressed={tab === "worn"}
                data-trait-tab="worn"
                className={`${CHIP} ${TYPE.action} ${tab === "worn" ? CHOSEN : UNCHOSEN}`}
              >
                Worn
              </button>
            )}
          </Strip>
        </div>

        {/* The open category's options. */}
        <div className="mt-3" data-trait-options={tab}>
          {tab === "worn" ? (
            <WardrobeOptions owned={owned} worn={worn} onToggle={toggle} />
          ) : (
            <TraitOptions trait={tab} value={draft[tab]} onChange={change} />
          )}
        </div>

        {/*
          * The four places a worn item goes, named once.
          *
          * `18 §6`'s rule is that a thing you cannot have yet answers in-world
          * rather than being hidden — but it answers **once**. The screen this
          * replaces printed four headings, four rules and *"Nothing for this
          * yet."* four times, which took a third of the page from the manager who
          * owns nothing, and that is every manager today.
          */}
        {emptySlots.length > 0 && (
          <p className={`mt-3 ${TYPE.bodyCompact} text-ink-500`}>
            {hasWardrobe ? "Nothing yet for " : "Nothing to put on yet. There are four places for it: "}
            {readableList(emptySlots.map((slot) => SLOT_NAMES[slot]))}.
          </p>
        )}

        {/*
          * Save is at the **bottom**, after the things it saves. Both buttons
          * occupy the row whether or not there is anything to save, disabled
          * rather than absent — controls that appear and disappear make the page
          * jump under a thumb already moving toward where something used to be.
          */}
        <div className="mt-5 border-t-2 border-dashed border-ink-300/60 pt-4">
          <button
            type="button"
            onClick={surprise}
            data-surprise
            className={`pixel-edge flex min-h-[48px] w-full items-center justify-center border-2 border-ink-500 bg-paper-mid px-3 ${TYPE.action} text-ink-900 active:translate-y-px`}
          >
            Surprise me
          </button>

          <div className="mt-3 flex gap-3">
            <button
              type="button"
              onClick={save}
              disabled={!dirty || pending}
              data-save
              className={`pixel-edge min-h-[52px] flex-1 border-2 px-3 ${TYPE.action} active:translate-y-px ${
                dirty && !pending
                  ? "border-ink-900 bg-red-mid text-paper-white"
                  : "border-ink-300 bg-paper-dark text-ink-500"
              }`}
            >
              Save
            </button>
            <button
              type="button"
              onClick={cancel}
              disabled={!dirty || pending}
              className={`pixel-edge min-h-[52px] flex-1 border-2 px-3 ${TYPE.action} active:translate-y-px ${
                dirty && !pending
                  ? "border-ink-900 bg-paper-mid text-ink-900"
                  : "border-ink-300 bg-paper-dark text-ink-500"
              }`}
            >
              Put it back
            </button>
          </div>
        </div>
      </PixelPanel>
    </div>
  );
}

/**
 * A row that scrolls sideways inside itself.
 *
 * `overflow-x-auto` on the row and never on the page: the one thing
 * `VISUAL_ACCEPTANCE` will not have is the body scrolling horizontally on a
 * phone. The negative margin lets the first and last chip reach the panel's
 * edge, so a half-visible chip is the cue that there is more.
 */
function Strip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      role="group"
      aria-label={label}
      className="-mx-4 flex gap-2.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {children}
    </div>
  );
}

function TraitOptions({
  trait,
  value,
  onChange,
}: {
  trait: BaseTrait;
  value: number;
  onChange: (trait: BaseTrait, index: number) => void;
}) {
  const isColour = trait === "skin" || trait === "hairColour" || trait === "topColour";

  return (
    <Strip label={TRAIT_TABS[trait]}>
      {isColour
        ? COLOUR_TRAITS[trait].map((ramp) => (
            <button
              key={ramp.index}
              type="button"
              onClick={() => {
                onChange(trait, ramp.index);
              }}
              aria-pressed={value === ramp.index}
              aria-label={ramp.name}
              data-option={ramp.index}
              className={`${CHIP} ${TYPE.bodyCompact} ${value === ramp.index ? CHOSEN : UNCHOSEN}`}
            >
              {/*
                * The swatch is the colour the sprite is actually painted with,
                * read from the same table the figure reads — so an option cannot
                * be labelled one colour and draw another.
                */}
              <span
                aria-hidden="true"
                className="h-[22px] w-[22px] shrink-0 border-2 border-ink-900"
                style={{ backgroundColor: HOUSE[ramp.base] }}
              />
              {ramp.name}
            </button>
          ))
        : STYLE_TRAITS[trait].map((option) => (
            <button
              key={option.index}
              type="button"
              onClick={() => {
                onChange(trait, option.index);
              }}
              aria-pressed={value === option.index}
              data-option={option.index}
              className={`${CHIP} ${TYPE.bodyCompact} ${value === option.index ? CHOSEN : UNCHOSEN}`}
            >
              {option.name}
            </button>
          ))}
    </Strip>
  );
}

function WardrobeOptions({
  owned,
  worn,
  onToggle,
}: {
  owned: readonly OwnedItem[];
  worn: Partial<Record<WearableSlot, string>>;
  onToggle: (slot: WearableSlot, collectibleId: string) => void;
}) {
  return (
    <div className="space-y-2.5">
      {WEARABLE_SLOTS.filter((slot) => owned.some((item) => item.slot === slot)).map((slot) => (
        <Strip key={slot} label={SLOT_NAMES[slot]}>
          {owned
            .filter((item) => item.slot === slot)
            .map((item) => (
              <button
                key={item.collectibleId}
                type="button"
                onClick={() => {
                  onToggle(slot, item.collectibleId);
                }}
                aria-pressed={worn[slot] === item.collectibleId}
                data-option={item.slug}
                className={`${CHIP} ${TYPE.bodyCompact} ${
                  worn[slot] === item.collectibleId ? CHOSEN : UNCHOSEN
                }`}
              >
                {item.name}
              </button>
            ))}
        </Strip>
      ))}
    </div>
  );
}
