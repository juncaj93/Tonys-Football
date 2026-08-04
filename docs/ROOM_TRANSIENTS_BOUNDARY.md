# The room's transient surfaces — the implementation boundary

**Status:** implemented, 2026-08-04. This is the canonical account of how the
parlor decides what is on screen over the art, what a room object opens into,
and what a room object looks like when a keyboard is driving it.

It sits under `docs/PRODUCT_DELIVERY_MANDATE.md`, `PROJECT_SPEC/16` and
`PROJECT_SPEC/18` in the hierarchy of `AUTONOMY.md §1`. Where it and an older
document disagree about a panel's geometry or about the affordance vocabulary,
this one wins and the loser gets corrected.

---

## 1. Three debts, one cause

Visual debts 3, 4 and 10 were filed as three cosmetic items on three surfaces,
a milestone apart, by three different pieces of work. They are one fact.

**The room had no owner for its transient state.** Five surfaces, five private
owners, nothing arbitrating:

| surface | owner | its state |
|---|---|---|
| the Tonight board, the sign, the receipt | `RoomDisplay` | `useState` `open` |
| the champion panel | `BannerRail` | `useState` `openSlot` |
| Tony's order pad | `TonyToy` | `useState` `dismissed` |
| the shut door's line | `ShutDoor` | `useState` `saying` |
| the reveal plate | `CounterTray` | `useState` `phase` |

From that one fact:

- **debt 4** — a panel and the pad could be up together, because nothing could
  arbitrate. `MANDATE §6`'s named failure.
- **debt 3** — the pad's timing had never been reviewed against the reveal's,
  because nothing owned both.
- **debt 10** — the affordance vocabulary was replaced by `18 §9.4` and the old
  CSS was orphaned, because nothing owned *"show me what I can touch"*.

The repository had already reached half of this conclusion and written it down.
`counter-tray.tsx` set `data-parlor-focus` directly on `document.body` so Tony's
line would fade while a box was opening, with the comment:

> *"Independent components will always do this; the fix is not to teach each one
> about the others but to give the room a single **focus** they defer to… On
> `body` rather than in React state because the two components have no common
> client ancestor: the room is a server component, and adding a provider around
> it to carry one boolean would be a larger change than the defect."*

That provider is `components/scene/room-stage.tsx`. The attribute stays; it has
one writer now instead of a component reaching outside its own subtree.

---

## 2. `RoomStage` — the contract

```ts
interface RoomStage {
  readonly showing: StageSurface | null;
  readonly blocked: boolean;
  readonly present: (surface: StageSurface, options?: { blocking?: boolean }) => void;
  readonly dismiss: (surface: StageSurface) => void;
  readonly isShowing: (surface: StageSurface) => boolean;
}
```

The whole rule is two pure functions, exported so the test drives the
transitions themselves rather than asserting on the provider's source:

```ts
afterPresent(current, surface, blocking)  // replaces; refuses while blocked
afterDismiss(current, surface)            // only the surface that is up may clear it
```

### What it owns, and what it must never learn

It owns **which one surface is up**. It owns no data, no routing, no
permissions, no ownership, no statistics and no navigation. A surface says *"I am
up"*; what it contains and where its links go stay with the component that has
that knowledge. That separation is what lets the room's art and layout be
redesigned later without any domain module moving.

### Three properties worth stating

**It renders no DOM.** `room-stage.test.tsx` asserts
`renderToStaticMarkup(<RoomStage><span/></RoomStage>) === '<span></span>'`. The
room's object map, hit regions and z-order are measured against the shell's own
coordinate space, and the parlor's intermittent hydration mismatch is still open
as visual debt 12 — a wrapper element in the middle of that is a hazard for no
benefit.

**Nothing is up on the server or on the client's first render**, so the served
HTML and the hydrated tree agree by construction. Nothing in it reads the clock,
storage or the viewport during render.

**Outside a provider it is inert rather than throwing.** These components are
also rendered by tests and by screens that are not rooms. A presentation
primitive must never be the reason a page fails to render.

### Blocking, and why the reveal is not just another panel

A panel is something you opened and can replace by opening another. **The
collectible reveal is not.** It is a recorded, once-only moment that plays at the
tray, and a manager who taps the receipt halfway through must not be able to make
it disappear. So `CounterTray` presents `'reveal'` as *blocking*, and while it is
up `present` refuses. The tap does nothing, which is the correct answer for a
room that is busy; the alternative is a panel drawn over the biggest moment in
the product.

A blocking surface may re-present *itself* — its claim comes from an effect that
can re-fire, and refusing itself would be a room that never lets go.

---

## 3. Yielding, not unmounting

The pad **is still in the tree** while a panel is up, at `opacity: 0`. Two
reasons, and the second is the important one:

1. Its state survives, so it is back on the counter when the panel goes —
   nothing was dismissed and nothing retypes. `globals.css` already described
   this for the reveal: *"He is standing right there watching you open it, and a
   shopkeeper talking over the thing he just handed you is the interruption, not
   the courtesy."*
2. **The DOM structure does not change.** With visual debt 12 open — an
   intermittent structural hydration mismatch in this exact room — adding a
   conditional render to the parlor is a cost with no upside when a CSS rule
   does the same job.

The selector changed from `body[data-parlor-focus='reveal']` to
`body[data-parlor-focus]`. The value was pinned because the box opening was the
only thing that had ever claimed the attribute; a panel claims it too, and with
the value pinned the pad stayed up behind the panel's scrim. Matching on
presence also means a surface added later yields the ambient room without
editing the rule.

### One defect found while doing it

`pointer-events: none` on the wrapper was not sufficient. The pad sets
`pointer-events: auto` on the box so it can be dismissed, and a child
re-enabling them overrides the parent — so an invisible dismiss button was
hit-testable across the bottom of the room for the whole reveal. The plate is
`z-26` inside the room and the pad is `z-40` fixed, so they are not even in the
same stacking context and the pad wins. `body[data-parlor-focus] .tony-line *`
closes it.

---

## 4. `RoomPanel` — one implementation, two materials

There were two of these, written a milestone apart. `Sheet` in `room-object.tsx`
and `ChampionPanel` in `banner-rail.tsx` both built a fixed full-screen layer, a
scrim, a focus-trapped `role="dialog"`, a `useId` heading and an Escape handler —
and disagreed:

| | `Sheet` | `ChampionPanel` |
|---|---|---|
| scrim | `bg-ink-900/60` | `bg-ink-900/55` |
| outer padding | `px-4` | `p-6` |
| maximum width | `19.5rem` (312px) | `300px` |
| close control | a pixel ✕ | a word, `Close` |

None of those differences was a decision. They are what two hands produce given
the same brief, and nothing in the build could notice they had drifted — which is
`MANDATE §6`'s *"deliberate placement"* failing quietly.

### The slots

```tsx
<RoomPanel title material onClose actions>{children}</RoomPanel>
```

A caller supplies **what the words are**. The panel supplies **where they sit and
how they behave**: the scrim, the placement, the sizing, the focus, the Escape
key, the dismissal and the accessible naming.

`room-transients.test.tsx` asserts it imports nothing from `@/lib/parlor`,
`@/lib/counter`, `@/lib/stats`, `@/lib/slice`, `@/lib/db`, `@/lib/auth`,
`next/link` or `next/navigation`. A caller that needs a link puts one in
`actions`, and the panel never learns where it goes.

`paper` is the cream order-pad stock every printed surface in the shop is made
of. `enamel` is the dark panel the champion banner opens into, which reads as the
wall the banners hang on. Both are the shop's palette with pixel-aligned borders;
neither is a default dialog. The test asserts the two materials place
**identically** — same layer, same scrim, same width, same padding.

### It is centred in the viewport, not in the room

The room is `max-w-[430px]` and centred, so at every supported width the two are
the same column. But a panel is a thing you are holding rather than a thing at a
coordinate in the shell, and pinning it to the artwork would make it drift the
day the shell's maximum width changes.

---

## 5. Visual debt 10 — the affordance vocabulary, and why it is deleted

About ninety lines went: `.door-shadow`, `.door-edge`, `.door-wash`,
`.affordance-on-request` and the `door-breathes` keyframe. All SVG `stroke` and
`fill` properties meant to be painted along a hand-traced polygon per object.
**Every one of them had zero consumers.** `room-object.tsx` says so in its own
header: *"An earlier version traced each object as an SVG polygon… That is
withdrawn."* The polygons went and the paint stayed.

The debt asked whether the class should be **wired up** instead, so that *look
around* reveals the Displays and the Toy rather than only Tony's own edge.

**It cannot be, and the reason is geometric rather than a matter of taste.**
`18 §9.4` makes affordance `drop-shadow()` on the overlay's **own alpha**, and
**five of the eight homepage objects are baked into the shell** — the board, the
sign, the receipt, the tray and the rear doorway have no overlay, so no alpha, so
nothing for a drop-shadow to follow. Giving them an affordance means drawing a
shape that is not the object's: an authored rectangle, which is what `§9.4`
withdrew and what `MANDATE §6` bans twice over as *"persistent button
rectangles"* and *"visible hitboxes"*.

`18 §2` agrees from the other direction: a **Display** has **no** affordance —
*"the content is the affordance"* — and a **Toy** has none.

So it is deleted rather than revived, and the reasoning is recorded in
`globals.css` where the next person will meet it. Dead code that draws the old
style is an invitation to reintroduce it.

### The half the debt did not name

`.room-shape:focus-visible .door-edge` was how a room object showed **keyboard
focus**. With the polygons gone that selector matched nothing, every room object
carries `outline-none`, and nothing else in the stylesheet styled focus at all —
so tabbing through the parlor moved an invisible cursor.

There has been a `keyboard-focus` screenshot state the whole time. It
photographed a room with no visible focus and passed, because a screenshot only
fails when somebody looks at it.

WCAG 2.4.7 requires it and `MANDATE §6` requires it — *"focus states stay usable,
appear only during relevant interaction, and stay pixel-aligned"*. The ring is
the one rectangle this room is allowed: it appears **only** while a keyboard is
driving, it is two whole pixels, and `outline-offset: -2px` draws it inside the
hit region so it lands on the grid rather than half a pixel outside it.

---

## 6. Visual debt 3 — the review, and its result

Debt 3 asked for a review rather than a repair: *"the timing of the order pad's
arrival and dismissal has never been reviewed against the reveal's timing — two
transient things that must never compete."*

**They do not compete, and they already did not.** The pad's arrival is
`line-arrives`, 260ms after an 980ms delay, so it lands at **1240ms**. The
affordance reveal begins at `REVEAL_AT_MS` = **1600ms**. They are 360ms apart and
never overlap.

That is a finding, not a fix, and it is worth exactly one thing: an assertion
that reads **both numbers from the files that own them**, so moving either
without moving the other fails the build. A one-off inspection leaves nothing
behind; this leaves the review itself.

The dismissal side is now the yield in `§3`: 160ms, and it happens whenever any
surface is presented.

---

## 7. What this pass deliberately did not do

- **It did not redesign the room.** No art, no geometry, no route, no
  destination and no object's kind changed. The homepage is still 3 Doors, 4
  Displays and 1 Toy.
- **It did not migrate `ShutDoor`.** The Back Hall has three Doors and no
  Displays, so there is nothing there for its line to compete with. `RoomStage`
  is mountable anywhere and the hall can adopt it the day it gains a second
  transient.
- **It did not touch the reveal's choreography.** `CounterTray` declares a
  blocking claim in place of writing an attribute; the anticipation beat, the
  plate, the rarity treatment and every `reveal-*` state are untouched.
- **It shipped no speculative fix for visual debt 12.** The instrumentation from
  PR #57 is preserved intact. `RoomStage` renders no DOM and the panels are
  conditionally rendered exactly as they were, so the pass changes nothing about
  the room's first-render structure — which is also why it produced no new
  evidence about the mismatch.

---

## 8. The gates

| gate | asserts | fails on the old build |
|---|---|---|
| `one-transient` | at most one transient surface is **visible** — real opacity through every ancestor, real area — on **every** state, not only the one built to catch it | **3/3 widths**, `display-over-tony`: *"shows 2 transient surfaces at once (panel + tony-line)"* |
| `focus-visible` | the element focused after tabbing into the room is a room object and has an outline of at least 2px that is not transparent | **3/3 widths**: *"has no visible ring (outline: none 0px)"* |

`one-transient` measures **pixels rather than elements** deliberately. The pad is
still in the tree when it yields, so a DOM check would have passed before and
after. Visibility through the ancestor chain is the only formulation that fails
on the old build.

`display-over-tony` is the new state, and its whole point is what it does *not*
do: every other Display state calls `dismissTony` before it taps, which is
exactly why this defect survived. Every board screenshot was clean; a manager who
tapped the sign mid-sentence was not.

The unit half is `components/scene/room-stage.test.tsx` (11 tests) and
`components/scene/room-transients.test.tsx` (13 tests). Against the pre-pass
build: debt 4's three assertions fail, debt 10's dead-CSS and focus-ring
assertions fail, and debt 3's two pass — correctly, because debt 3 asked for a
review and the review's finding is that the two beats were already sequential.

---

## 9. Evidence

`docs/evidence/room-transients/` — the Tonight panel opened without dismissing
Tony first, at 390, before and after; and the keyboard focus ring, which had not
been visible in a screenshot before. The before frame is the first photograph
ever taken of visual debt 4.

The whole sweep on this build: **86 states × 3 widths, passed**, with zero
hydration sightings recorded in `report.json`. `npm run check`: 1187 tests across
74 files.
