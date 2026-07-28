# 17 — Accelerated Roadmap

**Version:** 1.0
**Status:** ✅ Approved — canonical. Supersedes the *ordering* in `16 §13` and nothing else.
**Approved:** 2026-07-28

---

## 0. What this changes, and what it does not

**Changes:** the order in which work becomes visible.

**Does not change:** the architecture, the invariants, the scope decisions, the release gates, or anything else in `16`. `17` introduces **no new scope**. Where `16 §13` and this document disagree about order, `17` wins; there is nothing else to disagree about.

The source-of-truth hierarchy in `README.md §7` is unchanged: `16` remains canonical, with `17` governing implementation ordering.

---

## 1. Why

`16 §13` finishes systems before surfacing them. Under that order nobody sees Tony's Pizza until five phases of backend are complete — correct for engineering, wrong for a product whose whole value is how it *feels*.

This roadmap gets a real, deployed, iPhone-first site in front of the commissioner within roughly a day, then deepens every system through live iterations.

### The timing fact that shapes everything

**Today is 28 July. The season starts around 10 September.**

We are in the offseason. There are no live matchups, no weekly scores, no rewards to grant — and the imported 2024 and 2025 seasons *are* the content.

This is an asset, not an obstacle:

- Day one needs **no live scoring, no economy, and no Slice pipeline**
- The offseason shop is a legitimate designed state, not a placeholder
- The league gets six weeks to claim accounts and give real feedback before anything is at stake
- The economy simulation keeps its gate (`16 §8`) with room to spare

---

## 2. Milestones

| | What | When |
|---|---|---|
| **M1 — Doors Open** | Deployed · real login · real room · **the Counter Greeting** | ~1 day |
| **M2 — Depth** | History · avatars · Slice · collection | following several days |
| **Season Ready** | Live sync · story engine · locked economy | by 8 Sept |

---

## 3. The Counter Greeting

**M1's acceptance criterion, not a nice-to-have.** If this does not land, M1 is not done.

### What the manager experiences

Within ten seconds of opening the site on a phone:

1. Tony is at the counter as the page paints
2. A short entrance — leans in, wipes his hands — ~600ms, skippable, absent under `prefers-reduced-motion`
3. Two short lines: a greeting using their name, then **one verified fact about them**
4. His expression matches the line's mood

### It reuses the approved content system entirely

| Piece | Existing system |
|---|---|
| The lines | `content_entries`, `kind = 'tony_line'`, `surface = 'parlor_greeting'` |
| Who gets which | `required_tags`, matched against the viewer's derived tags |
| Not repeating | The existing cooldown pipeline (`16 §10`) |
| The underlying fact | Verified import data; `league_memories` where a fact needs provenance |
| Tony's expression | A field on the content entry naming one of his three sprites |

**No new tables. No AI. Every line curated, every fact verified.**

### The one thing pulled forward

Per-manager **derived tags** — a pure function over imported history producing booleans. This is the `16 §10` reputation model, needed earlier than planned. It is roughly fifty lines and no new schema.

### Acceptance test

> Two managers log in side by side and get **visibly different greetings that are both true.**

Secondary: the same manager on three consecutive days gets three different lines.

### Content

`content/counter-greetings.md` holds the drafted lines, split into **verified** (safe to seed) and **canon-based** (commissioner approval required). Group A is sufficient for M1 on its own.

---

## 4. Vertical slices

| # | Slice | Contains | PRs |
|---|---|---|---|
| **V0** | **Pipeline** | Neon production · Vercel · env vars · migrations on deploy | 1 |
| **V1** | **Doors Open** | Claim + PIN + 90-day session · six-zone parlor · Tonight board · derived tags · **Counter Greeting** · your receipt · offseason dressing | 1 |
| **V2** | **Memory** | Timeline · trophy wall · championship rings · manager profiles · avatar builder + parlor presence | 1–2 |
| **V3** | **The Ritual** | Slice v0 (commissioner-authored, publish, archive, newspaper rack) · first real shop dressings | 1 |
| **V4** | **The Collection** | Token ledger + `apply_token_delta` · resettable preseason grant · 36-item catalog · one box · reveal · collection · **Showcase** | 2 |
| **V5** | **Season Systems** | Live sync · dressing resolver · story engine + template renderer · economy simulation · weekly stakes | 4–5 |

**V0 ships before any feature exists.** Paving the road while nothing can break costs an hour or two and makes every later slice a live deploy.

---

## 5. Manual first, automated second

The central accelerant. A manual version is a **real feature**, not a mock — and the automation that follows *reduces commissioner work* rather than gating the feature.

| Feature | Simple version | Automated later |
|---|---|---|
| **Tuesday Slice** | Commissioner writes the issue; publishes; archives; lands on the rack | Story engine → fact packets → template renderer → review screen |
| **Timeline** | Generated from imported history; commissioner pins or hides | Fed live by the event spine |
| **Rewards** | Admin grants tokens | Tuesday job, once the simulation locks numbers |
| **Shop changes** | A handful of hand-set dressings | Full condition-driven resolver |

The Slice matters most here: **live within days as a hand-written post**, starting the weekly ritual six weeks before it carries stakes.

---

## 6. The preseason token grant

V4 ships a **fixed offseason grant that resets when the season opens**, framed in-world: *Tony's handing out tokens while the shop is quiet. They don't carry over.*

This lets the collection loop go live in August — real pulls, real inventory — while committing to **no** economy numbers, because everything resets before it counts. It is the single deliberately resettable thing in the system, designed that way from the start.

---

## 7. PR checkpoints

Six categories. Everything else is continuous work inside a slice.

| Checkpoint | Why |
|---|---|
| Infrastructure and secrets (V0) | Touches production and external resources |
| Authentication (V1) | Security surface, reviewed before anyone can log in |
| Anything writing to the token ledger (V4) | Data-integrity invariant, `16 §4.2` |
| Any non-additive migration, once real accounts exist | Irreversible against live data |
| Economy simulation output (V5) | Explicit gate, `16 §8` |
| Each vertical-slice boundary | One PR per slice, not per subtask |

Roughly **6–8 PRs to Season Ready**, not thirteen-plus.

---

## 8. Where the engineer works continuously

**Inside a slice, no stopping to check in:**

- UI composition, styling, mobile layout, responsive behaviour
- Seeding and editing content entries, dressings, catalog rows
- Writing and refactoring tests
- Refactors contained within the slice
- Swapping placeholder assets for approved art via the registry
- Purely additive migrations, *before* real accounts exist

**Stop and check in for:**

- A new external resource or secret
- A migration touching existing data once managers have claimed accounts
- Any change to the identity model or the ledger's integrity rules
- Any scope outside the current slice — propose it, do not absorb it
- Once the league has access: anything that changes what they already see

---

## 9. The share gate

Not a slice count. Share with the league when **all** are true:

- [ ] Every manager can claim and log in **without being talked through it**
- [ ] The Counter Greeting is visibly different and true for at least five managers
- [ ] At least one complete system beyond the parlor — Memory (V2) **or** Collection (V4)
- [ ] **B0 and B1 art has replaced the zone placeholders**, so the shop is a room rather than taped cardboard
- [ ] Nothing on screen is broken or empty without an in-world explanation
- [ ] Session persistence confirmed on a real iPhone across several days
- [ ] The commissioner has used it for two days **without wanting to apologise for it**

The last is the real gate. V2 plus art is the likely trigger; V4 makes it stronger.

Until then M1 is reviewed privately by the commissioner.

---

## 10. Deployment

**Branching.** `main` → production, auto-deploy on merge. Every PR gets a Vercel preview. Preview deploys are public-by-URL on Hobby, so they use the **sandbox Neon branch — never production data**.

**Domain.** M1 ships on the Vercel URL so DNS does not block it. Attaching a `juncaj.net` subdomain afterward is a Vercel setting plus a DNS record, provided nothing hardcodes the origin: session cookies stay host-only, and any absolute URL comes from an env var.

**Migrations.** Forward-only, generated and committed, reviewed in the PR, run as a deploy step before new code serves traffic. Never destructive once real accounts exist.

**Feature flags carry more weight than usual.** With ten users and daily shipping, merge to production aggressively and gate half-built work behind a flag rather than maintaining a staging ritual. Flags fail closed.

**Rollback.** Revert the merge; Vercel redeploys the previous build. Any migration shipping alongside a revertible feature must be additive so the old build still runs against the new schema.

---

## 11. Parallel tracks

The engineer works serially. Real parallelism is commissioner-and-engineer.

| Track | Owner |
|---|---|
| B0 art test set → B1 zone tiles | Commissioner |
| Reviewing and extending the Counter Greeting lines | Commissioner |
| Remaining Tony and manager dialogue | Commissioner |
| Implementation slices | Engineer |

---

## 12. Deferred, deliberately

Casino · basements · AI Slice renderer · auction · live weekly rewards · seasonal packs · vending · Season Story.

**The stability rule:** once managers have claimed accounts and own things, migrations are forward-only and never destructive.

---

## 13. Art during acceleration

M1 ships with placeholder art. That is the designed behaviour, not a compromise: every asset resolves through the registry, and swapping a placeholder for approved art is a **registry row, never a code change** (`art/ASSET_PIPELINE.md`).

The honest consequence: **until B0 and B1 land, the shop is a room made of taped-up cardboard signs.** It reads as intentional rather than broken — that was the design intent — but it is the largest visual gap at M1, and it is why art appears in the share gate rather than the M1 gate.
