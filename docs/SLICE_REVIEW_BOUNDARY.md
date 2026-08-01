# The Slice review chain — the boundary

**Status:** built, 2026-08-01. This file is the durable record of what the
commissioner review-and-approval workflow is, what it deliberately is not, and
what it unblocks.

**Authority:** `PROJECT_SPEC/16_FINAL_RECONCILED_PLAN.md §9` (approval mandatory
in season one, the manual hold switch permanent) and `§4.3` (the Tuesday chain
ending `draft Slice → notify commissioner`), read with
`PROJECT_SPEC/08_TONYS_TUESDAY_SLICE_GAZETTE_SYSTEM.md §22`, `§23`, `§27` and
`§29`. Where `08` and `16` disagree, `16` wins.

---

## 1. Why this came before the Tuesday job

The Tuesday cron was the first item in the checkpoint's queue and it was **not**
buildable, for a reason that had nothing to do with the operations it calls:

- `16 §4.3`'s chain ends **`draft Slice → notify commissioner`**.
- `16 §9` requires commissioner approval before the first season publishes.
- There was **no review queue, no approval state, and no publication record**
  anywhere in the repository. `lib/slice/edition.ts` said so in its own header:
  the rack worked *"without a review queue"* because *"the approval gate
  belongs"* elsewhere, and elsewhere had not been built.

So scheduling the job would have done one of two things: published an issue
nobody approved, or dropped the draft on the floor. That is a **governance** gap
rather than a functional one — authoring, settlement and week finalization all
existed and were idempotent — and it is the gap this closes.

---

## 2. The chain

```
generateDraft ──► submitForReview ──► approveVersion ──► publishVersion ──► the rack
     │                                     │
     └── the validator refused it          └── rejectVersion (with a reason)
         → visible, and unapprovable           → terminal; revision is a new version
```

`lib/slice/publication.ts` owns all of it. Ten steps, each with a name:

| | Step | Where |
|---|---|---|
| 1 | draft generation | `generateDraft` — the operation the Tuesday job will call |
| 2 | stable draft identity | `slice_issues` unique on `(season_id, week)`, forever |
| 3 | review queue | `reviewQueue` · `/admin/slice` |
| 4 | commissioner-visible preview | `reviewDetail` · the real `<Newspaper>` |
| 5 | approve | `approveVersion` — and only with a **named person** |
| 6 | reject or revise | `rejectVersion` with a required reason; revision is a new version |
| 7 | publication state | one published version per issue; corrections supersede |
| 8 | idempotent retry | by content hash, on publish, and on every decision |
| 9 | audit history | `slice_reviews`, append-only |
| 10 | prevention of unapproved publication | **the transition trigger, not the service** |

---

## 3. Identity, versions, and why the status is on the version

`08 §23` requires an immutable snapshot at publication and says corrections
*"create a new version with a visible correction note"* rather than rewriting
league history. So the thing that moves through the chain is a **version**, and
the **issue** is the stable identity versions belong to — one row per
`(season, week)`, forever.

Putting the status on the issue makes a published issue with a correction draft
ambiguous: published and in review at once. Two states on one row is how a
publication gate gets bypassed by accident.

`rejected` is terminal for a version. Revising means generating a new one, so the
prose that was refused survives beside the prose that replaced it.

**`draft` is not reachable from the product today, and the screen handles it
anyway.** Both callers — the desk's button and the demo appliers — pass
`submit: true`, so a generated version goes straight into the queue. The status
still exists because `generateDraft` allows it and a job may want to draft a week
it is not yet ready to put in front of anybody; a screen that rendered no action
for a status the database permits would be a dead end reachable by one API call.
Recorded here so the branch is not read as dead code.

---

## 4. What is in the database rather than in a service

Every one is asserted by asking the database for the wrong thing
(`lib/slice/publication.test.ts`, 23 tests against a real Postgres).

- **A version's content is immutable.** Only its status and decision fields may
  change. An approval that could be applied to different prose than the one that
  was read is not an approval.
- **Regeneration is idempotent by natural key.** `UNIQUE(issue_id, content_hash)`
  — the deterministic renderer produces identical bytes from an identical packet,
  so re-running the Tuesday job appends nothing. The same natural-key idempotency
  `0004` used for opening a box.
- **A version the validator refused can never be approved or published.**
  `slice_versions_unpublishable_stays_out`, which is `08 §27` at the table.
- **Only the transitions the chain has.** An explicit table of pairs, so *"what
  else can reach published"* is answerable in one place.
- **Publication requires a recorded approval naming a person.** The trigger reads
  `slice_reviews`, not the status column, so a service that skipped the review row
  could not publish. `slice_reviews_decisions_are_attributed` refuses an approval
  with nobody on it.
- **One published version per issue** — a partial unique index — and the issue's
  pointer must agree with it.
- **The manual hold blocks publication outright**, at the database, for every
  caller. `16 §9` makes it permanent, and a permanent switch that lives in a
  service is a switch one code path can forget.
- **Review history and holds are append-only.** An approval cannot be edited or
  removed; the hold records both directions rather than flipping a flag.
- **Each action happens once per version.** `UNIQUE(version_id, action)`.

---

## 5. Three defects the tests found

**Ten simultaneous publishes produced five publication rows.** The service's
already-published check is a *read*, and under READ COMMITTED four transactions
had read `approved` before the first committed; the status update then re-read a
row that was already `published`, found `NEW.status = OLD.status`, and returned
without complaint. The fix is a natural key — `UNIQUE(version_id, action)` — not
a better check.

**The content digest did not survive a round trip.** `content` is stored as
`jsonb`, which is a parsed structure rather than a byte store, so Postgres
re-emits object keys in its own order and `JSON.stringify` of the returned object
hashed to something else. The digest is what an approval *names*; a digest that
only matches before a round trip cannot be verified. `editionHash` is canonical
now — keys sorted, arrays left alone.

**The record printed itself out of order.** `occurred_at` comes from the injected
clock, so two decisions inside one transaction share an instant, and the review
screen printed *"put up for review"* above *"drafted"*. `slice_reviews.seq` is an
identity column and the history orders by it — the same reasoning the hold table
already carried.

---

## 6. Three defects found by looking

Each is recorded because the mechanism that found it was a screenshot at true
size, not a test.

**The hold ate the entire first screen.** A text field and a red STOP THE PRESS
were the first thing on the desk, so *"what is waiting on you"* — the only reason
to open the page — started below the fold, and **three different desk states
photographed byte-identically**. The hold's *state* is now a banner at the top
when it is on; its *switch* is at the foot. An emergency control is not the
primary action.

**`Tony&rsquo;s press`, printed as text.** `&rsquo;` inside a JSX expression is a
string, not markup — on the one screen whose job is to be believed.
`components/slice/review.test.tsx` fails on the old behaviour.

**"put up for review it".** The phrases were verbs with ` it` appended, which
reads correctly for five of six actions. Whole phrases now.

Plus two smaller ones: *"left out, and why"* printed the same sentence twice,
because a suppression's detail names what **beat** the story rather than which
story lost — so the kind leads each line now; and *"AS IT WILL PRINT"* was cream
type straight onto the counter's red-and-white checker at 360, which is
`VISUAL_ACCEPTANCE §7`'s *"labels disappearing into artwork"*. It is a
`SignPlate`, which carries its own ground.

---

## 7. What this deliberately does not do

`08 §22` lists fourteen things a review screen should show. Three of them are
**not built**, and their absence is a decision rather than an omission.

**There is no prose editing.** `16 §9` requires every number and proper noun in a
published issue to match the fact packet, checked deterministically. A free-text
edit box would let a sentence no validator had passed reach the one surface the
league reads as true. The controls are approve, reject and regenerate — a
*stronger* guarantee than the one `08` asked for.

**There is no candidate override.** `MANDATE §9` makes Stats the sole authority
on what a result meant and how much of a deal it was. A control that let the
review screen promote a story the scorer ranked fourth would move that authority
into the reviewer's hands. The screen *shows* the scores and the suppression
reasons — which is what makes the selection arguable — and changing one means
changing the policy, not the issue.

**Regeneration cannot change the facts.** `08 §22` requires regeneration to lock
the fact packet; here it is locked by construction. The renderer is
deterministic, so regenerating an unchanged week produces identical bytes and the
unique content hash turns the second insert into a no-op. Regeneration produces
something new only when the underlying facts moved — which is exactly when a new
version is correct.

Two more, smaller: **eligible lore used** and **recent manager/category
distribution** are partly covered (the packet's suppressions and demotions carry
the diversity story) and partly not modelled at all (there is no lore system yet).
Not claimed as done.

---

## 8. What the rack serves, and what changed for managers

`rackIssue` has two sources, in this order, and the order is the product rule:

1. **The most recently published issue.** Once the chain has approved anything,
   that is the paper — nothing else may reach the rack. Served from stored
   `content` (`08 §28`), so a stat correction in March cannot silently reword an
   issue printed in October.
2. **The historical rendering** (`latestEdition`), for the one state publication
   cannot answer: the shop before the first issue has ever been approved. A
   finished season, rendered by the same pipeline, stamped as last season's.

The fallback is not a hole in `16 §9`'s gate. The gate is about **live weekly
publication**; this is a season that closed in January. Making it the *second*
source rather than the only one is what turns approval into the authority.

The stamp now comes from the rack rather than from the render mode: *"Last one
Tony printed"* is a claim about **which week this is**, so a published issue for
the current season must not carry it.

---

## 9. The demo states

Six, in `lib/demo/states.ts`, all on `/admin/slice`, all on seats carrying the
commissioner's keys — set by `ensureDemoSeat` behind both demo guards, so the
flag can only ever land on a `demo:`-prefixed fixture and can never be set in
production at all. `requireAdmin()` answers `notFound()`, so a press-desk demo on
an ordinary seat photographs a **404** that files under the state's name and
passes every pixel gate. `checkReviewDesk` is what stops that.

| State | Shows | How |
|---|---|---|
| `review-empty` | nothing waiting | **a rendering** — see below |
| `review-waiting` | an issue drafted and waiting | driven |
| `review-refused` | a draft the validator refused | driven, with one doctored sentence |
| `review-approved` | approved, not yet printed | driven |
| `review-published` | on the rack, with its record | driven |
| `review-held` | the press stopped | driven |

**`review-empty` is a preview parameter, not a seat.** An issue belongs to the
**league**, not to a seat, so once any other press-desk demo has drafted
something the desk is not empty for anybody — and the visual driver loops widths
on the outside, so the second and third passes would photograph a populated desk
under this name and pass. `?desk=empty` is resolved on the server behind the demo
guard and writes nothing. `MANDATE §8` sanctions a preview-only query parameter
for exactly this.

**`review-refused` doctors one sentence, and nothing else.** The renderer and the
validator agree on every week of both finalized seasons — `slice.test.ts` asserts
it — so asking the pipeline for a refused draft is asking it for a defect. The
demo puts a score nobody posted into the deck and runs the **real**
`validateEdition` over it; the violations on the screen are computed by the
shipping validator, and `recordVersion` writes the row rather than an INSERT the
product would never issue. The applier **refuses** if the doctored issue passes.

**Four of the six are photographed on the draft's own screen**, not on the queue.
The queue is league-scoped and additive, so the sections accumulate as each state
is applied and by the last one every desk looks the same — the screenshots proved
it. The screen where "approved" means something is the one with the Print button
on it.

---

## 10. What this unblocks, and what still gates it

**The Tuesday job is now buildable.** Its last step has a destination:
`generateDraft(season, week, { submit: true })` puts the week in front of the
commissioner, idempotently, and nothing it drafts can reach a manager until a
named person stamps it.

What remains before a cron may be scheduled is **operational**, not structural:
`vercel.json` with the two allowed jobs (`16 §4.3`), a secret-protected route,
and a decision about what the job does when a week refuses to draft. That is a
small piece of work and it is the next executable task.

**Nothing schedules anything today.** The desk's *"print a draft"* button calls
the same operation a cron would, so the whole chain is walkable now, by a person,
without an operational commitment nobody has reviewed.
