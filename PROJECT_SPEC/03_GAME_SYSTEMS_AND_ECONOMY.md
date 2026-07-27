# 03_GAME_SYSTEMS_AND_ECONOMY.md

Version: 2.0

## 1. Purpose

This document defines Tony Tokens, fantasy rewards, loot-box purchasing, collectibles, casino games, prop betting, real-money peer bets, season close, and the final auction.

## 2. Economy Goals

The economy should:

- reward fantasy participation and success
- create meaningful spending decisions
- preserve collectible scarcity
- support fun risk without enabling farming
- reset cleanly each season
- generate social stories

The economy should not encourage real-money purchasing, endless grinding, or pay-to-win advantages.

## 3. Tony Tokens

Tony Tokens are the single in-game currency.

They may be used for:

- loot boxes
- blackjack
- slots
- fantasy prop bets
- future roulette
- final-season silent auction
- commissioner-enabled limited token sinks

Tokens never change Sleeper lineups, scores, waiver position, FAAB, or league competitive rules.

## 4. Token Sources

Fantasy performance is the primary source.

Initial baseline values may include:

- first-season login/start balance: 250
- matchup win: 150
- weekly high score: 400
- special fantasy accomplishment: commissioner-configured tokens
- championship and season awards: substantial token rewards plus permanent trophy/medal items where specified

Final numbers must be configurable and reviewed against simulations before launch.

Routine rewards grant **tokens only**. They do not directly grant loot boxes.

Daily login rewards and zero-balance safety grants should not be part of the default MVP economy unless simulations prove they are needed. If enabled later, place them behind feature flags and strict limits.

## 5. Token Ledger

Every balance change must create an immutable transaction record containing:

- user
- season
- signed amount
- reason code
- human-readable description
- source entity or event when applicable
- created timestamp
- idempotency key
- administrator identity when manually adjusted

Never treat `season_users.tokens` as the only record of truth. The displayed balance should reconcile to the ledger.

## 6. Season Reset

Tokens do not carry over.

At the commissioner-approved season close:

1. Freeze new token wagering and purchases.
2. Resolve or void outstanding seasonal wagers.
3. Archive final token standings and transaction history.
4. Reset next season's active balance according to configured starting rules.
5. Preserve all permanent ownership and history.

## 7. Spend-Down Countdown

During the final playoff period, display a prominent countdown explaining:

- the exact token-expiration date
- the silent-auction close date
- the final date for loot-box purchases and casino use

Do not run a discounted sale. The message is simply that tokens must be spent because they will not carry over.

## 8. Final-Season Silent Auction

The auction is a social token sink near the end of the playoffs.

Managers may list eligible owned items for token bids. The commissioner can restrict which categories may be listed.

Required rules:

- auction closes several days before full season shutdown
- bids remain hidden until close unless commissioner chooses another mode
- winning bid transfers item ownership and tokens atomically
- seller receives tokens in time to spend them before expiration
- users cannot list equipped or protected trophies unless explicitly allowed
- auction transactions are permanent and audited
- cancellation and tie rules are defined before launch

## 9. Collectible Categories

Keep categories focused:

### Display Collectibles

Items for one or two basement shelves, including nostalgic objects and inside-joke artifacts.

### Wall Items and Decor

Signed jerseys, banners, posters, neon signs, championship displays, and seasonal decor.

### Character Cosmetics

Hair, outfits, hats, accessories, held items, and other visual layers.

### Auras and Animations

High-value cosmetic effects. Most animations should be Epic or Legendary.

### Basement Themes

Room-wide visual environments. Basic themes are available initially; premium themes enter loot pools or seasonal events.

Sports memorabilia—especially signed football jerseys and notable Detroit football legends—is the premium traditional collection category.

## 10. Rarity

Use four tiers:

- Common
- Rare
- Epic
- Legendary

Rarity affects:

- drop probability
- reveal treatment
- visual/audio complexity
- social announcement eligibility
- auction desirability

Legendary items require a unique reveal moment and activity-feed announcement.

## 11. Loot Boxes

Loot boxes are purchased only with Tony Tokens.

Recommended launch tiers:

### Standard Pizza Box

Lower price, primarily Common and Rare, small Epic chance, no or extremely small Legendary chance depending on final simulation.

### Supreme Pizza Box

Higher price, better Rare/Epic odds, controlled Legendary chance.

### Seasonal Box

Limited-time pool for Halloween, Thanksgiving, Christmas, and future events.

Exact costs and probabilities belong in database configuration, not hardcoded frontend logic.

The commissioner must be able to preview simulated distribution before publishing changes.

## 12. Duplicate Handling

Do not automatically refund 50% of the entire box price for every duplicate; that can destabilize the economy.

Preferred design:

- duplicate items convert to configurable salvage value based on item rarity
- salvage may be represented as Tony Tokens in MVP or a future separate crafting currency
- all conversions are server-authoritative and logged

Claude should recommend the simplest balanced MVP option after simulation.

## 13. Casino Design Direction

Casino games should draw from the simple, colorful gambling minigames of **Super Mario 64 DS**:

- instantly understandable
- short rounds
- tactile animation
- one-more-try energy
- personality over realism

The underground casino should not resemble DraftKings or a serious real-money casino product.

## 14. Launch Games

### Blackjack

- fast single-player hands against the house
- dealer may be represented by a rotating customized league character or Tony
- server-authoritative deck and settlement
- configurable wager limits
- concise contextual reactions

### Slots

- simple wager choices
- server-authoritative outcome
- Tony's Pizza visual symbols
- transparent internal odds and configurable payout table
- short, skippable animation

No direct collectible drops from ordinary casino outcomes at launch unless explicitly balanced later. Casino wins primarily return tokens.

## 15. Roulette

Roulette should be designed and technically scaffolded early, but disabled through a feature flag.

It should not appear in navigation or public assets until the commissioner publishes it as a content drop.

Do not let hidden roulette work delay the first-season MVP.

## 16. Anti-Farming and Responsible Limits

The casino must include:

- server-authoritative outcomes
- request idempotency
- wager limits
- rate limits
- session and daily loss/play monitoring
- no client-calculated payouts
- no free-token loop that can be automated

The expected value should prevent reliable long-term token farming.

## 17. Fantasy Prop Bets With Tokens

Props are generated from verified fantasy context and should aim to create fair, interesting decisions.

Good props:

- a manager over/under near a data-informed weekly line
- whether a recent trade acquisition outscores the player sent away
- whether a traded-away player causes measurable trade revenge
- a balanced rivalry matchup proposition

Bad props:

- arbitrary lines such as 150 points without context
- events directly controlled by a manager, such as whether Alex makes a trade
- propositions that cannot be settled objectively

### Line Creation

Use available inputs such as:

- season average
- recent rolling average
- projection
- matchup context
- lineup availability
- scoring distribution

The backend should generate a candidate line designed to be approximately balanced, then verify that the settlement data is available.

AI may propose narrative wording but may not set or settle the line.

## 18. Real-Money Peer Side Bets

Real-money bets are separate from Tony Tokens.

Flow:

1. User selects another league member.
2. User enters clear terms and a dollar amount.
3. "Tony in disguise" explains that this is a peer agreement.
4. Target user accepts or declines.
5. Accepted terms lock.
6. The site settles automatically only when objective data rules are defined; otherwise commissioner settlement is required.
7. The site records the debt ledger and may provide payment deep links.

The platform must never:

- hold funds
- transfer money
- take a percentage
- create an open public betting market
- imply that Tony's Pizza is a licensed sportsbook

Legal and platform-policy review is required before public deployment of this feature, even for a private group.

## 19. Leaderboards

Primary economy leaderboard:

- current-season token balance

Optional historical statistics:

- all-time tokens earned
- largest casino win
- largest casino loss
- total casino action

At season end, the manager with the most tokens may receive a permanent special award and configured high-value rewards, but the award design must not create a reason to avoid spending tokens during the final week. Resolve this tension explicitly before implementation—for example by snapshotting the token leader before the final spend-down period.

## 20. Activity and Gazette Eligibility

Only notable economy events enter the activity feed or Tuesday Slice.

Examples:

- legendary pull
- exceptional casino swing relative to the season economy
- major accepted side bet
- token-leader change near season end
- auction record

Ordinary spins, hands, and purchases are not news.

## Final Economy Principle

Fantasy performance creates opportunity. Tokens create choices. Collectibles create permanent memories.
