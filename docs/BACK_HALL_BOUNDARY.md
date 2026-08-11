# The Back Hall — the implementation boundary, prepared

**Status:** **implemented, 2026-07-31.** The hall is a room. What follows is the boundary as prepared, with `§0`, `§5` and `§7` corrected to what was actually built and what was found while building it.

> **Amended 2026-08-09 — the stairs are open.** The basement was built and `rooms` was flipped, so the hall a manager walks into now has one destination open and one shut. Four things in this document changed with it and are marked inline: `/rooms` is no longer a closed room (`§0`, `§1`), the rear doorway's reason for not glowing is now a mechanism rather than a state (`§3`), and the two photographed states swapped roles (`§5`). Everything else — the room's grammar, the Underground's fixed line, the object map, the depth rule — is unchanged. `docs/ROOMS_BOUNDARY.md` is the basement's own account.

The commissioner's instruction: *"You may inspect and clarify the Back Hall, Rooms and Underground specifications. Prepare route contracts, state boundaries, navigation flow, locked/open states, demo requirements, and visual asset slots. Do not create generic dashboard pages."*

The authority is `PROJECT_SPEC/18_PARLOR_NAVIGATION_MAP.md §5`–`§6` and `§9.2`. This file records what is **already true in code**, what `18` fixes that a future implementer must not re-decide, and the contracts that need to exist before anybody opens M4.

---

## 0. What exists today

| | State |
|---|---|
| `/back-hall` | **Built as a room** — one portrait scene, three hit regions in room units, nothing scrolling. `lib/backhall/objects.ts` is the map, `components/scene/back-hall.tsx` draws the placeholder scene |
| `/rooms` | **Built as a closed room** — `app/rooms/page.tsx`, 41 lines, a `ClosedRoom` panel. **Superseded 2026-08-09**: the basement is built and the stairs are open. `docs/ROOMS_BOUNDARY.md` |
| `/underground` | **Deliberately not a route, and correctly so.** It is an inert plate on `/back-hall` that answers in world. A `<Link href="/underground">` to a route that did not exist shipped once, was prefetched on hover, logged a 404 on every visit, and was caught by the console gate rather than by CI (`VISUAL_ACCEPTANCE §0`) |
| Art | Every slot in `18 §9.2` is a placeholder. `zone_back_hall_shell`, `object_stairs_rooms`, `object_door_underground_locked` / `_open`, `object_door_return` |

**Read `app/back-hall/page.tsx` before touching any of this.** It already carries the reasoning for two decisions that look like omissions: the Underground is *not* a `Link`, and its line is the fixed copy from `18 §5`. Both are correct and both are the kind of thing a later change quietly undoes.

---

## 1. Route contracts

| Route | Owns | Never |
|---|---|---|
| `/back-hall` | One compact pixel-art scene: two environmental choices and an in-world return | A card grid · a bottom nav · scrolling · a heading that says "Back Hall" as a page title |
| `/rooms` | ~~The basement landing. **Locked in v1**~~ **Open, 2026-08-09.** A manager's own room: four curated places, three themes, the character in it, and a door to the corridor | A card grid · free-form placement · drag-and-drop · a second balance |
| `/underground` | The curtained doorway. **Locked, and never labelled `CASINO` on first discovery** | The word casino, anywhere on the page, in any state |

**`/back-hall` is not a menu.** `18 §5`: *"a small pixel-art scene, not a menu card."* The failure mode has a name in this repository — the room's grammar is objects, and a page of buttons labelled with destinations is the generic dashboard the instruction forbids. If the implementation ends up with a `<ul>` of links, it is wrong regardless of how it is styled.

**One screen, no scroll.** Same contract as the parlor: `Page oneScreen`, `100dvh`, nothing underneath. A Back Hall that scrolls has stopped being a room.

---

## 2. The state boundary — what decides locked from open

**A destination is open when the feature behind it is released, and that is a deploy-time fact, not a per-manager one.**

This matters because the obvious implementation is wrong in a specific way: a per-user unlock implies progression, and `16` removes achievements, levels, clout and prestige from the product entirely. **Nobody earns the Back Hall.** It is a hallway.

So:

| | Mechanism |
|---|---|
| Open / locked | A **feature flag**, one per destination, read server-side |
| Where the flag lives | The same place the reserved `roulette` key lives — `16` requires that key to exist and the feature never to be built, so the mechanism is already specified |
| What a manager sees | Identical for everybody at a given deploy |
| What the door does when locked | Renders as a **closed door with a line**, never hidden, never a disabled button |

`18 §6`: *"a locked destination is a closed door, never a hidden one. Managers should know the downstairs exists before it opens."*

### The two locked lines

| Destination | Line | Source |
|---|---|---|
| Rooms | Curated, in the shop's voice, saying *when* rather than apologising | `05 §8.5` |
| Underground | **`Don't worry about it.`** | `18 §5`, verbatim and not paraphrasable |

The Underground's line is fixed copy. It is the joke and the reveal, and rewording it costs both.

---

## 3. Navigation flow

```
parlor ──(rear doorway, Door ⑦)──► /back-hall ──► /rooms
                ▲                        │
                └────(return door)───────┴──► /underground
```

Three properties, all of them already true of the parlor and all of them easy to lose here:

1. **The return is an in-world door**, not a browser-back dependency and not a breadcrumb. `ReturnPlate` is the existing component and it is what the other interior screens use.
2. **Two taps is the approved maximum depth** for Rooms and Underground, and it is the *only* approved exception to one-tap depth (`18 §5`). Nothing may be added a third tap deep.
3. **The rear doorway does not glow, and after 2026-08-09 that is a mechanism rather than a state.** This used to read *"it glows only when something beyond it is open… in v1 nothing beyond it is open"*, and the second half stopped being true when the basement opened. The doorway still does not glow, and **cannot**: it is baked into the shell (`18 §8.1`), so it carries no overlay, no alpha, and nothing for `drop-shadow()` to follow — `lib/parlor/objects.ts` states it directly. That is also the right answer on the merits. Glow means *available now*, and a door that lit up permanently because a feature exists would turn the affordance into a label. The opening of a locked door is an **announced event** (`18 §6`), which is a thing the commissioner does once, not a thing the room says forever.

---

## 4. Visual asset slots

All five are registry rows today, all placeholders, and all of them are swapped by a registry row rather than a code change (`art/ASSET_PIPELINE.md`).

| Slug | Purpose | Notes for whoever draws it |
|---|---|---|
| `zone_back_hall_shell` | The scene | **One portrait shell plus transparent overlays** (`16` architecture invariant), exactly as the parlor is. Not a grid of hotspots |
| `object_stairs_rooms` | Door → `/rooms` | Basement stairs or a cellar landing. The metaphor must be guessable before tapping |
| `object_door_underground_locked` | Door, locked | Curtained, unmarked. **Nothing on it says what is behind it** |
| `object_door_underground_open` | Door, open | The later-phase state. Drawn now so the slot is proven; never shown in v1 |
| `object_door_return` | Return to the parlor | In-world. The manager should read it as a door, not as a control |

**Silhouettes are alpha-derived** — `filter: drop-shadow()` on the overlay's own alpha, no authored masks, no polygons, no hit-map images. That is an architecture invariant and it is what `checkColourFidelity` enforces.

---

## 5. Demo requirements

The catalog pattern is settled twice over now (`lib/demo/states.ts`, `lib/slice/editions.ts`) and should be copied rather than reinvented.

| State | Shows |
|---|---|
| `back-hall-calm` | v1: both destinations locked, nothing glowing |
| `back-hall-rooms-open` | Rooms open, Underground locked — the first real transition |
| `back-hall-both-open` | Both open. The state nobody will see for a year and which has to look right when they do |
| `rooms-locked` | The closed basement landing and its line |
| `underground-locked` | The curtained door and *"Don't worry about it."* |

**Superseded 2026-08-09, and the two that survive have swapped roles.** `rooms`
opened, so the hall a manager actually walks into has the stairs open and the
curtain shut — that is what **`back-hall`** photographs now. The state needing a
parameter is the one a **revert** produces, and it is **`back-hall-shut`**, via a
new `?open=none` sentinel. Same two flag combinations, opposite defaults, and the
shut hall is still photographed for exactly the reason `§5` gives below: nobody
will look at it until the day somebody needs it.

Every one of them is a **flag combination**, so they need no database writes at all — the same property that makes the Slice's editions safe, arrived at for a different reason.

Three requirements carried forward from the two catalogs that already exist, because both learned them the expensive way:

1. **A state declared and not implemented must throw**, not render something plausible.
2. **A marker attribute the driver checks**, so a state resolved server-side cannot photograph an ordinary page under its name. That false green has happened twice.
3. **A driver-coverage test**, so a state nobody photographs fails the build rather than silently going unreviewed.

---

## 6. What this preparation deliberately does not decide

- **What is actually in Rooms.** Basements are P6 / v1.1 and the room content is not a Back Hall question.
- **What is actually in the Underground.** The casino is P10 and **not in v1**. Roulette is never built; a reserved feature-flag key is the entire required scaffolding.
- **When either opens.** A commissioner decision with a date, not an engineering one.

---

## 7. What is actually wrong today, measured rather than assumed

Two findings from reading the rendered page, neither urgent enough to interrupt Batch B or Slice work, both recorded so they are not rediscovered.

### 7.1 It is a card grid, and `18 §5` says it must not be

The Back Hall is currently three stacked `PixelPanel`s with headings — which is *"a menu card"* almost exactly as `18 §5` describes when it forbids one. The spec's shape is **one compact pixel-art scene, two obvious environmental choices, an in-world return**, on the same one-portrait-shell-plus-overlays grammar as the parlor.

This is not a styling complaint. The room's whole grammar is objects you can guess the destination of before tapping, and a panel with a title is a control with a label — the failure the mandate calls *"generic web boxes"* and the preserved M1 baseline forbids reintroducing.

**It is blocked on art**, which is honest: `zone_back_hall_shell` and its four overlays are placeholders, and building the scene against placeholders would produce a second thing to redo when they arrive. The panels are the correct interim, and the interim should be **recorded as visual debt** rather than mistaken for the design.

### 7.2 Two type sizes are under the floor

| Where | Size | Floor |
|---|---|---|
| The destination body copy | `text-[15px]` | 16–18px, adjusted upward for optical size (`MANDATE §6`) |
| *"Don't worry about it."* | `text-[9px]` | — |

The second is the one that matters. It is the **best line on the page**, it is the entire reveal of the Underground, and at nine pixels in `amber-mid/70` on a cream panel it is close to unreadable at real size. `VISUAL_ACCEPTANCE §7`: **readability wins over styling, always** — and this is a case where the styling is not even winning anything, because a line nobody can read is not atmospheric, it is absent.

**Fixable now, in isolation, without art**: raise both to the floor and take the amber to a colour that clears 4.5:1 on `paper-mid`. Small enough to fold into any slice that touches this route.


---

## 8. What was built, and the three things it corrects in this document

**2026-07-31.** The hall stopped being three stacked panels and became a room, on the parlor's
grammar: one portrait scene, transparent rectangles over it, `Page oneScreen`, no scroll.

### 8.1 The scene is drawn, not signed

`§7.1` said the card grid was *"blocked on art"* and that building against placeholders means
building it twice. **The commissioner's ruling of 2026-07-31 ends that**, and M3 had already shown
what replaces it: flat rectangles in palette colours at the right size, the precedent the pizza box
and the collectible set. `components/scene/back-hall.tsx` is that, and it draws **from the same
rectangles the hit regions use**, so what a manager sees and what a tap lands on cannot drift.

When `zone_back_hall_shell` lands, that file is deleted and the overlays become `AssetView`s.
Nothing else moves — the coordinates, the flags, the lines and the gates are all outside it.

### 8.2 `back-hall-both-open` is a demo this document asked for and the product cannot honestly produce

`§5` lists five demo states. Two of them (`rooms-locked`, `underground-locked`) turned out to be the
same screen as `back-hall-calm`, and one of them **cannot exist**.

`/underground` is *deliberately not a route* — `§0` of this document says so, and `18 §5` explains
why: the reveal is that you find out what is behind the curtain by being let in. So "the Underground
is open" is not a state this product can be in. Rendering it means a `<Link>` to a page that does not
exist, which is the exact defect the console gate caught here once before: prefetched on hover, a 404
on every visit, nothing rendered wrong, no test failed.

It was tried, and the driver hung on `networkidle` against a 404 — which is the most useful possible
outcome, because it made the contradiction impossible to ship. `openTo()` now **throws** if a flag
opens a door with no route behind it, rather than rendering a door onto nothing. The state becomes
photographable in the same change that gives the casino its route, in P10.

**Two states, not five:** `back-hall` (both shut — what every real manager sees) and
`back-hall-rooms-open` (the first real transition). Both are flag combinations needing no database
writes, exactly as `§5` intended.

### 8.3 The chain is a state of the door, and was part of the room for one round

Found by looking at `back-hall-rooms-open` — a state nobody will see for a year, which is precisely
why it is photographed. The stairwell was drawn with a chain across the rail, and the chain was part
of the scene rather than part of the door's state, so **the open stairs were photographed chained**.
Nothing failed. The picture simply contradicted the page.

Fixed, and gated: `checkBackHall` now fails a state whose chain and whose door disagree.

### 8.4 What the gates check now

| Gate | What it catches |
|---|---|
| `backhall.test.ts` | three objects, all Doors · no two overlapping · 44 CSS px on the narrowest phone · the Underground's line verbatim · **no digit and no "soon" on a shut door** (`18 §6`: no countdowns) · nothing naming the casino · `roulette` unopenable by any route including the preview override |
| `driver-coverage.test.ts` | every declared state has a `case`, an expectation, and a gate — and the reason `back-hall-both-open` is absent lives in the assertion that says so |
| `checkBackHall` (visual QA) | the hall's own object map · **which doors are actually open**, read from the DOM rather than assumed from the URL · the chain agreeing with the door · the word for what is behind the curtain never reaching the page |

The `open` check exists for the reason the nine `reveal-*` states did: `?open=` is resolved by the
**server**, so a server without `DEMO_FIXTURES=1` answers every state with the ordinary shut hall —
and a driver that only navigated would file that under a name claiming otherwise and pass.

---

## 9. The art direction, 2026-08-11 — the room is a diagram, and two defects were under it

> **Superseded within the same day by `§10`: the shell was commissioned, delivered and
> hung.** This section is kept because it is the diagnosis and the reasoning, and because
> `§9.2`–`§9.5` are what `§10` executed. Where the two disagree about what exists, `§10`
> is the live account.

Commissioner report: the hall's visual quality is not accepted, and it must belong in the
same illustrated world as the parlor and the storeroom.

`docs/art/BATCH_G_BACK_HALL_HANDOFF.md` is the brief. `docs/evidence/back-hall/` is the
photography and the measurements. What belongs here is the part that governs the room
rather than the picture.

### 9.1 `§8.1`'s stand-in did its job, and its job is over

The 2026-07-31 ruling was *"do not block all Back Hall development on final art — use
deliberate in-world placeholder architecture"*, and it was right: the hall stopped being a
menu card a year before a painting existed. But the stand-in was always **the interim, not
the design**, and this file said so at `§7.1` before the ruling and at `§8.1` after it.

What makes it over is that both neighbours are now painted. In July the hall was a drawn
room between a painted room and nothing; today it is a drawn room **between two painted
rooms**, and it is the only interior in the product that is not art. That is a different
defect from the one `§7.1` recorded, and it is the one the report names.

Measured on production captures at 390 (`docs/evidence/back-hall/README.md`): the hall
spends **9** colours on ≥0.5% of the screen each, against the storeroom's 25 and the
parlor's 48, and its two darkest fills alone cover **56.9%** of the frame.

### 9.2 The stand-in is deleted, not ported

`§8.1` already commits to this and it survives the art direction unchanged: when
`zone_back_hall_shell` lands, `components/scene/back-hall.tsx` is **deleted** and the shell
becomes one `AssetView`. The coordinates, the flags, the locked lines and the gates are all
outside that file, which is why the swap is a registry row plus a deletion.

**One element has to survive it: the chain.** It is a state of the door rather than part of
the room — `§8.3` is the round where that distinction was learned by photographing an open
stairwell with a chain across it — so it stays runtime CSS and is explicitly excluded from
the painting (`BATCH_G §0`).

### 9.3 The curtain is baked, and that is a decision about a Phase 10 asset

`18 §8.1` bakes the parlor's rear doorway as a *plain framed opening* because a rack, a
banner or a box is composited into every prepared place in that room. **Nothing is ever
composited into the Back Hall's three openings in v1**, so the same rule buys nothing here
and costs a second asset.

So the shell draws all three openings complete, closed curtain included. The single
constraint that falls out: the curtain must be drawn **inside a frame drawn around it**, so
`object_door_underground_open` can later be an overlay on the same rectangle without the
frame moving. That asset is Phase 10, it is an announced event that happens once (`18 §6`),
and `/underground` is still deliberately not a route.

### 9.4 The staircase is shared with a room that is already painted

`zone_room_shell_storeroom` shipped on 2026-08-10 and it paints **its own top of these
stairs** — a full wooden flight in a dark timber framed opening, rising away from the
viewer, warm light at the top. That light is this room, and the two shells now have to agree
about one staircase.

It also settles a question the drawn stand-in answered differently. The stand-in cuts a
**hole in the floor with a rail around it**; the storeroom's flight is **framed in timber
and rises away**. The painted room is the one that already shipped, so the hall's stair is
a framed stair head in the wall, not a hatch — and the `stairs` rectangle moves with it.

### 9.5 Two defects found by measuring rather than by reading

**A shut door's answer lands off the bottom of the screen.** `ShutDoor` renders its line 8
units below the door's own rectangle. The stairs end at `y 542`, so at 390 the line's top is
at **670.3px in a 664px viewport** — invisible — and at 375 all but 19px of a 68px panel is
below the fold. Nobody meets it today because `rooms` is open; it is exactly what the
one-line revert in `lib/flags.ts` produces, and `back-hall-shut` is photographed **without
tapping anything**, so no gate has ever seen it. Recorded as visual debt 19, and it becomes
a hard constraint on the new geometry: **a lockable door must end above `y 465`.**

**The room has no status-bar treatment.** `Page oneScreen` deliberately starts the room at
row zero (`components/shell.tsx` carries the reasoning, and it is good reasoning). The
homepage pays for that with a scrim and a utility bar carrying `env(safe-area-inset-top)`;
this route has neither, so the top ≈48 room units sit under the iOS clock and battery with
nothing between them. Measured `roomTop: 0` at all three widths. Not filed as debt because
the honest fix is a decision for the implementation slice — either the parlor's scrim, or a
top band the painting keeps dark and unread. The brief takes the second and does not
foreclose the first.

### 9.6 What this investigation deliberately did not decide

- **What is behind the curtain.** `OPEN_ITEMS` **G1**, and it is a commissioner decision
  between two contradicting commissioner-level sources.
- **The final coordinates.** `BATCH_G §3.1` recommends three rectangles and states the four
  rules they may not break. The storeroom set the precedent on 2026-08-10 — when the art
  came back close, the **code** was re-aimed rather than the painting redrawn — and the
  same applies here, once.
- **Anything about the manager sprite.** No manager ever stands in this room. `C3` is open
  and untouched.

---

## 10. `zone_back_hall_shell` — delivered and hung, 2026-08-11

The commissioner supplied the approved shell the same day the brief went out. It is
processed **unmodified** through `art:process` and live: `/back-hall` stamps
`data-room-shell="art"` at all three widths.

### 10.1 The stand-in is deleted, and the chain is what survives it

`§8.1` promised this and `§9.2` restated it. `components/scene/back-hall.tsx` went from
about a hundred and eighty lines of flat rectangles to one `AssetView` plus the chain.

It is **deleted rather than kept behind a resolver**, which is where the hall differs from
the basement. `manager-room.tsx` keeps its drawing because two of three themes are still
unpainted and the code resolves a shell per theme; the hall has one shell, so a second
branch would be a branch nothing can reach. The honest failure signal for a lost registry
path is the gate, not a silent fallback — `checkBackHall` asserts `data-room-shell` reads
`art`, and `registry.test.ts` pins the slug as `generated`.

The chain stays runtime, for the reason `§8.3` recorded. It also got better: one pale bar
was the only thing left on screen that looked drawn by a programmer, so it is now eye
plates and eleven alternating links, which is what makes a line read as *links* rather than
as a rule. It is still flat and still in palette — it is a state marker, and `MANDATE`
forbids temporary art polished enough to be mistaken for a decision.

### 10.2 The geometry moved to the art, once

Measured by **luminance profile** off the delivered file rather than by eye: the openings
are dark columns in a lit wall, so the jambs are where the column means step.

| | Was (drawn stand-in) | Is (measured off the shell) |
|---|---|---|
| `stairs` | `[16, 392, 112, 150]` | **`[38, 118, 72, 174]`** |
| `curtain` | `[204, 104, 88, 276]` | **`[118, 118, 86, 174]`** |
| `return` | `[122, 122, 70, 258]` | **`[266, 116, 50, 176]`** |

The brief asked for the art to be drawn to the geometry; it came back close and not exact,
and the code moved — the same call the storeroom's delivery made on 2026-08-10, for the
same reason. **That happens once.** These numbers are now the master.

The stairwell changed *kind* as well as position, and that was forced rather than chosen:
the stand-in cut a hole in the near floor and railed it, while `zone_room_shell_storeroom`
— painted first, and painting *the other end of the same flight* — frames it in dark timber
and runs it away from the viewer. Two shells cannot disagree about one staircase.

### 10.3 Visual debt 19 is closed by the geometry, and gated by a tap

`§9.5` filed it and made it a constraint: a **lockable** door must end above `y 465`, because
`ShutDoor` renders its answer 8 units beneath the rectangle and that answer is up to 68 CSS
px tall. Both lockable doors now end at `292`.

Measured on a production build, tapping the shut doors:

| | Was, at 390 | Is |
|---|---|---|
| the stairs' line | `670.3 – 737.9` in a 664px viewport | **`365.6 – 433.2`** |
| the curtain's line | 472.9, fine | 365.6 – 409.4 |

`checkBackHall` now **taps** each shut door and fails if its answer is not wholly on screen.
It had to tap: the line is at `opacity: 0` until something touches the door, and this state
has always been photographed without touching anything, which is why a milestone of
screenshots never saw it. Restoring the old rectangle turns it red at all three widths with
exactly those numbers.

The copy moved with the picture. `LOCKED_LINES.stairs` said *"Chain across the rail"* and
there is no rail in the painting; it now says *"Chain across the stairs."*

### 10.4 Two gates got stronger, and one of them was quietly rotting

- **The chain check read a Tailwind class** (`.bg-ink-100\/70`). Restyling the chain — which
  is exactly what happened here — would have made it match nothing, and *"no chain found"*
  is the **passing** answer for the open state. A gate that silently becomes vacuous is
  worse than no gate. It reads `data-stairs-chained` now.
- **The shell check is new**, and it exists because deleting the fallback removed the only
  other thing that would have noticed.

### 10.5 What the delivered shell measures

| | ≥0.5% of frame | ≥0.1% | distinct |
|---|---|---|---|
| the hall, drawn stand-in | 9 | 16 | — |
| **the hall, painted** | **19** | **25** | 82 |
| the storeroom | 25 | 31 | 73 |
| the parlor | 52 | 64 | 90 |

`BATCH_G §5.10` set the target at 25–48 and it landed at **19**, six under the storeroom.
Recorded rather than rounded up: the room genuinely has a large plain floor, its top colour
covers 15.9% against the storeroom's 19.8%, and at phone size it reads as the same world.
The number is a proxy and the picture is the acceptance criterion (`docs/PALETTE_FIDELITY_BOUNDARY.md`
established that the proxies can prefer the worse picture).

### 10.6 Still not decided, still not touched

The status-bar treatment from `§9.5` — this route has no scrim. The delivered shell keeps
its top band dark and unread, which is the mitigation the brief asked for; the parlor's
scrim remains available and remains a decision for whoever wants it. Nothing about the
Underground, the manager sprite, the parlor or the basement moved.
