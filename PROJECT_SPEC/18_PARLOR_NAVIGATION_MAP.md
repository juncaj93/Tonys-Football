# 18 — The Parlor's Environmental Navigation Map

**Version:** 2.0 — Counter Shop and Back Hall
**Status:** ✅ Approved — canonical. Governs every interactable object in the parlor.
**Approved:** 2026-07-29
**Supersedes:** version 1.0 of this document in its entirety. See §0.
**Applies to:** V1 Doors Open, and every later slice that adds a room object.

---

## 0. What this version supersedes

Version 1.0 of this document is **withdrawn**, not amended. The following decisions from it must not survive anywhere in the specification, the art inventory, the prompts, or the handoff:

| Withdrawn | Replaced by |
|---|---|
| A separate homepage **basement door** | The single rear doorway → Back Hall → `/rooms` |
| A separate homepage **Underground / back door** | The single rear doorway → Back Hall → `/underground` |
| The homepage **display case** as the Collection entrance | The **countertop tray** → `/counter` |
| **`/collection`** as the primary collectible route | **`/counter`**, with `/counter/collection` beneath it |
| The **five-Door** homepage manifest (3 open + 2 locked) | **Four Doors**, three Displays, one Toy |
| The **"exactly three objects are highlighted"** rule | A Door glows **only when it has something to say** (§3.1) |
| The **nine-object** verification list | The **eight-object** list in §10 |
| Separate **basement** and **Underground** prepared openings in the shell | **One** plain rear doorway |
| **Authored SVG silhouette polygons** shipped beside each Door | **Alpha-derived** silhouettes — `filter: drop-shadow()` on the overlay's own alpha (§9.4) |
| **Six landscape zone tiles** composed into a room | **One portrait shell** at 960×1707 plus transparent overlays (§8) |

Also retired and not to reappear anywhere: **the second homepage door**, **the floor hatch**, **the clipboard**, **`zone_menu_board`**, **"Keys"** and **"Office"** as parlor objects.

**Retained unchanged from version 1.0:**

- The four-role taxonomy — Door · Display · Toy · Scenery (§2)
- The governing rule: an object earns a destination only if a manager can guess where it goes before tapping (§1)
- Silhouette-shaped affordance, never a bounding box — only the *derivation* changed
- Locked destinations are visible but never glow, and answer in-world (§6)
- Tony is a Toy and never navigation
- Destinations are named for what the manager will find, never for the furniture
- Most of the room is scenery, permanently

---

## 1. The governing rule

> **An object earns a destination only if a manager can guess where it goes before tapping it.**

If a label is needed to explain *why* that object leads there, the mapping is wrong. Change the object or drop the destination — do not add a tooltip.

**Corollary: decoration is allowed to be decoration.** A room where everything is clickable is not a room, it is a toolbar with wallpaper. Most of the parlor is scenery, permanently and by design.

---

## 2. Four kinds of object

Every object in the room is exactly one of these. This taxonomy is what dissolves the arbitrary-rectangle problem.

| Kind | Behaviour | Affordance |
|---|---|---|
| **Door** | Navigates to a destination | Glows **only when it has something to say** |
| **Display** | Shows live content in place; may expand | **None** — the content *is* the affordance |
| **Toy** | Reacts; gives no information and goes nowhere | None |
| **Scenery** | Not interactive | None |

---

## 3. The homepage — eight objects

| # | Object | Role | Route / behaviour | Kind |
|---|---|---|---|---|
| ① | **Left arched nook** — newspaper rack | The Slice | `/slice` | Door |
| ② | **Large wall board** | Tonight at Tony's | Expands in place | Display |
| ③ | **Banner rail** | Champions & History | `/timeline` | Door |
| ④ | **Small sign right of Tony** | Prediction (V1); Tony's Line (flagged) | Expands in place | Display |
| ⑤ | **Receipt in front of Tony** | Manager record | Expands in place | Display |
| ⑥ | **Countertop tray** | Tony's Counter | `/counter` | Door |
| ⑦ | **Right-rear doorway** | Back Hall | `/back-hall` | Door |
| ⑧ | **Tony** | Dialogue | No route | Toy |

**Four Doors, three Displays, one Toy.**

**There is no basement door, no Underground door, and no display case on the homepage.**

**Why each Door belongs:** a rack holds papers. Banners hang on a wall and you look up at them. A tray on the counter is where the thing you are buying sits. A doorway in the back wall goes into the back. None of these needs explaining.

The banner rail is the strongest content at launch, because 2024 and 2025 are already imported.

### 3.1 The glow rule

A Door glows **only when it has something meaningful to say**. This replaces the fixed "exactly three glow" rule of version 1.0.

| Door | Glows when |
|---|---|
| **Newspaper rack** | A Slice is unread |
| **Countertop tray** | A box is owned, purchasable, or meaningfully available |
| **Back Hall** | Something beyond it is available or newly relevant |
| **Banner rail** | **Never persistently.** Visibly tappable; the banners are their own affordance. |

Typically **one or two** objects glow at once. Locked and quiet destinations stay calm.

A glow that is always on is wallpaper. A glow that appears when something changed is information — that is the whole reason the rule moved from a fixed count to a condition.

### 3.2 Tonight at Tony's — deterministic precedence

The board carries a state line, a headliner, and up to two supporting lines. **Four readable lines maximum. It never scrolls.**

First match wins:

1. Championship or playoff elimination in progress
2. A new Slice published and unread
3. Draft or season-opening status
4. Playoff-race implication in the current week
5. Highest-stakes matchup — best combined record, tiebreak on combined points-for
6. Commissioner announcement
7. Offseason countdown

The board is also where the **current week** lives. It is the first thing you see walking in, and "what week is it" and "what's new" are the same question asked twice.

| State | Header |
|---|---|
| Offseason | `SEASON OPENS IN 44 DAYS` |
| In season | `WEEK 7 · FINAL` |

### 3.3 The receipt — preseason versus in-season

| Phase | Contents |
|---|---|
| **Preseason** | Canonical name · career regular-season record since 2024 · previous finish · titles |
| **In-season** | Canonical name · current W–L · points for · streak or recent result |

The switch trigger is **the first finalized week of the current season**, not the season start date. The receipt **never renders `0–0`**.

Records come from finalized `rosters.settings`, never recomputed from corrected weekly scores, per the Stats & Data ruling. Regular season only; playoff records are separate and labelled.

The receipt expands in place. It has the manager's own name on it — it needs no glow and no route.

### 3.4 The small sign — V1 versus flagged

**V1:** Tony's weekly prediction only. The next issue of the Slice marks it right or wrong.

**Later, behind the approved feature flag — Tony's Line**, the already-approved weekly market:

- Line set at a season median or rolling average — structurally ~50/50, using no projection data
- Fixed stake · fixed 2× payout
- Closes before kickoff
- Settled by the Tuesday job from finalized data
- All movement through `apply_token_delta` with an idempotency key

**No separate weekly prop system is created.** No real-money framing; tokens are never called cash, dollars, or winnings.

### 3.5 Tony's protected lane

`x 54–146, y 173–285` in logical units (320×569).

- The nook stays left of and clear of the lane
- No doorway in the lane
- The receipt sits below and in front of him
- Tray contents never obscure his face
- The foreground counter layer overlaps his lower body
- The board and the banners never cover his head

### 3.6 Scenery — explicitly not interactive

Booths and tables · checkered cloth · arcade carpet · neon signs · storefront window · pizza oven · corkboard papers · wall frames and posters that are not banners · the burn barrel · the counter itself · the register.

**Booths become a people surface in V2**, once avatars exist and league members appear in them; tapping a person will go to that person. Until there is someone sitting there, a booth is somewhere to sit.

---

## 4. Tony's Counter

**Canonical route: `/counter`.** Not `/shop` — the product takes no money, and "the counter" is what Tony calls it.

| Route | Contents |
|---|---|
| `/counter` | Available boxes, rotation, token prices, purchase, owned unopened boxes |
| `/counter/collection` | All owned collectibles, filters, rarity, set progress |
| `/counter/showcase` | The one item shown to the league. No levels, prestige, or clout. |

**Landing priority** on `/counter`: owned unopened box → available rare box → normal inventory → collection progress.

### 4.1 Opening happens at the tray

**Tapping an owned box on the homepage opens it *there*, in place.**

Routing to `/counter` first inserts a navigation step into the most exciting moment in the product. The route is for browsing; the tray is for the moment.

### 4.2 Rotation

- **League-wide, never per-manager.** A legendary appearing is a shared event someone mentions in the group chat — that is the entire point. Per-manager rotation is unfair in a way ten friends notice immediately.
- **Deterministic.** Stock is generated by the Tuesday job from a seeded shuffle over the catalog, stored, and identical for everyone. Never generated on read. Never on the client.
- **Rarity gates frequency, not price.** Price may scale modestly by tier, but rarity does its work through how often a box appears — so a manager having a poor token season is never locked out of the best content.
- **Tuesday to Tuesday.** Everything returns. No countdowns.
- **Simulation-gated.** Frequencies, prices, and reward tables are Phase 3 outputs. No values lock before the multi-season simulation runs.

### 4.3 Authority

Purchase and opening are server-authoritative, transactional, auditable, and idempotent. The reward is resolved from a stored reward table, with the box's config version recorded on the opening. Duplicate requests and refresh rerolls are rejected. **The client never decides a reward.** All token movement goes through `apply_token_delta`.

---

## 5. The Back Hall

**One rear doorway → `/back-hall`.**

On the homepage it is simply the staff-side door. It is **not** described as the basement and **not** described as the Casino. Unlabeled is preferred. It glows only when something beyond it is open; in V1 that is nothing, so it ships present and calm.

The Back Hall is **a small pixel-art scene, not a menu card**: one compact screen, no scrolling, two obvious environmental choices, plus an in-world return door.

| Destination | Metaphor | Route | V1 status |
|---|---|---|---|
| **Rooms** | Basement stairs / cellar landing | `/rooms` | Locked → V2 |
| **Underground** | Curtained, unmarked doorway | `/underground` | Locked → later phase |

The Underground is **never labelled `CASINO`** on first discovery. Its locked line is: *"Don't worry about it."*

**No card grid, no bottom navigation, no browser-back dependency.** The in-world return door goes back to the parlor.

Rooms and Underground are **two taps** from the parlor. This is the one approved exception to one-tap depth, for two reasons: both fictionally belong behind the public dining room, and the artwork has exactly one real rear doorway. The Back Hall also **improves the reveal** — a curtained door in the public dining room is odd; in a staff hallway it is exactly right.

---

## 6. Locked areas

1. **Visible.** A locked destination is a closed door, never a hidden one. Managers should know the downstairs exists before it opens.
2. **Never highlighted.** Glow means *available now*. This is what keeps the affordance honest.
3. **Tappable, but answers in-world.** Tapping gives a Tony line — not a route, not a modal, not a "coming soon" badge.

**No countdown timers on locked doors.** The single honest countdown in the product is end-of-season spend-down (`16 §8`). A door that opens "in 3 days" manufactures urgency; a door that is simply shut does not.

When a locked door opens, it opens **for everyone at once**, as an announced event — the world's own progressive-revelation mechanic rather than a per-user unlock (`16 §6`).

---

## 7. Click depth

| Depth | Destinations |
|---|---|
| **One tap from the parlor** | The Slice · Tonight · Champions & History · the prediction · the receipt · Tony's Counter · the Back Hall · Tony |
| **Two taps** | Rooms · Underground |
| **One tap inside the Counter** | Purchase · open an owned box · Collection · Showcase |

**Loot boxes are never behind the Back Hall.** The economy is a core loop, not a back room.

Nothing else in the product is deeper than two taps from the parlor.

---

## 8. Shell architecture

The room is **one portrait shell plus transparent overlays**. It is not six composed tiles, and it is not a grid of hotspots.

**Generate the shell at 960×1707** — exactly 3× the 320×569 logical room.

### 8.1 Baked into the shell — architecture and blank Display surfaces only

| Element | Drawn as |
|---|---|
| Left arched alcove | **Empty recess.** No rack, no stand, no newspapers. |
| Large wall board | **Fully drawn, face completely blank** |
| Banner rail | **Bare rail.** Nothing hanging. |
| Small sign | **Fully drawn, face completely blank** |
| Receipt | **Fully drawn, paper completely blank**, lying in front of Tony |
| Countertop tray | **Empty.** No box, no items, no glow. |
| Right-rear doorway | **Plain framed opening.** No door leaf, curtain, handle, or sign. |
| Booths, counter, carpet, oven, atmosphere | Fully drawn |

Each recess and opening carries **its own soft interior shadow**, so overlays sit *into* the room rather than on top of it.

### 8.2 Never in the shell

Characters · any text or lettering · a box · a rack · banners · a display case · a second doorway · a floor hatch · rarity glows · any bloom or highlight effect.

### 8.3 The distinction that matters

Four things are deliberately kept apart, and confusing any two of them is how version 1.0 went wrong:

| Layer | What it is | Changes how often |
|---|---|---|
| **Architectural shell** | Baked pixel art: walls, fixtures, recesses, blank surfaces | Once, then almost never |
| **State overlays** | Transparent PNGs placed into prepared spots | When state changes |
| **Runtime HTML/CSS** | Every changing word, number, and glow | Every request |
| **Feature-flagged behaviour** | Tony's Line, Rooms, Underground | On a phase gate |

---

## 9. Asset manifest

### 9.1 Homepage overlays

| Asset | Purpose | Variants |
|---|---|---|
| `object_newspaper_rack` | Door → `/slice`; sits in the left alcove | 1 |
| `object_banner` | Reusable; one instance rendered per season | 1 |
| `object_box_standard` | Tray state | 1 |
| `object_box_rare` | Tray state | 1 |
| `object_box_legendary` | Tray state | 1 |
| `object_box_owned` | Tray state — unopened, owned | 1 |
| `zone_parlor_counter_front` | Foreground counter layer, overlaps Tony's lower body | 1 |
| `character_tony_neutral` | Tony | **Exists** — rescale to 3× |

### 9.2 Back Hall

| Asset | Purpose |
|---|---|
| `zone_back_hall_shell` | The scene, with prepared empty places |
| `object_stairs_rooms` | Door → `/rooms` |
| `object_door_underground_locked` | Door, locked state |
| `object_door_underground_open` | Door, open state |
| `object_door_return` | In-world return to the parlor |

### 9.3 Runtime HTML/CSS — never baked into art

Tonight board text · the prediction · Tony's Line when flagged · the manager receipt · banner champion name and year · box price and availability · **every glow and rarity treatment**.

### 9.4 Affordance implementation — alpha-derived

**Glow is `filter: drop-shadow()` applied to the overlay's own alpha channel.**

It follows the silhouette exactly, never covers the wall beside the object, and updates automatically when the art is swapped. **No authored masks. No SVG polygons. No hit-map images.** This replaces the authored-silhouette requirement of version 1.0 outright.

- **Hit region** is the tightly-cropped overlay's bounding box, expanded to a **44px minimum** effective target. Expand the hit region, never the glow.
- **Reduced motion** replaces every pulse with a static outline.
- No hover-dependent behaviour anywhere.

### 9.5 Banner expansion

The rail holds **six banners at full size**. From the seventh, banners scale together on a shared rail geometry.

Seasons 1–6 require no new art beyond the single reusable `object_banner` overlay. **Baked lettering is rejected** — it would force regeneration every January and make historical names unfixable.

---

## 10. Acceptance — the eight-object list

On an iPhone, one-handed:

- [ ] Exactly **eight** interactive objects: **4 Doors, 3 Displays, 1 Toy**
- [ ] **No** basement door, **no** Underground door, **no** display case, **no** second doorway, **no** floor hatch on the homepage
- [ ] Typically **one or two** objects glow; the banner rail never glows persistently
- [ ] Every glowing object is guessable **before** tapping
- [ ] Tapping an owned box opens it **at the tray**, in place — no navigation first
- [ ] The rear doorway is unlabeled and calm in V1
- [ ] The Back Hall is one screen, two obvious choices, and an in-world return
- [ ] Rooms and Underground are two taps; nothing else is deeper than two
- [ ] Tapping Tony produces a line and no navigation
- [ ] Tapping a booth, poster, or wall frame does nothing at all
- [ ] Every tap lands on the object, never on the wall beside it
- [ ] All changing text is HTML over blank surfaces — **none baked into art**
- [ ] Reduced motion replaces every pulse with a static outline
- [ ] One iPhone screen; no scrolling required to reach any destination

**The real test:** show it to someone who has never seen it and ask where the newspaper goes. If they have to tap to find out, this document has not been implemented.

---

## 11. Shell-generation brief

Hand this verbatim to the Art Designer. It produces the **architectural shell only**.

> A 1990s neighbourhood pizza parlor interior, shallow stage box, portrait, seen from just inside the door at standing eye level. Warm key light from the upper left, cool fill from the lower right. Booths, counter, pizza oven, wood panelling, checkered detailing, clean patterned carpet, warm pizza-shop clutter.
>
> Draw these four fixtures **completely, with every face entirely blank** — no letters, numerals, words or marks of any kind: a large cream wall board; a small dark sign to the right of the counter's centre; a single paper receipt lying flat on the counter toward the front; a bare horizontal rail mounted above the large board.
>
> Include these **two empty architectural features**, prepared but containing nothing:
> - a **shallow empty arched alcove** at floor level on the far left — plain recessed wall and floor, **no rack, stand or newspapers**
> - a **plain framed doorway opening** in the right rear wall near the booths — **no door leaf, curtain, handle or sign**
>
> Leave a **clear empty section of countertop** with nothing standing on it. Leave the counter's centre-left standing area clear for a character who is not drawn here.
>
> Each recess and opening carries its own soft interior shadow. Leave the front strip of floor clear.
>
> **Negative:** no people or characters · no newspaper rack · no banners or pennants · no box or package on the counter · no display case or vitrine · no door leaf · no curtain · no second doorway · no floor hatch · no letters, numerals or lettering shapes anywhere · no glow, bloom or highlight effects · no team logos · no brand marks.

**Canvas:** 960 × 1707. **Palette:** quantize to `art/palette.json` per `art/ASSET_PIPELINE.md §4`.
