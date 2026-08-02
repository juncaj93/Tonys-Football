import Link from 'next/link';

import { CharacterView } from '@/components/character/character-view';
import { Customiser, type OwnedItem } from '@/components/character/customiser';
import { PanelHeading, PixelPanel, SignPlate } from '@/components/scene/panel';
import { RoomBehind } from '@/components/scene/room-behind';
import { Page } from '@/components/shell';
import { TYPE } from '@/lib/design/type';
import { requireUser } from '@/lib/auth/current-user';
import { customiserOptions } from '@/lib/character/composite';
import { previewCharacter } from '@/lib/character/previews';
import { characterFor, ownedWearables } from '@/lib/character/service';
import { getDb } from '@/lib/db';

/**
 * The mirror in the back of the shop — where a manager decides who they are.
 *
 * ## Why it lives under `/profile`
 *
 * `18 §3` fixes the homepage at **eight objects** and this is not one of them, so
 * the customiser cannot be a door off the parlor without breaking a ruling. The
 * surface a character most obviously belongs to is a manager's basement, and
 * `16` defers basements to v1.1 (`P6`, *"character in-room"*).
 *
 * `/profile` is the one route in the product that is **about you rather than
 * about the league** — your name, your keys, your devices. Who you are belongs
 * with it, one tap beneath, and it needs no new object in a room whose object map
 * is asserted by a test.
 *
 * ## What the preview parameter does and does not do
 *
 * `?character=<key>` replaces the drawing with a **named geometry fixture** and
 * hides the controls. It is for looking at the silhouettes that could clip; it is
 * not a way to edit somebody else's character, and it writes nothing. The
 * customiser's own states — an empty wardrobe, a staged change, a refused save —
 * come from demo seats, because they are states of a manager rather than of a
 * composite.
 */

export const dynamic = 'force-dynamic';

export default async function CharacterPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { user } = await requireUser();
  const params = await searchParams;

  const preview = previewCharacter(params['character'], process.env);
  if (preview !== null) {
    return (
      <>
        <RoomBehind />
        <Page>
          <main
            className="mx-auto w-full max-w-md flex-1 px-4 pt-3 pb-8"
            data-character-preview={preview.key}
          >
            <SignPlate>{preview.key}</SignPlate>

            <PixelPanel tone="paper" className="mt-3 flex flex-col items-center px-4 pt-5 pb-4">
              <CharacterView composite={preview.composite} scale="hero" />
              <div aria-hidden="true" className="mt-1 h-[3px] w-[70%] bg-ink-900/25" />
            </PixelPanel>

            <PixelPanel tone="paper" className="mt-3 px-4 pt-4 pb-4">
              <PanelHeading>What this is</PanelHeading>
              <p className={`mt-2 ${TYPE.body} text-ink-700`}>{preview.description}</p>

              {/*
                * The layer list, named. A silhouette that looks right for the
                * wrong reason — the hat drawn under the hair, say — is invisible
                * in the picture and obvious in the order.
                */}
              <ul className="mt-3 border-t-2 border-dashed border-ink-300/60 pt-3">
                {preview.composite.layers.map((layer) => (
                  <li
                    key={layer.layer}
                    className={`flex items-baseline justify-between gap-3 py-0.5 ${TYPE.bodyCompact} text-ink-700`}
                  >
                    <span className={`${TYPE.eyebrow} text-ink-900`}>
                      {layer.layer.replace('-', ' ')}
                    </span>
                    <span className={`text-right ${TYPE.machine} text-ink-500`}>
                      {layer.slug}
                    </span>
                  </li>
                ))}
              </ul>
            </PixelPanel>

            <BackToProfile />
          </main>
        </Page>
      </>
    );
  }

  const db = getDb();
  const [state, owned] = await Promise.all([
    characterFor(db, user.id),
    ownedWearables(db, user.id),
  ]);

  const equipped: Record<string, string> = {};
  for (const item of owned) {
    if (item.equipped) equipped[item.slot] = item.collectibleId;
  }

  const items: OwnedItem[] = owned.map((item) => ({
    collectibleId: item.collectibleId,
    slug: item.slug,
    name: item.name,
    slot: item.slot,
  }));

  return (
    <>
      <RoomBehind />

      <Page>
        <main className="mx-auto w-full max-w-md flex-1 px-4 pt-3 pb-8">
          <SignPlate>Who you are</SignPlate>

          <div className="mt-3">
            <Customiser
              configuration={state.configuration}
              equipped={equipped}
              owned={items}
              options={customiserOptions()}
            />
          </div>

          <BackToProfile />
        </main>
      </Page>
    </>
  );
}

/**
 * The way back, named for where it goes.
 *
 * The ruling behind the wording is `ReturnPlate`'s: a back link must never name
 * the page you are already on. This one goes up a level rather than out to the
 * parlor, so it says so.
 */
function BackToProfile() {
  return (
    <Link
      href="/profile"
      className={`pixel-edge mt-5 flex min-h-[52px] items-center justify-center border-2 border-ink-500 bg-paper-mid px-4 ${TYPE.action} text-ink-900 active:translate-y-px`}
    >
      Back to your keys
    </Link>
  );
}
