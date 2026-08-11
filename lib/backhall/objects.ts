import { ROOM } from '@/lib/parlor/objects';
import type { RoomObjectSpec } from '@/lib/parlor/objects';

/**
 * What is in the back hall.
 *
 * The same grammar as the parlor, deliberately: **one portrait shell plus
 * transparent overlays**, hit regions that are rectangles because they are never
 * drawn, and an object earning a place here only if a manager can guess where it
 * goes before tapping it (`18 §5`, `16`'s architecture invariants).
 *
 * ## Three objects, not three cards
 *
 * `18 §5`: *"a small pixel-art scene, not a menu card… one compact screen, no
 * scrolling, two obvious environmental choices, plus an in-world return door."*
 * That is the whole map:
 *
 *   - the **stairs** down, which are Rooms
 *   - the **curtained door**, which is the Underground and says so to nobody
 *   - the **way back**, which is a door rather than a breadcrumb
 *
 * The shipped version was three stacked panels with headings — a control with a
 * label, three times — which is exactly the *"menu card"* `18 §5` forbids and
 * the *"generic web boxes"* the preserved M1 baseline forbids reintroducing.
 * That is the thing being replaced, and it is why this file exists at all: the
 * room needs coordinates before it can stop being a list.
 *
 * ## The room is the same size as the parlor, on purpose
 *
 * `zone_back_hall_shell` is registered at `320x569` — identical to
 * `zone_parlor_shell` and to every room shell on disk. So the two rooms share
 * one coordinate system and one `place()`, and walking through the rear doorway
 * does not change the size of the world.
 *
 * It read `960x1707` here until 2026-08-11, which was the registry's own value
 * until all four room shells were found registered three times oversized and
 * corrected (`docs/OPEN_ITEMS.md` **A3**). The number matters to whoever draws
 * the shell, so it is the live one rather than the historical one.
 *
 * ## Locked is a state of a Door, not a different kind of object
 *
 * A shut door is still a door. `18 §6` requires it to be **visible, never
 * highlighted, and tappable with an in-world answer** — so it stays kind `door`
 * in the map and simply stops being an anchor while it is shut, which is exactly
 * what the counter tray does when it opens a box in place (`18 §4.1`). Modelling
 * a locked destination as a Toy would say the room has one door and a curiosity,
 * and the manager is supposed to learn that there is a way down.
 */

/** The back hall shares the parlor's coordinate system. */
export const BACK_HALL = ROOM;

/**
 * The three.
 *
 * Coordinates are chosen against the placeholder scene in
 * `components/scene/back-hall.tsx`, which draws the hall from these same
 * numbers — so the hit region and the thing you can see are one definition
 * rather than two that drift. When `zone_back_hall_shell` lands as real art it
 * is measured the way `zone_parlor_shell` was, and these move once.
 *
 * Every region is at least 44 × 44 room units where the drawn object is smaller,
 * and `backhall.test.ts` fails the build if any two of them touch.
 */
export const BACK_HALL_OBJECTS: readonly RoomObjectSpec[] = [
  /**
   * The stairwell, down the left-hand wall.
   *
   * Stairs going down are the only metaphor in the product that needs no
   * explanation at all, which is the test `18 §5` sets for an object earning a
   * destination. It is drawn as an opening in the floor with a rail and a lit
   * landing below, not as a labelled hatch.
   */
  {
    id: 'stairs',
    kind: 'door',
    label: 'Down the stairs',
    destination: 'the rooms',
    href: '/rooms',
    rect: [16, 392, 112, 150],
  },

  /**
   * The curtained doorway, on the right.
   *
   * **Never labelled `CASINO` on first discovery** (`18 §5`). Nothing on it, in
   * its accessible name, or in the copy beside it says what is behind it — the
   * whole reveal is that you find out by being let in. Its accessible label is
   * what a manager can actually see: a curtain.
   *
   * ## It has no `href`, and that is the honest state rather than an omission
   *
   * `/underground` is **deliberately not a route** (`BACK_HALL_BOUNDARY §0`, and
   * `18 §5` on the reveal). It was a `<Link>` to one once: Next prefetched it on
   * hover, every visit to this page logged a 404, nothing rendered wrong, no
   * test failed, and the console gate was the only evidence.
   *
   * So the door cannot be opened yet — not because the flag is off, but because
   * there is nothing on the other side. `openTo` throws rather than handing back
   * a Door with nowhere to go, which is the repository's standing rule for a
   * state that is declared and unimplemented. When the casino lands in P10 it
   * brings its route, and this becomes one line.
   */
  {
    id: 'curtain',
    kind: 'door',
    label: 'The curtained doorway',
    destination: 'somewhere',
    rect: [204, 104, 88, 276],
  },

  /**
   * The way back to the parlor.
   *
   * A door in the world rather than a breadcrumb or a browser-back dependency
   * (`18 §5`). It is the only object here that is never shut.
   */
  {
    id: 'return',
    kind: 'door',
    label: 'Back out front',
    destination: 'the parlor',
    href: '/',
    rect: [122, 122, 70, 258],
  },
] as const;

export function backHallObject(id: string): RoomObjectSpec {
  const spec = BACK_HALL_OBJECTS.find((object) => object.id === id);
  if (spec === undefined) throw new Error(`no back-hall object called ${id}`);
  return spec;
}

/**
 * The two destinations that can be shut, in the order they appear on screen.
 *
 * The return door is deliberately absent: it is not a feature and it never
 * closes. A list that included it would invite somebody to flag it.
 */
export const LOCKABLE = ['stairs', 'curtain'] as const;
export type Lockable = (typeof LOCKABLE)[number];

/**
 * What each shut door says when it is tapped.
 *
 * `18 §6.3`: *"tappable, but answers in-world — not a route, not a modal, not a
 * coming-soon badge."* And `18 §6`: **no countdown timers on locked doors.** The
 * single honest countdown in this product is the end-of-season spend-down; a
 * door that opens "in three days" manufactures urgency, and a door that is
 * simply shut does not.
 *
 * The Underground's line is **fixed copy from `18 §5`, verbatim and not
 * paraphrasable.** It is the joke and it is the reveal, and rewording it costs
 * both. The stairs' line is curated in the shop's voice and says *what* rather
 * than *when*, for the same reason.
 */
export const LOCKED_LINES: Readonly<Record<Lockable, string>> = {
  stairs: 'Chain across the rail. Tony has not finished down there.',
  curtain: 'Don’t worry about it.',
};

/**
 * The spec for a destination that is open, or a refusal.
 *
 * A flag says *"the feature behind this door has shipped"*. It cannot make a
 * route exist. `/rooms` is built and can be opened today; `/underground` is
 * deliberately not a route at all, so turning its flag on in a preview would
 * render a link to a 404 — the exact defect the console gate caught here once
 * before, and one that fails no test and looks perfectly fine in a screenshot.
 *
 * Throwing is the established answer to a declared-and-unimplemented state
 * (`lib/slice/editions.ts`, `lib/demo/states.ts`): **fail loudly rather than
 * render something plausible.** The alternative — quietly rendering the shut
 * door and ignoring the flag — is worse, because then the flag silently does
 * nothing and somebody eventually ships the casino behind a door that never
 * opens.
 */
export function openTo(id: string) {
  const spec = backHallObject(id);

  if (spec.href === undefined) {
    throw new Error(
      `${id} has no route yet, so it cannot be opened. ` +
        'A feature flag says the feature shipped; it cannot make a page exist. ' +
        'Build the destination first — see docs/BACK_HALL_BOUNDARY.md §0.',
    );
  }

  return spec;
}
