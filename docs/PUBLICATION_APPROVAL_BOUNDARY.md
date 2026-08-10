# The commissioner publication path — the boundary

**Status:** built, 2026-08-10. This file is the durable record of **which
surfaces in this product require Alex's approval before the league sees them**,
which deliberately do not, and how the one path that does is enforced.

**Authority:** `PROJECT_SPEC/16_FINAL_RECONCILED_PLAN.md §9` (commissioner
approval mandatory in season one, the manual hold permanent), `§4.3` (the Tuesday
chain ending `draft Slice → notify commissioner`), `docs/PRODUCT_DELIVERY_MANDATE.md §9`
(Stats is the sole authority on what a result meant), and `09 §9`
(a hidden or disabled control is not authorization). Read with
`docs/SLICE_REVIEW_BOUNDARY.md`, which is still the canonical account of the
Slice's own chain — this document sits **above** it and does not replace it.

---

## 1. The rule this implements, and the rule it refuses to over-apply

> Anything that represents Tony **publishing authored editorial content** to the
> league passes through a commissioner review state first.

The second half matters as much as the first, and getting it wrong in the
generous direction would have been the more expensive mistake:

> **Deterministic application state does not.** Sleeper-derived facts — final
> scores, records, standings, week finalization — and everything computed from
> them — token settlements, weekly rewards, earned rings — continue to operate
> automatically under their canonical authority.

A commissioner stamp on a matchup result is a **person approving a fact**. It
would make the ledger wait on an editor, it would make *"why haven't I been
paid"* an answer about somebody's inbox, and it would put `MANDATE §9`'s Stats
authority in a reviewer's hands. The queue exists to stop unapproved *prose*
reaching the league, not to insert a human into arithmetic.

---

## 2. The matrix

Every surface in the repository that can put something in front of a league
member. Found by enumerating all twenty page routes, all fifteen server actions,
both cron routes, and every write path in `lib/`.

### A · Requires commissioner approval

| Surface | Where | Why | State today |
|---|---|---|---|
| **Tony's Tuesday Slice** | `lib/slice/publication.ts` · `/slice` | Authored editorial prose the league reads as true. `16 §9` names it explicitly. | **Gated.** Full chain: draft → review → approve → publish. Nothing else can reach the rack. |

**One row, and that is the finding.** The Slice is the only thing in this
product that publishes authored editorial content. Every other candidate is in
one of the three categories below, and each classification is a decision with a
reason rather than an omission.

### B · Automatically derived — no approval, deliberately

| Surface | Where | Why no approval |
|---|---|---|
| Final scores, records, standings | `lib/sleeper/*` · `fantasy_matchups` | Sleeper is the source of truth (`16 §4`). Approving a score is approving a fact. |
| Week finalization | `week_finalizations` · the Tuesday cron | Append-only, derived from stored results. A week is final because the games ended. |
| Token settlements, weekly rewards | `apply_token_delta` · `lib/rewards/*` | `03 §4` fixes the amounts; the ledger is the authority. A reward waiting on an editor would be invisible — the desk would just look quiet. |
| Earned championship rings | `lib/counter/rings.ts` | Derived from `final_rank`. You won it or you did not. |
| Loot-box openings and salvage | `lib/counter/*` | A recorded roll against a versioned table. Recomputable by the manager. |
| **Weekly stakes** — Tony's Line, bounties, the chalkboard | `lib/stakes/*` | Deterministic authoring from stored facts, every sentence a curated template from `lib/stakes/copy.ts`, every one validated by **the Slice's own validator**. Nothing is drawn, sampled or generated. `16 §9` and `18 §3.4` specify the design with no approval step, and inserting one would delay a wager for no gain in truthfulness. See §6. |
| Tonight at Tony's board | `lib/parlor/*` | A *view*, computed from verified domain tables on every load (`16 §4.1`). Stores nothing. |
| The Timeline | `lib/league/timeline.ts` | Same — a rendering of finalized seasons. |
| The Counter Greeting and Tony's toy lines | `lib/content/greeting.ts` · `app/actions/tony.ts` | **Selection** from already-approved curated content. Reads; writes only a usage log. The approval happened when the line entered the repository (see C). |
| The Showcase | `app/actions/counter.ts` | **Manager-authored**, and a manager putting their own item in their own window is not Tony printing something. Constrained to what they own, by a trigger. |
| Manager rooms | `app/actions/rooms.ts` | Same. Placement is constrained to owned items by a trigger. |
| Character appearance | `app/actions/character.ts` | Same. Self-expression from a closed trait set. |

### C · Private or repository-reviewed — never runtime-published

| Surface | Where | Why |
|---|---|---|
| PIN reset | `/admin`, `resetPinAction` | An operational power over one account. Recorded in `admin_audit_logs`; nothing reaches the league. |
| The manual publication hold | `/admin/slice` | A control **over** publication, not a publication. Append-only both ways. |
| Draft-a-week-by-hand | `/admin/slice` | Produces a draft, which then enters review like any other. It cannot publish. |
| **The content engine** — Tony lines, manager lines, NPC events, shop dressings | `content/*.md` → `content_entries` via `scripts/seed.ts` | Authored editorial content, and it **is** reviewed — in the repository, by pull request, before a deploy step seeds it. There is **no runtime authoring surface anywhere in the product**, which is what makes the repository the review. |
| `/dev/assets` | The asset contact sheet | A developer surface with no in-world entrance. Already exempt from the product gates. |

> **The one trigger to reopen this file.** If a runtime editor for
> `content_entries` is ever built, it creates a publication path and needs a kind
> in `lib/publication/kinds.ts`. Recorded here so that work cannot be done
> without meeting this sentence.

### D · Future or deferred — nothing to gate

| Surface | Status |
|---|---|
| **Commissioner announcements** | Specified (`08 §18`, `18 §6` priority 6) and **not implemented**. No table, no route, no writer. See §5 for the decision waiting. |
| Season Story | Deferred (`16`). Not implemented. |
| Basement spotlight | Not implemented; `04 §10`'s category axis does not exist in the shipped catalog. |
| Future Slice special editions | The concurrent preseason Draft Review edition is the first. It enters review through the Slice kind unchanged — see §8. |
| Seasonal events, casino, vending machine, silent auction | Deferred (`16`). |
| **AI-generated content** | There is **none in the repository**. `ANTHROPIC_API_KEY` is unset by commissioner decision (2026-07-30), generative text is limited to the Slice by `16 §10`, and `16 §9` already requires the Slice to publish correctly with the key unset. If an AI draft is ever produced it is a `slice_issue_version` like any other, and it reaches the league by the same single path: a person stamps it. **AI cannot publish, because publication is a status transition a trigger guards, not a thing a generator can do.** |

---

## 3. What was built

**No migration.** Not one schema change. Everything below is a projection over
tables that already existed, which is why there is no new activation step and
nothing in `docs/ACTIVATION.md` moves.

### 3.1 One place to look

`/admin` — the office — now answers *"is there anything for me"* above the fold,
and the press desk stays its own screen for everything that is **not** a decision
waiting to be made: drafting by hand, the manual hold, the full rack, the refused
drafts.

The note in `app/admin/page.tsx` used to say folding the press desk in would make
the office a dashboard. That was right about the press desk and wrong about the
queue, and the distinction is the whole design:

- A **dashboard** shows the state of everything, so nothing on it is a task.
- The **queue** shows what is waiting on a decision by the commissioner and
  nothing else. Most weeks it is empty.

A gate whose door is behind another door gets routed around. That is why it
moved.

### 3.2 A registry, not a framework

`lib/publication/` is four small files:

| File | What it is |
|---|---|
| `item.ts` | The shape of one thing waiting, and the order they are read in. No lifecycle of its own — the five readiness bands are a **projection** of the Slice's existing statuses. |
| `kinds.ts` | The closed registry. **One entry.** A kind supplies a label, `list()` and `decide()`. |
| `queue.ts` | Merges kinds, sorts, and exposes the one composite operation. Computes nothing about an item. |
| `preview.ts` | The review-only `?queue=<band>` narrowing. Filters; never fabricates. |

Adding a kind is writing one object literal. The registry earns its place at a
population of one for exactly one reason: **the queue has to be able to say
"nothing is waiting" and be believed**, and that stays true only if adding an
editorial surface means adding it *here* rather than remembering to.

`kinds.test.ts` asserts the registry is closed and every key has a definition, so
a new editorial surface that forgets this file is a compile error rather than an
invisible hole in `16 §9`.

**What was deliberately not generalized:** no generic status column, no generic
decision table, no plugin loader, no per-kind migration. The day a second kind
cannot be expressed as an object literal is the day to widen the shape — with the
second kind in front of us, rather than guessed at now.

### 3.3 Approve is publish — and the backend still separates them

**The product is one gesture.** `16 §9` requires a person to approve; nothing in
it requires a second tap between approving and printing, and this is a ten-person
private league where every extra tap is a tap on which the paper is approved and
not on the rack. The stamp reads **Approve & print**.

**The backend keeps the two apart**, because one of them has a permanent switch
across it: the manual hold stops *publication* and not *approval*. A collapsed
operation would have to either refuse the whole gesture while the press is
stopped — losing a decision the commissioner is entitled to make — or pretend the
hold is not there.

So the composite is **resumable rather than atomic**:

```
needs_review ──[Approve & print]──► published
                     │
                     └── press stopped → approved, and the queue says so
                                          → tapping again finishes it
```

An atomic version would roll the approval back on a held press and lose the fact
that a person read the paper. Both halves are already individually idempotent and
individually audited, so resumability costs nothing and keeps more.

`Approve only` survives beside it, unpromoted, for the commissioner who wants a
note on the record or wants to stamp now and print later.

---

## 4. The five guarantees, and where each one lives

| | Guarantee | Where it is enforced |
|---|---|---|
| 1 | **Only the commissioner may decide** | `requireAdmin()` in the server action, first line, before anything the request sent is read. The actor passed to the service is the id *that check produced* — never a form field. `requireAdmin()` answers `notFound()`, so a manager posting learns nothing about whether the action exists. |
| 2 | **Readiness is re-derived at decision time** | `kinds.ts` re-reads the version from the database and refuses a copy the deterministic check refused. The database refuses it too (`slice_versions_unpublishable_stays_out`) — the service's sentence is what a person can read, the constraint is the guarantee. A disabled button is worth nothing. |
| 3 | **The copy read is the copy printed** | The digest travels with the decision and the server refuses a mismatch. For the Slice this is belt as well as braces — a version's content is **immutable at the database** — and it is here because it is the *contract*, and because "immutable" is a property somebody has to keep true rather than take on trust. |
| 4 | **Deciding twice does nothing twice** | Already-published is read back rather than re-published, and beneath it `UNIQUE(version_id, action)` makes a duplicate audit row unwritable. Ten simultaneous taps produce one publication row — asserted. |
| 5 | **Every decision names a person, permanently** | `slice_reviews`, append-only, with a CHECK refusing an unattributed approval. The publish trigger reads *that row*, not the status column, so a service that skipped it could not publish. |

**No second audit table was built.** `slice_reviews` already carried publication
type (implied by the table), item id, actor, timestamp, action and — through the
version — the content digest. `admin_audit_logs` keeps the operational actions it
already had. Building a third record of the same events would have created the
question *"which one is right"*.

### 4.1 Fail-closed is a property of the identity model

There is **no `is_admin` system of this feature's own**, and the historical ZIP's
admin document is not the current model. Commissioner authority is `users.is_admin`,
and the only thing that ever sets it is the deploy seed reading
`COMMISSIONER_SLEEPER_USER_ID`. Unset, the seed grants it to nobody and every seat
answers `notFound()` — the safe outcome is the **default** rather than a case
somebody remembered to write.

> **That variable is still unset in production.** It is item 2 of
> `docs/ACTIVATION.md §5` and **nothing here changes that**. This work does not
> claim it, and the queue is inert in production until Alex sets it.

---

## 5. What is not built, and why each absence is a decision

**No prose editing, no candidate override.** Both were already refused with
reasons in `docs/SLICE_REVIEW_BOUNDARY.md §7`, and generalizing the queue does
not reopen them. A free-text edit would let a sentence no validator passed reach
the surface the league reads as true; a candidate override would move `MANDATE §9`'s
Stats authority into the reviewer's hands.

**No post-publication editing.** `08 §23` treats a published issue as an immutable
snapshot and a correction as a **new version with a visible note**. That is what
the chain does, and this work did not widen it. Manual recovery for a bad issue
is: draft the week again, stamp the new version, and the old one is marked
`superseded` and kept — because the league read it.

**No publication cron.** `16 §4.3` allows exactly two scheduled jobs and both are
built. The Tuesday job's last step is `submit: true`; it lands on the desk and
stops. There is no parameter on the route that can change that. **Cron prepares
drafts. Cron cannot approve, and cron cannot act as Alex** — an approval row with
no actor is refused by the database.

**No push notifications, no external service.** The only indication anything is
waiting is a count on the office door on `/profile`, rendered **only for the
commissioner** so it cannot become a side channel telling the league an issue is
pending before it prints. Not on the homepage: `18 §3` fixes it at eight objects
and gives the glow to Doors only, so a badge there would be a ninth thing on a
screen the navigation map closed.

**No commissioner-announcement kind.** The feature does not exist — no table, no
route, no writer — and a kind for a surface with no rows is a queue section that
can only ever be empty. `08 §18` and `18 §6` specify it. **When it is built, the
right shape is almost certainly one explicit *Publish announcement* button and no
second approval step**, because Alex writing the words and Alex approving the
words are the same act on the same screen and a two-step there is bureaucracy
rather than intentionality. That is a recommendation, not a ruling — the decision
belongs with the feature.

---

## 6. The one classification worth arguing with

**Weekly stakes author sentences that appear on a sign beside Tony, and they are
not gated.** That is the closest call in the matrix, so the reasoning is on the
record rather than implied:

- Every sentence is a **curated template** from `lib/stakes/copy.ts`, which
  contains no digits at all — a test fails the build for one — and every number
  arrives by substitution from a stored fact.
- The prose goes through **the Slice's own validator**, so the banned-term scan
  already refuses odds and win-probability language.
- Authoring is **deterministic**: the same basis authors the same stakes on every
  machine, and `stake_key` is unique, so re-running writes nothing.
- `16 §9` and `18 §3.4` specify the whole design and neither names an approval
  step, and stakes are **money-bearing** — a wager that cannot be offered until
  somebody reads their email is a wager nobody takes.
- Tony's Line, the only one that needed a season median, is **flag-shut in v1**.

If Alex wants stakes gated, the mechanism is already there: it is one kind in
`kinds.ts`. This records that it was considered and decided, not overlooked.

---

## 7. What is photographed

Four new visual states at all three phone widths, and the reason there are four
is that the press desk's six are about **one draft and the decision on it** while
these are about the screen that answers *"is there anything for me at all"*:

| State | Shows |
|---|---|
| `office` | Nothing waiting — **what a commissioner meets today**, because the 2026 season has no games |
| `office-ready` | One paper ready to stamp, with *facts verified* on the row |
| `office-blocked` | A draft the check refused, saying why on the row |
| `office-printed` | The recently-printed archive on its own |
| `office-queue` | The whole desk — ready, stamped, refused and printed, in priority order |

Three narrow the queue with `?queue=<band>`, a **server-resolved preview behind
both demo guards that filters the real queue and fabricates nothing**. The reason
is the one `review-empty` already recorded: an issue belongs to the **league**,
not to a seat, and the driver loops widths on the outside — so an unnarrowed "one
paper is waiting" would photograph one item at 390 and four at 360, three files
under one name, all green.

`checkOfficeQueue` asserts **exact** composition, which is the opposite of
`DESK_EXPECTATIONS`' `atLeast` and is what the narrowing buys. It also fails when
the queue does not render at all — `requireAdmin()` answers `notFound()`, and a
404 photographs cleanly and files under the state's name. That is the false green
the nine `reveal-*` states cost a milestone to.

---

## 8. How the concurrent preseason Slice edition lands

A second session is building the preseason **Draft Review** edition. Nothing in
this work needs to change for it, and that is the point of putting the contract
where it is:

- A special edition is still a **`slice_issue_version`**. It gets drafted,
  validated, submitted, stamped and printed by the same chain.
- The queue reads `reviewQueue`, `approvedQueue` and `publishedIssues` — so a new
  issue *mode* appears in it the moment it produces a version, with no change
  here.
- `decide()` re-reads readiness from the database at decision time, so whatever
  readiness rules the preseason edition adds (Tony's grades complete, takes
  written) are enforced through **its** `publishable` verdict, which is the field
  the composite already refuses on.

The one thing that would need a change is a preseason edition whose readiness is
**not** expressible as `publishable` — for example *"7 of 10 grades written"*,
which is a progress state rather than a verdict. That is a `blockedReason` on the
item and one line in the Slice kind's `list()`. Recorded here so the integration
is a known small edit rather than a discovery.

---

## 9. Where the reasoning lives

| Question | File |
|---|---|
| Why the Slice's chain is shaped as it is | `docs/SLICE_REVIEW_BOUNDARY.md` |
| Why the queue exists and what it does not compute | `lib/publication/queue.ts` |
| What is and is not an editorial publication | `lib/publication/kinds.ts` (and §2 above) |
| Why the queue needs a preview parameter | `lib/publication/preview.ts` |
| Why the office is not a dashboard | `app/admin/page.tsx` |
| Why the row has no Approve button | `components/admin/review-queue.tsx` |
| What still needs a human in production | `docs/ACTIVATION.md` |
