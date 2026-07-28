# Implementation Handoff

**For:** the engineer picking up the next assignment
**Current assignment:** V0 Pipeline + V1 Doors Open
**Authority:** `PROJECT_SPEC/17_ACCELERATED_ROADMAP.md` for ordering · `PROJECT_SPEC/16_FINAL_RECONCILED_PLAN.md` for everything else

---

## Read first

1. `PROJECT_SPEC/16_FINAL_RECONCILED_PLAN.md` — architecture, invariants, scope
2. `PROJECT_SPEC/17_ACCELERATED_ROADMAP.md` — ordering, slices, checkpoints
3. `content/counter-greetings.md` — the M1 content
4. This file

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
- **Parlor** — six zones, stacked full-width cards on mobile, composed scene on desktop
- **Tonight at Tony's** — at most four lines, never scrolls
- **Counter Greeting** — Tony sprite, ~600ms entrance, two lines, expression matching, reduced-motion path
- **Your receipt** — record, finish, points, from imported history
- **Offseason dressing** — the shop reads as closed-for-the-summer, deliberately

**Out of scope:** tokens, collectibles, the Slice, live sync, avatars, basements, casino, real art. Their doors exist and are visibly closed.

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

---

## Known open items

1. **Sleeper username → manager mapping** — four 2025 accounts unmapped. Group A greetings do not depend on it; Group B does. Listed in `content/counter-greetings.md`.
2. **Group B greeting lines** await commissioner approval. Seed Group A only.
3. **Art** — everything resolves to placeholders until B0/B1. Expected, not a bug.
