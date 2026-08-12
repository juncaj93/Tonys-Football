# Mobile reliability, sessions and failure recovery — the boundary

**Status:** the canonical account of this workstream. Written 2026-08-12 against
`main` at `1692a14`, with every claim below measured on a **production build**
(`next build` + `next start`) driven by a real iPhone-Safari user agent at 390 ×
664, against a real Postgres.

This was an audit of what happens when managers behave like people with phones
rather than like ideal clients. It is **not** a new feature, and it is not the
performance workstream: that one owns latency, queries and bundles, this one owns
**correctness and recovery**.

---

## 1 · The session architecture, as built

Read from the running code rather than from the documents.

| | |
|---|---|
| **Cookie** | `tonys_session`, value `<token>.<hmac(SESSION_SECRET, token)>` |
| **Attributes** | `HttpOnly` · `SameSite=Lax` · `Secure` in production · `Path=/` · **host-only** (no `Domain`) · `Max-Age` 90 days |
| **Stored** | `sha256(token)` in `sessions.token_hash` — never the token |
| **Lifetime** | 90 days, **rolling**, refreshed in two halves: the row's `expires_at` in `resolveSession`, the cookie's `Max-Age` in `middleware.ts` on every request |
| **Row touch** | at most hourly (`SESSION_TOUCH_INTERVAL_MS`), because the cookie half costs nothing |
| **Sign-in** | pick a name from the door, six digits, rate-limited per user **and** per IP hash; a success clears the failure slate |
| **Revocation** | `sessions.revoked_at` + a reason — `SIGNED_OUT`, `SIGNED_OUT_EVERYWHERE`, `COMMISSIONER_RESET` |
| **Devices** | `/profile` lists unrevoked, unexpired sessions with a coarse `deviceLabel` derived from the UA; the raw header is deliberately never stored |
| **Admin** | `users.is_admin`, seeded from `COMMISSIONER_SLEEPER_USER_ID`; **unset means nobody**, and every admin route answers `notFound()` |
| **Authorization** | exactly one server-side layer — `viewer()` / `requireUser()` / `requireAdmin()` in `lib/auth/current-user.ts`, carrying `server-only`. There is no client route guard anywhere |

`SameSite=Lax` rather than `Strict` is a deliberate phone decision recorded in
`lib/auth/cookie.ts`: `Strict` drops the cookie on the first navigation in from a
text message, which is exactly how this league will open the site.

---

## 2 · What was rehearsed

**Before** is the behaviour on `main`; **after** is this branch. Every row below
was driven against the production build in a browser — §12 lists separately the
two things that were *not*, so nothing here is read wider than it was measured.

### Session

| Scenario | Before | After |
|---|---|---|
| Valid session | signed in | unchanged |
| Expired before page load | `307 → /door` | unchanged |
| **Expired or revoked between page load and a mutation** | redirected cleanly to `/door` | **unchanged, and now pinned by a test** |
| Malformed / forged cookie | rejected without a database query (HMAC first) | unchanged |
| Sign-out | cookie deleted; protected routes `307 → /door` | unchanged |
| Sign-out in one tab, another tab open | the old tab lands on `/door` on its next navigation | unchanged |

The mid-mutation redirect is the one that mattered most and it was **already
right**. `requireUser()` throws Next's redirect, the router catches it, and the
manager lands on the door. `lib/reliability/attempt.ts` re-throws that control
flow explicitly so this branch cannot have broken it, and
`attempt.test.ts` fails if it ever does.

### Browser

| Scenario | Result |
|---|---|
| Refresh | safe everywhere; every mutation surface re-reads server state rather than modelling it |
| Back after a successful mutation | shows the previous entry; returning forward reads committed state |
| Forward after Back | correct |
| Duplicate submit / double tap | blocked by `pending` guards on every surface, and by database constraints underneath |
| **Submit, lose the response, retry** | safe on every mutation — see §5 |
| Two tabs mutating the same cosmetic state | last write wins, intentionally — see §7 |
| Navigating away while a request is pending | no orphaned effect; the server transaction either committed or did not |

### Network

| Scenario | Before | After |
|---|---|---|
| **Request never reaches the server** | **whole application replaced by a raw framework error** | in-world line, screen intact, work intact |
| **Transient 500** | **same raw framework error** | same recovery |
| Server commits, response lost | as above, and the manager could not tell | as above; a retry is safe by §5 |
| Database down during a page render | **near-empty 500 document** | the product's own recovery screen, still `500` |

---

## 3 · The defect

**Every client mutation surface took the whole application down when its request
failed to land, and there was no error boundary anywhere in the project to catch
it.**

Eight components, nine call sites, all written the same way:

```ts
startTransition(async () => {
  const result = await setThemeAction(theme);   // rejects in a tunnel
  if (!result.ok) { setRefused(true); return; }
  router.refresh();
});
```

Nothing catches the rejection. React re-throws it during render. `app/` contained
no `error.tsx`, no `global-error.tsx` and no `not-found.tsx`, so the tree
unmounted and Safari showed:

> Application error: a client-side exception has occurred while loading … (see
> the browser console for more information)

Measured, at 390px, on a production build:

| what a manager did | what they got |
|---|---|
| tapped a room theme with the network cut | the string above |
| tapped a room theme, server returned 500 | the string above |
| **saved a character with the network cut** | the string above, **and every choice destroyed** |

The last row is the expensive one. `components/character/customiser.tsx` holds
the manager's work in `useState`; unmounting throws it away. A minute spent
choosing a face was lost to one dropped packet, with no way back except retyping
the URL — *"see the browser console"* being an instruction to nobody on an
iPhone.

**Not exotic.** A lift, a tunnel, a carriage between two masts, a Safari tab
restored after the server redeployed. This is the ordinary condition of the
primary client.

### Why nothing caught it

- `npm run test` — no test calls a server action through a browser transport.
- `npm run visual:qa` — photographs pages; a screenshot of a form is not a test
  of the form, which is the same blind spot that let `@E352` break every
  character save in production for weeks.
- `next build` — nothing here is a type error.

---

## 4 · The repair

Three pieces, deliberately not one mechanism.

### `lib/reliability/attempt.ts` — keeps the manager's work

Converts *"we never got an answer"* into a value, so the component stays mounted
and can say so. Every call site now reads:

```ts
const outcome = await attempt(() => setThemeAction(theme));
if (!outcome.ok) { setRefused(UNREACHABLE_LINE); return; }
if (!outcome.value.ok) { setRefused('Tony can’t fit it out like that.'); return; }
```

A refusal and an unreachable server are **different sentences and the same
gesture**, so each surface keeps its own voice and shares one line for the second
case: *"That didn't reach Tony. Try it again."*

**It does not retry, queue, cache or persist anything.** Every mutation in this
product is already idempotent or guarded in the database (§5), so the correct
retry is the manager tapping again; a retry this module performed would be a
second mechanism competing with guarantees that are already exactly right, and a
place for a duplicate to hide.

**It re-throws Next's control flow** — `NEXT_REDIRECT`, `NEXT_NOT_FOUND`,
`NEXT_HTTP_ERROR_FALLBACK`. `requireUser()` redirects an expired session by
throwing, and that throw *is* the recovery path; swallowing it would replace a
clean sign-in prompt with an error line on a screen that could never work again.
Rehearsal shows Next resolves a redirect through the router rather than by
rejecting this promise, so the guard is belt and braces — kept because the cost
is one comparison and the failure it prevents is silent and permanent.

### `app/error.tsx` and `app/global-error.tsx` — the floor underneath

`attempt` keeps a manager's work by never leaving the screen. The boundaries
catch **everything nobody predicted, including the next defect**. Two ways out:
`reset()` re-renders the segment without a reload, and a plain link to the parlor
— plain because if the client router is what failed, a navigation through it
fails too.

No error text, no digest, no stack: a digest is a server-log correlation id and
printing it puts a hex string in front of somebody who cannot use it. No
automatic retry: a boundary that re-ran itself would loop invisibly and heat the
phone.

`global-error.tsx` supplies its own `<html>`, `<body>` and stylesheet import,
because Next replaces the whole document when the root layout is what threw.

**Its first draft hand-sized every value inline** — no Tailwind, no `TYPE` — on the
reasoning that a boundary should not depend on the thing that failed.
`lib/design/typography.test.ts` refused it, and the gate was right: what fails
there is the layout *component*, not the stylesheet, which Next links into the
document for the route independently. So the reasoning bought nothing and would
have cost a second entry on an exemption list `TEXT_SURFACE_BOUNDARY §8` keeps at
one on purpose. It uses the type case like every other surface. If the stylesheet
genuinely were absent it degrades to browser defaults — a paragraph and two
controls, unstyled but legible and operable, which is the whole job.

### One defect was introduced by the repair, and found by reading the diff

The tray gained a fourth phase, because opening a box has **three**
distinguishable failures rather than two: a reveal, *"the box is gone"* (`lost`),
and *"the server never answered"*. Collapsing the third into `lost` would have
been worse than the crash it replaces — *"Tony looks at the tray. There's nothing
on it"* is a false statement about a manager's property.

The new plate says the box is still on the tray and to tap it again. **The box
overlay's render condition did not include the new phase**, so the one screen
that makes a claim about the box was the one screen the box was missing from. The
plate and the sprite are separate branches of the same component and nothing
asserts the words match the picture; no screenshot of a working tray would have
caught it. Fixed in `db7fbd7`, and it is one of the five properties
`counter-tray-recovery.test.tsx` now holds.

### `app/not-found.tsx` — the dead end is still in the shop

Next's built-in fallback is `404: This page could not be found.` in black on
`#fff` **with no link on it**. In a product that is one dark pixel-art room, a
manager who tapped a room they may not visit, or opened a bookmark from a Safari
tab restored three weeks later, got a white screen from a different application
and no way back.

**The 404 stays a 404.** `requireAdmin()` answers `notFound()` so a player
probing `/admin` learns nothing about whether it exists, and `/rooms/[userId]`
does the same so probing addresses teaches nothing about who plays. Rendering a
boundary changes what is drawn, never the status — verified at `404`, and
`checkNotFound` in the visual gate asserts the status rather than assuming it,
because a boundary that accidentally rendered at 200 would look identical in
every photograph and would have quietly converted a security decision into a
cosmetic one.

It says the same thing to everyone. A helpful *"you are not the commissioner"*
would give away exactly what the 404 was chosen to withhold.

---

## 5 · Retry and idempotency — the audit

Every mature mutation, classified. **No duplication defect was found**, and the
financial guarantees were not touched.

| Mutation | Class | Why |
|---|---|---|
| `buyBoxAction` | **GUARDED** | client-minted token per attempt → `purchase:<userId>:<token>` idempotency key in `apply_token_delta`. The token is **kept** on failure, so a retry replays the same key and spends once; a new one is minted only on confirmed success, so a deliberate second purchase is still a second purchase |
| `openBoxAction` | **GUARDED** | `box_openings.box_id UNIQUE`. A retry returns the same collectible with `replayed: true` |
| `pickSideAction` | **GUARDED** | `UNIQUE(stake_id, user_id)`. A retry after a lost response answers `already` rather than staking twice. This is why the surface never needed a token, and that reasoning is unchanged |
| `placeInSlotAction` | **RETRY-SAFE** | idempotent; one transaction; a trigger enforces ownership |
| `clearSlotAction` | **RETRY-SAFE** | idempotent, succeeds on an already-empty slot |
| `setThemeAction` | **RETRY-SAFE** | last-write-wins on a cosmetic setting |
| `setShowcaseAction` | **RETRY-SAFE** | full replace; a trigger enforces ownership |
| `saveCharacterAction` | **RETRY-SAFE** | full replace of the configuration |
| `anotherLineAction` | **RETRY-SAFE** | writes nothing; deliberately does not spend the day's greeting |
| `signOutAction` / `signOutEverywhereAction` | **RETRY-SAFE** | guarded by `revoked_at IS NULL` |
| `resetPinAction` | **RETRY-SAFE** | one transaction: clear hash, revoke sessions, write the audit row |

**`signInAction` is the one exception, and it is reported rather than fixed** —
see §10.

---

## 6 · What was preserved deliberately

These were examined and **left exactly as they are**. Each is a decision, not an
oversight.

- **`notFound()` for unauthorized admin routes.** A security ruling. Only the
  drawing changed; the status did not.
- **`notFound()` for un-visitable rooms**, for the same reason.
- **`redirect('/door')` for an expired session**, including mid-action.
- **No client-side affordability check** before buying a box. `CHECK
  (token_balance >= 0)` is the authority; a client check would be a race and a
  second copy of a rule.
- **No optimistic UI** in rooms or the showcase. The server owns what is in a
  slot; `router.refresh()` is the confirmation.
- **The middleware rewrites the cookie without validating it.** Rehearsed
  specifically because it looked like it might resurrect a deleted cookie on
  sign-out — **it does not**: after sign-out the cookie is gone and protected
  routes redirect. Re-sending a value the browser already holds grants nothing,
  and validating would cost a database round trip on every request including
  static assets.
- **Tony's toy says nothing when it fails.** Poking him is not a request a
  manager needs told about, and an apology in the middle of the parlor would be
  the room reporting on its own plumbing.
- **No resume-after-login.** A manager whose session expires deep in `/rooms`
  signs in and lands at `/`. For a ten-person app whose home screen is one tap
  from everything, a `?next=` parameter is an OAuth-shaped answer to a
  two-tap problem.

---

## 7 · Multi-device

- **Two devices signed in** — both work; each is a row on the key ring with a
  coarse label.
- **One session revoked from the other** — the revoked device redirects to
  `/door` on its **next navigation or mutation**, which is prompt enough: there
  is no polling and none is wanted.
- **"Change the locks everywhere"** revokes every session including the current
  one, and renders only when more than one device is listed.
- **PIN change** does not exist; a commissioner reset clears the hash and revokes
  every session in one transaction, and the manager re-claims from the door.
- **Both devices mutating the same cosmetic state** — **last write wins, and that
  is intentional.** Room theme, slot contents and showcase choice are personal
  and cosmetic; the loser of a race is the tab that is out of date, and refreshing
  fixes it. **No conflict-resolution system was invented**, because no
  destructive race exists: nothing here merges, and nothing is lost that was not
  replaced by its owner.
- **A stale tab holding old state** — the mutation still succeeds, because every
  one of them is a full replace or is guarded by a constraint rather than by a
  read-modify-write. There is no lost-update hazard to fix.

---

## 8 · Error and recovery UX

| Looked for | Found |
|---|---|
| raw framework errors | **yes — the defect in §3.** Fixed |
| blank screens | **yes — the same defect.** Fixed |
| generic "something went wrong" where an action is possible | the framework's fallback offered none; the replacement offers two |
| errors below the phone viewport | **none.** Every refusal renders next to its control; the customiser's sits in the *pinned* header, so it is on screen at any scroll position |
| errors disappearing too quickly | none — nothing auto-dismisses |
| 404 hiding recoverable state | **no.** Both `notFound()` callers are security-intentional and were preserved |
| actions failing silently | **yes, before this branch** — a failed tap produced no acknowledgement at all. Every surface now has `role="status"` with `aria-live` |
| the sign-in form losing a dropped response | the manager gets **Safari's own** offline page with a Reload button, and retypes six digits. A document-level POST that never returns is not something the application is present for, so this is inherent rather than a defect — recorded so it is not mistaken for one |
| stale button state after failure | none — `useTransition` settles normally now that the scope no longer throws |

---

## 9 · Security sanity check

Not a penetration test. The obvious invariants, checked while reading the auth
code, with **one** evidence-backed finding.

| Invariant | Result |
|---|---|
| Cookie attributes appropriate for production | `HttpOnly` · `SameSite=Lax` · `Secure` when `NODE_ENV=production` · host-only · 90-day `Max-Age`. **Pass** |
| Authorization from the server session, never a form field | **Pass.** The room actions take no `userId` at all — `requireUser()` supplies it. `resetPinAction` derives the actor from the session and refuses the actor as its own subject |
| A manager cannot mutate another manager's private state | **Pass**, three deep: no parameter to name someone else, a service check, and a **trigger** — `room_placements_must_be_owned` and the Showcase's equivalent — because a foreign key can say *"that collectible exists"* and cannot say *"it is theirs"* |
| Admin identity server-derived | **Pass.** `users.is_admin` from the deploy seed; there is no client-supplied admin claim anywhere, and unset `COMMISSIONER_SLEEPER_USER_ID` means nobody |
| Revocation actually revokes | **Pass**, rehearsed: a session revoked from another device redirects on its next navigation or mutation |
| Sensitive actions authorize before acting | **One finding — fixed.** See below |
| No private data in public or static artifacts | **Pass.** One route prerenders (`/dev/assets`); it contains no manager name, balance or PIN material, and the build emits no other static HTML carrying league data |

### The finding · an unguarded export from a `'use server'` file

`app/actions/slice.ts` opened every action with `requireAdmin()` **except
`currentSeasonYear`**, which opened with a query. Next publishes each export of a
`'use server'` module as a callable endpoint, so an unguarded one is reachable by
anyone holding the URL, signed in or not — and `16 §11` has exactly one
unauthenticated surface, the door.

**What it exposed is small**: the newest open season's year, which is on Sleeper
and on the wall of the shop. Nothing was mutated and nothing private returned.

**It also has no callers.** `app/page.tsx`, `lib/parlor/receipt.ts` and
`lib/counter/showcase.ts` all import the identically-named function from
`lib/league/membership.ts`; nothing imports this one. That is the same shape as
the `@E352` defect — an unused export from a `'use server'` file — which is why
it is worth naming rather than shrugging at.

**Guarded rather than deleted.** One line. *"That particular read was harmless"*
is a property of today's body, and the missing line is what the next body would
inherit; removing an export is the Slice owner's call, and this workstream owns
authorization rather than the Slice's surface area.

## 10 · Remaining risks, reported not fixed

### R1 · A lost sign-in response leaves a phantom device

`signInAction` inserts a new `sessions` row per successful sign-in. If the
response is lost the cookie never arrives, the manager taps again, and a second
row is created — so the key ring can list a device nobody holds, for 90 days.

**Measured** against the production build by letting the server commit and
dropping the response: two sessions became three, and `/profile` listed three
rows all reading `iPhone · Safari`. The numbers are in `OPEN_ITEMS` **E8**.

**Not fixed** because it is the one place where the smallest durable mechanism is
not small: deduplicating needs either a schema change or a client-minted token
threaded through the door, and this workstream's authority stops at
"no schema migration unless absolutely unavoidable". The consequence is cosmetic
and already recoverable — *"Change the locks everywhere"* clears it — and the
phantom row grants no access, because its cookie value was never delivered to any
browser.

### R2 · The error boundary is not in the automated sweep

`not-found` is a visual state and runs at all three widths. The **error** screen
is not: photographing it needs a route that throws, and adding deliberately
failing code to the product is a larger intervention than this defect warrants.
It is evidenced instead by a real database outage against the production build,
captured at 390 / 375 / 360 in `docs/evidence/mobile-reliability/`, and by
`checkNotFound`'s sibling assertions on the shared primitives.

### R4 · A rehearsal test times out under load, and it is not this branch's

`lib/rehearsal/week-16.test.ts`'s *"changes nothing when the Tuesday job runs
twice on the semifinal"* failed once on a 5-second timeout while this
workstream's dev server and visual-QA server were both running. In isolation it
takes **2.35s**, and the whole file passes in 13.9s — so the test is correct and
its headroom is about 2×, which a busy machine can eat.

**Nothing was changed.** It is not in this workstream's area, it is not a product
defect, and raising a timeout to make a branch green is the move this
repository's own gate culture argues against. Recorded because it will be seen
again by whoever next runs the suite beside a server, and because *"the playoff
rehearsal is flaky"* is a much worse thing to discover without this note.

The clean run — every server stopped — is **121 files, 2028 tests, exit 0**.

### R3 · The `#418` on the door is the known one — **not a new finding**

A minified React `#418` was observed once on `/door` during rehearsal. Checked
against the ledger rather than filed: it is **visual debt 16**, quarantined on
commissioner approval 2026-08-06 with a ceiling of 2, and `docs/OPEN_ITEMS.md`
**F1** already records it — including a sighting at `/door@360`.

Nothing was done to it, and that is deliberate. F1's restart condition is the
**element name**, which only a dev build produces; this rehearsal ran a
production build, so it adds no evidence. **The ceiling was not touched.**
Recorded here only so a future reader does not mistake the sighting for
something this workstream introduced.

---

## 11 · Deferred — active-work conflicts

**None.** `docs/ACTIVE_WORK.md` was empty when this branch opened and the claim
was the first commit on it. Nothing was skipped for ownership reasons.

Two areas were touched that carry standing rulings, and neither ruling moved:

- **`components/character/customiser.tsx`** — character customisation is
  `CLOSED`. No trait, canvas, layer, catalog entry, default or regression guard
  was touched; the change is that a failed save no longer unmounts the screen.
  **11,520 combinations before and after.**
- **`components/counter/pick-side.tsx`** — stakes are a hard boundary. Nothing
  about the line, the stake, the payout, settlement or eligibility was touched;
  the change is the same one-line error path. The surface is flag-gated shut in
  v1 in any case.

No art, no economy value, no cron, no schema, no migration, no fantasy fact, no
publication policy, and no `docs/ACTIVATION.md` item moved.

---

## 12 · The gates

- `lib/reliability/attempt.test.ts` — 8 tests: a dropped request and a 500 both
  become answers; a redirect and both not-found digests are **re-thrown**; a
  production error digest is *not* mistaken for control flow.
- `lib/reliability/call-sites.test.ts` — an AST guard: a `'use client'` module may
  not `await` a call to an identifier ending in `Action` unless it is inside
  `attempt`. It sees through parentheses and conditionals — the room's slot used
  a conditional — carries a control assertion so it cannot pass vacuously, and
  **goes red on all four pre-fix files**.
- `components/scene/counter-tray-recovery.test.tsx` — five source assertions on
  the one surface with **three** distinguishable failures rather than two. All
  five go red on the pre-workstream file.
- `checkNotFound` in `scripts/visual-qa.mts` — the product's screen, a way back
  at ≥44px, and **still a 404**. Verified to go red at all three widths when the
  state is pointed at a page that is not a 404, so it cannot pass vacuously.
- `not-found` is a new state in `ALL_STATES`, photographed at 390 / 375 / 360.

### What was driven, and what was not

Stated separately because they are different strengths of evidence.

**Driven end to end in a browser**, against the production build, before and
after: the room's theme picker (network cut, and server 500), the character
customiser's Save (network cut, at all three widths), sign-out, cross-tab
sign-out, session revoked mid-mutation, Back and Forward after a committed
mutation, two tabs mutating the same state, a signed-in non-admin probing
`/admin`, and a full database outage during a page render.

**Not driven**: the tray's own `unreachable` phase. The hit region sits under the
parlor's overlay stack and this workstream's ad-hoc harness could not reach it —
the visual driver can, which is why `tray-owned-box` and `tray-reveal` remain the
coverage for the real path. The recovery phase is pinned by the source
assertions above instead. Recorded rather than glossed: it is the one repair here
whose behaviour was reasoned about rather than watched.

The other five surfaces — the showcase picker, the room's slots, the buy button,
the stake's pick-side and Tony's toy — were **not individually driven**. They are
the identical three-line change against the identical mechanism, the call-site
guard proves each one goes through `attempt`, and each keeps its own already-
tested refusal path. Named here so *"every surface was rehearsed"* is not read
into the tables above.

---

## 13 · The verdict

> **Can a normal manager lose work, duplicate an action, or get stranded by
> ordinary iPhone/Safari/session failures?**

Before this branch: **they could lose work and they could be stranded** — both
from one root cause, reachable by a dropped request on any mutation, and both
measured rather than reasoned about. They could **not** duplicate an action; the
database guarantees were already correct everywhere and none was weakened here.

After it: no, on all three counts, for every path rehearsed in §2.
