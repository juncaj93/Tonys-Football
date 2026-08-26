# Commissioner corrections — the boundary

**Status: built.** `/admin/corrections`, two per-manager corrections, no migration,
no schema change, nothing in `docs/ACTIVATION.md` moves.

This is the canonical account of what the corrections drawer does, what it
deliberately does not do, and which of those absences are decisions rather than
omissions.

---

## 1. What was actually missing

The office could do exactly one thing to a manager: clear a forgotten PIN. That
covers *"I cannot get in"* and covers nothing else, and the two mistakes that
actually happen on launch night are different:

- **The wrong name.** Ten names on a door and one tap each. Somebody takes a
  league-mate's name and sets a PIN against it. `claimManager` refuses a second
  claim — correctly — so from that moment the right manager cannot get in and
  the wrong one is signed in as somebody else.
- **A character saved by accident.** `characterFor` reports `chosen: false`
  only while there is **no** configuration row, which is what makes the mirror
  say *"Tony guessed. Change anything you like."* One Save turns that off
  permanently, and nothing in the product could turn it back on.

Neither is a defect. Both need a person with the keys.

## 2. Two corrections, and no third

| Correction | What it does | Audit action |
|---|---|---|
| **Release this name** | Clears the PIN, revokes every session, puts the name back on the door | `identity_release` |
| **Reset their character** | Deletes the `character_configurations` row | `character_reset` |

**There is no bulk launch reset, and that is a decision.** A league-wide reset is
one tap that touches ten people, and the tap carries no evidence of which of the
ten needed it. Every correction here names a subject, and so does its audit row —
so `admin_audit_logs` answers *"what was done to this manager, and by whom"*
rather than *"a reset happened."* A bulk reset is a different decision with
different consequences and needs its own.

## 3. Releasing a name is the key board's mechanism with the decision recorded

`releaseName` calls `resetPin`. That is deliberate rather than lazy: *"the key
comes off this person and goes back on the hook"* is the same operation whether
the reason was a forgotten PIN or the wrong name tapped, and a second copy of it
would be two paths that could drift about session revocation.

What differs is the **decision**, so what differs is what gets written down.
`resetPin` gained a `reason` — `FORGOTTEN_PIN` (the default, so the key board
keeps writing `pin_reset` exactly as it always has) or `WRONG_IDENTITY`. It
decides the audit action name and nothing else, and **it must never become a
parameter that changes what happens**: two reasons that did different things to
the hash or the sessions would be two operations sharing one name.

A trail that recorded both as `pin_reset` could not tell, a season later, a
forgotten PIN from a launch-night mis-tap.

## 4. What a correction may touch

**Identity only.** No correction moves a token balance, writes a ledger row,
opens or grants a loot box, touches a collectible, empties a room, or changes
anything the league reads. `lib/admin/corrections.ts` reaches into
`users`, `sessions`, `character_configurations` and `admin_audit_logs`, and
nowhere else.

This is not an accident of the current implementation — it is the property that
makes a correction safe to press. A tool that quietly deleted somebody's
collection would be a destructive operation wearing the clothes of an
administrative one, and the commissioner pressing it could not have known.
`corrections.test.ts` has a `blast radius` block for exactly this, and its
assertions are about what **survives**.

### Equipped wearables are deliberately left on

A wearable is something the manager **owns**; `wearable_equips` is where they put
it, not proof they chose a face. Clearing it would be an identity correction
reaching into the collectible economy, and it would take a hat off somebody who
only wanted their hair back. The customiser removes it in one tap; a
commissioner cannot put it back.

### A release does not reset the character, and a reset does not release the name

They compose instead. The launch case needs both — the wrong person claims a
name, dresses a character on it, and both have to be undone — but folding them
together would mean a commissioner fixing a mis-tap on the door silently
deleting something. `resetCharacterSelection` therefore works on an **unclaimed**
manager, because that is the state a release leaves behind.

## 5. The confirmation step

Three screens, one route: `/admin/corrections` is the league · `?subject=<id>` is
one manager · `?subject=<id>&do=<kind>` is the confirmation, and it is the only
screen in the feature with a button on it.

The confirmation exists to be read. It names the manager, says in plain words
what will happen, and says what will **not** — the tokens, the collection, the
room. A correction whose blast radius a reader has to infer is a correction they
will avoid using.

This is the reasoning the press desk already recorded when it refused an Approve
button on the queue row: *"a button bar at the top would make approving without
reading the default gesture."* A correction on the list would be that, one screen
earlier.

**A control that would only ever be refused is absent, not disabled**
(`correctionAvailable`), and the sentence beside the manager says why — the draft
board's convention. The services re-check every rule regardless, because a hidden
button is not authorization (`09 §9`).

## 6. Authorization is unchanged

`requireAdmin()` on the page, `requireAdmin()` on the first line of the action,
`notFound()` on both. The actor is the session's user and never a form field —
the form carries who is being corrected, never who is doing the correcting.
`applyCorrectionAction` is a server action rather than a route handler, so it
gets Next's Origin/Host check for free, exactly as `resetPinAction` does.

The corrections screen offers the door's population — `listDoorManagers` rather
than a query of its own — so the retired-manager rule has one definition rather
than two, and the office cannot become a way back in.

## 7. `changed: false` is an outcome, not a failure

Resetting the character of a manager who never saved one is a correction that
finds the world already correct. The audit row is written either way, with
`cleared` in its details, because the commissioner did press the button and
*"I pressed it and nothing was there"* is exactly the thing a trail should be
able to say. A trail that logged only successful deletions could not tell that
from a correction nobody ever made.

## 8. Gates

- `lib/admin/corrections.test.ts` — 24 assertions against a real Postgres, in
  five blocks. The `blast radius` block is the largest, deliberately: the failure
  mode that matters for an administrative tool is not *"it did not work"* but
  *"it did more than it said."*
- `app/actions/use-server-exports.test.ts` — already covers the new action file,
  which is why it exports nothing but an async function.
- Three visual states — `corrections`, `corrections-manager`,
  `corrections-confirm` — at all three widths. The two inner screens are reached
  by **tapping**, because their URLs need a real manager's id and a driver that
  typed one would photograph the list under the confirmation's name.
  `corrections-confirm` deliberately stops at the confirmation and presses
  nothing: the screen is the deliverable, and pressing the button would release a
  seeded manager's name and leave every later state a different league.
