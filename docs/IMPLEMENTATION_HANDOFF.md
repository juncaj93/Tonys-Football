# Implementation Handoff

**For:** the engineer picking up the next assignment
**Current assignment:** V0 Pipeline + V1 Doors Open
**Authority:** `PROJECT_SPEC/17_ACCELERATED_ROADMAP.md` for ordering · `PROJECT_SPEC/18_PARLOR_NAVIGATION_MAP.md` for the room · `PROJECT_SPEC/16_FINAL_RECONCILED_PLAN.md` for everything else

---

## Read first

1. `PROJECT_SPEC/16_FINAL_RECONCILED_PLAN.md` — architecture, invariants, scope
2. `PROJECT_SPEC/17_ACCELERATED_ROADMAP.md` — ordering, slices, checkpoints
3. `PROJECT_SPEC/18_PARLOR_NAVIGATION_MAP.md` — **which objects are interactive and why**
4. `content/counter-greetings.md` — the M1 content
5. This file

---

## Already shipped

| | Where |
|---|---|
| Next.js 15 · TS strict · Tailwind 4 · Vitest · ESLint 9 · CI | repo root |
| Injected clock, enforced by lint | `lib/clock.ts` |
| Asset registry, placeholder-first | `lib/assets/` |
| Identity schema — users, seasons, memberships, co-owners | `lib/db/schema.ts` |
| Sleeper adapter — transport, chain, codec, fixtures | `lib/sleeper/` |
| Historical import, idempotent | `lib/sleeper/persist.ts` |
| Recorded league fixtures, 2024–2026 | `fixtures/sleeper/` |

**Do not rebuild any of it.** The chain, the importer, and the fixtures are done and tested.

---

## The assignment

### PR 1 — V0 Pipeline

Infrastructure only. Ship it before any feature exists, so every later slice is a live deploy.

- Neon **production** database; use the **pooled** connection string
- Vercel project on `main`, auto-deploy
- Preview deploys pointed at the **sandbox Neon branch — never production data.** Hobby previews are public-by-URL.
- Environment variables per `.env.example`
- Migrations run as a deploy step, before new code serves traffic
- Deploy current `main` and confirm a live URL

M1 ships on the `*.vercel.app` URL. Do not block on DNS. Keep the origin out of the code — session cookies host-only, absolute URLs from env — so a `juncaj.net` subdomain attaches later without a code change.

### PR 2 — V1 Doors Open

- **Auth** — claim flow over imported managers (pick your name → set a 6-digit PIN), argon2id, 90-day rolling session, host-only cookie, rate limiting, commissioner reset
- **Derived tags** — pure function over imported history → per-manager booleans. Tag list in `content/counter-greetings.md`.
- **Content engine v0** — `content_entries` + `content_usage_log` + selection with cooldowns, seeded from `content/counter-greetings.md` **Group A only**
- **Parlor** — **one portrait shell plus transparent overlays** at 320×569 logical. Not six composed tiles, not a grid of hotspots.
- **Room interaction** — per `18` v2.0. See below; this replaces any earlier hotspot or zone-tile approach.
- **Tonight at Tony's** — at most four lines, never scrolls
- **Counter Greeting** — Tony sprite, ~600ms entrance, two lines, expression matching, reduced-motion path
- **Your receipt** — record, finish, points, from imported history
- **Offseason dressing** — the shop reads as closed-for-the-summer, deliberately

#### Room interaction — `PROJECT_SPEC/18_PARLOR_NAVIGATION_MAP.md` v2.0

Every object is exactly one role, and **a Door glows only when it has something to say**. That is what makes a glow mean *something changed here*, rather than becoming wallpaper.

**Exactly eight interactive objects — 4 Doors, 3 Displays, 1 Toy:**

| # | Object | Role | Route / behaviour | Glows when |
|---|---|---|---|---|
| ① | Left arched nook — newspaper rack | Door | `/slice` | a Slice is unread |
| ② | Large wall board | Display | Tonight at Tony's, expands in place | never |
| ③ | Banner rail | Door | `/timeline` | **never persistently** |
| ④ | Small sign right of Tony | Display | prediction (V1), expands in place | never |
| ⑤ | Receipt in front of Tony | Display | manager record, expands in place | never |
| ⑥ | Countertop tray | Door | `/counter` | a box is owned or available |
| ⑦ | Right-rear doorway | Door | `/back-hall` | something beyond it is open |
| ⑧ | Tony | Toy | a line on tap, cooldown-limited, **no navigation** | never |

Typically **one or two** glow at once. Everything else in the room is **scenery** — no hotspot, no glow, no hit area.

**There is no basement door, no Underground door, no display case, no second door, and no floor hatch on the homepage.** Rooms and Underground live **inside the Back Hall only** — `/rooms` and `/underground`, both locked in V1.

**Routes.** `/counter` is the collectible-economy route, with `/counter/collection` and `/counter/showcase` beneath it. **`/collection` is not a route** — do not create it. `/back-hall` is one compact pixel scene with two environmental choices and an **in-world return door**; no card grid, no bottom nav, no browser-back dependency.

**Opening happens at the tray.** Tapping an owned box on the homepage opens it *there*, in place. Do not route to `/counter` first — that inserts a navigation step into the most exciting moment in the product.

**Tony's Line is later, flagged behaviour.** In V1 the small sign carries Tony's prediction and nothing else. Do not build the market, the stake, or the settlement now.

**Remove** any rectangular hotspot on wall frames, posters, booths, or Tony. **Remove** "Keys" and "Office" from the room — admin is not a parlor object (`02 §3`). **Remove** the clipboard; the receipt replaces it.

**Affordance is alpha-derived.** Glow is `filter: drop-shadow()` on the overlay's **own alpha** — it follows the silhouette exactly and never covers the wall beside the object. **No authored masks, no SVG polygons, no hit-map images.** The hit region is the tightly-cropped overlay box expanded to a **44px minimum**: expand the hit region, never the glow. Reduced motion replaces every pulse with a static outline. Name destinations for what the manager will find, never for the furniture.

**All changing text is HTML over blank baked surfaces** — the board, the small sign, the receipt, and the banner years. None of it is baked into art.

**Out of scope:** tokens, collectibles, the Slice pipeline, live sync, avatars, Rooms, Underground, real art. Their doors exist and are visibly closed.

---

## Working mode

**Run continuously inside a slice.** No check-in for:

- UI composition, styling, mobile layout, responsive behaviour
- Seeding and editing content entries
- Writing and refactoring tests
- Refactors contained within the slice
- Swapping placeholder assets via the registry
- Purely additive migrations, *before* real accounts exist

**Stop and check in for:**

- A new external resource or secret
- A migration touching existing data once managers have claimed accounts
- Any change to the identity model or ledger integrity rules
- Any scope outside the current slice — propose it, do not absorb it
- Once the league has access: anything that changes what they already see

---

## Invariants — do not violate

From `16 §4.2`, unchanged by the accelerated ordering:

- **No database client in the browser.** Server-side access only.
- **Roster 4 in 2025 is not roster 4 in 2026.** Both memberships uniques stay season-scoped.
- **One economy primitive.** All token movement through `apply_token_delta` with an idempotency key. Not in this assignment — do not pre-empt it.
- **The injected clock.** `new Date()` and `Date.now()` are lint errors outside `lib/clock.ts`.
- **`is_historical` means provenance, not completeness.** See `16 §12`.
- **Migrations forward-only** once real accounts exist.
- **Every asset by slug**, never by path.
- **Mobile first, iPhone Safari.** 44px targets, safe-area insets, `dvh`, no hover dependence, no zoom-on-focus.

---

## Definition of done — V1

On a real iPhone:

- [ ] Live URL; PIN login; still logged in the next day
- [ ] **Two managers get visibly different, verifiably true greetings**
- [ ] Tony's entrance plays once, skippable, absent under reduced-motion
- [ ] Tonight board answers "what's new" in under five seconds
- [ ] The receipt shows the manager's actual 2025 season
- [ ] Every action comfortable one-handed
- [ ] It does not look like a dashboard
- [ ] `npm run check` green; CI green

Room interaction (`18 §10`):

- [ ] Exactly **eight** interactive objects: **4 Doors, 3 Displays, 1 Toy**
- [ ] **No** basement door, Underground door, display case, second doorway, or floor hatch
- [ ] Typically **one or two** objects glow; the banner rail never glows persistently
- [ ] Every glowing object can be correctly guessed **before** tapping
- [ ] The rear doorway is unlabeled and calm in V1
- [ ] The Back Hall is one screen, two obvious choices, and an in-world return
- [ ] Rooms and Underground are two taps; nothing else is deeper than two
- [ ] Tapping Tony produces a line and no navigation
- [ ] Tapping a booth, poster, or wall frame does nothing at all
- [ ] Every tap lands on the object, never on wall beside it
- [ ] All changing text is HTML over blank surfaces — none baked into art
- [ ] Reduced motion replaces every pulse with a static outline

---

## Known open items

1. **Sleeper username → manager mapping** — four 2025 accounts unmapped. Group A greetings do not depend on it; Group B does. Listed in `content/counter-greetings.md`.
2. **Group B greeting lines** await commissioner approval. Seed Group A only.
3. **Art** — everything resolves to placeholders until B0/B1. Expected, not a bug.
