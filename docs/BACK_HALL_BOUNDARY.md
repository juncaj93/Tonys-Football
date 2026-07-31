# The Back Hall — the implementation boundary, prepared

**Status:** preparation only, 2026-07-31. **No implementation, and this must not delay Slice polish or Batch B integration.**

The commissioner's instruction: *"You may inspect and clarify the Back Hall, Rooms and Underground specifications. Prepare route contracts, state boundaries, navigation flow, locked/open states, demo requirements, and visual asset slots. Do not create generic dashboard pages."*

The authority is `PROJECT_SPEC/18_PARLOR_NAVIGATION_MAP.md §5`–`§6` and `§9.2`. This file records what is **already true in code**, what `18` fixes that a future implementer must not re-decide, and the contracts that need to exist before anybody opens M4.

---

## 0. What exists today

| | State |
|---|---|
| `/back-hall` | **Built** — `app/back-hall/page.tsx`, 102 lines. Reached by the homepage's one rear doorway |
| `/rooms` | **Built as a closed room** — `app/rooms/page.tsx`, 41 lines, a `ClosedRoom` panel |
| `/underground` | **Deliberately not a route, and correctly so.** It is an inert plate on `/back-hall` that answers in world. A `<Link href="/underground">` to a route that did not exist shipped once, was prefetched on hover, logged a 404 on every visit, and was caught by the console gate rather than by CI (`VISUAL_ACCEPTANCE §0`) |
| Art | Every slot in `18 §9.2` is a placeholder. `zone_back_hall_shell`, `object_stairs_rooms`, `object_door_underground_locked` / `_open`, `object_door_return` |

**Read `app/back-hall/page.tsx` before touching any of this.** It already carries the reasoning for two decisions that look like omissions: the Underground is *not* a `Link`, and its line is the fixed copy from `18 §5`. Both are correct and both are the kind of thing a later change quietly undoes.

---

## 1. Route contracts

| Route | Owns | Never |
|---|---|---|
| `/back-hall` | One compact pixel-art scene: two environmental choices and an in-world return | A card grid · a bottom nav · scrolling · a heading that says "Back Hall" as a page title |
| `/rooms` | The basement landing. **Locked in v1** (`16` defers basements to P6 / v1.1) | Any inventory, any placement, any drag |
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
3. **The rear doorway glows only when something beyond it is open** (`18 §3` — a Door glows only when it has something to say, and only Doors glow). In v1 nothing beyond it is open, so **it ships present and calm**. The `glow` gate in `npm run visual:qa` already fails a room where anything else glows; it will fail a Back Hall door that glows for nothing.

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
