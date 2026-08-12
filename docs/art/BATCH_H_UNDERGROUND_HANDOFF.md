# Tony's Pizza Fantasy — Underground Casino Art Production Brief

**Batch H · one asset · `zone_underground_shell`**

> ## Round 1 candidate received, 2026-08-12 — **content approved, rendering register held.**
>
> The commissioner supplied a generated candidate. **Its content compliance is the best of
> any first-round shell this project has had**: no people, no text, blank reel windows, a
> bare baize, no gambling iconography anywhere, one staircase, and an exit that reads as the
> way out with no label. §19 is the full review against §14.6.
>
> **It is not accepted yet, and the reason is not composition.** Beside the three approved
> shells it is a **photographic render rather than an illustration** — soft volumetric light
> cones, specular floor highlights, and large near-black regions that carry no detail. `18`'s
> visual quality target is that this room *"must sit beside the approved Parlor, Back Hall
> and Basement without looking like a fourth art style."*
>
> **One cheap experiment settles it and no opinion can** (§19.4): run the file through
> `art:process` and put the 320 × 569 output beside the other three. This session could not —
> the candidate exists only as a conversation attachment, and this container has no
> `node_modules` and no image library. §19.6 is the tightened prompt if it needs a round 2.

**Status:** specification only. **No artwork was generated. No code, geometry, registry
row, flag, migration or route was touched.** This file is the paste-ready handoff for a
separate image-generation session, plus the measurements it rests on.

**Every number in this document was read off running code**, not off a design document:
`lib/casino/objects.ts`, `components/scene/underground.tsx` and `app/underground/page.tsx`
on `origin/claude/underground-casino-investigation-mu3ayr` (`3bde2ee`), and
`lib/parlor/objects.ts`, `lib/backhall/objects.ts`, `lib/rooms/objects.ts`,
`components/shell.tsx`, `art/assets.inventory.json` and `art/palette.json` on `main`
(`1692a14`). Where a document and the code disagreed, the code won and the disagreement is
recorded in §17.

---

## 1. Current implementation found

### 1.1 Where it lives

The Underground is **not on `main`**. W1 — the casino foundation and the slot machine —
lives on `claude/underground-casino-investigation-mu3ayr`, four commits ahead of
`1692a14`, unmerged and with no open PR. It was inspected read-only; nothing was
cherry-picked and nothing on that branch was modified.

`docs/ACTIVE_WORK.md` on `main` shows no claim, because the casino branch carries its own
claim row in its own copy of that file.

| | |
|---|---|
| Route | `app/underground/page.tsx` — `export const dynamic = 'force-dynamic'` |
| Room geometry | `lib/casino/objects.ts` — `UNDERGROUND = ROOM` (`320 × 569`), `HORIZON = 400`, four objects |
| Drawn stand-in | `components/scene/underground.tsx` — 88 lines of flat palette rectangles |
| Slot machine UI | `components/casino/slot-machine.tsx` — a `RoomDisplay` opening a `RoomPanel` |
| Server action | `app/actions/casino.ts` — one action, `spinAction(token, stake)` |
| Flags | `lib/flags.ts` — `underground: false`, `slotMachine: false`, `blackjackTable: false` |
| Visual states | `underground`, `underground-covered`, `back-hall-both-open` — **declared, never photographed** |

### 1.2 The route, exactly as it behaves

`requireUser()` → resolve flags → **`if (!flags.underground) notFound()`**. In production
the flag cannot be opened by any query string (`featureFlags` refuses overrides when
`VERCEL_ENV === 'production'`), so **every real manager gets a 404 and the room is
unreachable**. The two demo states reach it as `?open=underground,slotMachine` and
`?open=underground` behind `DEMO_FIXTURES=1`.

### 1.3 The room's structure

```
<Page oneScreen>                         h-dvh, overflow-hidden, no scroll, no utility bar
  <main style="background:#0d0a0c">      the letterbox colour, hardcoded on this route
    <div class="w-full max-w-[430px] self-start" style="aspect-ratio: 320 / 569">
      <RoomStage>                        owns which ONE transient surface is up; renders no DOM
        <UndergroundScene .../>          the drawn stand-in — absolute inset-0, aria-hidden
        <SlotMachine spec=slots .../>    RoomDisplay → RoomPanel
        <RoomDisplay spec=blackjack .../>  covered line, W2 owns the game
        <RoomDisplay spec=desk .../>       the manager's own tab + last 5 spins
        <RoomDoor spec=return href=/back-hall />
      </RoomStage>
```

**Four objects and no fifth**, asserted by `lib/casino/underground.test.ts`. Exactly one
Door, and it goes to `/back-hall`.

### 1.4 What is drawn versus what is a hit region

**Nothing interactive is drawn.** Hit regions are invisible rectangles positioned in room
units by `place()`; the picture is entirely `UndergroundScene`. Doors render at `z-30`,
panels at `z-50` (`fixed inset-0`, centred **in the viewport**, not in the room).

This is the whole reason the shell can be one flat image: **there is no overlay composited
into the Underground at runtime.** Compare the parlor, which composites a newspaper rack, six
pennants and a box; and the basement, which composites collectibles into four slots and a
manager sprite onto a rug. The Underground composites **nothing**.

### 1.5 Games open in place, over the room

`18 §5` caps Rooms and the Underground at **two taps** and calls it the only approved
exception to one-tap depth — so a game at `/underground/slots` would be three. Both games
are `RoomDisplay`s opening `RoomPanel`s. **The room is never replaced and never navigated
away from.** The panel is `fixed inset-0 z-50`, so it covers the artwork while it is up;
the shell therefore does not have to reserve any area for a panel.

### 1.6 Visual effects supplied by CSS rather than artwork

| | |
|---|---|
| Keyboard focus | `.room-shape:focus-visible` — 2px `--color-amber-glow`, `outline-offset: -2px`. The one rectangle the room is allowed |
| Affordance glow | `filter: drop-shadow()` on an **overlay's own alpha** (`18 §9.4`). The Underground has no overlays, so **nothing in this room can glow** — and Displays never glow by rule anyway |
| Covered / live | Today: `slotsLit` and `tableLit` recolour two rectangles in the stand-in. See §17.5 — this does not survive a baked shell unchanged |
| Panels, scrims, type | All runtime HTML through `lib/design/type.ts` |

---

## 2. Exact room/canvas measurements

| | |
|---|---|
| Logical room | **320 × 569** room units (`UNDERGROUND = ROOM`) |
| Aspect | **0.56239** (`320 / 569`); height ÷ width = `1.77812` |
| Processed asset | **320 × 569 px**, one-for-one with room units |
| Deliver source at | **≈ 940 × 1672** (hold the aspect; `process-art.ts` uses `fit: 'fill'`, so a wrong aspect is **stretched**, not cropped) |
| Background | **Opaque.** This is an environment, not a cutout |
| Palette | the **`zone` family's 96 colours** — 32 shared + a 64-colour measured extension (`art/palette.json`) |
| Slug | **`zone_underground_shell`** — proposed, §12.3. It does **not** exist in `art/assets.inventory.json` today |
| Current asset path | **none.** No file, no registry row, no `art_status` |
| Registry canvas trap | ⚠️ register at **`320x569`**. All four existing room shells were once registered `960x1707` and `process-art.ts` resizes to whatever the registry says — it would have shipped a 3×-oversized room (`OPEN_ITEMS` **A3**). `art/prompts/zone_tile.md §4–§5` still says `960 × 1707` and is **stale** |

### 2.1 How much of it a phone actually shows

The room is aspect-locked and anchored `self-start` inside a `100dvh` column, with
`max-w-[430px]`, so this is arithmetic rather than opinion. Driver conditions:
`width × 664`, `deviceScaleFactor: 3`.

| Width | Rendered room | px per room unit | Visible room rows | Verdict |
|---|---|---|---|---|
| **390** | 390 × 693.47 | 1.2188 | **0 – 544** | rows 545–568 **cropped** (29.5 px) |
| **375** | 375 × 666.80 | 1.1719 | 0 – **566** | rows 567–568 cropped (2.8 px) |
| **360** | 360 × 640.13 | 1.1250 | 0 – 568, all of it | **23.9 px of flat `#0d0a0c`** below the art |

**Identical to the Back Hall**, because it is the same page structure. `roomTop` is **0**:
this route has **no utility bar and no status-bar scrim**, so the top ≈48 room units sit
under the iPhone clock and battery with nothing between them.

---

## 3. Relationship to the Back Hall

### 3.1 The building, as the product actually models it

```
                          the dining room  (/)  — zone_parlor_shell, painted
                                  │
                          one rear doorway
                                  │
                          THE BACK HALL  (/back-hall) — zone_back_hall_shell, painted
                     ┌────────────┼────────────┐
              stairs, LEFT   curtain, CENTRE   doorway, RIGHT
                     │            │            └── back to the dining room
                     │            └── THE UNDERGROUND  (/underground) — UNPAINTED
                     └── a manager's basement (/rooms) — zone_room_shell_storeroom, painted
```

Measured on the delivered `zone_back_hall_shell` (`lib/backhall/objects.ts`, 2026-08-11):

| Back Hall object | rect | leads to |
|---|---|---|
| `stairs` | `[38, 118, 72, 174]` | `/rooms` — the manager basement |
| **`curtain`** | **`[118, 118, 86, 174]`** | **`/underground`** |
| `return` | `[266, 116, 50, 176]` | `/` |

The curtain is a **framed opening in the back wall of the hall, at floor level**, hung with
a heavy dark maroon curtain drawn closed, hem just clear of the floor, frame drawn all the
way around it. That description is `BATCH_G §4`'s and it is what shipped.

### 3.2 Two continuity facts that constrain this brief

1. **The storeroom already paints the hall's curtain.** `zone_room_shell_storeroom` shows
   the basement staircase "rising to a lit doorway **with a curtain beside it**"
   (`lib/rooms/objects.ts`). So a third painting of that same corner already exists, and the
   maroon curtain is an established, painted object in this building — not a new invention.
2. **The building already has exactly one full staircase, and two shells agree about it.**
   The hall paints its head; the storeroom paints its foot. `BATCH_G §5.8` made "put the two
   files side by side before delivering" an acceptance rule for precisely this reason.

### 3.3 What the Underground-side return must therefore look like

> **RECOMMENDATION: the maroon curtain, seen from the inside, at the top of a short flight
> of four or five worn masonry steps, in the centre of the back wall, with warm amber light
> from the hall spilling down them.**

Why this and not the alternatives:

| Candidate | Verdict |
|---|---|
| **A curtain at the top of a short flight** | **Recommended.** Recognisable in one glance — the maroon is the only maroon in the building. Honours the commissioner's "underneath" without inventing a second full staircase. The stub flight is visually unmistakable from the storeroom's full timber-framed flight |
| A curtain on a flat wall, no steps | Works navigationally, but the room then sits on the hall's own floor and "underneath the parlor" is lost, along with the reason the walls are masonry and the ceiling is low |
| A second full staircase | **Refused.** Two painted shells already agree about one staircase in this building; a second full flight makes "which stairs did I come down?" a real question, and the storeroom's flight is the one with a painting at each end |
| A plain door | **Refused.** The manager entered through a curtain. A door on the other side is a different opening |

The existing hit region — `return`, `[126, 96, 70, 120]` — is a back-wall opening at the top
of the visible wall, which is exactly where the head of a short flight lands in a stage box.
**The recommendation fits the geometry that already exists rather than asking it to move.**

### 3.4 Material continuity to carry through the curtain

The Underground is the **same building, one step further from the public**: the hall's
patched plaster and worn panelling give way to the raw masonry the storeroom already
establishes. The hall's caged utility bulb, its surface conduit and its galvanised pipe runs
continue into this room and get *older*. Nothing in the Underground should look like it was
installed after 1975.

---

## 4. Required room composition

### 4.1 The fixed architecture

| Feature | Room units | Notes |
|---|---|---|
| Ceiling | `y 0 – 70` | **Low.** Exposed joists or a shallow brick vault, one pipe run, one conduit. Dark and quiet — this band sits under the iOS clock |
| Back wall | `y 70 – 400` | Old masonry: painted brick, patched render, a course line or two. The one wall that carries the room's age |
| **Horizon (wall meets floor)** | **`y ≈ 400`** | `HORIZON = 400` in `lib/casino/objects.ts`. Lower than the hall's ≈370 and the storeroom's 340 — this is a cellar, and the extra wall is where the age lives |
| Floor | `y 400 – 569` | Worn boards or a dark restrained carpet runner over concrete. Recedes gently |
| Front ground line | `y 500 – 569` | Clear and unobstructed |
| **Crop band** | `y 545 – 568` | **Plain floor only.** Cropped at 390, letterboxed at 360 |

### 4.2 The four fixtures, and where they sit

| | Room units | What it must read as before anything is tapped |
|---|---|---|
| **Slot machine** | `[22, 150, 84, 200]` | one upright cabinet against the left wall — tall, narrow, a window and a handle |
| **Blackjack table** | `[126, 236, 132, 96]` | a half-round baize table with a dealer's station on the far side |
| **Cash desk** | `[236, 150, 68, 76]` | a small service counter or barred window on the right — where you settle up |
| **The way out** | `[126, 96, 70, 120]` | a curtained opening at the top of a few steps, warm light behind it |

**20 room units of clear masonry separate the exit's foot (`y 216`) from the table's back
edge (`y 236`).** That gap is the whole clearance between the two and must not be painted
through with a third object.

### 4.3 Everything else is scenery, permanently

`18 §3.6`. A crate that opened a panel saying *"a crate"* is the failure the mandate calls a
generic web box wearing pixel art. **None of the following may become interactive, ever**,
and all of them are wanted:

green-shaded pendant lamp over the table · a second one over the machine · a bare bulb on a
flex · wall sconces · exposed pipe runs and a stop-cock · a fuse box · a floor drain · four
or five mismatched bar stools · a bentwood chair pushed back from the table · a low shelf of
glasses · stacked wooden crates and a dough-tray stack that made it down here · a chest
freezer nobody moved · an old pizza oven door bricked up in the wall · a coat hook with a
jacket on it · an ashtray on the desk · a wall clock with a **completely blank face** · a
folded newspaper · a mop and bucket in a corner · a radiator · a dartboard cabinet, **closed**
· two empty picture frames · a pale rectangle of unfaded paint where a sign used to hang.

---

## 5. Blackjack physical area

**`[126, 236, 132, 96]`** — room units, `x 126–258`, `y 236–332`. Centre of the room, in
front of the exit, occupying the middle third.

| | |
|---|---|
| Status of the **rectangle** | **W1's, and authoritative for this brief.** It is declared, tested (44 px floor, no overlap, inside the room) and drawn shut from day one |
| Status of the **game** | **NOT YET AUTHORITATIVE — W2 OWNS FINAL GEOMETRY.** No blackjack component, no hand rendering, no dealer UI exists |
| Rendered size | 161 × 117 px @390 · 155 × 112 @375 · **148 × 108 @360** |
| Baked or overlay? | **BAKED.** §12 |

### 5.1 Why the table is drawn from the first day even though the game is W2

`18 §6.1`: a locked destination is a **closed door, never a hidden one**. Hiding the table
until blackjack ships would make the room look finished when it is not, and would make the
day it arrives read as a *new room* rather than as a dealer turning up. Its covered line is
already written: *"Green baize, no dealer. Tony has not found anyone he trusts."*

### 5.2 What the painting must and must not do with it

**Must:** read as a blackjack table at a glance and at 360 px — a half-round or
kidney-shaped baize top, a padded rail, a dealer's standing position on the far side, a chip
tray recess and a shoe or a card well, **all of them empty**.

**Must not, under any circumstances:** any card, face-up or face-down · any chip · any
printed arc, betting circle, insurance line or "dealer must draw to 16" legend · any number ·
any lettering.

The reason is sharper than "text is runtime". **The game renders in a panel over the room.**
A painted card on the table would be a baked game state that a live hand then contradicts,
permanently, in every screenshot. The baize is bare because a bare baize is the only state
that is never wrong.

### 5.3 What the art must leave possible for W2

W2's hand renders **in the panel**, not on the table — dealer row top, player row beneath,
totals as plates, HIT and STAND at thumb height, card faces drawn from `lib/design/type.ts`
and never as art (fifty-two card assets is more files than every collectible, wearable and
room shell in this project combined). So the table's job is to be furniture, and the only
thing W2 needs from it is that it **stays furniture**. See §16.

---

## 6. Slots physical area

**`[22, 150, 84, 200]`** — room units, `x 22–106`, `y 150–350`. Against the left-hand wall,
standing on the floor and rising well above the horizon.

| | |
|---|---|
| Status | **W1, built, working end to end against a real Postgres** |
| Rendered size | 102 × 244 px @390 · 98 × 234 @375 · **94 × 225 @360** |
| Baked or overlay? | **BAKED.** §12 |

### 6.1 The three surfaces that must be painted blank

1. **Three reel windows**, side by side, drawn as **flat dark glass with nothing behind
   them.** No symbol, no fruit, no seven, no cherry, no bar, no blur, no partial symbol.
2. **The marquee / topper panel** above them — a lamp box, drawn **unlit and blank**. No
   wordmark, no mascot, no numerals, no payout ladder.
3. **Any credit, meter or coin window** — blank dark glass, or simply not drawn.

Same reason as the baize, in a stronger form: the reels the manager reads are
`data-slot-reel` elements **in the panel**, and the server decides what they say. A symbol
painted into the cabinet's window is a permanent third opinion about a result the server
already settled.

### 6.2 Paint the machine dormant, not running

The cabinet should read as **switched off and waiting** — dark glass, unlit marquee, a
handle at rest — sitting inside a room that is itself warmly and invitingly lit. This is the
same decision the parlor's Tonight board makes: the largest cream rectangle in the room is
baked **blank** and every word on it is runtime HTML.

That also makes the covered state honest without a second asset. *"Unplugged. Tony says the
wiring down here is nobody's business"* is what the painting already shows. **The live
state's light is runtime's problem, not the painting's** — see §17.5, which is an engineering
decision this brief deliberately leaves open by keeping those three surfaces flat.

### 6.3 What it must read as

An upright cabinet a person stands at: a slanted control shelf, a **side handle**, a coin
tray at knee height, chrome or brass trim gone dull, one cracked corner. **A machine that
has been in this room since before anyone playing it was born** — not a modern video
terminal, not a screen on a stand, not a themed multiline cabinet.

---

## 7. Exit / return treatment

**`[126, 96, 70, 120]`** — room units, `x 126–196`, `y 96–216`. Rendered 85 × 146 px @390 ·
82 × 141 @375 · **79 × 135 @360**. The **only** Door in the room, and the only object that is
never shut.

### 7.1 It must be understood without a word

`18 §5`'s test: cover the file with your hand except this opening and ask where it goes. If
the answer needs a label, redraw it. Three things carry it, in this order:

1. **The maroon curtain** — the same heavy fabric as the hall's, drawn **back to one side or
   parted**, because from this side you have already come through it.
2. **Warm amber light from above and behind it**, spilling down the steps. Every other light
   in this room is green-shaded or bare-bulb; this is the only warm daylight-adjacent source,
   and light coming *in* from an opening is architecture, not affordance.
3. **Four or five worn masonry steps** rising to it, so the direction is up and out.

### 7.2 The one rule about drawn affordance

Light **in** the opening is architecture and is wanted. A highlight, outline, bloom, arrow or
glow **on its edge** is affordance, and affordance is CSS at runtime (`18 §9.4`). The
difference is whether the light is inside the opening or on its rim.

### 7.3 A rule that does not bind here, recorded so nobody re-derives it

`BATCH_G §3.1` rule 3 — *a lockable door must end above `y 465`* — exists because a **shut**
door renders its in-world answer up to 68 CSS px **below its own rectangle**, which put the
hall's stairs' line off the bottom of the screen at 390 (visual debt 19).

**It does not bind anything in the Underground.** The one Door here is never lockable, and
the two covered machines are `RoomDisplay`s: their covered lines open in a `RoomPanel`, which
is `fixed inset-0` and centred **in the viewport**. There is no below-the-rect text anywhere
in this room.

---

## 8. Character / clear-floor ruling

> ## **NO CHARACTER. The Underground is environment-only.**

Determined from the implementation, not assumed:

- `app/underground/page.tsx` renders **no** `ManagerSprite`, no Tony, no dealer, no NPC.
- `lib/casino/underground.test.ts` asserts the room holds **four objects and no fifth**.
- The Back Hall is already *"the one room in the product with no character in it"*; the
  Underground is the second.
- `docs/UNDERGROUND_CASINO_INVESTIGATION.md §I` reserves **no** character slot.
- Character customisation is **`CLOSED — production verified`** (`OPEN_ITEMS` **A2**) and no
  new character artwork is requested by this or any other open workstream.

**Consequences for the painting:**

- **Do not reserve a large empty standing area.** The basement reserves a rug at
  `[126, 334, 112, 168]` because a `112 × 168` manager sprite stands on it. Nothing stands
  here, so that floor is free for stools, crates, a runner and shadow.
- **Draw nobody.** No dealer behind the table, no patron at the machine, no silhouette in the
  doorway, no coat-on-a-chair that reads as a person, no mannequin, no framed photograph of a
  face.
- **The dealer's absence is content**, not a gap. *"Green baize, no dealer. Tony has not
  found anyone he trusts."* is the shipped copy. An empty dealer's station with the chair
  pushed back says it better than any label.
- The `FRONT GROUND LINE` rule in the family block still applies as a **composition** rule —
  keep the front strip of floor clear — even though no sprite is composited onto it.

---

## 9. Static vs runtime asset table

| Element | Shell | Separate art overlay | CSS/HTML runtime | Notes |
|---|---|---|---|---|
| Walls, ceiling, floor | ✅ | — | — | Opaque, baked |
| Pipes, conduit, fuse box, drain | ✅ | — | — | Scenery, permanently |
| Lamps and lampshades (the fixtures) | ✅ | — | — | Painted light, painted shades |
| Light *falling on* surfaces | ✅ | — | — | Baked. `LIGHT` is one key from upper left |
| Entrance: curtain, steps, frame | ✅ | — | — | §7 |
| Light spilling **in** from the entrance | ✅ | — | — | Architecture, not affordance |
| **Blackjack table** (baize, rail, chip tray, shoe) | ✅ | ❌ | — | §12. Bare |
| Cards, hands, totals, dealer | — | ❌ | ✅ | In the panel. **W2** |
| Chips, wagers, bet circles | — | ❌ | ✅ | Never painted |
| **Slot cabinet** (case, handle, trim, coin tray) | ✅ | ❌ | — | §12 |
| **Reel windows** (the glass) | ✅ **blank** | — | — | Flat dark, nothing behind |
| Reel symbols / results | — | `symbol_slots_*` × 6, **not this batch** | ✅ | Rendered in the panel today |
| Marquee panel | ✅ **blank, unlit** | — | — | No wordmark, no mascot, no ladder |
| "Machine is live" light | — | — | ✅ **open — see §17.5** | Brief keeps the surfaces flat so either answer works |
| **Cash desk** (counter, grille, shelf) | ✅ | — | — | Bare top |
| Token balance, tab, spin history | — | — | ✅ | `RoomDisplay` → `RoomPanel`, viewport-centred |
| Wager buttons, PULL, HIT, STAND | — | — | ✅ | `TYPE.action`, ≥44 px |
| Game outcomes, verdict lines | — | — | ✅ | Curated strings |
| Covered-machine lines | — | — | ✅ | `COVERED_LINES` |
| Interaction affordance / glow | — | — | ✅ | **Nothing in this room glows** — no overlays, and Displays never glow |
| Keyboard focus ring | — | — | ✅ | `.room-shape:focus-visible`, 2px amber |
| Panels and scrims | — | — | ✅ | `RoomPanel`, `fixed inset-0 z-50` |
| Manager sprite | — | — | — | **Not applicable.** §8 |
| Letterbox below the room | — | — | ✅ | `#0d0a0c`, hardcoded. §17.3 |

**Read the ❌ column as the finding it is:** the two casino fixtures were *reserved* as
separate overlay slugs by the investigation, and this brief recommends against generating
them. §12 is the argument.

---

## 10. Exact hotspot / reserved-region measurements

All four rectangles are **live, tested code** on the casino branch. Percentages are what
`place()` emits.

| Object | kind | x | y | w | h | x2 | y2 | left % | top % | width % | height % | purpose |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `slots` | display | 22 | 150 | 84 | 200 | 106 | 350 | 6.875 | 26.362 | 26.250 | 35.149 | opens the slot panel |
| `blackjack` | display | 126 | 236 | 132 | 96 | 258 | 332 | 39.375 | 41.476 | 41.250 | 16.872 | **reserved** — covered line today, hand panel in W2 |
| `desk` | display | 236 | 150 | 68 | 76 | 304 | 226 | 73.750 | 26.362 | 21.250 | 13.357 | the manager's **own** tab and last 5 spins |
| `return` | **door** | 126 | 96 | 70 | 120 | 196 | 216 | 39.375 | 16.872 | 21.875 | 21.090 | `/back-hall` |

### 10.1 Rendered target sizes

| Object | @390 | @375 | **@360** | floor |
|---|---|---|---|---|
| `slots` | 102 × 244 | 98 × 234 | **94 × 225** | 44 × 44 |
| `blackjack` | 161 × 117 | 155 × 112 | **148 × 108** | 44 × 44 |
| `desk` | 83 × 93 | 80 × 89 | **76 × 86** | 44 × 44 |
| `return` | 85 × 146 | 82 × 141 | **79 × 135** | 44 × 44 |

Every region clears 44 CSS px on the narrowest supported phone with large margins. The floor
in room units is **39.1** (`44 × 320 ÷ 360`), asserted by
`lib/casino/underground.test.ts`.

### 10.2 Authority, stated precisely

| | |
|---|---|
| `slots`, `desk`, `return` | **Authoritative.** W1, built, tested |
| `blackjack` **rectangle** | **Authoritative as a reserved region.** Declared and tested in W1 |
| Blackjack **game** geometry — hand layout, card size, action row, dealer area | **NOT YET AUTHORITATIVE — W2 OWNS FINAL GEOMETRY.** It renders in a panel, not on the table, so it constrains the painting only by requiring the table stay bare |
| Slot **symbol** art (`symbol_slots_*` × 6) | **Not this batch.** Six small fixed-canvas assets, owned by whoever ships slots art |

### 10.3 The precedent that governs what happens after delivery

**No coordinate in this document is a demand.** Both painted rooms in this product were
delivered close-but-not-exact and **the code moved to the art, once**:

- `zone_room_shell_storeroom`, 2026-08-10 — eight hit regions and four slot rects realigned;
  `HORIZON` 366 → 340, `CEILING` 46 → 62.
- `zone_back_hall_shell`, 2026-08-11 — all three doors re-measured by luminance profile.

The reasoning is the same both times and applies here: **a room that already works is far
cheaper to re-aim than a painting is to redraw.** Compose the room properly and the
rectangles follow. What may **not** move is the *kind* of each object, the count of four, or
the 39.1-unit floor.

---

## 11. Mobile safe regions

| Band | Room units | Rule |
|---|---|---|
| **Status-bar band** | `y 0 – 48` | Under the iPhone clock and battery, with **no scrim on this route**. Keep it dark and quiet — ceiling, a joist, a pipe. Nothing that has to be read |
| **Composition band** | `y 0 – 544` | Design for this. It is what a 390 px phone shows |
| **Crop band** | `y 545 – 568` | **Plain floor only.** Cropped at 390, letterboxed at 360 |
| **Left/right edges** | `x 0 – 8`, `x 312 – 320` | No load-bearing fixture. The device edge is here at every width |

### 11.1 Thumb reach

Portrait, one-handed, 664 px tall. Comfortable reach is roughly the lower half of the screen.

| Object | Screen band @390 | Reach |
|---|---|---|
| `slots` | 183 – 427 px | good — its lower two-thirds are in easy reach |
| `blackjack` | 288 – 405 px | **best in the room** |
| `desk` | 183 – 275 px | upper-middle, a stretch — acceptable, it is a low-frequency read-only surface |
| `return` | 117 – 263 px | upper third |

The exit sitting high is **correct rather than a defect**: it is an opening in the back wall,
which is where a back-wall opening goes in a stage box, and it is exactly where the hall puts
its own three doors (`y 116–292`). It is also not a control anyone hunts for under time
pressure.

### 11.2 Readability at 360, which is the width that decides

At 360 the whole room fits and every fixture is at its smallest. Both games must be
distinguishable **from each other and from the scenery** at 94 × 225 and 148 × 108 CSS px.
That is a silhouette test, not a detail test:

- the machine is **tall, narrow, upright, standing against a wall**;
- the table is **wide, low, horizontal, standing in the floor**;
- they are on opposite sides of the room and share no edge.

**Cull any candidate where the two read alike as black shapes.**

### 11.3 It must not look like a desktop casino cropped into a phone

The composition is portrait-first: a low ceiling pressing down, one wall, a shallow floor,
three fixtures and a way out. Not a wide room with the sides cut off, and not a bank of
machines receding into perspective.

---

## 12. Recommended asset architecture

> ## **OPTION A — one asset. `zone_underground_shell`, everything baked.**

### 12.1 The argument

The parlor bakes its openings empty **because things get composited into them** — a rack into
the alcove, six pennants onto the rail, a box onto the tray. The basement leaves six places
empty for the same reason — four collectibles, a pennant and a manager sprite land in them.

**Nothing is composited into the Underground.** Not today, and not in W2: the hand renders in
a panel, the reels render in a panel, the tab renders in a panel. The two fixtures never
appear, disappear, move, change size or change identity. They are furniture.

An overlay earns its separation by being **stateful**. Neither of these is.

### 12.2 What splitting would cost

| | |
|---|---|
| Alignment | Two or three images that must stay pixel-aligned across every regeneration. `zone_parlor_counter_front` was **withdrawn** for exactly this — the registry note calls it *"a defect class worth deleting"* |
| Seams | A cabinet overlay needs its own contact shadow, floor contact and wall occlusion, hand-matched to a painting drawn separately |
| Processing | Three `art:process` runs, three canvases, three chances to inherit the `960 × 1707` mistake |
| Glow | Overlays carry alpha, and alpha is what `filter: drop-shadow()` reads. Both fixtures are **Displays**, and `18 §3` says Displays never glow — so a separated overlay would hand this room the one capability the navigation ruling forbids it |
| Benefit | **None that anything uses.** No state changes either object |

### 12.3 The proposed registry row — **specified, not added**

To be inserted in `art/assets.inventory.json` under a new `_underground_B1` group, **by
whoever integrates the delivered art**, not by this workstream:

```json
"_underground_B1": {
  "$comment": "Behind the curtain in the Back Hall. One portrait shell, everything baked -- the slot cabinet, the blackjack table, the cash desk and the way out are all in the painting, because nothing is ever composited into this room. The reel windows, the marquee, the baize and the desktop are drawn BLANK: every card, symbol, number and word a manager reads is rendered at runtime into a RoomPanel over the room. Geometry is fixed by lib/casino/objects.ts. See docs/art/BATCH_H_UNDERGROUND_HANDOFF.md.",
  "zone_underground_shell": {
    "family": "zone",
    "canvas": "320x569",
    "batch": "B1",
    "art_status": "generated",
    "role": "scenery",
    "alt": "The room behind the curtain at Tony's",
    "path": "/assets/zone/zone_underground_shell.png",
    "source": "ChatGPT image generation, approved shell candidate",
    "prompt_ref": "docs/art/BATCH_H_UNDERGROUND_HANDOFF.md",
    "rights_status": "original"
  }
}
```

⚠️ **`canvas` is `320x569`.** Not `960x1707`. See §2.

### 12.4 Slots this batch deliberately does **not** commission

| Slug | Why not |
|---|---|
| `object_blackjack_table` | Baked. §12.1. Reserved by the investigation; **recommend striking the reservation** |
| `object_slot_machine` | Baked. Same |
| `symbol_slots_*` × 6 | Real and still needed — **but they are slots-game art, not room art**, and they render in a panel. A separate, later batch |
| `object_door_underground_open` | **Exists as a registry row, never shipped.** It is the **Back Hall** side, for the day the curtain is drawn back. Phase 10, one overlay over the hall's existing rectangle. Not this room |
| `object_door_return` | Baked into the shell, exactly as the hall bakes its three openings |

---

## 13. Reference-image authority

The generation session receives **three approved images**. Their authority is not equal and
must be stated in the session, or the model averages them.

### 13.1 `zone_parlor_shell` — PRIMARY WORLD / ART-QUALITY REFERENCE

**This is the quality bar and the tie-breaker.** Authority for: pixel density · palette and
warmth · material treatment · architectural believability · environmental sophistication ·
detail budget · the nostalgic neighbourhood-pizzeria identity · late-90s / early-2000s
adventure-game feel.

Measured on the 320 × 569 asset: **52 colours covering ≥0.5% of frame**, 64 at ≥0.1%, 90
distinct, largest single colour 4.2%.

### 13.2 `zone_back_hall_shell` — PRIMARY PHYSICAL-CONNECTION REFERENCE

Authority for: **the maroon curtain** — its exact fabric, weight, fold and colour · how the
player entered · back-of-house material continuity · worn employee-space character · the
lighting transition from warm public rooms to dim service space.

Measured: **19** at ≥0.5%, 25 at ≥0.1%, 82 distinct, largest 15.9%.

> `BATCH_G §5.10` asked for 25–48 and the hall landed at **19**, and it was **accepted
> anyway**, because the target is a proxy and the picture at phone size is the criterion.
> Recorded rather than rounded up, and it governs here too — see §14.4.

### 13.3 `zone_room_shell_storeroom` — UNDERGROUND MATERIAL REFERENCE

Authority for: masonry and block walls · exposed joists and structure · utility pipe runs ·
old basement construction · low ceiling · the green-shaded utility lamp · the warm hidden-room
atmosphere · **and the staircase this room must not duplicate**.

Measured: **25** at ≥0.5%, 31 at ≥0.1%, 73 distinct, largest 19.8%.

### 13.4 The composite instruction

> **Parlor for how well it is drawn. Back Hall for the curtain you came through. Storeroom
> for what the walls are made of.** The Underground is the same building as all three, one
> room further from the street.

---

## 14. Complete paste-ready ChatGPT image-generation prompt

**Four parts, in this order, always. Paste each verbatim. Do not paraphrase the preamble —
paraphrasing is how style drift starts, and it is invisible until the third asset and then
all three have to be redrawn.**

### 14.1 PART 1 — THE BLOCK

*Paste verbatim from [`art/prompts/_style_preamble.md`](../../art/prompts/_style_preamble.md). Reproduced here so this file is self-contained.*

```
STYLE: Hand-crafted pixel art in the manner of late-1990s / early-2000s console and
handheld games. Limited palette, flat color fills, crisp 1-pixel outlines, strong
readable silhouettes. Cozy, warm, slightly worn. Nothing glossy, nothing 3D-rendered,
no gradients, no anti-aliasing, no soft shadows, no lens effects, no drop shadows.

SETTING: A neighborhood pizza parlor in a fictionalized Metro Detroit, operating since
the 1990s. Red-and-white checkered cloth, worn wood paneling and laminate, amber
incandescent light, neon beer and sports signage, arcade carpet, CRT glow, paper menus,
faded football memorabilia, handwritten signs taped to things. Familiar, lived-in,
a little shady. Not a tourist-board Detroit, not a generic neon casino, not steampunk,
not cyberpunk, not fantasy-medieval.

CAMERA: Straight-on, at standing eye level, no tilt, no isometric projection, no dutch
angle, no dramatic or wide-angle lens. Two rules apply depending on what is being drawn:

  ENVIRONMENTS are a shallow stage box — like a shoebox diorama or a theatre set seen
  from the front row. The floor is visible and recedes gently toward a back wall. Side
  walls may angle in very slightly. The recession is shallow: a suggestion of depth, not
  a corridor, never an aggressive vanishing point.

  SUBJECTS — characters, objects, clothing layers, and surfaces — are drawn completely
  flat and front-facing with no perspective, no foreshortening, and no rotation.

LIGHT: One warm key light from the upper left, the color of an incandescent bulb. Cool
low-influence ambient fill from the lower right. Shadows are one step darker in the same
color family, never black and never grey. Neon is emissive: full-value color with a
one-pixel bloom, unaffected by the key light.

PALETTE: Restrict to a warm, slightly desaturated palette of roughly 32 colors —
warm near-blacks, browns, brick reds, cream paper tones, amber, muted blues, with a
few saturated neon accents in cyan, green, yellow, and magenta. Never pure black
(#000000). Never pure white (#FFFFFF).

OUTPUT: Generate at high resolution in this style. Do not attempt to output at the final
tiny pixel dimensions — the asset will be downscaled with nearest-neighbor and quantized
afterward. Transparent background unless the prompt says otherwise. Single subject,
centered, full subject visible with a small margin, no cropping at the edges.

NEGATIVE — never include any of the following:
team logos, league marks, or any sports-team insignia; real athletes or recognizable
likenesses of real people; real signatures or autographs; brand names, wordmarks, or
corporate logos; Mario, Luigi, or any Nintendo character; any existing video-game,
film, or cartoon character; watermarks; signatures; text or lettering of any kind
unless the prompt explicitly requests it; photorealism; 3D rendering; smooth gradients;
anti-aliased edges; drop shadows; lens flare; motion blur; multiple subjects when one
was requested.
```

### 14.2 PART 2 — FAMILY: room shells

*Paste verbatim from [`art/prompts/zone_tile.md §2`](../../art/prompts/zone_tile.md).*

```
SUBJECT TYPE: One complete interior room, portrait orientation, seen from just inside the
door at standing eye level. Not a wide establishing shot and not a corridor.

STAGE BOX: A shallow interior space. The floor is genuinely visible and recedes gently
toward a back wall. Side walls may angle in very slightly or not at all. The recession is
shallow — enough that this reads as a room you are standing in, never a deep corridor and
never an aggressive vanishing point.

FRONT GROUND LINE: Keep the front strip of floor, along the bottom edge, clear and
unobstructed. Flat front-facing character sprites are composited standing there. The floor
angle must be shallow enough that a completely flat, non-perspective character standing on
that line looks correct in the scene.

PREPARED PLACES: Certain fixtures are drawn completely but left entirely blank, and certain
architectural features are drawn as empty recesses containing nothing. These are not
mistakes and must not be filled in, decorated, or made interesting. Objects and text are
composited in later. Each recess and opening carries its own soft interior shadow so that a
later overlay sits INTO the room rather than on top of it.

DEPTH: Expressed by overlap and value. Background elements are one value lighter and lose
their outline.

OUTLINE: Mid-ground props carry a 1-pixel outline in a warm dark brown. Background elements
carry no outline and are separated by value alone.

DETAIL BUDGET: No more than six distinct interior shapes per mid-ground prop, and no more
than three per background element. Texture is suggested, never rendered.

CHARACTERS: None. Rooms contain no people.

BACKGROUND: Opaque. This is an environment, not a cutout.

TEXT: None anywhere. Every surface that will carry words is drawn completely blank.

EFFECTS: None. No glow, bloom, rim light, or highlight on any object. All affordance is
applied at runtime in CSS.
```

### 14.3 PART 3 — SUBJECT: `zone_underground_shell`

```
SUBJECT: A small private games room in the cellar of an old neighbourhood pizza parlor,
seen straight on from just inside its entrance at standing eye level, portrait
orientation, aspect ratio 0.5624 (tall and narrow). A shallow stage box: one back wall,
the floor visible and receding gently, side walls angling in very slightly. Not a
corridor, not a hall, not a wide room.

WHAT THIS PLACE IS: A service and storage cellar that somebody gradually converted into a
private games room over about thirty years, and never finished converting. It is the same
building as the pizza parlor above it and the staff hallway you came through. Somebody put
a table and a machine down here, hung two lamps over them, brought some stools down, and
left everything else exactly where it was.

CEILING: Low and close, occupying only the top eighth of the image. Dark. Exposed timber
joists with the boards of the floor above visible between them, one galvanised pipe run
crossing, one surface conduit following the corner. Nothing here needs to be looked at.

WALLS: Old painted masonry — brick or block, painted a long time ago in a warm off-white
that has gone amber and grey, patched in mismatched squares, flaking at the skirting, with
one or two darker course lines. A bricked-up arch on the back wall where an old oven door
used to be. A small grey fuse box, a stop-cock, a run of iron pipe with a bracket, and one
pale unfaded rectangle where a sign used to hang and does not any more. The plaster and
panelling of the hallway above have given way to raw structure.

FLOOR: Worn dark boards over concrete, with a restrained dark red carpet runner laid across
the middle of the room, edges frayed. Mopped pale in a path between the entrance and the
table. The front strip along the bottom edge is completely clear.

LIGHT: Warm, low, and coming from inside the room rather than from any window — there are
no windows. Two green-shaded practical pendant lamps hang low on flexes, one over the table
in the centre and one over the machine on the left, throwing warm amber pools onto the baize
and the floor and leaving the corners in shadow one step darker in the same colour family.
One bare bulb on a flex near the back. A single small enamel wall sconce by the cash desk.
The whole room is warm, inviting, and slightly too dim, like a room lit by people who did
not want to be noticed from outside.

ENTRANCE, BACK WALL CENTRE — THE WAY OUT: A plain framed opening in the centre of the back
wall, raised above the room's floor and reached by four or five worn stone or brick steps
rising to it. A heavy dark maroon curtain — the same fabric and colour as the curtain in the
attached staff-hallway reference image — hangs in that frame, drawn back to one side, so the
opening is partly open. Bright warm amber light spills through it and falls down the steps
into the room. This is the only warm light source in the room that comes from somewhere
else, and it must read at a glance, with no label, as the way back up and out. Draw the
frame completely around the curtain.

SLOT MACHINE, LEFT WALL: One tall, narrow, upright antique slot-machine cabinet standing on
the floor against the left-hand wall, occupying roughly the left quarter of the image and
rising from the floor to well above head height of the furniture around it. Dark lacquered
wood case, dulled brass or chrome trim, one cracked corner, a slanted control shelf, a
coin tray at knee height, and a single mechanical pull handle on its right-hand side. It has
been down here since long before anyone playing it was born.
  THREE REEL WINDOWS, side by side across the middle of its front face, drawn as flat, dark,
  completely empty glass with nothing whatever behind them — no symbol, no fruit, no fragment
  of a symbol, no reflection, no blur.
  ONE MARQUEE PANEL above the reel windows, drawn as a completely blank, unlit lamp box — no
  wordmark, no mascot, no picture, no numerals, no payout ladder, no marking of any kind.
  The machine is switched off and at rest. Nothing on it is lit.

BLACKJACK TABLE, CENTRE FLOOR: One half-round blackjack table standing in the middle of the
floor, its straight edge toward the back of the room, occupying roughly the central third of
the image at about the height of the horizon. Dark green baize top, worn pale in patches,
with a padded dark leather rail around its curved edge and turned wooden legs. A shallow
empty chip-tray recess and an empty card shoe well sit on the dealer's side. A plain bentwood
chair stands behind it, pushed back and empty.
  THE BAIZE IS COMPLETELY BARE — no cards face-up or face-down, no chips, no printed arc, no
  betting circles, no printed rule line, no marking, no numerals, no lettering of any kind
  anywhere on the cloth.

CASH DESK, RIGHT: A small worn wooden service counter or half-window built into the right-hand
wall, about waist to chest height, with a simple turned brass grille above it and one shelf
behind. Its counter top is completely bare. Beside it, a coat hook with a jacket on it and a
glass ashtray.

DRESSING — all of it scenery, none of it precious, all of it clear of the four fixtures
above: four or five mismatched wooden bar stools · a low shelf of upturned glasses · two
stacked wooden crates and a stack of grey dough trays that made it down here from the kitchen
· a chest freezer nobody has moved in years · a mop in a bucket in a corner · a cast-iron
radiator · a closed dartboard cabinet on the wall, doors shut · two small empty picture frames
· a round wall clock with a completely blank face · a folded newspaper. Nothing tidy, nothing
filthy, nothing valuable.

MOOD: A neighbourhood back room. Warm, worn, comfortable, faintly illicit, and entirely
domestic in scale — the sort of place a few people who know each other play cards in on a
Tuesday. It belongs to the pizza parlor above it. Not Las Vegas, not a modern casino, not a
nightclub, not a sportsbook, not a mobile casino app, not cyberpunk, not a luxury resort, not
a gangster-movie set, not a fantasy dungeon, and not a neon spectacle. The table and the
machine are the only two things in the room that say what it is for; every other surface still
says pizza cellar.
```

### 14.4 PART 4 — NEGATIVE

*Paste immediately after the subject.*

```
no people or characters of any kind · no dealer, croupier, bartender, patron, silhouette,
mannequin, statue or stand-in figure · no face in any picture frame · no letters, numerals,
words, digits or lettering shapes anywhere, in any language, at any size, including illegible
or decorative lettering · no readable or unreadable signage, plaque, notice, arrow, taped note
or hand-written card · no illuminated exit sign · no playing card, card face, card back, card
fan or card in any hand · no poker chip, chip stack, chip tray contents, cash, banknote, coin
pile or currency symbol · no dice · no roulette wheel, roulette table, roulette layout, big-six
wheel or any wheel game · no poker table, craps table, baccarat table or second gaming table ·
no bank or row of additional slot machines · no video screen, LCD, CRT, monitor or digital
display of any kind · no symbol, fruit, seven, bar, bell, cherry or icon inside any reel window
· no lit marquee, no payout table, no odds, no jackpot meter, no credit meter, no numbers on
any machine · no card suits, dice, chips, dollar signs, sevens or cherries used as wallpaper,
carpet pattern, upholstery, tiling or decorative motif anywhere · no neon spectacle, no marquee
lighting, no bulb chase, no signage arch · no glow, bloom, rim light, sparkle, halo, ray or
highlight applied to any object or drawn around any opening · no second staircase, no floor
hatch, no lift, no window, no daylight · no door leaf, handle, latch, lock or bolt on the
curtained opening · no chain, rope, velvet rope, stanchion, gate or barrier anywhere · no team
logos, league marks or sports insignia · no real brand names, wordmarks or corporate logos on
any machine, packaging, bottle, sign or prop · no smooth gradients, anti-aliasing, drop
shadows, lens effects or motion blur · no photorealism and no 3D rendering
```

### 14.5 Output requirements — state these to the session

- **Portrait, aspect `0.5624` (320 : 569).** Deliver at roughly **940 × 1672**. The pipeline
  downscales with lanczos and quantizes; `fit: 'fill'` means a wrong **aspect** is stretched,
  not cropped, so the aspect is the one dimension that must be right.
- **Opaque background.** Not a cutout.
- **One image. One room. No sheet, no variants grid, no annotations, no border, no mockup
  frame, no phone bezel.**
- **Generate four candidates and cull hard.** `_style_preamble.md` budgets a 50–70% cull rate;
  generation is cheap and reviewing is the real cost.

### 14.6 Acceptance — what a delivered shell has to satisfy

1. **Opaque**, and exactly `320 × 569` after processing. Delivered at aspect `0.5624`.
2. **Survives the `zone` quantization to 96 colours.** Flat fills survive; smooth gradients
   band.
3. **No text anywhere.** Not on the clock, not on the machine, not on a crate, not on the
   fuse box.
4. **No people**, and no object that reads as a person at thumbnail size.
5. **The reel windows, the marquee, the baize and the desk top are blank.** Anything painted
   on them is a baked game state that a live result contradicts, permanently, in every
   screenshot.
6. **No painted affordance on the entrance.** Light *in* the opening is architecture and is
   wanted; a highlight, outline or bloom *on its edge* is affordance, and affordance is CSS
   (`18 §9.4`).
7. **The way out is guessable without a label.** Cover the file except the entrance and ask
   where it goes. If the answer needs a word, redraw — `18 §5` sets that test and it outranks
   how good the drawing is.
8. **The machine and the table are distinguishable as solid black silhouettes at 360 px.**
   §11.2.
9. **The curtain matches `zone_back_hall_shell`'s** — same fabric, weight, colour. Put the two
   files side by side before delivering.
10. **No second full staircase.** The building has one, and `zone_back_hall_shell` and
    `zone_room_shell_storeroom` already paint its two ends.
11. **Rows 545–568 carry nothing but plain floor**, and rows 0–48 nothing that has to be read.
12. **Colour vocabulary target: roughly 25–48 colours covering ≥0.5% of the frame.** This is a
    **proxy, not a gate** — `zone_back_hall_shell` landed at 19 and was accepted anyway,
    because the picture at phone size is the criterion and `docs/PALETTE_FIDELITY_BOUNDARY.md`
    is the standing evidence that these proxies can prefer the worse picture.

---

## 15. Processing / integration instructions AFTER art approval

**None of this is done by this workstream.** It is the runbook for whoever integrates the
delivered file.

1. **Place the file.** `art/incoming/zone_underground_shell.png`.
2. **Add the registry row** from §12.3. ⚠️ `"canvas": "320x569"`.
3. **Normalise framing.** `npm run art:prepare-incoming` — this exists because across three
   rounds of candidates not one arrived correctly cropped, and framing is the one thing
   generators are worst at.
4. **Process.** `npm run art:process` — downscale, then quantize against the **`zone` family's
   96 colours**. Nothing else in the `zone` family changes; family extensions are additive.
5. **Swap the scene for the painting.** `components/scene/underground.tsx` says in its own
   header that it is **deleted** when the shell lands. Follow the **Back Hall's** precedent,
   not the basement's: the hall deleted its stand-in outright because it has one shell, while
   `manager-room.tsx` keeps its drawing because two of three themes are still unpainted. The
   Underground has one shell. A resolver branch here is a branch nothing can reach.
6. **Add `data-room-shell="art"`** to the scene's root. See §17.1 — it is missing today, and it
   is the only thing that can make a lost registry path fail a gate instead of shipping a
   flat-rectangle room.
7. **Re-aim the geometry to the painting, once.** Measure the four fixtures off the delivered
   file by luminance profile, not by eye, and update `lib/casino/objects.ts` and `HORIZON`.
   This is the storeroom's and the hall's precedent (§10.3), and after it the Underground is
   the master for its own coordinates.
8. **Check the letterbox seam.** The route hardcodes `#0d0a0c` behind the room. Confirm the
   shell's bottom rows sit close to it, or the 23.9 px band at 360 becomes a visible join.
   §17.3.
9. **Run both gates in full.** `npm run check` and `npm run visual:qa`. Per
   `docs/CASINO_BOUNDARY.md §12.4` the visual gate has **never been run** against the
   Underground — the two states are declared, wired and unphotographed — so this is the first
   real photograph of the room, art or no art.
10. **Add a `checkUnderground` gate.** §17.2.

---

## 16. Anything that must wait for W2 blackjack

| | Status |
|---|---|
| The table's **rectangle** | **Not waiting.** W1, declared and tested. The art is drawn to it |
| The table's **appearance** | **Not waiting.** It is furniture and stays furniture. Bare baize is the only state that is never wrong |
| **Hand rendering** — dealer row, player row, totals, HIT/STAND | **W2. NOT YET AUTHORITATIVE.** Renders in a `RoomPanel` over the room, so it constrains the painting only by requiring the baize stay bare |
| **Card art** | **Never.** Card faces are drawn from `lib/design/type.ts`. Fifty-two card assets is more files than every collectible, wearable and room shell in this project combined |
| The **covered → live** treatment of the table | **Open. §17.5.** This brief keeps the surfaces flat so W2 can answer it either way |
| `blackjackTable` flag | Exists, shut, engineering/demo only (R11) |
| The **`underground` flag itself** | R11: **both games ready before the curtain goes up.** Art landing does not open the room, and must not be read as opening it |

**Nothing in this batch is blocked by W2**, and the room does not wait for art either — the
stand-in is approved placeholder architecture and has held this route since W1.

---

## 17. Conflicts or risks

Eight findings. **All are reported; none was fixed.** Six are engineering items owned by the
casino workstream, one is a documentation error on `main`, and one is a question for the
commissioner.

### 17.1 `UndergroundScene` carries no `data-room-shell` marker — **report, do not fix**

`components/scene/back-hall.tsx` and `components/scene/manager-room.tsx` both declare which
half rendered, and `checkBackHall` **asserts it reads `art`** — so a registry row losing its
`path` fails the visual gate instead of shipping a placeholder the size of a room. The
Underground's scene root is a bare `<div aria-hidden="true" className="absolute inset-0">`.

**Consequence:** when `zone_underground_shell` lands, a broken asset path would silently
render the flat-rectangle stand-in with every gate green. §15 step 6.

### 17.2 There is no `checkUnderground` gate, and the room has never been photographed

`docs/CASINO_BOUNDARY.md §12.4` records this against itself: **`npm run visual:qa` was not
run** on the casino branch — the container's Playwright build did not match the pinned
version and the driver was correctly **not** weakened to work around it. So `underground` and
`underground-covered` are *declared and wired*, and their `driver-coverage` tests prove they
are declared, not that they look right.

There is also no per-room assertion of the kind `checkBackHall` provides — nothing pins the
object map, the four rectangles, or the covered lines being on screen.

**Consequence for this batch:** the art will be integrated against a room whose *current*
appearance has never passed a visual gate. The baseline needs to exist before the swap, or the
swap and the baseline arrive together and neither can be blamed.

### 17.3 The letterbox colour is hardcoded, and it differs from its neighbours

`app/underground/page.tsx` sets `backgroundColor: '#0d0a0c'`; `/back-hall` sets `#1a1214`,
its own floor tone. At 360 px, **23.9 CSS px of that colour sits below the room**. If the
delivered shell's bottom rows are not close to `#0d0a0c`, the join is visible on the width
where the whole room fits.

**Reported as a fit risk**, not a defect. The correct fix is to sample the delivered art and
set the constant to match, at integration.

### 17.4 The room's exit is drawn as a staircase, and the way in is a curtain

The stand-in draws `return` as a **framed stairwell with five treads**. The manager arrives
through a **curtain in the back wall of the hall**. Nothing in the product reconciles those,
because nothing has ever had to.

**Resolved in this brief by recommendation, not by fiat:** §3.3 puts the curtain at the top of
a short flight, which satisfies both. **The commissioner may overrule it** — the alternative
is a curtain on a flat wall, which is simpler and loses "underneath". Recorded here so the
choice is visible rather than smuggled into a prompt.

### 17.5 `slotsLit` / `tableLit` do not survive a baked shell unchanged — **an open decision**

`UndergroundScene` takes two booleans and uses them to recolour two rectangles: the slot's
reel window `bg-ink-900 → bg-amber-mid`, and the baize `bg-ink-700 → bg-green-deep`. **A
painting has no rectangle to recolour.**

Three answers, all available, none chosen here:

1. **Drop the visual distinction.** The covered state is already carried by the copy — tapping
   answers *"Unplugged…"* — and the machines are shut for a short window only.
2. **Runtime light over blank baked surfaces**, exactly as the Tonight board is baked blank
   cream with runtime HTML on it. Needs the reel window's and marquee's rectangles measured off
   the delivered art.
3. **Paint them live and drop the covered state.** **Refused** — it bakes a game state, and it
   contradicts `18 §6.1`'s closed-door rule.

**This brief deliberately keeps those three surfaces flat, dark and blank**, which leaves 1 and
2 both open and costs nothing either way. It is the casino workstream's decision, not this
one's.

### 17.6 The investigation reserved two overlay slugs this brief recommends striking

`docs/UNDERGROUND_CASINO_INVESTIGATION.md §I.2` reserves `object_blackjack_table` and
`object_slot_machine` as separate Display overlays. **Neither is registered**, so nothing has
to be retired — but the reservation should be struck rather than left to be discovered later
and honoured out of politeness. §12 is the argument, and its strongest limb is that a Display
with alpha gains a glow capability `18 §3` forbids it.

### 17.7 `art/prompts/zone_tile.md §4–§5` still says the canvas is `960 × 1707`

Stale for **every** room shell since 2026-08-10, when all four were found registered three
times oversized (`OPEN_ITEMS` **A3**). `BATCH_G` carries the same warning. A third handoff
repeating the same correction is evidence the prompt file should be fixed rather than
annotated — **reported, not fixed**, because `art/prompts/` is not this workstream's.

### 17.8 The rulings this brief rests on are not on `main`

`docs/OPEN_ITEMS.md` **G1** on `main` still reads *"Nothing was built and nothing should be
until this is answered"*, and describes the blackjack-and-slots contradiction as open. R1–R13
resolve it — but they live in `docs/CASINO_BOUNDARY.md` on the **unmerged** casino branch.

**Consequence:** anyone reading `main` alone will conclude this art has no approved feature
behind it. That is a real and correct reading of `main`. **The brief should not be executed
until the casino branch merges or the commissioner confirms R1–R13 independently.** See §18.

---

## 18. Verdict

The Underground is the last unpainted room in the product. Every other interior — parlor,
Back Hall, basement storeroom — is delivered art, and the pattern for adding a fourth is
established twice over: **brief the geometry, accept the painting, re-aim the code once.**

The investigation is complete and the answer to the primary question is short:

> **One opaque `320 × 569` shell, everything baked — walls, floor, entrance, slot cabinet,
> blackjack table, cash desk — with the reel windows, the marquee, the baize and the desk top
> painted blank, because every card, symbol, number and word a manager reads is rendered at
> runtime into a panel that covers the room.**

Nothing is composited into this room, so nothing needs to be a separate asset. There is no
character, so no floor is reserved. There is one Door, and it is the curtain you came through,
at the top of a few steps.

**What was found and reported rather than fixed:** a missing `data-room-shell` marker (§17.1),
an unphotographed room and a missing gate (§17.2), a hardcoded letterbox colour that may not
match the art (§17.3), a stairs-versus-curtain contradiction in the stand-in (§17.4), a
lit/covered mechanism that a painting cannot carry (§17.5), two overlay reservations that
should be struck (§17.6), and a stale canvas figure in `art/prompts/` (§17.7).

**No artwork was generated. No code, geometry, registry row, flag, migration or route was
modified. Nothing was merged. The Underground remains CLOSED.**

> ## READY FOR IMAGE GENERATION: **YES**
>
> The prompt in §14 is complete and self-contained. Attach the three approved room images
> from §13 and paste the four parts in order.
>
> **One caveat that is a sequencing matter, not a missing fact (§17.8):** the rulings that
> make blackjack and slots the approved games live on the unmerged casino branch, so `main`
> still shows `OPEN_ITEMS` **G1** open. Generating the image costs nothing and blocks nothing.
> **Integrating it should wait for that branch to merge**, because §15 step 7 re-aims
> `lib/casino/objects.ts` — a file that only exists there.

---

## 19. Round 1 candidate — acceptance review, 2026-08-12

Reviewed against §14.6, by putting the candidate beside the three processed shells on disk
(`public/assets/zone/zone_parlor_shell.png`, `zone_back_hall_shell.png`,
`zone_room_shell_storeroom.png`) rather than against the prose of this document.

**What this review could not do, stated first.** The candidate exists only as a conversation
attachment. It is not on disk, this container has no `node_modules` and no image library, so
**nothing here is a measurement**: no aspect ratio, no colour count, no quantized preview.
Every figure below is an estimate read off the rendered image and is marked as one.

### 19.1 What it gets right — and this is most of the brief

| §14.6 | | |
|---|---|---|
| 3 | **No text anywhere** | ✅ The wall clock face is blank, the marquee is blank, the dartboard cabinet is shut, the fuse box is unlabelled. Nothing to redraw |
| 4 | **No people** | ✅ And nothing that reads as one at thumbnail size — the jacket on the hook stays a jacket |
| 5 | **Blank runtime surfaces** | ✅ **Three reel windows, flat dark, empty.** Marquee blank and unlit. **Baize completely bare** — chip-tray recess and card wells present and empty, exactly as asked. Desk top bare |
| 6 | **No painted affordance** | ✅ Light comes *through* the opening; nothing is outlined, bloomed or arrowed |
| 7 | **The way out is guessable** | ✅ **The best thing in the image.** Steps rising to a lit frame with the maroon curtain drawn back and warm light falling down them. It passes the cover-the-file test outright |
| 8 | **Silhouette separation** | ✅ Tall narrow cabinet left, wide low table centre, opposite sides, sharing no edge |
| 10 | **No second staircase** | ✅ One flight, and it is the exit |
| 11 | Crop and status bands | ✅ Rows 0–48 are dark joists and a pipe run; the bottom is plain boards |
| — | **No gambling iconography** | ✅ **Full compliance.** No suit, die, chip, seven or cherry used as pattern anywhere. No roulette, no second table, no bank of machines, no screen |
| — | Dressing | ✅ Green-shaded pendants, brick, conduit, fuse box, radiator, crates, dough trays, freezer, stools, coat hook, ashtray, blank clock, newspaper, bricked-up arch, unfaded paint rectangle |

`18 §5`'s test is passed by three of the four fixtures on sight. That is a strong candidate.

### 19.2 The one content miss — the cash desk

The brief asked for *"a small worn wooden service counter or half-window built into the
right-hand wall… with a simple turned brass grille above it and one shelf behind."*

What came back is **a barred window with a ledge under it**. Two problems, and the second is
the one that matters:

1. It reads as a **window**, not as a place you settle up — and this room has no windows by
   its own description (*"coming from inside the room rather than from any window — there are
   no windows"*). It is the only fixture that fails the cover-it-and-guess test.
2. **It sits hard against the right edge and is partly cut by it.** Estimated at `x ≈ 272–320`,
   which runs into §11's *no load-bearing fixture in `x 312–320`* rule and would put a 44 px
   tap target against the device bezel at every width.

The desk is a real Display carrying the manager's own tab and last five spins. It cannot be
demoted to scenery, and it cannot be re-aimed onto a fixture that is half off the canvas.

### 19.3 The rendering register — the reason this is not accepted yet

**Continuous-tone source art is not the problem and must not be treated as one.**
`docs/PALETTE_FIDELITY_BOUNDARY.md` established that the approved parlor shell *arrives*
941 × 1672 with 153,738 distinct colours: **these are paintings, and the pixel-art look is
manufactured by the pipeline.** A candidate that is not already pixel art is exactly what the
preamble asks for.

What is different here is **register and value range**, and it shows immediately against the
three processed shells:

| | Approved parlor / hall / storeroom | Round 1 candidate |
|---|---|---|
| Light | Flat pools with **stepped edges** | **Soft volumetric cones** with continuous falloff |
| Surfaces | Flat fills separated by value; suggested texture | Rendered grain, **specular highlights on the floorboards** |
| Darks | Still carry detail — the storeroom's pipes, crates and shelf all read inside shadow | Left wall, ceiling corners and lower right **collapse to near-black with no detail** |
| Overall key | Storeroom is the darkest and still legible | **Visibly darker than the storeroom**, with heavy vignetting |

The storeroom is the fair comparison — same building, same green-shaded pendant, same block
walls, same pipes, same red rug — and it stays readable because its shadows are *value steps*
rather than *falloff*. Lanczos downscale plus a 96-colour quantization is unforgiving of
falloff: it bands, and banding across a large dark wall is the one failure
`ASSET_PIPELINE §8` names explicitly.

**The measured risk this creates.** §14.6.12's proxy is ~25–48 colours covering ≥0.5% of
frame. The three approved shells measure 52 (parlor), 25 (storeroom), 19 (hall). This
candidate's large flat near-blacks will very likely land **at or below the hall's 19**, and
the hall is already the accepted low-water mark. The proxy does not decide — the picture at
phone size does — but it is pointing the same way the eye is.

### 19.4 The experiment that settles it, which no opinion can

> **Save the candidate to `art/incoming/zone_underground_shell.png`, add the §12.3 registry
> row, run `npm run art:prepare-incoming && npm run art:process`, and put the 320 × 569
> output beside the other three shells at phone size.**

That is fifteen minutes and it is the only evidence that counts. Both outcomes are actionable:

- **It holds up** → accept, and follow §15 from step 5. The cash desk still needs §19.5.
- **It muddies** → regenerate with §19.6. The composition is banked either way; nothing about
  the layout has to change.

`PALETTE_FIDELITY_BOUNDARY` is the standing evidence that proxies here can prefer the worse
picture, so the processed file is the artefact to judge — **not this attachment, and not the
colour count**.

### 19.5 Geometry — estimated, and the re-aim looks legal

Per §10.3 the code moves to the painting, once. Estimated delivered positions against the
reserved rects:

| Object | Reserved | Estimated delivered | Re-aim |
|---|---|---|---|
| `slots` | `[22, 150, 84, 200]` | ≈ `x 6–70, y 154–330` | narrower and further left. ~64 units wide still clears the 39.1 floor — **legal**, but verify against the left edge |
| `blackjack` | `[126, 236, 132, 96]` | ≈ `x 102–272, y 273–358` | wider and lower. **Legal, and better for thumb reach** |
| `return` | `[126, 96, 70, 120]` | ≈ `x 134–208, y 97–267` | very close. **Legal** |
| `desk` | `[236, 150, 68, 76]` | ≈ `x 272–320, y 199–330` | **runs off the canvas.** §19.2 — this is the blocker, not the offsets |

**`HORIZON` becomes vestigial rather than re-aimed.** The delivered back wall meets the floor
at roughly `y 267` against the code's `400`. That constant has exactly one consumer —
`components/scene/underground.tsx`, which §15 step 5 **deletes** — so it should be deleted
with it rather than corrected to a number nothing reads.

⚠️ **Aspect must be measured before processing.** The candidate looks near `0.58` against the
required **`0.5624`**. `process-art.ts` uses `fit: 'fill'`, so a wrong aspect is **stretched,
not cropped** — a 3% horizontal stretch on a painted room is the kind of error that is
invisible in isolation and obvious beside the parlor.

### 19.6 If a round 2 is needed — six prompt corrections, not a redesign

**Keep the composition.** The fault is in how the room is *lit and rendered*, and two lines of
the SUBJECT invited it.

1. **Delete the two lines that asked for this.** *"slightly too dim, like a room lit by people
   who did not want to be noticed from outside"* and *"leaving the corners in shadow"* are
   where the darkness came from. Replace with: *"Warm and clearly lit. Every corner of the
   room stays readable — shadow is one value step darker, never an absence of detail."*
2. **Forbid falloff explicitly**, because the preamble's *"no soft shadows"* was
   under-weighted at that distance: *"Light pools have flat, stepped edges. No volumetric
   light cones, no continuous falloff, no specular highlights on the floor."*
3. **Restate the style at the tail.** The preamble sits above a long SUBJECT and generators
   weight the end. Add immediately before the NEGATIVE: *"Restating the style: flat colour
   fills, crisp 1-pixel outlines, value-stepped shading, illustrated rather than
   photographed."*
4. **Name the reference by role.** *"Match the attached basement/storeroom image's rendering
   register exactly — same flatness, same edge crispness, same amount of detail surviving
   inside the dark areas. It is the same cellar in the same building."*
5. **Rewrite the cash desk** so it cannot come back a window: *"A small wooden service counter
   standing against the right-hand wall, free of the room's right edge, with a hinged flap,
   a cash drawer and a shelf of ledgers behind it. It is a counter you settle up at, not a
   window. There are no windows in this room."*
6. **State the aspect as a hard number**: *"Output 940 × 1672 pixels, aspect 0.5624 exactly."*

Add to the NEGATIVE: `· no volumetric light shafts or light cones · no specular or glossy
highlights on any surface · no vignetting · no barred window, grille window or teller cage ·
no window of any kind`.

### 19.7 Verdict on round 1

| | |
|---|---|
| Content, compliance, dressing, text, people, iconography | **Approved.** Nothing to change |
| Composition and the exit | **Approved.** §3.3 and §7 are satisfied better than the brief asked |
| Cash desk | **Must change**, whether or not the render is re-run — it is off-canvas and reads as a window |
| Rendering register and value range | **Held.** Decide on the processed file, not on the attachment |
| Aspect | **Measure before processing** |

**This is a near miss on one axis, not a failed batch.** If §19.4 comes back clean, the only
outstanding work is the cash desk.
