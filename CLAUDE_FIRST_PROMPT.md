# First Claude Code Prompt

Read the entire `PROJECT_SPEC` folder before writing any code.

Treat every Markdown file as part of one product specification. The final `README.md` contains the required manifest, reading order, source-of-truth hierarchy, and completeness check.

Do not begin implementation if any manifest file is missing.

Do not begin implementation yet.

First, provide the following:

1. Your understanding of the product and the complete player experience.
2. The core weekly return loop.
3. The product principles that must not be compromised.
4. A recommended technical architecture.
5. A recommended repository and domain structure.
6. A database-schema review, including any changes you recommend.
7. Your identity model for permanent users, league managers, seasons, and Sleeper roster IDs.
8. Your Sleeper synchronization and idempotency strategy.
9. Your token-ledger, loot-box, collectible, and basement integrity strategy.
10. Your Story Engine, fact-packet, AI generation, validation, review, and publication architecture.
11. Your admin, sandbox, feature-flag, backup, and season-transition architecture.
12. Your authentication, authorization, security, and rate-limiting plan.
13. Current hosting, framework, API, cost, licensing, legal, or platform risks that should be verified before implementation.
14. Every contradiction, unresolved decision, or missing requirement you detect.
15. The smallest polished MVP you recommend.
16. A phased implementation plan with dependencies and release gates.
17. A testing strategy covering unit, integration, end-to-end, security, accessibility, and synthetic season scenarios.
18. Anything you would simplify, defer, or change before the first line of code.

Important constraints:

- Sleeper is the fantasy-football source of truth.
- The application is a persistent social game layered on top of Sleeper, not a Sleeper replacement.
- Accuracy is more important than humor.
- All fantasy facts and economy values must be computed deterministically.
- Generative AI is reserved for Tony’s Tuesday Slice.
- All ordinary Tony, manager, NPC, casino, and UI dialogue must use curated content or validated templates.
- The league has defenses and no kickers.
- Collectibles persist across seasons.
- Seasonal tokens reset.
- Loot boxes are purchased with tokens.
- Blackjack and slots are the planned launch casino games.
- Roulette must remain disabled behind a feature flag until explicitly enabled.
- Do not introduce achievements, levels, clout, prestige, unrestricted room drag-and-drop, Crash, or real-money custody.
- Zack’s personality must not be invented.
- The first season of Tony’s Tuesday Slice requires commissioner approval before publication.
- Do not silently resolve material contradictions. Report them.

Optimize for correctness, maintainability, secure automation, simple architecture, polished user experience, responsive performance, accessibility, recoverability, long-term league history, and minimal weekly commissioner work.

Favor simple systems over clever systems.

Wait for my approval after presenting your review and plan. Do not write implementation code until I approve the architecture and MVP scope.
