# Mobile performance — the canonical account

**Workstream:** iPhone performance and interaction smoothness, 2026-08-12.
**Scope:** how the product *feels* on iPhone Safari at 390 / 375 / 360. No
feature design, no art, no economy value, no product ruling.

This is the record of what was measured, what was changed, what was found and
deliberately **not** changed, and what is left. `docs/OPEN_ITEMS.md` carries the
items that stay open; this carries the reasoning.

---

## 0. The finding that was not a performance finding

**`/counter/showcase` answered HTTP 500 for every manager who has ever won the
league.** Two of the ten on a freshly seeded production database, one of them the
commissioner.

It was found by measuring, not by reading: the driver hits every route and
records the status, and this one came back `500` seven times out of seven while
everything around it was green.

`item_championship_ring` is a real `collectibles` row and is deliberately
**outside** the box catalog — `systemLayer`, earned rather than pulled
(`lib/counter/catalog.ts`). All three readers in `lib/counter/showcase.ts` called
`catalogItem`, which throws rather than returning a hole, so the page threw
before it rendered anything.

Three things are worth carrying out of it:

- **`lib/rooms/service.ts` had already solved this, for this exact slug**, with
  the reasoning written out — *"a room asking 'is this furniture?' is entitled to
  be told no without a page failing to render."* The Showcase never got the same
  treatment, and nothing connected the two.
- **The test suite could not have caught it.** Every showcase test builds its
  managers from scratch, and a manufactured manager has no ring. The rings come
  from `scripts/seed.ts` reading verified titles, which only the seeded database
  has.
- **Neither could the visual gate**, and that is the more interesting half.
  `/counter/showcase` is photographed at all three widths on every sweep. A
  Next.js production error page renders as a plain dark screen with a short
  sentence on it — it has no palette contamination, no undersized type, no
  overlapping hit region and no missing tap target, so **every deterministic
  gate passes on it**. The sweep has been photographing a 500 and reporting
  green. See §8.

The fix is the room's: a ring is not offered as something to put out, because it
is granted rather than chosen and already has a place that is *about* having won
it. A stored pick the catalog cannot name reads as *nothing out* rather than as
an exception — `showcaseFor` is on the **parlor's** critical path, so a throw
there is not one screen failing, it is the shop failing.

`lib/counter/showcase.test.ts` carries three tests and **all three fail on the
pre-fix module**.

---

## 1. How this was measured

Everything below is from the **production build** (`next build` + `next start`),
never the dev server, against a **freshly seeded** database.

Three instruments, none of them left in the repository:

| | |
|---|---|
| **Query log** | a `--require` preload wrapping `pg.Pool.prototype.query`, writing one line per query with start and end timestamps |
| **A latency proxy** | a TCP proxy in front of Postgres adding **1 ms each way**, so the database is a network hop away the way Neon is and a local unix-domain Postgres is not |
| **Playwright at iPhone widths** | 390 × 664, DPR 3, touch, a real iPhone Safari User-Agent; signed in through the real front door |

### The measurement bug that had to be fixed first

The first probe wrapped `pg.Client.prototype.query` and reported **every query as
taking 0 ms and nothing ever overlapping** — which would have concluded that
already-parallel code was serial.

`Pool.query` hands `Client.query` a callback, because that is how it knows when
to release the client, and pg's client returns a `Query` object rather than a
promise whenever a callback is present. So the client-level wrapper saw every
call start and never saw one finish. The pool is the layer drizzle issues
through and the layer that must be measured. `scripts/query-budget.test.ts`
carries the same note, because the same trap is waiting for the next person.

### The number that predicts production, and the one that does not

**Wall-clock TTFB on this machine is noise.** `/timeline` measured 53 ms, 92 ms
and 66 ms on three runs of *identical code*.

**Waves** are stable. A wave is a set of queries that overlap in time:
everything in one wave costs one round trip, and a page costs as many round trips
as it has waves. On a local Postgres a query costs about a tenth of a
millisecond, so thirty-five waves and one wave look the same; against a database
a network hop away the wave count *is* the latency.

---

## 2. The baseline, and what changed

Production build, database at a 2 ms round trip, freshly seeded, signed in as a
real manager.

| Route | queries before → after | **waves** before → after | status |
|---|---|---|---|
| `/` (the parlor) | **58 → 27** | **35 → 13** | |
| `/counter` | 8 → 7 | 6 → 4 | |
| `/counter/showcase` | 5 → 5 | 3 → 2 | **500 → 200** |
| `/timeline` | 12 → 12 | **12 → 4** | |
| `/rooms` | 17 → 17 | 2 → 2 | untouched — see §5 |
| `/slice` | 34 → 34 | 34 → 32 | mostly untouched — see §5 |
| `/counter/collection` · `/back-hall` · `/profile` · `/profile/character` | unchanged | unchanged | already lean |

The parlor's 22 fewer round trips are worth roughly **65 ms at a 3 ms RTT and
110 ms at 5 ms**, on the product's most-visited screen, before counting the
database's own work.

Wall-clock agreed, for what it is worth: the parlor's time-to-first-byte under
the same modelled latency went **164 ms → 76 ms**. That number is quoted second
rather than first because §1 is right about it — `/timeline` measured 53, 92 and
66 ms on three runs of identical code, and a delta that size would be
indistinguishable from noise. The parlor's is not, and it happens to point the
same way as the wave count.

---

## 3. What was wrong, in order of how much it cost

### 3.1 The parlor paid 31 queries for answers it threw away

**24 of them for a sentence that could not be said.** `statsAsideFor` refuses
outright while a moment tag is held — a manager standing in front of an unopened
box is in the middle of something — and the page evaluated the fact packet
(21 queries) and the champion (3) as **arguments**, so both were paid before the
refusal could happen.

This is not an edge case. Measured on the seeded league, **all ten managers hold
a moment tag**, because the seed grants everyone a welcome box and a
season-opening box. Every manager, every load, until they tap the tray.

`parlorAside` in `lib/parlor/aside.ts` puts the gate ahead of the loading, in the
file that owns the rule. The alternative — restating `momentTags.size > 0` in the
page — is one rule in two places, and the copy is the one that rots.

**7 more for the offseason.** `featuredMatchup` is the *fallback* inside
`inSeasonFace`; out of season `boardFace` is built from the countdown alone and
never looks at it. `seasonClock()` is synchronous, so asking it first costs
nothing and keeps the read in the parallel wave when it is genuinely wanted.

### 3.2 Four pages queued reads that never needed each other

The parlor's tail was six sequential stages — wallet, then showcase, then the
board, then moment tags, then the greeting, then the aside — none of which was an
input to the next. It is two waves now: everything that depends only on *who is
asking*, then everything that needed an answer from the first.

`/slice` awaited the named preview, the previewed board and the open season one
after another; `lib/league/timeline.ts` did the same with three independent
reads.

### 3.3 `/counter` read the same wallet twice

Identical query, identical arguments, one after the other. `purseFor` read it,
and the page read it again to answer *do they hold a seat at all* — because
`purseFor` deliberately collapses "no seat" and "no stored prices" to one null
and the page needs to tell them apart to say the right sentence. It reports which
null it means now.

### 3.4 The Timeline cost one round trip per season of league history

`seasonFacts` was awaited inside a `for` loop over seasons. Nothing in the loop
body depended on another season — the margin population and the banners are both
already in hand — so this was an N+1 that **grows every January**. Three seasons
is nine sequential reads today.

`Promise.all` preserves input order, so the wall is in the same order it was.

---

## 4. Safari, at 390 / 375 / 360

**This is the part of the product that is already in good shape**, and it is
worth saying plainly rather than inventing work. Checked against the running
build and the stylesheet:

| | |
|---|---|
| `100dvh` rather than `100vh` | ✅ `components/shell.tsx` — Safari's collapsing toolbar cannot crop the last row |
| `viewportFit: cover` + `env(safe-area-inset-*)` | ✅ notch and home indicator, per surface rather than globally |
| no `maximumScale` / `userScalable` | ✅ pinch-zoom stays available |
| `-webkit-text-size-adjust: 100%` | ✅ no landscape text inflation |
| `-webkit-tap-highlight-color: transparent` | ✅ no grey flash on tap |
| `overscroll-behavior-y: none` | ✅ no rubber-banding behind fixed chrome |
| **inputs at ≥16px** | ✅ `app/globals.css` — the single most common iOS "the page zoomed when I tapped the box" defect, already closed |
| `position: fixed` rather than `background-attachment: fixed` | ✅ `components/scene/backdrop.tsx`, with the reason written down |
| tap targets | ✅ 44px convention, and the visual gate measures it |
| back / forward | ✅ **7 ms** — Next's client router cache serves it |

**Nothing was changed here.** No Safari defect was found.

---

## 5. Found, measured, and deliberately not changed

### 5.1 `/slice` is 32 sequential round trips and the reason is editorial

Parallelising the three independent reads took it 34 → 32 waves. The remaining 32
are inside `rackIssue`, which — with nothing yet published — walks back through
the season building a fact packet per week until one is publishable. The page's
own comment already says so.

Changing that means changing how the Slice decides what is on the rack, which is
**Tuesday Slice editorial mechanics** and outside this workstream's boundary. It
is also self-limiting: the walk exists only while nothing has ever been
published, and `16 §9`'s approval chain ends that permanently on the first
published issue.

**Not filed as debt.** The cost is real and the condition is temporary.

### 5.2 `/rooms` runs `ensureRoom` twice, including two writes

`roomFor` and `placeable` each call it, and the page calls both in parallel — so
every render of `/rooms` issues two `INSERT … ON CONFLICT DO NOTHING` and two
selects where one of each would do. On Neon both writes go to the primary.

**Not fixed, on a cost judgement rather than a boundary one.** The clean fix
means threading the resolved room through two service signatures in a
recently-landed area, and the honest alternative — resolving it once in the page
first — trades two queries for an extra wave, which is close to a wash. `/rooms`
is 17 queries in **2** waves and is not a latency problem. Filed as `E8`.

### 5.3 The parlor still asks the same season question three times

After the change, the only repeated read left on the parlor is
`currentSeasonYear` — `select year from seasons order by year desc limit 1`,
three times, down from six. Three different modules legitimately need it and
none is wrong to ask.

**Left alone deliberately.** Collapsing it means request-scoped memoization, and
the primitive for that (React's `cache()`) keys on argument identity — so it
would first need `getDb()` to return a stable handle, which is a change to how
every service in the product receives its database. That is a general mechanism
introduced for three of the cheapest queries in the set, which is the abstraction
Phase 4 of this workstream's own brief warns against. It is recorded rather than
filed: there is nothing here to fix until something makes the read expensive.

### 5.4 Web-font swap moves the layout after first paint

All three faces are `font-display: swap` (`@fontsource`'s default) against a
`ui-monospace` fallback whose metrics are nothing like VT323's. When the font
lands at 87–151 ms, text reflows. Measured cumulative layout shift, cold cache,
390 px:

| route | CLS |
|---|---|
| `/profile/character` | **0.109** |
| `/profile` | 0.070 |
| `/counter` | 0.057 |
| `/timeline` | 0.044 |
| `/` (the parlor) | 0.011 |
| `/slice` · `/back-hall` · `/rooms` | 0.000 |

The shifting nodes are text; the two routes with no font request have no shift.
On a real phone over cellular the font arrives later, so the jump is *more*
visible than this.

**Not fixed, and this one is a genuine judgement call.** Every route to it
touches how the product's type is declared — `next/font/local`, self-hosted
`@font-face` with preloads, or fallback metric overrides — and this repository
has a typography module, a static type-size test and a runtime gate that measures
the **computed** size of every rendered text node. That is the right amount of
protection and it is also the reason a font-pipeline change is not a low-risk
performance edit. Filed as `E9` with the measurements, so whoever picks it up
starts from numbers rather than from an impression.

### 5.5 There is no `loading.tsx`, `error.tsx` or `not-found.tsx` anywhere

Three consequences, all measured:

- **Nothing is prefetched.** Watched for 2.5 s on an idle parlor: **zero** RSC
  prefetch requests. Every page is `force-dynamic` and none has a loading
  boundary, so Next has no static shell to prefetch and correctly fetches
  nothing. Adding `prefetch` props would change this not at all.
- **A tap has no feedback until the next screen paints** — 137–188 ms here, more
  in production. The old screen simply sits there.
- **A thrown error is Next's default page**, which is exactly what §0 produced.

**Reported rather than implemented, on product grounds.** A loading state is a
new screen in a product whose central rule is that *the room is the interface*,
and an error boundary needs words in Tony's voice — `CLAUDE.md` limits Tony's
dialogue to curated content, so writing them here would be authoring unapproved
content on the surface the league reads as him. Both are product decisions.
Filed as `E10`.

The honest performance answer meanwhile is the one taken: **make the server
faster**, which is what §3 does. Nav latency tracked TTFB almost exactly.

---

## 6. Client JavaScript — audited, nothing to do

| | |
|---|---|
| shared first-load JS | **102 kB** (React + the Next runtime) |
| per-route | **182 B – 11 kB**; the largest is the character customiser, which is legitimately interactive |
| on the wire, cold cache | 203–237 kB total per route, 104–125 kB of it script |
| duplicate requests | **zero**, on every route measured |
| third-party requests | **zero** — fonts are self-hosted, there is no analytics vendor and no CDN |
| `'use client'` components | 16, all genuinely interactive |

There is no heavy dependency to remove and no component that should be a Server
Component and is not. **No change was made and none is recommended.**

---

## 7. Mutation smoothness — audited, nothing to do

Every manager-facing mutation already holds a pending state and disables its
control: buy a box, take a side, pick a showcase item, choose a theme, place an
item, set a PIN, save a character. The tray goes further and unmounts its own
button while a box is opening, with a `phase !== 'idle'` guard behind it.

Confirmation is `router.refresh()` — ask, then re-read — rather than a modelled
client transition, so the server stays authoritative. **No double-submit path was
found and nothing was weakened.**

---

## 8. What the gates could not see, and what now can

The visual sweep photographs `/counter/showcase` at three widths on every run and
has been photographing a **500** page. Every deterministic gate passed on it: a
production error page has no palette contamination, no undersized type, no
overlapping hit region and no missing tap target.

That is a real hole and it is **not closed by this workstream** — closing it
means the driver asserting on response status, which is a change to
`scripts/visual-qa.mts`, a file this claim did not take. Filed as `E11`, with the
worked example attached, because a gate that reports green on a 500 is the exact
class of thing this repository files.

What was added instead is `scripts/query-budget.test.ts`, deliberately small:

- **the aside costs nothing when a moment is in play** — the 24-query saving,
  with a control assertion so it cannot be satisfied by a `parlorAside` that
  never reads anything;
- **the Timeline derives every season at once** — asserted as *more than one
  season in flight*, which is the property, and it **fails on the pre-change
  loader**;
- **a guard on the guard** — the instrument is only meaningful while the pool is
  the layer drizzle issues through.

**No wall-clock threshold, and no total-query-count assertion for a route.** A
timing gate on a shared runner varies by more than any regression worth catching,
and a count that has to be edited on every feature is a count that gets edited
without being read. What is pinned is the **shape**: work that is refused must
not be paid for, and work that does not depend on other work must not queue
behind it.

---

## 9. The gates, and the one that failed first

**`npm run check` — green**, exit 0: preflight, typecheck, lint, the full suite
against a real Postgres, production build.

**`npm run visual:qa` — green**, 125 states × 3 widths, 375 captures, every
deterministic gate passing — including `/counter/showcase`, which this branch
stopped being a 500.

It did **not** pass first time, and the way that was resolved is worth recording
because the answer was measurement rather than a ceiling change.

| Sweep | Commit | Sightings of React `#418` | |
|---|---|---|---|
| this branch | `7ff0387` | **3** | **failed** — over the quarantine ceiling of 2 |
| **clean `main`** | `1692a14` | **1** | passed |
| **this branch, again** | `7ff0387` | **2** | passed |

The middle row is the control `docs/OPEN_ITEMS.md` **F1** asks for, and it
reproduced the defect at **`/door@375` during `profile` — the same route, state
and width as one of the branch's three**, on a build that does not contain the
branch. The third row is the same commit as the first, passing.

Six sightings, **six different route/state/width combinations, none repeated**,
every one of them on `/profile`, `/door`, `/admin` or `/admin/slice` — **not one
on a route this branch changed**. That is the signature
`scripts/visual-qa-quarantine.ts` describes, and the opposite of a newly
introduced mismatch, which is deterministic and fires on the same state at all
three widths.

**The ceiling was not touched.** F1 is explicit that moving it to unblock a
branch is the move its own header argues against, and that the ceiling and the
per-capture rate want re-deriving *together* by a session that takes that on
deliberately. The three measurements are added to F1 as evidence and nothing
else.

---

## 10. One honest caveat about the local sweep

`npm run visual:qa` was run locally against the production build and a freshly
seeded `tonys_visual`, exactly as `visual-qa.yml` does — **except for the browser
version.** The pinned Playwright wants Chromium 151 and the agent container ships
151's predecessor; the matching build cannot be downloaded, because the proxy
refuses `cdn.playwright.dev` with a 403. The installed build was aliased to the
expected path rather than the driver being edited, so the gate ran unmodified.

**The hosted run is the authority on pixels**, and this is recorded rather than
glossed because a colour or a metric could in principle differ by one browser
version. It does not affect anything in this document: every number in §1–§3 is a
query count, a round-trip count or a byte count, and none of them comes from the
sweep.

---

## 11. What did not move

No art, asset, palette or registry row. No economy value, price, rarity, catalog
size or token rule. No schema, migration, trigger or index. No cron. No feature
flag. No fantasy-truth boundary — every read below is the same read it was, and
**nothing is cached across requests**; the only reuse added is within a single
render. No Slice editorial mechanic. No publication-approval step. No
historical-analysis semantics. No manager sprite or character work. No
Underground. No visual design decision.
