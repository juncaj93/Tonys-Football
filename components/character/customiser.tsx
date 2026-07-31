"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { saveCharacterAction } from "@/app/actions/character";
import { PanelHeading, PixelPanel } from "@/components/scene/panel";
import { PALETTES } from "@/lib/character/catalog";
import {
  composeCharacter,
  type CharacterConfiguration,
} from "@/lib/character/composite";
import { fillColour } from "@/lib/character/figure";
import { WEARABLE_SLOTS, type WearableSlot } from "@/lib/character/layers";

import { CharacterView } from "./character-view";

/**
 * The mirror in the back of the shop.
 *
 * ## Preview is local; truth is the server
 *
 * Every tap changes what is drawn and **writes nothing**. `composeCharacter` is
 * pure and runs identically in the browser and on the server, so the preview is
 * not an approximation of the saved result — it is the same function, given the
 * same inputs, producing the same layer list.
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
 * back to the stored one that is not "remember what it was and put it back". The
 * boundary document's rule — *"a manager who taps the wrong hair and loses a look
 * they spent time on is a support request nobody can answer"* — is satisfied
 * before saving by Cancel, and after saving by the fact that the previous
 * configuration is still a row of small integers they can re-enter.
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
  readonly options: {
    readonly body: readonly { readonly index: number; readonly name: string }[];
    readonly hair: readonly { readonly index: number; readonly name: string }[];
  };
}

const SLOT_NAMES: Readonly<Record<WearableSlot, string>> = {
  head: "On your head",
  face: "On your face",
  body: "Over your clothes",
  hand: "In your hand",
};

/** The same four places, as things rather than as headings. */
const BARE_SLOT_NAMES: Readonly<Record<WearableSlot, string>> = {
  head: "your head",
  face: "your face",
  body: "over your clothes",
  hand: "your hand",
};

/** "a, b and c" — an Oxford-comma-free list, because Tony would not use one. */
function readableList(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]!}`;
}

/**
 * A control is a slab of painted board, exactly as `/profile`'s are.
 *
 * 48px minimum rather than the 44 WCAG asks for, because these sit in rows of
 * six on a 360 and the extra four pixels are the difference between a row that
 * reads as buttons and one that reads as a paragraph of links.
 */
const CHOICE =
  "pixel-edge flex min-h-[48px] flex-1 basis-[calc(50%-0.375rem)] items-center justify-center border-2 px-3 text-center text-[16px] leading-tight active:translate-y-px";
const CHOSEN = "border-ink-900 bg-amber-mid text-ink-900";
const UNCHOSEN = "border-ink-500 bg-paper-mid text-ink-700";

export function Customiser({
  configuration,
  equipped,
  owned,
  options,
}: CustomiserProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [refused, setRefused] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [draft, setDraft] = useState<CharacterConfiguration>(configuration);
  const [worn, setWorn] =
    useState<Partial<Record<WearableSlot, string>>>(equipped);

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

  const composite = useMemo(
    () => composeCharacter(draft, wornSlugs),
    [draft, wornSlugs],
  );

  const dirty =
    draft.body !== configuration.body ||
    draft.hair !== configuration.hair ||
    draft.palette !== configuration.palette ||
    WEARABLE_SLOTS.some(
      (slot) => (worn[slot] ?? null) !== (equipped[slot] ?? null),
    );

  const change = (next: Partial<CharacterConfiguration>): void => {
    setSaved(false);
    setRefused(null);
    setDraft((current) => ({ ...current, ...next }));
  };

  /** Tapping what is already worn takes it off — the same gesture, not a second control. */
  const toggle = (slot: WearableSlot, collectibleId: string): void => {
    setSaved(false);
    setRefused(null);
    setWorn((current) => ({
      ...current,
      [slot]: current[slot] === collectibleId ? undefined : collectibleId,
    }));
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

  /** The slots with nothing to put in them. Named once, not four times. */
  const empty = WEARABLE_SLOTS.filter(
    (slot) => !owned.some((item) => item.slot === slot),
  );

  const status =
    refused !== null
      ? refused
      : pending
        ? "Saving…"
        : dirty
          ? "Not saved yet."
          : saved
            ? "Saved. That is you now."
            : "This is you.";

  /*
   * **One panel, not a page of loose controls.**
   *
   * The first build put the preview on paper and every option row straight onto
   * the room, and the walk found what that costs: a `PanelHeading` is `ink-900`,
   * the room behind it is dark wood, and *every section title on the page was
   * invisible* — "Build", "Colouring" and all four slot names simply were not
   * there. It is the exact inverse of the cream-on-cream defect that shipped on
   * three routes, and it fails the same rule (`VISUAL_ACCEPTANCE.md §4`).
   *
   * The fix is not to recolour the headings. Twenty painted slabs floating on a
   * photograph of a room is *"a website component"* however legible the labels
   * are — the question `VISUAL_ACCEPTANCE.md §8` asks last. A mirror propped
   * against the wall with the clothes rail beside it is one object, so it is one
   * surface, and the headings land on paper where they were always meant to.
   */
  return (
    <div data-character-customiser="">
      <PixelPanel tone="paper" className="px-4 pt-5 pb-4">
        {/*
         * The character stands on the floor of the panel rather than floating in
         * the middle of it — bottom-centre anchoring is only meaningful if there
         * is something to stand on.
         */}
        <div className="flex flex-col items-center">
          <CharacterView composite={composite} scale="customiser" />
          <div
            aria-hidden="true"
            className="mt-1 h-[3px] w-[70%] bg-ink-900/25"
          />
        </div>

        <p
          className="mt-3 min-h-[24px] text-center text-[17px] leading-[1.4] text-ink-700"
          aria-live="polite"
        >
          {status}
        </p>

        <Section title="Build">
          <Choices>
            {options.body.map((option) => (
              <button
                key={option.index}
                type="button"
                onClick={() => {
                  change({ body: option.index });
                }}
                aria-pressed={draft.body === option.index}
                className={`${CHOICE} ${draft.body === option.index ? CHOSEN : UNCHOSEN}`}
              >
                {option.name}
              </button>
            ))}
          </Choices>
        </Section>

        <Section title="Hair">
          <Choices>
            {options.hair.map((option) => (
              <button
                key={option.index}
                type="button"
                onClick={() => {
                  change({ hair: option.index });
                }}
                aria-pressed={draft.hair === option.index}
                className={`${CHOICE} ${draft.hair === option.index ? CHOSEN : UNCHOSEN}`}
              >
                {option.name}
              </button>
            ))}
          </Choices>
        </Section>

        <Section title="Colouring">
          <Choices>
            {PALETTES.map((palette) => (
              <button
                key={palette.index}
                type="button"
                onClick={() => {
                  change({ palette: palette.index });
                }}
                aria-pressed={draft.palette === palette.index}
                className={`${CHOICE} gap-2 ${draft.palette === palette.index ? CHOSEN : UNCHOSEN}`}
              >
                {/*
                 * The swatch is the actual skin colour the palette resolves to,
                 * read from the same function the figure is painted with — so a
                 * palette cannot be labelled one colour and draw another.
                 */}
                <span
                  aria-hidden="true"
                  className="h-[18px] w-[18px] shrink-0 border-2 border-ink-900"
                  style={{ backgroundColor: fillColour("skin", palette.index) }}
                />
                {palette.name}
              </button>
            ))}
          </Choices>
        </Section>

        {/*
         * A slot appears when there is something to put in it.
         *
         * It used to always appear, and the walk found what that costs the
         * manager who owns nothing — which is **every manager today**, because
         * nothing awards a wearable yet. Four headings, four rules, and the
         * sentence *"Nothing for this yet."* four times took over a third of the
         * page. That is the defect already recorded against `/counter`: *"three
         * identical cream cards — one of them repeating the sentence three lines
         * above it"*.
         *
         * The empty slots are named in **one** line instead, so a manager still
         * learns the four places exist. Naming them matters: `18 §6`'s rule is
         * that a thing you cannot have yet answers in-world rather than being
         * hidden — but it answers *once*.
         */}
        {WEARABLE_SLOTS.filter((slot) =>
          owned.some((item) => item.slot === slot),
        ).map((slot) => (
          <Section key={slot} title={SLOT_NAMES[slot]}>
            <Choices>
              {owned
                .filter((item) => item.slot === slot)
                .map((item) => (
                  <button
                    key={item.collectibleId}
                    type="button"
                    onClick={() => {
                      toggle(slot, item.collectibleId);
                    }}
                    aria-pressed={worn[slot] === item.collectibleId}
                    className={`${CHOICE} ${worn[slot] === item.collectibleId ? CHOSEN : UNCHOSEN}`}
                  >
                    {item.name}
                  </button>
                ))}
            </Choices>
          </Section>
        ))}

        {empty.length > 0 && (
          <Section title={owned.length === 0 ? "What you wear" : "Still empty"}>
            <p className="text-[17px] leading-[1.45] text-ink-500">
              {owned.length === 0
                ? "Nothing to put on yet. There are four places for it: "
                : "Nothing yet for "}
              {readableList(empty.map((slot) => BARE_SLOT_NAMES[slot]))}.
            </p>
          </Section>
        )}

        {/*
         * Save is at the **bottom**, after the things it saves.
         *
         * It was above them, which read fine on a manager with an empty wardrobe
         * and badly on one with a full one: you scrolled past four sections of
         * choices to reach the end and then had to scroll back up to commit them.
         *
         * Both buttons occupy the row whether or not there is anything to save,
         * disabled rather than absent — controls that appear and disappear make
         * the page jump under a thumb already moving toward where something used
         * to be.
         */}
        <div className="mt-5 flex gap-3 border-t-2 border-dashed border-ink-300/60 pt-4">
          <button
            type="button"
            onClick={save}
            disabled={!dirty || pending}
            className={`pixel-edge min-h-[52px] flex-1 border-2 px-3 font-display text-[12px] uppercase active:translate-y-px ${
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
            className={`pixel-edge min-h-[52px] flex-1 border-2 px-3 font-display text-[12px] uppercase active:translate-y-px ${
              dirty && !pending
                ? "border-ink-900 bg-paper-mid text-ink-900"
                : "border-ink-300 bg-paper-dark text-ink-500"
            }`}
          >
            Put it back
          </button>
        </div>
      </PixelPanel>
    </div>
  );
}

function Choices({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap gap-2.5">{children}</div>;
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-4 border-t-2 border-dashed border-ink-300/60 pt-3">
      <PanelHeading>{title}</PanelHeading>
      <div className="mt-2.5">{children}</div>
    </section>
  );
}
