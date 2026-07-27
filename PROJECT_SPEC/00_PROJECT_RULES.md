# 00_PROJECT_RULES.md

Version: 2.0

## Purpose

This document defines the non-negotiable rules for Tony's Pizza Fantasy. These rules override individual feature ideas and implementation convenience.

## 1. Build a Living Game, Not a Dashboard

Sleeper already handles core fantasy management. Tony's Pizza should transform the league into a persistent social game filled with stories, collectibles, gambling, personality, and history.

Every feature must answer at least one of these questions:

- Does this create a memorable league moment?
- Does this make managers want to return?
- Does this deepen ownership, rivalry, or social interaction?
- Does this preserve league history?

A standard statistics table is acceptable only when it supports a larger Tony's Pizza experience.

## 2. Accuracy Comes Before Entertainment

Wrong facts immediately destroy trust.

Authoritative facts must come from:

- Sleeper API data
- persisted application records
- commissioner-entered canon or corrections
- deterministic backend calculations

AI may exaggerate emotion, but it may never invent or alter:

- scores
- winners
- player performances
- trades
- standings
- records
- league rules
- token transactions
- loot outcomes
- casino outcomes

When data is missing or ambiguous, omit the claim or hold it for commissioner review.

## 3. AI Has a Narrow Role

Live AI generation is approved only for **Tony's Tuesday Slice**, using structured, verified story data.

Do not use live AI for:

- random Tony comments
- NPC dialogue
- item names or descriptions at runtime
- activity-feed messages
- casino reactions
- draft reactions
- loot reveals
- seasonal copy
- notifications

Those systems must use human-created and AI-assisted-at-development-time content libraries, selected by deterministic context rules.

## 4. The League Is the Best Content

Prioritize:

- real manager personalities
- actual fantasy outcomes
- established rivalries
- inside jokes
- historical league moments
- commissioner-added lore

Generic football jokes, random mascots, and forced memes are fallback content only.

Never explain an inside joke. Use it naturally or do not use it.

## 5. Do Not Overuse Personal Material

Personalities and inside jokes are seasoning, not scripts.

The system must:

- use context-sensitive triggers
- track recent usage
- enforce cooldowns
- vary targets and topics
- avoid reducing a manager to one repeated joke

Tony may favor or roast certain managers more than others, but the writing must still evolve with real events.

## 6. Fantasy Success Drives Progression

The main reliable source of Tony Tokens is fantasy-football performance.

Examples include:

- matchup wins
- weekly high score
- season accomplishments
- playoff accomplishments
- commissioner-approved special events

Casino games are entertainment and token-risk systems, not farming systems. Their expected value, limits, and reward structure must not make grinding more profitable than fantasy success.

## 7. Tokens Are Seasonal; Collections Are Permanent

At season close:

Reset or close:

- token balances
- active casino season statistics
- unresolved seasonal props
- weekly standings and active challenges

Preserve permanently:

- collectibles
- character appearance and equipped cosmetics
- unlocked animations
- basement themes and displayed items
- trophies and medals
- archived statistics
- Gazette issues
- lore and historical events

No token rollover currency or conversion system is planned. Managers receive advance warnings to spend their tokens before season close.

## 8. Loot Boxes Always Cost Tokens

Routine fantasy rewards grant tokens, not loot boxes.

Managers decide whether to spend tokens on:

- loot boxes
- casino games
- the final-season auction
- other commissioner-enabled token sinks

This preserves agency and keeps the economy understandable.

## 9. Preserve Scarcity

Collectibles should be curated, desirable, and slow to accumulate.

Avoid:

- excessive filler
- constant free boxes
- high legendary odds
- unlimited purchase loops
- rewards that allow one user to complete the collection quickly

Legendary items must feel like league-wide events.

## 10. First-Time Magic, Returning-Visit Speed

The first visit to an important location may include a short introduction.

Examples:

- Tony revealing the underground casino
- entering a basement for the first time
- the first loot-box opening

After the first visit, provide direct access. All nonessential animations must be skippable.

## 11. Mobile First

Design and validate for phone use before enhancing desktop.

Requirements:

- large touch targets
- readable type
- simple navigation
- fast asset loading
- smooth performance on ordinary phones
- no interaction dependent on hover
- no complex free-form placement required for basement use

Desktop may provide richer environmental detail and draft-night TV mode.

## 12. Use One Cohesive Art System

All characters, objects, environments, and animations must share:

- consistent pixel density
- perspective
- proportions
- lighting
- outline treatment
- animation timing

Do not mix unrelated AI-generated art styles or realistic assets with the established game world.

## 13. Progressive Revelation Is Intentional

The system should support finished content that remains hidden until published.

Examples:

- roulette prepared but disabled
- seasonal boxes activated later
- new NPCs released gradually
- new collectibles added in waves

Use feature flags and commissioner preview tools. Do not expose unfinished or unannounced content.

## 14. Commissioner Control Is Required

The commissioner must be able to:

- preview and publish features
- operate a fully isolated demo/sandbox mode
- manage seasons
- correct tokens and inventories with audit logs
- manage lore and joke cooldowns
- review Tony's Tuesday Slice
- trigger or rerun sync jobs safely
- archive and replace managers without erasing history

## 15. Build for Many Seasons

Never hardcode assumptions that only work in 2026.

All important records must be season-aware, and all permanent ownership must be independent of a specific season.

## 16. Keep the Scope Disciplined

For each proposed feature, decide whether it is:

- required for first-season identity
- valuable but deferrable
- future expansion

Do not sacrifice reliability, mobile performance, or the core weekly loop to add breadth.

## Final Rule

Tony's Pizza should feel chaotic, funny, and surprising to league members while remaining controlled, auditable, and accurate behind the scenes.
