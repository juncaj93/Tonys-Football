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
| `stairs` | **Door** → `/back-hall` | The way out. The only Door in the room |
| `shelf_left` · `shelf_right` | Display | Two places on one plank |
| `wall` | Display | A nail |
| `bench` | Display | The workbench — `04 §10`'s "special display slot" |
| `rings` | Display | The championship rail. **Derived, not a slot** |
| `manager` | Display | The person standing in it |
| `corridor` | Display | The door to the other nine rooms |

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

**Setting it back to `false` shuts the door completely**: the hall draws the
chain, the stairs stop being an anchor, and the built room is simply unreachable.
No data is touched and nothing is lost. That reversibility is what made opening
it the right default rather than a commitment.

What `18 §6` also asks for is that the opening be **announced**. That is the
commissioner's act, not a deploy's, and it has not been done.

**The shut hall is still photographed.** The override could only ever *add* until
now, so the moment the default flipped, the chained stairwell became the state no
parameter could produce — and it is the state a revert produces, where being
wrong is least recoverable. `?open=none` is the sentinel that keeps it
reachable, and `back-hall-shut` photographs it at all three widths.

---

## 10. Art: none is required, and none is requested

**No room art exists and this feature does not ask for any.** There is no
`zone_room_shell_*` slug in `art/assets.inventory.json` and there was none before
this change.

`components/scene/manager-room.tsx` draws the room in **flat rectangles in
palette colours**, which is the placeholder architecture the commissioner
approved on 2026-07-31 (*"do not block all Back Hall development on final art…
use deliberate in-world placeholder architecture"*) and which
`components/scene/back-hall.tsx` is the worked precedent for. It draws from the
same rectangles the hit regions use, so what a manager sees and what a tap lands
on cannot drift.

Two things in the room use **real, already-approved art**:

- **Collectibles** in the four places — the twelve Batch B sprites, at their
  authored 46 × 46 into a 46 × 46 slot, which is the pipeline's *one art pixel is
  one room unit*.
- **Championships** on the rail — `object_champion_banner`, the same 18 × 15
  pennant the parlor's own rail hangs. A manager who has seen the shop reads a
  pennant as a title before anything explains it. The alternative,
  `item_championship_ring`, is still a placeholder and would have drawn a row of
  identical cartons on a wall rail, which says *storage* — the one thing that
  rail must not say.

**The pennant carries no year here.** The parlor's does, and that mark is the
product's one declared exemption from the type floor (10.1 CSS px at 360),
justified there because the rail is the only place the season is named. Here the
panel lists every title at body size, so a second exemption would spend the
rule's one concession to save a tap.

When room art ever exists, `manager-room.tsx` is deleted and the overlays become
`AssetView`s. The coordinates, the themes, the flags and the gates are all
outside it.

---

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
| `lib/rooms/objects.test.ts` | eight objects · exactly one Door · no two overlapping · 44 CSS px on the narrowest phone · every slot at the collectible's authored 46 × 46 · no label that is a route or a column name · three themes, each with a full material set · an unknown theme repaired on read |
| `lib/rooms/service.test.ts` | one room per manager under concurrency · the ownership trigger · one thing per place · one place per thing · **emptying a room leaves the collection untouched** · a ring is never furniture · a retired manager is neither in the corridor nor visitable · the corridor's count can fall |
| `lib/rooms/driver-coverage.test.ts` | every state photographed · every state *checked* · every theme photographed · the whole object map named · the four places driven through the product's own controls |
| `checkRoom` (visual QA) | the object map on every room state · the room's own path · **how many things are actually on show** · which theme actually rendered · a panel that was meant to be up · **no control on a visited room that would change it** |

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
