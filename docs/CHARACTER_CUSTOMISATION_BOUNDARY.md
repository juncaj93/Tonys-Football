# The character-customisation rebuild — the canonical account

**Status: CLOSED — production verified, 2026-08-09.** One reopened product area,
one production crash root-caused and fixed, one trait model replaced, one sprite
system written, one screen redesigned. Merged in #78 (`ecbaf2f`).

**The fix is confirmed on the real deployment**, not inferred from a green gate:
Alex loaded production on iPhone, opened the character editor, changed a trait and
saved. It worked, and the exception did not recur — the exact path that originally
failed. `1891557172@E352` is **not** an active defect.

That observation covers **this feature only**. It says nothing about cron
execution, live Sleeper ingestion, the commissioner variable, demo seats in
production, or the rest of `docs/ACTIVATION.md §5`.

The area is **not reopened** by this record. The six-trait, 64 × 96, 29-layer
system below is the accepted v1 implementation, and everything outside character
customisation stays frozen.

---

## 0. The production crash, which is the reason this file starts here

Alex opened the customiser in production, changed something, pressed Save, and got

```
Application error: a server-side exception has occurred while loading tonys-football.vercel.app
Digest: 1891557172@E352
```

### The root cause is a code defect, and it is one line

`app/actions/character.ts` carried, from #48 (2026-07-31):

```ts
export const CUSTOMISER_SLOTS = WEARABLE_SLOTS;
```

in a file whose first line is `'use server'`. Next.js compiles such a module with
an injected `ensureServerEntryExports([...every runtime export])`, whose entire
body is *"throw unless every one of these is a function"*. The error it throws
carries `__NEXT_ERROR_CODE = "E352"`, which is where the `@E352` suffix on the
digest comes from — it is not a hash, it is a name, and it names exactly this.

**The export had no consumer anywhere in the repository.** It was dead from the
day it was written, and it broke every character save for as long as it existed.

### Classification

**A bad server action.** Not missing data, not a schema mismatch, not an unset
environment variable, not an asset lookup, not a session problem, not stale
production data. Merging and deploying repairs production with no migration, no
backfill and no manual step. Nothing in `docs/ACTIVATION.md` moves.

### Why the route loaded perfectly and only Save was broken

The `'use server'` module is evaluated on the server when an **action is
invoked** — not when the page renders. `GET /profile/character` never touches it.
That is why:

| Gate | Result | Why |
|---|---|---|
| `next build` | green | the check is deliberately runtime-only; the loader's own comment says *"here we can only check that they are functions"* |
| `npm run test` | green | nothing loads a compiled `'use server'` module through the flight loader |
| `npm run visual:qa` | green | it opened `/profile/character` and photographed it. **A screenshot of a form is not a test of the form.** |

### The reproduction

Locally, against a production build and a real Postgres, through the product:
sign in at the door, open the customiser, change the hair, press Save.

```
⨯ Error: A "use server" file can only export async functions, found object.
  Read more: https://nextjs.org/docs/messages/invalid-use-server-value
  at 87423 (.next/server/app/profile/character/page.js)
```

and in the browser, character for character:

```
Application error: a server-side exception has occurred while loading localhost
Digest: 296987159@E352
```

The numeric half of a digest hashes the stack, which contains build-specific
chunk paths, so it differs between builds. **`@E352` is the identity**, and it
matched on the first attempt.

### The gates that exist now

1. **`app/actions/use-server-exports.test.ts`** — parses every `'use server'`
   file in the product with the TypeScript compiler API and fails on any runtime
   export that is not an `async function`. AST rather than a regular expression:
   `export const` inside a comment or a nested function is not an export.
   `export type` and `export interface` are erased before any of this happens and
   are left alone. It fails on the pre-fix file and passes on the fixed one, and
   it carries a self-check that reproduces the exact offending declaration so a
   scan that silently stopped recognising `export const` cannot read as a pass.
2. **`character-saved`**, a visual state that **presses the button** and asserts
   the screen says *Saved*, at all three widths.

---

## 1. What was actually wrong with the feature, beyond the crash

### One integer chose three things

`0008` stored `body`, `face`, `hair`, `palette`. `palette` was a **bundle**: each
of its four values fixed a skin tone *and* a hair colour *and* a shirt colour
together. A manager who wanted the deepest skin tone also got black hair and a
red shirt, and there was no way to take one without the others.

That contradicted `art/palette.json`, which has carried a dedicated four-step
`skin` ramp whose own role note reads:

> *Avatar and character skin. Four steps spanning a usable range. **Managers
> select a step; it is not tied to any other palette role.***

written before `0008` and disobeyed by it.

### The skin tones were not the skin ramp

`lib/character/figure.ts` painted faces with `#C99A63`, `#7A4A2A`, `#E0D2B8` and
`#A9713F` — `wood-pale`, `wood-mid`, `paper-mid` and `wood-light`. Every
manager's face was the colour of the counter.

### Forty-eight characters for ten managers

2 bodies × 6 hairstyles × 4 palettes. And the default was all-zeroes, so every
manager who never opened the customiser was **the same person**.

### The drawing was a diagram of a character

Nine flat rectangles per layer: a square head, no outline, no light direction, no
curve. It was honest about being a stand-in and it is what made the screen read
as a form with a picture on it.

### The screen was a wall of buttons

Twelve controls, every option of every trait at once, the preview pushed to the
top and Save below the fold. Six traits at that density would have been
thirty-seven controls.

---

## 2. Geometry — measured, not chosen

`64 × 96`, bottom-centre anchored. Display scales are whole multiples only:
**1× row, 2× card, 3× customiser and hero.**

The measurements it was chosen against, taken from the running product:

| | |
|---|---|
| `character_tony_neutral.png` | authored **88 × 240**, rendered **84 × 230** CSS px at 375 — **0.95 CSS px per source px** |
| Tony's head | **41 × 40** source px |
| `zone_parlor_shell.png` | authored **320 × 569**, rendered at 360–390 wide |
| The old manager canvas | `32 × 48`, giving a **12 × 11** head |
| The new manager canvas | `64 × 96`, giving a **22 × 24** head |

**Raising it cost no art.** All twenty registry rows were `art_status:
placeholder` and no PNG existed at any size, so there was nothing to re-cut. The
old number was never a measurement either.

**It does not match Tony's density, and does not claim to.** At the customiser's
3×, a manager's head is 66 × 72 CSS px built from 22 × 24 source pixels, against
Tony's 38 CSS px built from 41 × 40. Matching his density at a comparable
on-screen size needs a canvas around `88 × 200`, and thirty layers at that size
are not authorable by hand. Managers and Tony are **never in the same frame in
v1** — basements are v1.1 — so what has to match is the pixel language: hard
edges, the locked palette, one light direction.

`64 × 96` is the smallest canvas on which the trait set is legible, which is the
only reason to have picked it. At `32 × 48` a moustache is an 8 × 2 bar and a
hairstyle is three rectangles; neither can carry a difference worth choosing.

---

## 3. The trait model

Six independent choices, `lib/character/catalog.ts`:

| Trait | Options | Drawn as |
|---|---|---|
| `skin` | 4 | the base body's colour |
| `hair` | 6 | a layer |
| `hairColour` | 8 | the hair layer's colour — **and the facial-hair layer's** |
| `facialHair` | 5 (incl. none) | a layer, or none at all |
| `top` | 6 | a layer |
| `topColour` | 8 | the top layer's colour |

**11,520 combinations**, six controls, and **five drawn layers** — which is the
whole point of separating colour from shape. Every one of the 11,520 is asserted
legal by test: there is no combination the system offers and then refuses.

### Numbers that are not preferences

- **Skin is 4** because `art/palette.json` says four. Its names are `Tone 1`…`4`:
  naming a skin tone after a food, a wood or a part of the world is how a neutral
  control stops being neutral, and this list is chosen from by real people about
  themselves.
- **Hair is 6** because `avatar_hair_01`…`_06` were canon before this existed and
  the commissioner ruling of 2026-07-31 is to preserve the exact canonical slugs.
  Their indices are unchanged, so a configuration saved before this release still
  means what it meant.
- **Tops keep `avatar_body_starter_02`/`_03` at indices 0 and 1**, for the same
  reason. Four are appended.
- **Facial hair takes the hair colour** rather than a colour of its own. One
  control fewer, and a manager who has to keep two colours matched by hand will
  eventually not, which reads as a bug rather than as a choice.

### Deliberately not in v1

- **Bottoms.** Eighteen rows of a ninety-six-row figure, shown from the front, in
  a panel. It costs a control and buys almost nothing. The layer position exists;
  a `bottoms` trait appends without moving anything.
- **A base face trait.** The body carries a face. `face` remains a **worn** slot.
- **Any progression.** No unlocks, no levels, no rarity on a free trait. This is
  customisation, and `16` bans the rest of it outright.

### The default is derived, and that is a feature

`defaultCharacterFor(userId)` is FNV-1a over the user id. **Stable** — the same
manager gets the same character on every device and after every deploy — and
**spread**, so ten managers who have never opened the customiser are ten
recognisably different people. All-zeroes was the obvious default and would have
produced ten identical characters, which is the state this feature exists to
avoid.

Nothing is inferred about anybody. It is a starting point, no meaning attaches to
which one you get, and the first save replaces it. `03`'s ban on inventing a
manager's personality applies to their face.

---

## 4. The sprite system

`lib/character/sprite.ts` + `lib/character/art/`.

### Shapes, not ASCII

A layer is authored as **ellipses, rectangles, polygons and individual pixels**
rasterised onto the shared canvas. Literal 64-wide ASCII rows were the obvious
alternative and are a trap: a mis-typed row is invisible in review and there are
twenty-nine layers.

### Shading is derived, and that is the point

One pass, one light direction (upper left), applied identically to every layer:

- **outline** where a solid pixel touches empty space — whatever material it is
  made of;
- **shade** on the inner lower/right edge;
- **base** everywhere else.

An author who has to remember which side the light is on will get it wrong on the
twenty-ninth sprite, and the twenty-ninth sprite is the one nobody looks at
twice.

**Outlining applies to fixed-colour materials too**, and that was a defect
found by looking: it originally applied only to the manager-coloured material, so
the winter beanie's cream pom had no edge at all and was invisible against the
cream panel the customiser draws on. A layer's outline is a property of its
shape, not of its material.

### Two tones per material, plus ink

`art/palette.json` is locked. A third, lighter tone per material would mean
inventing colours the room does not have. Every colour a character can be painted
with is asserted to be one of the locked 32.

### Rendering

The composite is flattened into the fewest coloured rectangles that draw it —
horizontal run-length, then identical runs merged downward — and emitted as **one
`<svg>`**. A character is a couple of hundred `<rect>`s rather than 6,144, and one
stacking context instead of eight, so nothing can half-load or arrive a frame
apart. A test asserts the decomposition is lossless: it is an optimisation of the
drawing and never of the picture.

Every layer's tone grid is cached by slug at first use, so a render is a walk over
cached arrays. There is deliberately **no cache keyed by configuration** — there
are 11,520 of them.

### The art-swap contract is intact and is per layer

All twenty-nine slugs are `art_status: placeholder`, which here means *there is no
PNG*. The moment a registry row gains a `path`, that one layer draws its PNG and
the rest keep drawing themselves. `art/ASSET_PIPELINE.md`'s *"swapping a
placeholder for final art is a registry row, never a code change"* holds, without
an all-or-nothing switchover.

### Defects found by rendering and looking

Recorded because each was invisible to every test that existed:

1. **The hoodie pocket punched a hole through to the chest.** `rect` + `erase` is
   the obvious way to draw a pocket; `erase` removes *this layer's* pixels, so the
   hole showed the manager's bare skin. `outline()` exists because of it.
2. **The T-shirt and jersey showed a midriff** — hems above the trouser line.
3. **Stubble was a full beard**, in the same tone as the full beard.
4. **The chef's hat was a lampshade** — straight-sided polygon, now three
   overlapping circles.
5. **The beanie's pom was invisible** — see the outlining note above.

---

## 5. Persistence

`drizzle/0016_character_traits.sql`. **Additive. Nothing dropped, nothing
renamed.**

- Five columns added: `skin`, `hair_colour`, `facial_hair`, `top`, `top_colour`.
- `hair` **reused** — it meant a hairstyle index and it still does, over the same
  slugs in the same order.
- `body`, `face` and `palette` **kept**, given a `DEFAULT 0`, and read by nothing
  from this release onward. Dropping is the one migration a rollback cannot undo,
  and three integers cost nothing.
- The backfill is **written out rather than defaulted**, because a DEFAULT would
  repaint every manager who had already chosen a look. The four old palettes map
  onto the new traits exactly — they were bundles *of these colours* — and the
  mapping is the one the previous release actually rendered.

**In practice the backfill runs over nothing**: saving has been impossible since
#48. The mapping is correct anyway, because *"the table is empty"* is a fact about
today and a migration is forever.

### Reading repairs; writing refuses

The one asymmetry in the system, and it is deliberate.

- **`characterFor` repairs per trait.** A retired hairstyle costs the hairstyle,
  not the character. The system this replaces reset the *whole* configuration on
  the first unresolvable value, so a manager whose hairstyle was retired also lost
  their skin tone, their shirt and their colour. Nothing is written: a value that
  stops resolving because a deploy is half rolled out comes back on its own.
- **`saveCharacter` refuses.** Storing a repaired value would silently discard a
  choice the client believed it was making, and the client is the only thing that
  could have sent an index the catalog does not have.

### What cannot happen

Unchanged from M3, and none of it was touched:

| Rule | Mechanism |
|---|---|
| You may only wear what you own | a trigger — an FK can say *"this is a collectible"*, not *"this is **your** collectible"* |
| One item per slot | `wearable_equips_one_per_slot` |
| One place per item | `wearable_equips_one_place_each` |
| A save is all-or-nothing | one transaction |
| Trait indices are non-negative | `character_configurations_traits_non_negative` |

The upper bound is the **catalog**, not a CHECK. A CHECK naming a count would need
a migration every time art shipped, and a migration that runs on a deploy to add a
hairstyle is a bad trade.

---

## 6. The screen

`/profile/character`, unmoved. `18 §3` fixes the homepage at eight objects and a
mirror is not one of them.

- **The character is pinned.** The screen is taller than a phone, and the first
  sweep photographed exactly what that costs: a save confirmed under a pair of
  legs. Sticky rather than smaller — a smaller character is the wrong thing to
  trade away on the screen whose subject is the character. The rule under it
  travels with it, because a line of body text cut through the middle of its
  glyphs reads as a rendering fault and the same line under a hard rule reads as
  scrolling under a header.
- **One category at a time.** Six tabs, one open, its options in a strip that
  scrolls sideways inside itself — never the page.
- **Colour options carry the colour they draw**, read from the same table the
  sprite reads, so an option cannot be labelled one colour and draw another.
- **Preview is local; truth is the server.** `composeCharacter` is pure and runs
  identically in both, so the preview is the same function on the same inputs —
  not an approximation. Nothing is public until Save.
- **Surprise me** rolls the six free traits and deliberately **not** the earned
  wearables: rolling somebody's equipment off their character would be a
  destructive act dressed up as a toy.
- **The character breathes** — one source pixel, `steps(1)`, so it lands on an
  exact device pixel at both ends. On the preview and nowhere else, and off
  entirely under `prefers-reduced-motion`.

`rollBelow` in the customiser uses `crypto.getRandomValues` with rejection
sampling. Not for unguessability — it is a shirt colour — but because
`Math.random` is banned repository-wide and `lib/counter/rng.ts` imports
`node:crypto` and cannot come to the client.

---

## 7. Verification

- **`npm run test`** — the character suite is 76 tests. Notable ones: every one of
  the 11,520 configurations validates; every hairstyle overlaps every hat (a
  matrix, because that rule fails on a *pair*); every layer stands on the same
  floor row; every top leaves the hands clear; no drawn colour is outside the
  locked palette; the run decomposition is lossless; nothing throws for any input
  a database could hold, including negatives, `NaN` and `Infinity`.
- **`npm run visual:qa`** — three new states. `character-editing` (a category open
  with an unsaved change), `character-saved` (**presses Save**), and
  `character-retired-options` (a stored character naming options that no longer
  exist, showing the four that survive).
- **`checkCharacter`** runs on every `character-*` state at all three widths and
  measures: the viewBox is the authored canvas; the display scale is a whole
  number and **the same** in both directions; `shape-rendering` is `crispEdges` as
  an attribute *and* as the computed value; `image-rendering` is `pixelated`; the
  figure is not clipped horizontally; the composite is not nearly empty; every
  control clears 44px; and — the one that matters — Save actually said *Saved*.

The gate found two defects in itself before it found none in the product: it
asked the DOM for `shapeRendering` when the attribute React emits is
`shape-rendering`, and it clicked a fixed option index when the option already
selected depends on a hash of a uuid the seed regenerates.

---

## 8. What would make this wrong

Stated so it can be checked rather than assumed.

- **If manager characters are never shown anywhere but `/profile`**, six traits is
  more than the surface needs and the honest answer is to put the character
  somewhere else, not to shrink it. `16` defers basements to v1.1, and a basement
  is the room a character most obviously stands in.
- **If final PNG art is ever commissioned for these layers**, the registry rows
  and the canvas are ready and the swap is per layer — but the 64 × 96 decision
  should be re-measured first, because a painted-and-quantized source at that size
  will not survive the way an authored sprite does. `docs/PALETTE_FIDELITY_BOUNDARY.md`
  is the record of what that costs.
- **If a wearable source is ever approved**, nothing here needs to change: the
  ownership contract, the grant path and the four slots are M3's and were not
  touched. The wardrobe is empty today because nothing awards a wearable, which
  is a product decision and not an unimplemented feature.
