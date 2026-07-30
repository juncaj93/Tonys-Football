# Product Delivery Mandate

**Status:** active standing mandate. Issued by the commissioner 2026-07-30.
**Precedence:** a **latest explicit commissioner ruling** — level 1 in `AUTONOMY.md §1`. It supplements and governs the *application* of `CLAUDE.md`, `AUTONOMY.md`, `PROJECT_SPEC/*`, the art and pipeline specs, the handoffs, `docs/TECH_LEAD_OPERATING_MODEL.md`, and the ruling index. Where an older document disagrees with this file, this file wins and the older document gets corrected.

> **The objective is no longer to prove that routes, components, schemas or individual PRs exist.**
>
> It is to autonomously deliver a polished, coherent, fun, statistically trustworthy Tony's in which **every approved major feature can be demonstrated end to end.**

---

## 1. Technical Lead ownership

The Technical Lead is also integration owner, visual-quality gate, release authority and delegated product owner, and owns: spec interpretation · milestone sequencing · decomposition · specialist assignment · branch and PR strategy · code review · **data review** · visual review · preview deploys · integration · production deploys · post-deployment verification · rollback and repair · durable documentation and checkpoints.

**Implement work directly whenever that is faster or safer than delegating it.**

The commissioner is never required to operate a specialist chat, relay reports between agents, approve PR mechanics, decide an implementation detail with one clearly correct answer, advance work after each small slice, or approve visual polish already covered by the approved direction.

GitHub is the shared operational record. Structured comment forms:

| Form | Used for |
|---|---|
| `TECH LEAD RULING` | a decision that changes canonical direction |
| `IMPLEMENTATION TASK — SW` | presentation / interaction work |
| `IMPLEMENTATION TASK — STATS` | fantasy-fact / statistical work |
| `VISUAL QA — CHANGES REQUIRED` | a rejected visual result plus its repair task |
| `RELEASE REVIEW` | production readiness and post-deploy verification |
| `DECISION REQUEST — TECH LEAD` | a specialist blocked on a ruling |

When a specialist must act: post the exact instruction in GitHub, name the owner, define scope, constraints, required evidence and stop conditions, then **review the code, data, screenshots and tests yourself** and require corrections directly. Never ask the commissioner to carry information between workstreams.

## 2. Source-of-truth precedence

1. latest explicit commissioner ruling
2. latest durable Technical Lead ruling
3. approved visual references and canonical production assets
4. canonical product specifications
5. architecture, data and art specifications
6. implementation and generation handoffs
7. current integrated code
8. historical plans, stale PR descriptions, superseded discussion

**Do not preserve incorrect behaviour because an old Markdown file still describes it.** On finding a contradiction: determine the authoritative rule, implement the correct behaviour, update the canonical record, mark or remove what is superseded, and add a test or validation so it cannot return.

Reconcile documentation **at milestone boundaries and before a production merge** — not after every commit. Delivery does not stop to update derived docs.

## 3. Autonomy boundary

Autonomous, without asking: PRs (create · update · retarget · merge · supersede · close) · branches and integration branches · rebasing and recreating stale branches · assigning or taking over specialist work · revising a poor approach · reverting a visual regression · fixing CI, tests, migrations, lint, typecheck, builds · updating canonical Markdown · creating deterministic preview data · preview deploys · merging a completed milestone to `main` · allowing the configured production deploy · smoke-testing production · repairing or rolling back a bad deploy.

**Never stop for:** branch strategy · PR creation · CI repairs · factual measurements · layout · typography · animation timing · copy editing · test maintenance · stale docs · reversible implementation choices · visual polish covered by the approved direction.

**Aesthetic uncertainty is not a blocker.** Use the approved direction, compare real screenshots, make the strongest professional choice, continue.

Escalate only for a genuine human-only blocker: unavailable account permission · a secret that cannot be supplied technically · paid-service authorization · an unresolved legal or rights question · irrecoverable loss of a required source asset.

## 4. No paid unattended model execution

The unattended paid Anthropic actor stays disabled (commissioner, 2026-07-30). Do **not** restore a paid cron, add an automatic paid-Claude trigger, infer that an existing secret authorizes spending, or re-escalate the decision.

Because the repository cannot wake a model by itself, **maintain `docs/CHECKPOINT.md`** before a session approaches its limits, carrying: current milestone · active branch and PR · completed slices · exact next task · unresolved failures · latest test results · latest visual-QA results · authoritative Markdown sections · the resume instruction.

Resume instruction:

> `Read CLAUDE.md and AUTONOMY.md, load the latest durable checkpoint, inspect the current repository and previews, and continue autonomous delivery.`

Session memory is never the only operational record.

## 5. Product completion standard

A feature is **not** complete because a route exists, a schema exists, an asset is registered, a component renders, a button is clickable, one happy-path test passes, CI is green, one screenshot was captured, or placeholder data makes it look functional.

It is complete when **all** hold:

- the complete user loop works
- the purpose is understandable without explanation
- real production data is correct
- representative demo states are available
- mobile interactions feel intentional
- visual quality matches Tony's world
- loading, empty, retry, duplicate, interrupted and error states are handled
- accessibility requirements pass
- state persists correctly
- tests and visual QA pass
- production is deployed and verified

**The finished experience is the deliverable, not the PR.**

## 6. Permanent visual-quality standard

Tony's must feel like a native interactive pixel-art world, not a website over a background image. `VISUAL_ACCEPTANCE.md` is the enforcing document; this section is its standing authority.

No milestone may reintroduce: Tony or clothing clipping · wrong foreground/rear layering · blurred or softened pixel art · CSS recolouring of approved assets · contaminated or legacy palette colours · violet-deep floor artifacts · unreadably small text · generic HTML cards dominating the room · persistent button rectangles · visible hitboxes · debug overlays · default modal or bottom-sheet styling · oversized chrome · legacy homepage artwork · broken responsive scaling · visually unfinished placeholder states.

**Characters:** preserve approved source art and canonical details; explicit layer order; verify body, clothing, equipment and foreground occlusion; never let a transformed parent, overflow container, mask or CSS crop cut a character; compare rendered screenshots against the approved reference composite.

**Typography at supported iPhone sizes:** essential text comfortably readable without zooming; body and dialogue generally **16–18 CSS px**, adjusted *upward* when the pixel font needs more optical size; important actions and values never in tiny decorative type; obvious hierarchy; line height and tracking suited to the pixel font. **Panels adapt around readable text — text is never shrunk to fit a panel.**

**Colour and pixel fidelity:** registered assets by slug; no CSS recolouring; avoid filters, blend modes, translucent tints and accidental overlays; hard pixel edges; correct `image-rendering`; avoid fractional scaling that blurs; sample screenshot colours against the source PNG. **Judge the browser-rendered result, not the source asset.**

**Interface integration:** room interactions feel embedded. Inert environmental objects never look like rectangular web buttons. Transient panels may be rectangular but must use Tony's palette, pixel-aligned borders, readable type, restrained size and deliberate placement. Focus states stay usable, appear only during relevant interaction, and stay pixel-aligned.

## 7. Mandatory visual iteration loop

For every meaningful user-facing slice: production build → real imported data or deterministic fixtures → render at **390 · 375 · 360** → capture every important state with Playwright → **inspect each screenshot at actual display size** → compare against approved references and prior accepted baselines → fix → repeat until clean.

States to inspect: idle · active · success · loading · empty · error · retry · keyboard-focus · longest realistic content · shortest realistic content · representative historical data · current unresolved data.

Reject for: character clipping · unreadable type · bad colour fidelity · generic web chrome · weak hierarchy · awkward empty space · poor animation timing · misleading affordances · placeholder-looking environmental objects · anything technically working that visibly feels unfinished.

**Every rejection produces a concrete repair task and another review cycle.**

## 8. Demoability is a first-class requirement

Every major feature must be safely demonstrable **today**, even when the real league calendar or production account does not contain the state.

Build a deterministic non-production demo system. It may use seeded sandbox data, fixture-backed preview routes, Playwright helpers, test-only clocks, fixed seeds, preview-only query parameters, commissioner-only non-production controls, and isolated component states.

It **must**: work only in local, test, preview or explicitly authorized demo contexts; be unreachable for ordinary production users; never pollute production league data; never modify finalized historical seasons; never award real collectibles, boxes, tokens, wins or prizes; stay distinct at the storage, service **and** UI boundaries; use fixed seeds for reproducible screenshots; expose every important state; and show no developer controls in the normal product.

Scenarios required over time: no boxes · one unopened box · several unopened boxes · each rarity · a duplicate · an interrupted opening · a retried opening · collection empty and full · equipped and unequipped items · a Slice with several strong story types · a Slice with insufficient data · completed and current seasons · Back Hall locked and open · casino win / loss / push · insufficient balance · duplicate wager · network failure and retry.

**A feature is not demo-ready if showing its important states requires editing the database by hand.**

## 9. Specialist ownership

**Technical Lead** — milestone priorities · product rules · final integration · visual and functional acceptance · coordination · release decisions · conflict resolution.

**Stats & Data** — the *sole authority* for fantasy-football facts and statistical significance: Sleeper-source correctness · persisted finalized history · matchup scores · standings · records · rankings · margins · percentiles · streaks · historical comparisons · candidate story selection · evidence and auditability · statistical regression tests.

**SW Initial Product** — presentation · interaction · animation · approved copy-template rendering · responsive UI · environmental integration · persistence through approved service interfaces.

**SW must never** decide what counts as a blowout, infer a winner from UI values, reconstruct historical scores from unrelated sources, classify a result's importance, choose emotionally loaded language without a Stats-provided classification, or invent or "improve" a score, margin, name, ranking or season. **SW consumes typed, verified facts.**

## 10. Deterministic stats-intelligence system

A deterministic statistical-fact layer comes **before** any narrative copy. Every publishable matchup or league fact is a typed fact object carrying at minimum:

stable fact ID · fact type · season · week · finalized status · source snapshot/version · winner manager ID · winner canonical display name · loser manager ID · loser canonical display name · winner points · loser points · exact margin · weekly rank · season rank or percentile · historical percentile where enough data exists · significance tier · selection score · reason selected · evidence references · suppression reason when not publishable.

```ts
{
  id: "2026-w04-largest-margin",
  type: "blowout",
  season: 2026,
  week: 4,
  finalized: true,
  winnerManagerId: "matty-b",
  winnerDisplayName: "Matty B",
  loserManagerId: "nathan",
  loserDisplayName: "Nathan",
  winnerPoints: 154.42,
  loserPoints: 103.91,
  margin: 50.51,
  weeklyMarginRank: 1,
  seasonMarginPercentile: 97,
  historicalMarginPercentile: 95,
  intensity: "obliterated",
  reasonSelected: "Largest finalized margin of the week and historically exceptional",
  sourceSnapshot: "sleeper-2026-w04-final"
}
```

A fact that cannot be evidenced is **suppressed with a recorded reason**, never softened into prose. This is the mechanism behind `CLAUDE.md`'s "accuracy is more important than humor" and "all fantasy facts must come from Sleeper or verified persisted application records".

---

## Reconciliation with existing rulings

Nothing in the prior record is weakened by this mandate; several things are strengthened.

| Existing | Effect |
|---|---|
| `AUTONOMY.md §2` label lifecycle | unchanged. Labels remain the state machine; this mandate names the comment forms used alongside them. |
| `AUTONOMY.md §6` four human-only blockers | **widened in wording, identical in effect** — account permission, an unsuppliable secret, paid authorization, plus legal/rights and irrecoverable asset loss. The standing "no" on paid API use stands. |
| `AUTONOMY.md §3` "green CI is necessary and never sufficient" | **elevated** — `§5` here defines the full completion bar, and `§7` makes the screenshot loop mandatory rather than customary. |
| `VISUAL_ACCEPTANCE.md` | remains the enforcing document. `§6` here is its standing authority, and adds the **16–18px** typography floor with "adjust upward for optical size", which supersedes the bare "17px floor" wording. |
| `docs/TECH_LEAD_OPERATING_MODEL.md §4` escalation boundary | **narrowed further** — visual polish and product sequencing are explicitly the Technical Lead's. |
| `16 §5.2` `weekly_analytics` | the stats-intelligence layer in `§10` is where it lands, with typed facts and recorded suppression. |
| `16 §9` generative AI limited to the Slice | unchanged and reinforced: narrative copy may only render **Stats-provided classifications**. |
| Simulation gating (`16 §8`) | unchanged. Demo fixtures must not lock a reward or price value. |
