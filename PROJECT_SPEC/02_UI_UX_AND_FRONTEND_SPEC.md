# 02_UI_UX_AND_FRONTEND_SPEC.md

Version: 2.0

## 1. Purpose

This document defines the player-facing structure, interaction model, navigation, animation philosophy, and responsive behavior of Tony's Pizza Fantasy.

## 2. Primary Experience: Tony's Pizza Parlor

The homepage is both a dashboard and an explorable environment.

It should immediately communicate:

- current fantasy context
- what changed since the user's last visit
- what is available to do
- who is currently around the parlor

The environment may contain clickable or tappable landmarks, but critical functions must also remain accessible through a persistent navigation system.

## 3. Primary Navigation

Use a mobile-first sticky bottom navigation with four core destinations:

1. **Parlor** — home, current fantasy week, activity, standings, Tuesday Slice
2. **Underground** — blackjack, slots, prop board, token leaderboard, peer side bets
3. **Loot** — available loot boxes, collection inventory, seasonal drops
4. **Basement** — personal basement, character customization, other managers' basements

Admin users receive a separate commissioner control entry that does not displace core player navigation.

Aim for any common action to be reachable within three taps.

## 4. Homepage Layout

The parlor is the visual shell. The information hierarchy should remain immediately understandable even if environmental art is disabled or simplified.

Priority order:

### Current Moment

Show the most relevant current state:

- live or upcoming matchup during the fantasy week
- final result after games conclude
- offseason status when the league is closed

### Tony's Tuesday Slice

When a new issue publishes, it becomes the dominant homepage callout.

Presentation:

- a newspaper lands or rests on the counter
- light steam or fresh-pizza visual treatment
- title: **Tony's Tuesday Slice**
- tagline: **Fresh Out of the Oven**
- one-time release animation per issue, then direct access

### League Pulse

A concise snapshot, not a second Sleeper dashboard:

- standings summary
- notable streak or fraud state when genuinely meaningful
- current token leader
- relevant active event

### Social Activity

Show only notable events such as:

- legendary pull
- major casino swing
- new content launch
- championship or record
- rare NPC appearance
- accepted real-money side bet

## 5. In-World Navigation Landmarks

The environment may provide thematic shortcuts:

- newspaper rack or counter → Tuesday Slice
- vending machine or claw machine → loot shop/opening flow
- suspicious back door → underground casino
- basement stairs/door → basement directory
- fantasy board/TV → standings and matchup detail

These shortcuts supplement—not replace—clear navigation labels.

## 6. League-Member Presence

Customized league characters rotate through the parlor based on context.

Appearance factors may include:

- recent fantasy result
- notable trade
- legendary pull
- token-leader status
- seasonal event
- current matchup
- recent login or activity

Characters should not all appear at once. Their equipped cosmetics, auras, and eligible animations should render consistently across the parlor, basements, and casino.

## 7. Underground Casino Entry

First visit only:

- draw attention to a suspicious back door with light and music
- Tony briefly reveals the underground area
- keep the sequence short and skippable

Returning visits open directly.

The underground environment should feel more like a Nintendo-era minigame room than a realistic sportsbook:

- colorful
- tactile
- instantly readable
- fast rounds
- exaggerated reactions

Real-money peer betting is visually separated through "Tony in disguise," who explains clearly that the site is recording an agreement and not handling money.

## 8. Basement Experience

Every manager has a separate permanent basement.

Keep customization curated and mobile-friendly.

Primary display categories:

- one or two collectible shelves
- wall items/decor
- character appearance, outfit, and aura
- equipped entrance or visitor animation
- room theme

Do not require free-form furniture placement.

Players choose which owned items occupy available slots. The system handles responsive positioning.

### Themes

Offer approximately 5–10 starter themes at first basement setup. Managers may change themes later. More distinctive themes can be unlocked through loot boxes or seasonal content.

### Interactive Items

Selected items may respond to tapping/clicking with:

- short animation
- sound
- lighting change
- Tony or character reaction

Interaction must be reliable, quick, and optional.

### Visiting

Visitors can:

- inspect displayed items
- see the owner's equipped character and aura
- trigger allowed interactive objects
- see the owner's equipped entrance/visitor animation

There is no basement rating, clout score, or prestige level.

## 9. Loot-Box Experience

Opening flow:

1. Select box and confirm token price.
2. Server confirms purchase and determines outcome.
3. Short visual anticipation.
4. Rarity reveal.
5. Item reveal and inventory update.
6. Legendary events publish to social activity.

Target duration:

- common/rare: approximately 1–3 seconds
- epic: approximately 2–4 seconds
- legendary: approximately 3–6 seconds

All opening animations are skippable. Skipping never changes the result.

## 10. Tony's Tuesday Slice UI

Use one continuous, animated scroll—not multiple pages and not a PDF imitation.

It should contain only the selected 4–5 stories and optional concise release notes.

Design tools:

- bold headline treatment
- newspaper/pizza-menu texture
- manager sprites or matchup visuals
- short stat callouts
- Tony quotes
- small scroll-triggered animations

Avoid dense walls of text, excessive recurring sections, and forced awards.

## 11. Draft-Night TV Mode

Draft night is in person with a manual board. The site complements rather than replaces it.

TV mode should provide:

- large readable recent-pick display
- Tony's short ADP-based reaction
- reach/value detection
- optional ticker for league bets or major activity
- no requirement for managers to interact with the site during every pick

Reactions must be prewritten/template-driven and based on verified ADP deltas.

## 12. Animation and Sound Principles

Animations should reward attention, not block access.

Use animation for:

- legendary reveals
- rare NPC entrances
- character emotes
- casino outcomes
- content launches
- meaningful state changes

Avoid:

- repeated onboarding sequences
- unskippable dialogue
- long page transitions
- effects that obscure navigation
- constant screen shake

Provide global sound controls and respect muted devices. Audio should never autoplay aggressively before user interaction.

## 13. Loading and Error States

Primary loader should use a spinning or animated Tony's Pizza logo.

The Bapple tree may appear as a very rare easter egg, not the default brand loader.

Errors should remain in-world but clear. Example:

> Tony couldn't reach Sleeper. Your saved league data is still safe. Try again.

Never hide a serious failure behind a joke alone.

## 14. Responsive and Accessibility Requirements

- Build from the mobile layout first.
- Use semantic controls and keyboard navigation on desktop.
- Maintain readable contrast despite textured backgrounds.
- Provide reduced-motion behavior.
- Do not rely only on color to indicate rarity, status, or result.
- Add text alternatives for meaningful visual assets.
- Ensure modals, drawers, and game controls are usable at common phone sizes.

## 15. Performance Requirements

- Lazy-load nonessential room and character assets.
- Use sprite sheets or optimized atlases where appropriate.
- Cache stable Sleeper and item metadata.
- Avoid loading every collectible on initial visit.
- Keep the critical homepage usable before environmental art finishes loading.
- Degrade gracefully on slower connections.

## Final UX Principle

Tony's Pizza should feel like a game world immediately, while remaining as easy to navigate as a polished modern mobile app.
