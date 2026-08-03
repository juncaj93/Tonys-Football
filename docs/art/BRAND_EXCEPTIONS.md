# Brand and logo exceptions — commissioner ruling, 2026-08-03

**Status: active, standing ruling.** This document is the canonical record. Where any
other art document — a batch handoff, `art/prompts/*.md`, `art/ART_SPEC.md §10`, or
`art/assets.inventory.json` — still shows the superseded text for one of the six items
below, **this document wins**, per `AUTONOMY.md §1`'s source-of-truth precedence
(latest explicit commissioner ruling is level 1). Correct the loser rather than
re-litigating.

## What this is

Tony's Pizza Fantasy is a private, non-commercial fantasy-football companion built for
a small friend group, not a public product. The commissioner has reviewed the first
two batches of generated collectible art and made six **narrow, itemized** exceptions
to the standing no-third-party-brand rule (`ART_SPEC.md §10`), because for this
specific private project the humor and nostalgia of a recognizable real-world
reference outweighs the (very low, for a closed non-commercial friend-group app) risk
that rule exists to manage.

**This is not a general loosening.** `ART_SPEC.md §10`'s prohibition — no third-party
trademarks, no team logos, no real player likenesses, no real signatures, no copied
restaurant branding, no unapproved brand marks, no existing game characters — **remains
in force for every asset not named below.** A future session finding brand-adjacent
content on any other asset should still reject it and point here to confirm it isn't
covered.

## The six exceptions

### 1. `collectible_arcade_token` — Tony's-branded token

Superseded: "abstract embossed design, no lettering." Now: an intentional **Tony's
token** — simplified Tony's wordmark, a simplified chef-mascot accent where legible at
size, embossed/stamped into the brass. No ® or ™ symbol. Simplify logo detail
aggressively enough to survive quantization and 23px legibility; a strong circular
silhouette still governs.

### 2. `collectible_neon_tony_sign` — Tony's wordmark and lettering approved

Superseded: "No lettering... unreadable at this size." Now: an intentional **Tony's
Pizza neon sign** — the Tony's wordmark, "PIZZA," a simplified chef accent, a
pizza-slice motif, red and warm-yellow tubing, dark backing plate, all may be legible.
Still enforced: readable silhouette at small size, simplified detail, no excessive
sparkle/particle effects, controlled material bloom (this is still the one item whose
own glow is exempt from the rarity-neutral rule — see `ART_SPEC.md §2.5`/collectible
family notes), transparent background, bottom anchor.

### 3. `collectible_reddiwip` — Reddi-wip-inspired treatment approved

Superseded: "unbranded... plain metal body." Now: an intentional **Reddi-wip-inspired**
treatment — predominantly red-and-white packaging, recognizable whipped-cream imagery,
similar package structure, aerosol top with an angled nozzle. Illegible microtext may
be simplified or dropped for 23px readability, but the can should not be redesigned
into a generic plain metal can. Still enforced: transparent background, square source
framing, bottom anchor, tall/slim silhouette, no cast shadow, clean quantization.

### 4. `collectible_bapple_tree` — Busch Light Apple-style cans approved

Superseded: the half-apple/half-banana fruit concept. Now: **a potted tree bearing
Busch Light Apple-style cans** hanging like fruit — red cans, recognizable white label
region, blue mountain/crest treatment, several cans (4–6 preferred over a crowded
canopy) hanging naturally, terracotta pot, leafy tree. Labels may be simplified and
can count reduced for legibility. The joke must still read immediately at 46×46 and
survive at 23px without the cans merging into noise.

### 5. `object_box_owned` (the pizza-box family) — Tony's branding approved; orientation is the open item

Superseded: "Blank — no printing, no lettering" (`art/prompts/zone_tile.md §6`). Now:
the box the player opens is an intentional **Tony's-branded pizza box** — warm
cardboard, red Tony's wordmark, simplified chef mascot, consistent across whatever
rarity treatment is applied at runtime (which remains 100% CSS/frame-geometry, never
baked into the art — rarity is never coupled to box art; see `PRODUCT_DELIVERY_MANDATE`
and `ASSET_PIPELINE.md §7`). No ® or ™ symbol.

**This one still needs a revision, but not for its branding.** The concept and
logo treatment are approved as-is from the first candidate. What's wrong is the
**camera angle** — see the box-family investigation in the accompanying revision
package (`docs/art/BOX_REVISION_PACKAGE.md`) for the exact corrected canvas (44×30,
not 96×96 as the registry currently and wrongly states) and the exact perspective the
runtime actually needs.

### 6. `collectible_portable_sauna` — barrel sauna approved

Superseded: "a zipped fabric tent on a low folding frame." Now: **a compact cylindrical
wooden barrel sauna** — rounded wooden facade, open door, visible dark interior, short
chimney, warm cedar appearance. Still enforced: single isolated object, transparent
background, no outdoor environment (no trees/lawn/gravel/fence), no smoke or steam,
strong silhouette, bottom anchor, 23px readability, simplified wood detail.

## Why these six and not a general rule

Each is a deliberate, itemized call, not a category. Tony's own branding (items 1, 2,
5) was already partially cleared by `ART_SPEC.md §10`'s 2026-07-29 ruling for
first-party marks — this ruling extends that same already-approved house branding to
three more assets it hadn't yet reached. Items 3, 4, and 6 are the genuinely new kind
of exception: real third-party consumer-product resemblance (Reddi-wip, Busch Light
Apple) and a content substitution unrelated to branding (the sauna). All three are
scoped to this private, non-commercial, closed-friend-group context specifically —
this ruling does not extend to a hypothetical future public or commercial version of
the product, and should be re-reviewed if the product's audience or distribution model
ever changes.

## What does not change

- Every other collectible, wearable, character, and environment asset remains subject
  to the full `ART_SPEC.md §10` rights rule, unchanged.
- Rarity, ownership, box probability, settlement, rewards, navigation, and collectible
  identity remain entirely decoupled from art composition (`lib/counter/`,
  `lib/parlor/objects.ts` — none of this changed). A future redesign of any of these
  six assets is a registry-row swap, exactly like every other asset in the pipeline.
- Where an automated validator cannot distinguish "approved branding" from
  "accidental/unapproved branding" (e.g., a stray numeral, an unrelated logo bleeding
  in from a generation), human visual review is still required — this ruling narrows
  what gets rejected on sight, it does not remove the review step.

## Where this is also recorded

- `art/ART_SPEC.md §10` — points here.
- `art/assets.inventory.json` — narrow per-item notes on the six affected registry
  groups.
- `docs/art/BATCH_B_COLLECTIBLES_HANDOFF.md` — updated subject briefs for
  `collectible_arcade_token`, `collectible_neon_tony_sign`, `collectible_reddiwip`,
  `collectible_bapple_tree`.
- `docs/art/BATCH_B2_COLLECTIBLES_HANDOFF.md` — updated subject brief for
  `collectible_portable_sauna`.
- `art/prompts/collectible.md` and `art/prompts/zone_tile.md` — updated SUBJECT lines.
- `docs/CHECKPOINT.md` — dated entry pointing here.
