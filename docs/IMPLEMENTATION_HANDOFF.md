# Implementation Handoff

**For:** the engineer picking up the next assignment
**Last completed:** V0 Pipeline + V1 Doors Open
**Authority:** `PROJECT_SPEC/17_ACCELERATED_ROADMAP.md` for ordering · `PROJECT_SPEC/16_FINAL_RECONCILED_PLAN.md` for everything else

> **V0 and V1 are shipped.** What follows is kept as the record of that
> assignment; §"Where V1 landed" at the bottom is what a reader needs now.
> The next slice is **V2 Memory** (`17 §4`) and has not been assigned.

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

---

# Where V1 landed

## The map

| | Where |
|---|---|
| Deploy pipeline, health check, runbook | `docs/DEPLOYMENT.md` · `app/api/health` · `vercel-build` |
| PIN, sessions, rate limiting, claim, reset | `lib/auth/` |
| Derived tags, pure over imported history | `lib/tags/` |
| Content engine v0 — parse, select, seed, greet | `lib/content/` |
| Season clock, receipt, Tonight board | `lib/parlor/` |
| Parlor, door, closed doors, profile, admin | `app/` · `components/` |
| Idempotent provisioning: history + content + admin | `scripts/seed.ts` |

## Decisions a later slice should know about

- **Distinctiveness beats tag count.** The selector ranks eligible lines by how many managers they are true of, not by how many tags they carry. Ranked by tag count, the two-tag title-drought line beat the one-tag "most points against" line and five managers saw the same greeting. Any new surface using `selectContent` should pass `audienceSize`.
- **Records live on `season_memberships`.** Wins, losses, points for and against, and `made_playoffs` are columns on the membership row. Unlike display names they are *not* seeded-once — Sleeper owns fantasy results, so a re-sync updates them.
- **A drawn bracket is not a played bracket.** Sleeper publishes the 2026 bracket in the preseason with six rosters named. Playoff participation counts only once a bracket match has been decided.
- **Lockout counts failures over 24 hours**, not the 15 minutes in `16 §11`. Counting over the same window that forms the first penalty makes every later penalty unreachable. Reasoning in `lib/auth/rate-limit.ts`.
- **Tonight at Tony's is a view, computed on every load.** The spine does not exist yet, so it reads imported history and the season clock. When `league_events` lands the source changes and the surface does not. Do not add a table for it.
- **`CLAIM_CODE` is optional and set in the environment only.** The code itself is never committed. With it unset, anyone holding the URL can claim an unclaimed name; setting it closes that window without touching sign-in.
- **Second and third place are derived, not just first.** `runner_up_{year}` and `third_place_{year}` come from the bracket's placement games for every completed season, and they are what distinguish a manager who never led or trailed the league in anything.

## Open, and for the commissioner

1. **One pair still shares a greeting.** SuggMyNick and cheeseking both made the 2025 playoffs without a title, and A21 is the only Group A line keyed to that. Both hear something true. Closing it is two lines in the markdown and no code change; the verified material exists — cheeseking went 1–13 in 2024 and 9–5 with a third-place finish in 2025, SuggMyNick had the second-best record in 2025 at 10–4. Asserted in `lib/content/greeting.test.ts` so adding a line shows up as a change.
2. **Group A's figures are pinned to 2025, and say so.** Every record, points total and placement names its season, and no line uses a relative time phrase — both enforced by `lib/content/parse.test.ts`. That keeps a claim about 2025 a claim about 2025 once 2026 finishes. It does not make a line immortal: "one ring" stops being true if that manager wins another, so the set still wants a read-through when a season completes.
3. **Kickoff is a constant.** `KICKOFF_2026` in `lib/parlor/season.ts`. Sleeper exposes no reliable preseason start date, so it is configuration rather than a derived fact.
4. **No PIN-change flow.** A manager can sign out everywhere; changing a PIN needs the commissioner to clear it first. It belongs with the auth work it would extend rather than bolted onto the profile page.
