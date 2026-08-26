# Tony's Pizza Fantasy — Consumer UX / Visual / Navigation Audit

**Status:** in progress — authenticated 390px, 375px, and 360px walkthrough
underway on `codex/consumer-ux-audit`, 2026-08-25.

## A. Product-level verdict

The product has a strong world-first direction and a clear, intentional entry
surface. A signed-in manager walkthrough shows that the parlor, Tuesday Slice,
showcase, and Back Hall's physical route markers are already persuasive at
iPhone widths. It also exposes release-blocking scene-composition failures in
the Room and casino, plus a small number of clear navigation/discoverability
defects. The scene failures belong to active workstreams; this audit records
them rather than duplicating their implementation.

## B. Highest-impact findings so far

1. **The Room and casino collapse to a mostly black world at iPhone width.** At
   390px, `/rooms` shows ceiling and a few floating objects over an otherwise
   black/brown field; `/underground` retains a narrow top treatment and a small
   Dealer Tony but loses the casino scene. The checked-in room shell asset is a
   complete bright scene, so this is runtime composition/visibility rather than
   a request for more art. This is release-blocking and belongs respectively to
   `codex/cozy-rec-room` and `codex/npc-dialogue-polish`.
2. **The current pizza-box change is not releasable yet.** PR #134 has green CI
   but a failed Visual QA run. This is a release gate, not a cosmetic nit: the
   new dedicated opening flow must be visually verified before it can replace
   the current experience.
3. **The character editor makes genuine customization controls undiscoverable.**
   At 390px, 375px, and 360px, its trait and option rows overflow horizontally
   with no visible scrollbar or more indicator. At 375px, `What to change` is
   698px wide in a 339px viewport; the player sees only Skin, Hair, Colour, and
   a fragment of Beard. This is an unclaimed runtime layout defect and is fixed
   in this audit by allowing these short primary-choice rows to wrap.
4. **Current Collection leaks unknown collectible names.** `/counter/collection`
   shows unowned entries such as Squeeze bottle, Dog bowl, and Lava lamp. This
   violates the mystery-until-unlocked requirement. PR #134 owns the pending
   correction, so it remains held at its Visual QA release gate rather than
   duplicated here.
5. **Navigation, Back Hall, and casino presentation are an active-work
   conflict.** The `codex/npc-dialogue-polish` claim owns the persistent pocket
   rail and room-first casino treatment. No parallel adjustment to the rail,
   route exits, casino room, or its copy is permitted in this audit.
6. **Basement shell composition is an active-work conflict.**
   `codex/cozy-rec-room` owns the rec-room shell, hearth, and manager-room
   composition. This audit will record visual findings but will not change room
   geometry or assets.

## C. Issues fixed in this pass

### Character customizer: reveal every category and option

The trait and option strips now wrap inside their panel rather than silently
scroll sideways. This preserves the local preview/save model and all character
layers while making every choice visibly available at 390px, 375px, and 360px.
It is deliberately a layout-only change: no art, catalog entry, character
composition, unlock rule, or saved data changes.

## D. Product decisions required

### Commissioner correction desk — planned feature, not an audit patch

The live office cleanly supports a PIN reset and clearly explains its effect,
but it has no way to correct a manager selected under the wrong known name at
launch. The requested commissioner correction flow needs explicit identity,
audit-log, and session-revocation rules; it must not be improvised as a display
name edit in a UI-only audit. Add it to the operator backlog with the intended
scope: correct the manager-name mapping, preserve the account's history, log
the commissioner action, and let the affected person set their own PIN again.

## E. Art follow-ups

New art is deliberately out of scope. The bright source Room asset is present
but its assembled mobile scene is not; that must be repaired as runtime
composition before deciding whether any art needs replacement. The audit does
not treat the proven runtime black-out as an art-generation request.

## F. Active-work conflicts deliberately untouched

| Area | Owner | Audit treatment |
| --- | --- | --- |
| Rec-room shell, hearth, room composition | `codex/cozy-rec-room` | Inspect and report only |
| Back Hall, pocket navigation, casino visual repair | `codex/npc-dialogue-polish` | Inspect and report only |
| Dedicated pizza-box opening / collection refinements | PR #134 | Gate and inspect before any merge; no competing implementation |

## G. Surfaces explicitly left alone

### The door / key-ring entry screen

At 390px it communicates one job: choose a manager key and set or enter a PIN.
The terms “taken” and “on the hook” make the two states understandable, and the
lost-PIN path explains the recovery authority without exposing a generic account
dashboard. No change is justified without an observed readability or tap-target
failure.

### Tuesday Slice

At 390px, the parchment panel, masthead, headline, and score receipt are
legible before the persistent rail. The rail overlays only lower, scrollable
copy rather than the primary result. Leave it alone.

### Showcase

At 390px, the currently displayed item is visibly distinguished and each owned
item has a plain-language `Show this` action. The screen does not leak the
unowned collection. Leave its interaction model alone; any removal of redundant
exit links belongs to the active pocket-navigation owner.

### Back Hall

At 390px, the red curtains, doorway, stairs, and room exits clearly map to
where they lead. An NPC conversation panel opens above—not behind—the rail and
is readable. The visiting manager sprite is oversized and floats slightly, but
that sprite placement is owned by `codex/npc-dialogue-polish`; report it there
rather than moving it from this audit lane.

### Commissioner office

At 390px, the office's first screen makes its two current jobs clear: open the
press desk or reset a taken key. The reset explanation is specific about signing
the person out and never exposes a PIN. Leave that flow alone. The missing
wrong-name correction capability is a planned operator feature recorded above,
not a visual defect to patch silently.

### Commissioner press desk

At 390px, the desk reads as an ordered paper workflow: waiting, approved but
unprinted, rack, then drafting. It makes the empty state useful without
inventing work, and the manual-draft and stop-press controls describe their
side effects before a commissioner reaches them. Leave the editorial workflow
alone.

### Commissioner draft board

At 390px, all ten managers are presented as large, separate rows and the empty
Sleeper state distinguishes “nothing imported yet” from a failed review. The
action to pull the draft is described before it can be pressed. Leave the draft
board's mobile hierarchy alone.

### Fraud Check

At 390px, the all-play explanation is clear before the ledger, every manager
row retains Official, All-play, and Schedule labels, and the page correctly
uses the league's other **nine** scores for each week. The rail occupies only
the bottom edge of a vertically scrollable ledger. Leave the calculation and
card hierarchy alone.

## H. Evidence gathered

- Signed-in live production walkthrough at 390px, with character-editor width
  checks repeated at 375px and 360px: `/`, `/counter`, `/counter/collection`,
  `/counter/showcase`, `/back-hall`, `/rooms`, `/underground`, `/slice`,
  `/profile`, and `/profile/character`.
- Browser measurements at 375px: `What to change` scroll width 698px vs client
  width 339px; the visible editor controls concealed legitimate categories.
- Screen evidence: Room and casino are visually black/incomplete at 390px even
  though their source art assets are bright, complete files. Back Hall and
  Slice compose successfully at that same width.
- Fraud Check at 390px: ten-manager, nine-opponent all-play language and
  card labels remain legible in the first viewport; no computation or content
  change is recommended.
- Commissioner office at 390px: key/PIN recovery is readable and has an
  appropriate self-reset safeguard; manager-name correction is not present and
  is captured as a planned, audited operator feature rather than altered here.
- Commissioner press desk at 390px: the empty, draft, and stop-press states
  are ordered and legible before their mutation controls; no adjustment is
  recommended.
- Commissioner draft board at 390px: all ten managers have distinct,
  thumb-sized rows and the no-draft-yet state is clear; no adjustment is
  recommended.
- Current `origin/main` route tree, active-work register, feature flags, and
  product/visual boundaries.
- PR #134 remote gates: CI succeeded; Visual QA failed and remains a release
  blocker pending exact screenshot/report review.

## I. Next audit action

Run local checks for the wrapped customizer, then publish this audit branch for
the required independent visual gate. Continue the signed-in read-only route
walk, including Fraud Check and commissioner surfaces. Keep PR #134 unmerged
until its failed Visual QA has exact, inspectable repair evidence.
