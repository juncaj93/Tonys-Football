# 18 — The Parlor's Environmental Navigation Map

**Version:** 1.0
**Status:** ✅ Approved — canonical. Governs every interactable object in the parlor.
**Approved:** 2026-07-28
**Applies to:** V1 Doors Open, and every later slice that adds a room object.

---

## 0. Why this exists

The room-as-menu is the right idea, and the first implementation failed it in a specific way: objects became hotspots because they were *drawn*, not because they *meant* something. A wall frame, a poster, a booth, and Tony each received the same rectangle, so the rectangle stopped carrying information.

The destination names compounded it. "Shelves," "Keys," "Office," "Rack," "Downstairs" are internal shorthand rather than places a manager can picture — and two of them named the same thing.

This document fixes the cause rather than the highlights.

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
| **Door** | Navigates to a destination | **Yes** — persistent, object-shaped |
| **Display** | Shows live content in place; may expand | **No** — the content *is* the affordance |
| **Toy** | Reacts; gives no information and goes nowhere | Faint at most |
| **Scenery** | Not interactive | None |

**Only Doors are highlighted.** That single rule takes the room from roughly ten competing rectangles to **three**, and restores the meaning of the highlight: *highlighted means somewhere you can go right now.*

---

## 3. The canonical map

### 3.1 Doors — three in V1, and only three

| | Object | Destination | Live text | Highlighted |
|---|---|---|---|---|
| ① | **Newspaper rack** | The Slice · `/slice` | Masthead: `TONY'S TUESDAY SLICE` + issue date. Offseason: `NO ISSUE YET · BACK IN SEPTEMBER` | Yes, when unread |
| ② | **Display case** | Collection · `/collection` | Plaque: `3 OF 36`. Empty: `CASE IS EMPTY — TONY'S WAITING ON A DELIVERY` | Yes, when the manager owns anything |
| ③ | **Trophy wall** | History · `/timeline` | The banners: `2024` and `2025` with each champion's name | Yes |

**Why each belongs:** a rack holds papers. A glass case holds things worth looking at. Banners hang on a wall and you look up at them. None of these needs explaining.

The trophy wall is the strongest content at launch, because 2024 and 2025 are already imported.

### 3.2 Doors — visible, locked

| | Object | Destination | Live text | Highlighted |
|---|---|---|---|---|
| ④ | **Basement door** | Rooms — locked until V2 | Handwritten sign: `DOWNSTAIRS CLOSED` | **No** |
| ⑤ | **Back door** | Underground — locked, later phase | Boards across it; a scrap reading `DON'T` | **No** |

Tapping either gives a Tony line, never a route. See §6.

### 3.3 Displays — read in place, no navigation

| | Object | Shows | Highlighted |
|---|---|---|---|
| ⑥ | **Board by the door** | Current week or season phase as a header, then ≤4 lines of what changed. Never scrolls. | No — already the loudest text in the room |
| ⑦ | **Receipt on the counter** | Record, finish, points, streak. Expands in place; **no route in V1** | No — it has the manager's name on it |
| ⑧ | **Chalkboard behind the counter** | Tony's weekly prediction; the next issue marks it right or wrong | No |

⑥ is the object that displays the current week — see §5. ⑦ replaces the clipboard entirely — see §4.

### 3.4 Toy

| | Object | Behaviour |
|---|---|---|
| ⑨ | **Tony** | Says something else. Cooldown-limited. **Goes nowhere.** |

**Tony is never navigation.** Making him a menu button cheapens the character and contradicts `12 §23`. He is the one thing in the room that responds without leading anywhere, which is exactly what makes the room feel inhabited rather than operated.

### 3.5 Scenery — explicitly not interactive

Booths and tables · checkered cloth · arcade carpet · neon signs · storefront window · pizza oven · corkboard papers · wall frames and posters that are not banners · the burn barrel.

**Booths become a people surface in V2**, once avatars exist and league members appear in them; tapping a person will go to that person. Until there is someone sitting there, a booth is somewhere to sit.

---

## 4. Removed and consolidated

| Was | Ruling |
|---|---|
| **"Shelves"** | → **The Case**, destination Collection |
| **"Rack"** | → destination **The Slice** |
| **"Downstairs"** | → **Rooms**; locked until V2 |
| **"Keys"** and **"Office"** | **Both removed from the room.** They name the same thing — commissioner tools — and `02 §3` requires admin to have a separate entry that does not displace player navigation. Admin belongs in the nav or a profile menu, never as a parlor object. |
| **Clipboard** | **Removed.** It duplicated the receipt. One object, one job — and a receipt is a literal record of what you did, a better metaphor for record and standing than a clipboard. |
| **Menu board (featured rotator)** | **Merged into the board by the door.** Two boards on two walls both answering "what's happening" was the redundancy driving the confusion. The space above the counter becomes the chalkboard. |
| **Tony as a destination** | **Removed.** Toy, not Door. |
| **Wall frames, posters, booths as hotspots** | **Removed.** Scenery. |

**Net: roughly ten competing interactables → three Doors, three Displays, one Toy, two visible locked doors.**

---

## 5. The current week

**The board by the door displays it.** It is the first thing you see walking in, and "what week is it" and "what's new" are the same question asked twice.

Not the chalkboard — that carries Tony's opinion, not the league's status. Not the menu board — that no longer exists as a separate object.

| State | Header |
|---|---|
| Offseason | `SEASON OPENS IN 44 DAYS` |
| In season | `WEEK 7 · FINAL` |

---

## 6. Locked areas

1. **Visible.** A locked destination is a closed door, never a hidden one. Managers should know the downstairs exists before it opens.
2. **Never highlighted.** Highlight means *available now*. This is what keeps the affordance honest.
3. **Tappable, but answers in-world.** Tapping gives a Tony line — *"Downstairs isn't ready. Landlord's problem."* — not a route, not a modal, not a "coming soon" badge.

**No countdown timers on locked doors.** The single honest countdown in the product is end-of-season spend-down (`16 §8`). A door that opens "in 3 days" manufactures urgency; a door that is simply shut does not.

When a locked door opens, it opens **for everyone at once**, as an announced event — the world's own progressive-revelation mechanic rather than a per-user unlock (`16 §6`).

---

## 7. Discoverability

In strict priority order.

**1 — The object explains itself.** Live text rendered onto the object is the primary mechanism: the rack has a masthead, the case has a plaque, the wall has banners with years on them. This is why the text-driven surfaces in `art/ART_SPEC.md §7` exist, and it does the heaviest lifting here.

**2 — Object-shaped affordance.** A soft glow following the object's **silhouette**, never a bounding box. Doors only.

**3 — Optional assist.** A "what's open?" control that outlines every available Door at once. **Off by default.** Assistance, not the primary explanation.

### 7.1 Hit areas follow silhouettes

**A rectangle around an irregular pixel object is the direct cause of the arbitrary feeling.** It swallows empty wall beside the object, so taps land on nothing and the highlight covers scenery.

Each Door ships with a **silhouette path** authored alongside its art — an SVG polygon tracing the believable outline. Both the hit area and the glow use that path.

Where an object is genuinely rectangular — a poster, a board, a plaque — a rectangle is correct and no path is needed.

### 7.2 Interaction rules

- Only Doors get persistent affordance
- Hit areas follow silhouettes; rectangles only for genuinely rectangular objects
- **Minimum 44px effective touch target** even when the silhouette is smaller — expand the *hit path*, never the glow
- No hover-dependent behaviour
- The glow respects `prefers-reduced-motion`: a static outline instead of a pulse
- Destinations are named for what the manager will find — The Slice, Collection, History, Rooms — **never for the furniture**

---

## 8. Art consequences

| Slug | Change |
|---|---|
| `zone_menu_board` | **Repurposed** → the chalkboard carrying Tony's prediction |
| `zone_wall` | **Renamed** → `zone_trophy_wall`; carries hanging banners, not empty poster patches |
| `zone_front_counter` | Must include a visible **receipt** and Tony's standing position |
| `zone_tonight_board` | Unchanged — now the sole status board |
| `zone_newspaper_rack` · `zone_display_case` | Unchanged |

**Now load-bearing rather than decorative:** `dressing_door_basement`, `dressing_door_boarded`, `surface_plaque`, `surface_banner_blank`, `surface_chalkboard`, `surface_receipt_strip`.

**New production requirement — silhouette paths.** Five objects need one: the newspaper rack, the display case, the trophy-wall banner group, the basement door, and the back door. Authored as SVG polygons in the zone tile's coordinate space and stored beside the asset. Roughly 10–20 points each — a tracing job, not a drawing job.

**No new illustrated assets are required.** This ruling reduces the interactable count and reuses surfaces already specified.

---

## 9. Acceptance

On an iPhone, one-handed:

- [ ] Exactly **three** objects are highlighted
- [ ] Every highlighted object can be correctly guessed **before** tapping
- [ ] Both locked doors are visible, tappable, and **not** highlighted
- [ ] Tapping Tony produces a line and no navigation
- [ ] Tapping a booth, poster, or wall frame does nothing at all
- [ ] The board by the door states the current week or days to the season
- [ ] Every tap lands on the object, never on wall beside it
- [ ] Reduced motion replaces every pulse with a static outline

**The real test:** show it to someone who has never seen it and ask where the newspaper goes. If they have to tap to find out, this document has not been implemented.
