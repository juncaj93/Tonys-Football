# Technical Lead Operating Model

**Status:** active, approved 2026-07-29.
**Purpose:** how the Technical Lead, the implementation workstreams, and the commissioner divide work — and where rulings live so nobody has to relay them.

---

## 0. Why this file exists

Rulings were being carried between chats by the commissioner, and the ruling record lived only in a session-local plan file that does not survive the session. Neither is a canonical record.

**GitHub is the shared communication layer.** Rulings are PR comments; the durable index is this file. A ruling that exists only in a chat did not happen.

---

## 1. Roles

| Role | Owns |
|---|---|
| **Technical Lead** | Workstream sequencing · branch and PR strategy · delegation · reconciliation of overlapping changes · review of diffs, tests, CI and previews · the canonical product and architecture record · deciding when work is integrated enough to ask the commissioner |
| **SW Initial Product** | Parlor art, homepage integration, application implementation |
| **Stats & Data** | The Sleeper adapter, correctness guardrails, derived statistics |
| **Commissioner** | Product taste, visual approval, production deployment |

---

## 2. The two message formats

Both go on the relevant PR. Neither goes through the commissioner.

### `TECH LEAD RULING`

Posted by the Technical Lead. Always carries:

1. Exact work authorized
2. Owner and target branch or PR
3. Required preserved behaviour
4. Tests and verification
5. Stop conditions
6. **Whether merge is authorized after green CI**

### `DECISION REQUEST — TECH LEAD`

Posted by a specialist that needs a ruling to continue. State the question, the options considered, what each costs, and what you would do absent a ruling. The Technical Lead answers on the PR and the specialist continues — **do not wait on the commissioner, and do not ask the commissioner to relay.**

If the answer turns out to be the commissioner's (see §4), the Technical Lead escalates it, not the specialist.

---

## 3. Delivery principle — group work into judgeable milestones

**Do not ask the commissioner to approve an isolated technical change that cannot be judged in the real website.** A palette metric, a coordinate correction, and a migration renumber are not things anyone can look at.

Dependent work is grouped onto an **integration branch** and reviewed on its Vercel preview. The commissioner sees the actual iPhone experience, the important interaction states, before-and-after context, and any remaining visible compromises — once, when it is ready to be judged.

**This rule exists because it was broken.** The first merge order was sequenced to minimise conflicts: `#8 → #11 → #10 → #9`. It was right about conflicts and wrong about the product — `#8` put the legacy homepage into production and `#11` put the approved shell in beside it, unwired, so the public preview regressed. Optimising merge order for PR cleanliness produced an incomplete public visual state.

**Never merge an incomplete visual milestone to `main` because an individual PR is technically green.**

---

## 4. Escalation boundary

### Goes to the commissioner

- An actual visual preview needing taste or approval
- Two or more materially different product outcomes, both valid
- An expensive or destructive redesign
- A new product rule the specification does not cover
- Production deployment approval

### Never goes to the commissioner

Branch mechanics · PR creation · rebasing and reconciliation · factual measurements · implementation choices with one clearly correct answer · test failures and fixes · CI maintenance · documentation updates · temporary preview deployments · routine merge sequencing.

---

## 5. Merge policy

Merge to `main` only when **all four** hold:

1. The integrated result is coherent as a product, not merely as a diff
2. Required CI is green **on the actual merged result**
3. The Technical Lead has reviewed it
4. Any required commissioner visual approval has been received

**Merging `main` deploys production.** `vercel-build` runs migrate → seed → build, so there is no such thing as a quiet merge to `main`. Do not deploy outside the repository's approved merge/deployment policy.

Work freely on branches and previews. That is what they are for.

---

## 6. Reconciliation principles

Learned from three-way merges that were genuinely hard, and worth stating once:

- **Documentation absorbs code, never the reverse.** A docs PR should reconcile against what shipped, not force shipped code to match a stale count.
- **Never delete an approved slug, record, or asset to satisfy an older number.** Recalculate the number.
- **When two branches change the same decision in opposite directions, the ruling decides — not the merge.** Resolve it before the conflict, and record which side won and why.
- **Keep both sides of an additive conflict.** A test deleted to make a conflict disappear is a regression with a green tick beside it.
- **A merged PR is finished.** It cannot track new work. New commits on its branch need a new PR.

---

## 7. Where the record lives

| Kind | Location |
|---|---|
| Product specification | `PROJECT_SPEC/`, hierarchy in `README.md` |
| Parlor navigation and object map | `PROJECT_SPEC/18_PARLOR_NAVIGATION_MAP.md` |
| Art pipeline and its rulings | `art/ASSET_PIPELINE.md` |
| Measured shell geometry | `art/SHELL_AUDIT_zone_parlor_shell.md` |
| Data policy and audit | `docs/DATA_AUDIT.md` |
| Current assignment | `docs/IMPLEMENTATION_HANDOFF.md` |
| **Ruling index** | §8 below |

A ruling that changes canonical direction is **folded into the specialized document** as well as indexed here. The index is a pointer, not the source of truth.

---

## 8. Ruling index

Chronological. `PR #n · comment` is the authoritative text.

| Date | Ruling | Where |
|---|---|---|
| 2026-07-29 | Palette quantization: **plain Euclidean RGB**; luma weighting never reintroduced | `art/ASSET_PIPELINE.md §4` · PR #11 |
| 2026-07-29 | Full-batch regeneration; B0 re-approval required after a quantizer change | PR #11 |
| 2026-07-29 | Cream board **closed at step 2** — metric correction alone; palette stays 32 colours | PR #11 |
| 2026-07-29 | Receipt is **trigger-only**; every blank surface classified surface-rendered or trigger-only | PR #9 |
| 2026-07-29 | Tony's Pizza **first-party branding permitted**; generic jersey numbers permitted; `16` canonical. Test is **identifiability, not decoration** | `art/ART_SPEC.md` · PR #11 |
| 2026-07-29 | Champion banners: **year-only fabric**, names in `/timeline`, six left-aligned slots, current season reveals `TBD` | PR #9 |
| 2026-07-29 | Banner rail reclassified **Display** → homepage is **3 Doors · 4 Displays · 1 Toy** | PR #9 |
| 2026-07-29 | Individual banner selection via **real DOM buttons**, not pointer arithmetic; bounded WCAG 2.5.8 AA exception that **does not generalise** | PR #9 |
| 2026-07-29 | `zone_parlor_counter_front` **withdrawn** — the shell's lower half is the foreground layer | PR #11 |
| 2026-07-29 | Board shift is **+5, not +6** — the board is 132 units, not 130 | PR #13 |
| 2026-07-29 | The board correction stays **provenance, not a pipeline stage**; every asset remains a pure function of its source | `art/ASSET_PIPELINE.md §4a` · PR #13 |
| 2026-07-29 | Merge order **superseded** by the integration-branch model | PR #14 |
| 2026-07-29 | Finalized seasons refuse record updates; open seasons still update | `docs/DATA_AUDIT.md` · PR #10 |
| 2026-07-30 | **Full autonomous delivery mandate** — Technical Lead is also integration owner, visual gate, and delegated commissioner for V1 | this file |
| 2026-07-30 | Transient panels are **set down in the room**, never bottom sheets. Sized to content, centred, pixel-bevelled, shared material with Tony's box and the champion panel | `components/scene/room-object.tsx` |
| 2026-07-30 | **Body copy floor is 17px.** Size the container to the type, never the type to the container | `components/scene/tony-toy.tsx` |
| 2026-07-30 | The Tonight board is **surface-rendered**: state line + one headliner on the board's own face, all four lines in the panel | `TONIGHT_FIELD` |
| 2026-07-30 | The prediction sign gets a **wiped-board** treatment — chalk residue, no invented prediction | `PREDICTION_SLATE` |

---

## 9. Current milestone — V1 Parlor

Integration branch **`integration/v1-parlor-milestone`**, tracked by **PR #14**, which is also the visual gate.

**Complete.** All four steps merged to the integration branch and then to `main`.

| | Work | PR | State |
|---|---|---|---|
| 1 | Board alignment + durable geometry | #13 | ✅ |
| 2 | Sleeper Phase A correctness | #10 | ✅ |
| 3 | Parlor navigation reconciliation | #9 | ✅ |
| 4 | Homepage wiring | #15 | ✅ |
| 5 | Visual polish — panels, typography, board face, prediction slate | direct | ✅ |

### Settled geometry — the wiring builds against these

| Feature | Extent |
|---|---|
| Rail rod | `x 54–184` · 131 units · centre `119.0` |
| Board, as shipped (+5) | `x 54–185` · 132 × 101 · centre `119.5` |
| Banner slots | `56 · 78 · 100 · 122 · 144 · 166` · width 18 · gap 4 · pitch 22 |
| Banner hit row | `y 58–87`, ends extended by `gap / 2` |
| Newspaper rack | `(10, 224)` at 38 × 38 |
| Layer cut | logical **y 292** |
| Tony | `(64, 180)` at 72 × 197, visible band 112 units |
| Tonight board text field | `TONIGHT_FIELD` `60, 93, 111, 74` — state line + one headliner |
| Prediction slate | `PREDICTION_SLATE` `154, 184, 37, 59` — chalk residue only |

Board and banner row co-centre at `119.5`, delta `0.0`. Partitions clear WCAG 2.5.8 AA at 24.75 CSS px on a 360 px viewport.

**Gap 4 is load-bearing.** Narrowing it to 3 drops the pitch to 21 → 23.6 CSS px, below AA on a 360 px viewport. If the rod is ever re-measured narrower than 128, the answer is **five slots at gap 4, never six at gap 3.**
