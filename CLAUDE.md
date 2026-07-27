# Claude Code Instructions

This repository contains the complete product specification for **Tony’s Pizza Fantasy**.

Before planning or implementing any feature, read:

1. `README.md`
2. Every numbered file inside `PROJECT_SPEC/`, in order
3. `CLAUDE_FIRST_PROMPT.md`

The files inside `PROJECT_SPEC/` are the canonical product specification.

Do not begin implementation if any file listed in the manifest inside `README.md` is missing.

## Core Product Identity

Tony’s Pizza Fantasy is a persistent social game layered on top of Sleeper.

Sleeper remains the fantasy-football source of truth.

The product is built around weekly league stories, persistent collectibles, manager basements, fictional tokens, friendly trash talk, league history, inside jokes, and Tony’s Pizza Parlor as the central world.

This is not a Sleeper replacement and should not become a generic fantasy dashboard.

## Core Rules

- Accuracy is more important than humor.
- All fantasy facts must come from Sleeper or verified persisted application records.
- Generative AI is limited to Tony’s Tuesday Slice.
- Ordinary Tony, manager, NPC, casino, event, notification, and UI dialogue must use curated content or validated templates.
- The league uses defenses and has no kickers.
- Permanent manager identity must remain separate from seasonal Sleeper roster identity.
- Zack’s personality must not be invented.
- Collectibles persist across seasons.
- Seasonal tokens reset.
- Loot boxes are purchased with tokens.
- Token mutations must use an append-only ledger.
- Token, loot-box, casino, auction, and reward actions must be server-authoritative, transactional, auditable, and idempotent.
- Blackjack and slots are the planned launch casino games.
- Roulette must remain disabled behind a feature flag until explicitly enabled.
- Do not introduce achievements, levels, clout, prestige, unrestricted room drag-and-drop, Crash, or real-money custody.
- The first season of Tony’s Tuesday Slice requires commissioner approval before publication.
- Do not silently resolve material contradictions. Report them before implementation.

## Build Behavior

Before writing implementation code:

1. Confirm that the complete manifest from `README.md` is present.
2. Read the complete specification.
3. Follow `CLAUDE_FIRST_PROMPT.md`.
4. Present an architecture review, identified risks, unresolved decisions, recommended MVP, and phased implementation plan.
5. Wait for explicit approval.

Do not initialize the application, create migrations, write components, create API routes, generate production assets, or begin implementation until the architecture and MVP scope are approved.

## Source of Truth

When requirements conflict, follow the source-of-truth hierarchy in `README.md`.

Prefer the most specialized canonical document for a system after applying that hierarchy.

Examples are illustrative unless explicitly labeled as fixed requirements.

## Implementation Philosophy

Favor simple systems over clever systems, one polished vertical slice over many unfinished features, deterministic calculations over model inference, configuration over scattered hardcoding, recoverable operations over destructive shortcuts, responsive and accessible interfaces, strong data integrity, and minimal weekly commissioner work.

A feature is not complete merely because it appears visually. It must also be secure, tested, accessible, recoverable, and operationally manageable.
