# Manager rooms — the implementation boundary

**Status:** **built and open**, 2026-08-09. This is the canonical account of what
the basement is, what it deliberately is not, and which decisions inside it are
settled so a later session does not re-make them.

The commissioner reopened deferred world-building scope and asked for *"the
smallest strong version that makes the space meaningful."* `16 §3` had deferred
basements to v1.1 / Phase 6 on the grounds that *"the Showcase carries the social
weight at launch"*; that deferral is what this supersedes, and **only** that one.

---

## 0. What it is, in one paragraph

Down the stairs behind the parlor, each manager has a permanent room. It holds
**four places** they can put things they own, a **rail** carrying championships
they cannot put anywhere, **themselves**, and a **door to the corridor** where
the other nine rooms are. It is fitted out in one of **three** ways. Nothing in
it is earned, priced, ranked or scored, and nothing in it can be faked.

---

## 1. What the specification asked for, and where each half landed

`16`'s P6 row is four things. This is where each one is:

| P6 asks for | Where it is |
|---|---|
| **3 themes** | `rooms.theme` · `lib/rooms/themes.ts` |
| **curated slots** | `room_placements`, keyed by an enum of four places |
| **visiting** | `/rooms/[userId]` — a read, so it needed no schema |
| **character in-room** | `characterFor()`, drawn at `roomObject('manager')` |

`04 §10` is the older table-level specification and it is followed except in two
places, both deliberate:

- **`equipped entrance animation`** — not built. `00 §10` allows a first-visit
  introduction and requires every non-essential animation to be skippable; an
  *equipped* one is a cosmetic with an inventory behind it, and no such inventory
  exists. The column would be a slot for a feature nobody has designed.
- **`configuration/version`** — not built. There is nothing to version: a room is
  four rows and one enum, and the collectibles those rows point at are already
  immutable. A version column nothing reads goes stale silently.

`06 §6.2`'s *"optional interactive prop zone"* and *"optional seasonal zone"* are
also absent, and the word in the specification is **optional**. Both are things
to add when there is something to put in them.

---

## 2. Navigation — the depth reconciliation, stated rather than assumed

`18 §7` puts Rooms at **two taps** from the parlor and calls it *"the one
approved exception to one-tap depth"*, then says **"nothing else in the product
is deeper than two taps."**

That sentence and *"visiting works"* cannot both be satisfied literally, and the
resolution is worth writing down because it is the kind of thing a later session
re-litigates:

- **`/rooms` is your own room**, at two taps. Not a lobby. A corridor at the
  bottom of the stairs would put a manager's own room three taps away and make
  the first thing they meet after opening a door in a pizzeria a **list of
  names** — the menu card `18 §5` forbids, one floor lower.
- **Visiting is one tap inside Rooms**, which is exactly the allowance `18 §7`
  already grants the Counter in the same table: *"one tap inside the Counter —
  Purchase · open an owned box · Collection · Showcase."* Collection and Showcase
  sit at the same effective depth from the parlor that a visited room does.

So the rule being applied is *"two taps to a destination, one move inside it"*,
which is what `18 §7` describes for the only other destination that has an
inside. **`18 §7` is not amended** — nothing new is deeper than the Counter's
own interior.

```
parlor ──(rear doorway)──► /back-hall ──(stairs)──► /rooms ──(corridor)──► /rooms/<manager>
   ▲                                                   │
   └───────────────────────────────────────────────────┘   (in-world doors, both ways)
```

---

## 3. The eight objects, and why each earns its place

`18 §1`: an object is interactive because a manager can guess what it does before
tapping it. Eight, and most of the room is scenery permanently.

| Object | Kind | What it is |
|---|---|---|
| `stairs` | **Door** → `/back-hall` | The wooden flight in its framed opening — the room's largest feature, and how you got in |
| `shelf_left` · `shelf_right` | Display | Two places on one plank |
| `wall` | Display | The empty frame on the back wall |
| `bench` | Display | The desk — `04 §10`'s "special display slot" |
| `rings` | Display | The pennant rail. **Derived, not a slot** |
| `manager` | Display | The person standing on the rug |
| `corridor` | Display | The cork noticeboard, with the league pinned to it |

**Three of those metaphors changed on 2026-08-09**, when the room gained an
approved reference, and each change is the same kind of correction:

| Was | Is | Why |
|---|---|---|
| A **nail** in the wall | An empty **frame** | Four units of grey that needed a drawn shadow to be visible at all. An empty frame is the most guessable *"something goes here"* an object can be, and it is the reference's own centrepiece |
| A **workbench** | A **desk** | The reference has a desk. The stored enum value is still `bench` — migrating four Postgres enum values to rename one label would be a migration bought entirely with vocabulary |
| A **door** to the corridor | A **noticeboard** | The old version had a manager tap a door and get a list — a door that opens onto a menu. A noticeboard *is* a list, in world, so taking a name off it and walking to that room needs no fiction at all |

**The corridor is a Display rather than a Door** because it has no single
destination: it opens onto a row of doors with names on them, and a Door with
nowhere particular to go would have to invent one.

**The rail is not a slot, and that is the whole point of having it.** Rings are
granted from verified titles (`lib/counter/rings.ts`) and cannot be placed, moved
or taken down. The shelf holds what you *chose*; the rail holds what you *won*.
`place()` refuses a ring — answering `not_yours` rather than adding a fourth
outcome, because a manager cannot reach that path through the product and the
only caller who sees it is one probing ids.

**The rail is drawn even when it is empty**, which eight of ten managers will
see. A rail that appeared the day you won would take the meaning out of the day
you won.

---

## 4. Where the theme picker lives, and the alternative that was rejected

The theme is on the panel that opens on **the manager** — titled *"Your room"* —
beside the link to the character editor.

The obvious alternative is a ninth object meaning *"what the walls are made
of"*. It was rejected because **no such object exists in a basement that a
manager could guess**. A paint tin, a light switch or a swatch card would each be
a control with a label, which is the thing `18 §1` refuses and the mandate calls
a generic web box wearing pixel art. The person standing in the room is the
honest owner of the room's own decisions, and a visitor tapping the same object
gets the only question they actually have: *whose room is this?*

---

## 5. Inventory ≠ placement

`16`'s P6 exit criterion, and the single most load-bearing sentence in this
feature.

- **Ownership** lives in `collectibles`. Append-only, undeletable, and this
  module has no way to mint or destroy a row there.
- **Placement** lives in `room_placements`. Freely mutable, because it records a
  current arrangement rather than something that happened.

So taking a thing off a shelf deletes a row and touches nothing else, and
`lib/rooms/service.test.ts` asserts exactly that by emptying a room and comparing
the manager's collection before and after.

Three constraints, each refusing a different lie:

| Constraint | Refuses |
|---|---|
| `UNIQUE (room_id, slot)` | Two objects in one place |
| `UNIQUE (room_id, collectible_id)` | One object in two places — a duplicate wearing the shape of a choice |
| `room_placements_must_be_owned` (trigger) | Displaying somebody else's collectible |

The trigger is the one that matters. A foreign key can say *this is a
collectible*; it cannot say *this is yours*, and that gap is the entire
authorization rule for a room the rest of the league can walk into. It is the
same mechanism and the same argument as `0006`'s Showcase trigger, deliberately,
so a reviewer who has read one has read both.

---

## 6. Category compatibility is deliberately not implemented

`04 §10` asks each slot to *"validate category compatibility"*, and this does not.

**The shipped catalog has no category axis.** A catalog entry is a slug, a name
and a rarity, derived from the art registry (`lib/counter/catalog.ts`).
Implementing that sentence would mean inventing a taxonomy for twenty-four
objects and then telling a manager their pizza cutter may not stand on the floor.

It would also be **invisible**: every collectible is drawn from the same 46 × 46
sprite, so a poster on the bench and a poster on the wall are the same picture. A
rule nobody can see and nobody can justify only ever generates refusals.

Recorded rather than silently skipped. If categories ever exist — as a registry
field, which is where they belong — `placeable()` gains a filter and nothing else
moves.

---

## 7. Nothing here is earned, priced or scored

Three separate temptations, refused for the same reason: `16` removes
achievements, levels, clout and prestige from this product, and a personal room
is exactly the surface they creep back into.

- **All three themes are available from the first visit.** No unlock — a cosmetic
  behind one is progression with a different word on it. No cost — `00 §8` lists
  what tokens buy and decorating a room is not on it, so pricing one would be an
  economy change and `16 §8` puts those behind the simulation.
- **The corridor's *"two things out"* is a fact, not a score.** It goes down when
  somebody tidies up, there is nothing to be top of, and a test asserts it can
  fall.
- **The rail shows what is on the wall and the panel lists everything.** No "+2"
  mark, because a count of what is *not* being shown is a score.

No token moves anywhere in this feature. `app/actions/rooms.ts` has no ledger
call, on purpose, and a future one would be a decision rather than a wiring job.

---

## 8. Server authority, in three layers

Every action in `app/actions/rooms.ts` is about **the caller's own room**, and
there is no `userId` parameter on any of them to make it otherwise.

1. `requireUser()` supplies the manager.
2. The service checks the collectible is theirs, so an honest mistake is a
   polite refusal.
3. The database refuses a placement whose collectible is not the room owner's.

If only one could exist it would be the third. A visitor has **no operation at
all** — the authorization on `/rooms/[userId]` is the absence of a request they
could make, and the visual gate reads the rendered page for a control that would
change somebody else's room, because that is how the guarantee would actually be
lost.

**Who can be visited: active league seats only.** A retired manager's room still
exists — `14 §5` makes a basement permanent — and is not reachable, because the
commissioner's ruling that a retired manager is not a browsable identity is
absolute and **a URL is not a door**. `visitable()` carries the rule and answers
the same `notFound()` for "not a manager any more" as for "no such person", so
probing addresses teaches nothing about who used to be here.

---

## 9. The flag is open, and closing it is one line

`lib/flags.ts` sets `rooms: true`. `18 §6`: when a locked door opens, it opens
**for everyone at once** — which is what a deploy-time flag does, and why this is
one line rather than a migration.

**Setting it back to `false` shuts the feature, not merely the door.** The hall
draws the chain, the stairs stop being an anchor, **and both routes answer
`notFound()`**. No data is touched and nothing is lost. That reversibility is
what made opening it the right default rather than a commitment.

That last clause was not free and is worth stating why. `18 §6` treats a locked
destination as a shut door rather than a missing page, and while `/rooms` was
three lines of *"not yet"* that was the whole of it — the route rendered a
chained door and there was nothing behind it to reach. There is now, and a door
with a chain on it and a **working room behind the address bar** is a state that
looks shut and is not. Both routes therefore consult the flag before rendering
anything, and answer `notFound()` rather than redirecting — the same answer
`requireAdmin()` gives, so a shut feature is indistinguishable from a route that
does not exist.

What `18 §6` also asks for is that the opening be **announced**. That is the
commissioner's act, not a deploy's, and it has not been done.

**The shut hall is still photographed.** The override could only ever *add* until
now, so the moment the default flipped, the chained stairwell became the state no
parameter could produce — and it is the state a revert produces, where being
wrong is least recoverable. `?open=none` is the sentinel that keeps it
reachable, and `back-hall-shut` photographs it at all three widths.

---

## 10. Art — the storeroom is painted; two shells outstanding

**Superseded twice.** It first read *"none is required, and none is requested"*,
which was true of the room as first built. The commissioner's direction of
2026-08-09 supplied an approved reference and corrected it. On **2026-08-10 the
storeroom shell was delivered, processed and shipped**, so the position now is:

| Theme | Shell | State |
|---|---|---|
| `storeroom` (default) | `zone_room_shell_storeroom` | **painted, live** |
| `rec_room` | `zone_room_shell_rec_room` | outstanding — draws the stand-in |
| `cold_store` | `zone_room_shell_cold_store` | outstanding — draws the stand-in |

Because resolution is per theme, that mixed state is a normal state and not a
half-finished one.

### 10.1 The architecture

`/rooms` is **one portrait shell plus transparent hit regions**, exactly as the
parlor and the hall are. `components/scene/manager-room.tsx` has two halves and
only one ever renders:

| | |
|---|---|
| `zone_room_shell_<theme>` has art | draw it, and nothing else |
| it does not | draw the geometry, which follows the reference's **composition** at a placeholder's fidelity |

**Resolved per theme, independently.** Three shells can land in any order, none
is gated on another, and nothing has to ship all-or-nothing. That is the
art-swap contract applied one room at a time.

The rendered page declares which half drew it (`data-room-shell="art"` /
`"drawn"`) and the visual gate reads it. Deliberately **not pinned to `drawn`**:
the day a shell lands the gate must go green on the better picture rather than
fail for having got what it was waiting for. Without the marker, a reviewer
looking at a folder of screenshots has no way to tell *"this is the room"* from
*"this is what stands in for the room"*, and the moment one theme has art and
another does not, two pictures mean different things under one naming.

### 10.2 The brief went first; the geometry moved to meet the art

The plan was *"the art is drawn to the geometry"*, and that is still the right
default — the room already works, so the cheaper thing to move is the paint. What
actually happened is worth recording, because it will happen again on the next
two shells.

**The delivered shell came back close, and not exact.** A generated image does
not hit a coordinate table, and it should not be sent back for a fifteen-unit
error when the alternative is editing eight numbers. So the geometry was
**aligned to the delivered art**, measured off it rather than guessed:

| Object | Was | Is | Moved because |
|---|---|---|---|
| `stairs` | `[10, 92, 98, 274]` | `[48, 92, 82, 240]` | the flight sits further right and stops higher; the old region covered the side table and missed the stair's right edge |
| `rings` | `[124, 52, 134, 46]` | `[136, 96, 118, 40]` | the rod is 44 units lower than briefed |
| `wall` | `[124, 112, 116, 78]` | `[150, 140, 100, 72]` | the frame is smaller and lower |
| `shelf_left` / `shelf_right` | `x 126 / 178` | `x 140 / 196` | the shelf spans `x 136–250`, not `120–230` |
| `bench` | `[246, 214, 68, 58]` | `[256, 286, 60, 60]` | the desk is a **foreground** object, not a ledge on the back wall |
| `corridor` | `[266, 56, 48, 124]` | `[280, 118, 40, 112]` | the cork board is further right and lower, and runs off the frame edge |
| `manager` | `[110, 320, …]` | `[126, 334, …]` | centred on the rug the art actually drew |
| `HORIZON` / `CEILING` | `366` / `46` | `340` / `62` | the floor line and the joists, read off the shell |

Two consequences, both recorded rather than absorbed:

- **The storeroom is now the master.** The handoff carries these numbers, so the
  rec room and the cold store are briefed to the room that exists. They are *the
  same room refitted*: a fixture that moved between themes would move a
  manager's things when they changed the walls.
- **`PENNANT.shown` went 6 → 5.** The delivered rod is 114 units wide and the
  parlor's 22-unit pitch fits five. Narrowing the pitch to force a sixth would
  make this rail visibly a different fitting from the one in the shop, which is
  the whole reason a pennant reads as a championship here without being
  explained. The panel lists every title either way.

Six **prepared places** must still be drawn empty on the outstanding two: the
frame, the shelf, the desktop, the pennant rod, the noticeboard and the rug.
Anything painted there is covered by a sprite at runtime and reads as a rendering
bug. `lib/assets/batches.test.ts` fails the build if the handoff and the registry
disagree about which slugs exist.

### 10.2.1 The canvas was wrong, and it would have shipped a 3×-oversized room

`zone_room_shell_*` was registered at **960 × 1707**, copied from
`zone_back_hall_shell`. Both were wrong. The one shell this product has actually
shipped — `zone_parlor_shell` — is **320 × 569 on disk**, and
`ART_PRODUCTION_BACKLOG`'s first rule says why: art is *"authored at its logical
size in CSS pixels, no larger… an oversized source gets resampled and loses"* its
edges. The device scales it up with `image-rendering: pixelated`.

It mattered because `process-art.ts` resizes to whatever the registry says. The
error was invisible while every shell was a placeholder and would have shipped a
three-times-oversized room the moment one arrived. `zone_back_hall_shell` was
corrected in the same change.

### 10.3 What else uses real approved art, and needs nothing

- **Collectibles** in the four places — the twelve Batch B sprites, at their
  authored 46 × 46 into a 46 × 46 **art rect**, which is the pipeline's *one art
  pixel is one room unit*.
- **Championships** on the rail — `object_champion_banner`, the same 18 × 15
  pennant the parlor's own rail hangs, at the same 22-unit pitch.

**No new `object_*` slug is required by this room.** Every interactive thing in
it is either architecture baked into the shell or a collectible the manager
already owns.

### 10.4 Hit region ≠ art rect

New with the reference, and worth stating because collapsing the two is the
obvious simplification. The frame is 116 × 78 because that is the frame and the
desk 68 × 58 because that is the desktop — both sized for a thumb — while every
collectible is drawn at exactly 46 × 46 wherever it goes. Collapsing them would
either shrink the targets to sprite size or stretch every sprite to its
furniture, and the second is the fractional resample this whole pipeline exists
to avoid. `lib/rooms/objects.ts` holds both, so there is still one definition of
each, and `objects.test.ts` asserts every art rect sits inside the region that
opens it.

## 11. Two defects this slice found

Both were found by gates rather than by reading, and both are recorded because
the mechanism matters more than the fix.

**The picker moved the same item four times.** `furnishRoom` in the visual driver
matched `Put X here` *and* `Move X here, from …`, so after the first place was
filled it took the first row — which was the item already in it — and each place
stole the last one's contents. The room ended with exactly one thing in it, four
times over. `checkRoom` **counts** rather than trusting the drive, which is the
only reason it was visible.

**A paper panel had never printed a rarity word.** `RoomPanel`'s `paper` material
was missing `on-paper`, so `.rarity-common` used the ink mixed for a dark ground
and measured **1.54:1** against cream. `PixelPanel`'s paper tone has carried
`on-paper` since the Collection shipped an invisible `LEGENDARY` row; this panel
was written a milestone later and did not, and nothing noticed because no caller
had ever put a tier in one. Same defect, two surfaces, one gate — which is the
argument for `rarity-contrast` running on every state rather than on the one it
was written for.

---

## 12. What the gates hold

| Gate | What it catches |
|---|---|
| `lib/rooms/objects.test.ts` | eight objects · exactly one Door · no two overlapping · 44 CSS px on the narrowest phone · **every art rect at the collectible's authored 46 × 46 and inside the region that opens it** · **every theme with its own registered 960 × 1707 shell** · **the manager standing on the floor, at the sprite's own aspect, between 26% and 34% of the room** · six pennants fitting the rail at the parlor's pitch · no label that is a route or a column name · an unknown theme repaired on read |
| `lib/rooms/service.test.ts` | one room per manager under concurrency · the ownership trigger · one thing per place · one place per thing · **emptying a room leaves the collection untouched** · a ring is never furniture · a retired manager is neither in the corridor nor visitable · the corridor's count can fall |
| `lib/rooms/driver-coverage.test.ts` | every state photographed · every state *checked* · every theme photographed · the whole object map named · the four places driven through the product's own controls |
| `checkRoom` (visual QA) | the object map on every room state · the room's own path · **how many things are actually on show** · which theme actually rendered · **whether the painted shell or the stand-in drew it** · a panel that was meant to be up · **no control on a visited room that would change it** |
| `lib/assets/batches.test.ts` | the basement handoff briefs exactly the three shells the themes resolve, at the canvas the room is authored in, and names all six prepared places |

Eight visual states at three widths: `room` · `room-furnished` · `room-slot` ·
`room-corridor` · `room-rec` · `room-cold` · `room-visited` · `room-empty`.

**One coverage limit, recorded rather than hidden.** `room-visited` photographs a
room with **nothing on its shelves**, and it cannot photograph a furnished one
today. A visited room is always a real league manager's — demo seats are excluded
from `activeLeagueManagers` and therefore from `visitable()` — and on a freshly
seeded database no real manager has put anything anywhere. Furnishing one would
mean signing in as them and spending the boxes `tray-owned-box` depends on, which
is one state paying for another's screenshot.

What the state *does* prove is everything structural: the eight objects, the
corridor navigation, the visitor's copy on an empty place, the rail with a
verified title on it, and — read out of the DOM — that no control on the page
could change somebody else's room. It becomes a furnished capture the first time
a real manager uses the feature, which is also the first time it would matter.

---

## 13. What this deliberately does not decide

- **The Underground.** Untouched. `docs/OPEN_ITEMS.md` carries the reconciliation
  and the decision that is wanted.
- **Whether more places, more themes, or any cosmetic economy should exist.**
  Four places and three themes are `04 §10` and `16`'s numbers. Growing either is
  a product decision, not a styling one.
- **The basement spotlight** (`08 §17`), which links a Slice story to a manager's
  room. The route it needs now exists; the Slice candidate does not, and adding
  one is a Slice change rather than a room change.

---

## 14. The manager sprite — why Image 2's fidelity is not a swap

**Commissioner direction, 2026-08-09** supplies an approved manager-sprite
reference and asks that managers *"feel substantially more illustrated"* and
*"clearly part of the same world as Tony"*. This section records what stands
between the current sprite and that bar, because it is **not** what it looks
like, and the obvious plan does not work.

### 14.1 The obvious plan, and why it fails

`components/character/character-view.tsx` already carries a per-layer art-swap
contract: *"the moment a registry row gains a `path`, that one layer draws its
PNG and the rest keep drawing themselves."* So the obvious answer is to generate
PNGs for the twenty-nine layer slugs and drop them in.

**That would destroy the colour system.** Colour in this product is a *runtime
parameter*, not a property of a drawing:

| Trait | Options | How it is applied |
|---|---|---|
| skin | 4 ramps | `paint: { kind: 'skin', index }` resolved at render |
| hair colour | 8 ramps | `paint: { kind: 'hair', index }` |
| top colour | 8 ramps | `paint: { kind: 'top', index }` |

`composeCharacter` attaches a `Paint` to every layer and `coloursFor` resolves it
against `lib/character/palette.ts` — *"resolved from the configuration, never
stored."* A layer that resolves to a **PNG bypasses that entirely**: `pngLayers`
draws the file as authored. `avatar_hair_03` as a PNG is one hair colour, and
the other seven silently stop existing.

Keeping the traits *and* using PNGs means a file per shape **per colour**:

```
body      1 shape × 4 skins   =   4
hair      6 shapes × 8 colours =  48
facial    4 shapes × 8 colours =  32
tops      6 shapes × 8 colours =  48
                                 ---
                                 132 files, before a single wearable
```

…and every colour added later multiplies four ways. That is not a batch; it is a
combinatorial explosion standing in for a parameter.

### 14.2 The two ways forward, and what each costs

Both are real, and **this is a commissioner decision rather than an engineering
one**, because the second one changes an approved pipeline.

**Option A — raise the drawn fidelity in place.** The layers are authored as
shapes in `lib/character/art/*.ts` against a shared geometry module, with derived
shading — a real sprite system, not nine rectangles. Anatomy, silhouette,
shading steps and outline treatment are all properties of that data and can be
improved without touching a trait, the canvas, the layer order, the editor or
the defaults.

- **Costs no art and no new pipeline.** Nothing closed is reopened.
- **Ceilinged by hand-authoring.** It will get closer to the reference; it will
  not reach a painted sprite, and `art/geometry.ts` already records why —
  matching Tony's density needs a canvas around 88 × 200 and *"a set of thirty
  layers at that size is not authorable by hand."*

**Option B — a tinted-mask pipeline.** Author each layer as a **2-tone mask**
(base, shade, outline) and have the renderer recolour it per ramp, exactly as the
shape system does today. This is the one route that reaches the reference's
fidelity **and** keeps 11,520 combinations from ~29 assets.

- **Reaches the bar.** A painted sprite, still fully customisable.
- **Costs a pipeline.** A mask convention, a recolouring step, and an art batch
  of ~29 masks generated to it. It is additive to the customiser — the traits,
  the canvas, the layer order and the stored integers are all untouched — but it
  is a new rendering path and a new acceptance gate.

### 14.3 What was deliberately not done

**Nothing.** The customiser is `CLOSED — production verified` and this direction
says explicitly not to reopen it, so no trait, canvas, layer, default or guard
moved, and no character art was invented. The one character-adjacent change in
this slice is where the figure *stands*: 29.5% of the room's height, up from
24%, set from the reference so a manager reads as somebody in the room rather
than a figure against its back wall. That is a property of the **room**, and
`objects.test.ts` pins it.
