# 05 — Content Bible and Dialogue

**Version:** 2.0  
**Status:** Canonical specification  
**Primary question:** How should the product communicate when live AI is not writing the Tuesday Slice?

---

## 1. Purpose

This document defines the written voice of Tony’s Pizza Fantasy Football Hub outside of Tony’s Tuesday Slice.

It governs:

- interface copy;
- notifications;
- system messages;
- handcrafted dialogue;
- event text;
- loot-box reveals;
- casino reactions;
- draft-night reactions;
- basement interactions;
- social-feed announcements;
- error and empty states.

It does **not** define Tony’s full personality, league-member canon, world lore, or the Tuesday Slice editorial workflow. Those belong in their dedicated files.

The core content objective is simple:

> Make every interaction feel like it came from the same strange neighborhood pizza parlor, without making the interface harder to use.

Clarity comes first. Personality enhances clarity; it must never replace it.

---

## 2. Content Architecture

All product text belongs to one of four layers.

### 2.1 Functional UI copy

Examples:

- navigation labels;
- form labels;
- confirmation messages;
- validation errors;
- settings;
- admin controls;
- status indicators.

Functional copy must be concise and immediately understandable. Flavor text may appear beneath or beside it, but never obscure the action.

**Good**

- `Open box`
- `You need 75 more tokens.`
- `Sleeper data last synced 8 minutes ago.`

**Bad**

- `Tony says the oven is cold and therefore your mysterious prize cannot currently emerge.`

### 2.2 Handcrafted character dialogue

This includes Tony, league-member characters, dealers, and approved lore NPCs.

Dialogue must come from curated pools, templates, conditional rules, or admin-authored content. It must not invoke live AI at runtime.

### 2.3 Dynamic templated content

Templates may insert verified values such as:

- manager display name;
- token amount;
- collectible name;
- rarity;
- matchup result;
- week;
- player name;
- transaction type.

Every variable must be supplied by validated application data. Missing variables must cause the template to be skipped or replaced by a safe generic line.

### 2.4 Generated editorial content

Live AI-generated prose is reserved for Tony’s Tuesday Slice and its controlled review pipeline. It must never be used to generate ordinary page copy, casino dialogue, random NPC dialogue, or transactional notifications.

---

## 3. Voice Principles

### 3.1 Sound like a place, not a chatbot

The voice should resemble a local pizza-shop owner and his regulars joking across the counter.

Use:

- short, punchy sentences;
- occasional exaggeration;
- natural contractions;
- specific references;
- restrained pizza-shop language;
- affectionate trash talk;
- confident declarations that are clearly comedic.

Avoid:

- corporate language;
- analytical jargon in user-facing copy;
- excessive meme slang;
- generic “AI humor”;
- overexplaining the joke;
- constant exclamation points;
- forced pizza metaphors in every line.

### 3.2 Write for friends who already know one another

The site is private and personalized. It does not need to explain every relationship or inside joke.

**Good**

> Tony still doesn’t trust that Bapple Tree.

**Bad**

> The Bapple Tree is an inside joke among league members because...

### 3.3 Roast decisions, not human worth

The humor can be ruthless, profane, or dramatic when appropriate, but it should target:

- lineup decisions;
- trades;
- fantasy outcomes;
- casino choices;
- bad luck;
- excessive confidence;
- familiar harmless habits.

Do not target protected traits, real trauma, health, finances, employment insecurity, relationships, or other sensitive personal matters unless the commissioner has explicitly approved a narrowly scoped joke for this private group.

### 3.4 Accuracy beats comedy

No copy may invent:

- scores;
- records;
- players;
- trades;
- injuries;
- token balances;
- collectibles;
- league settings;
- historical events.

If the system cannot verify a fact, it must not state it.

---

## 4. Dialogue System

### 4.1 Dialogue records

A dialogue entry should support:

- `id`;
- `speaker`;
- `surface`;
- `trigger_type`;
- `required_conditions`;
- `excluded_conditions`;
- `template_text`;
- `weight`;
- `cooldown_days`;
- `max_uses_per_season`;
- `active`;
- `season_scope`;
- `lore_tags`;
- `safety_notes`;
- `created_by`;
- `updated_at`.

Dialogue must be content-managed rather than buried across components.

### 4.2 Selection rules

When a dialogue moment occurs:

1. Identify the surface and trigger.
2. Filter to active entries.
3. Enforce required and excluded conditions.
4. Enforce per-user, global, and lore cooldowns.
5. Remove entries with unresolved template variables.
6. Apply weights only after eligibility is established.
7. Select one entry.
8. Record the use in the dialogue usage log.

The fallback must always be a plain, valid line. A missing joke must never break an interaction.

### 4.3 Repetition control

The site should feel authored, not like a slot machine repeating its loudest line.

Use:

- local cooldowns for the exact line;
- broader cooldowns for a joke or lore tag;
- seasonal usage caps;
- recent-history exclusion;
- lower probability for especially cinematic dialogue.

Do not show the same distinctive line to the same manager twice in a short period.

### 4.4 First-time versus repeat interactions

First encounters may be longer and more theatrical. Repeat interactions should be quick.

Example:

**First Cottage Inn event**

- door burst animation;
- screen shake;
- sound cue;
- “WHERE’S BRANDON?!”;
- brief reaction beat.

**Later appearances**

- abbreviated entrance;
- shorter line;
- immediate return to the user’s task.

---

## 5. Tony Dialogue Rules

Tony is the most frequent character, but he should not speak on every click.

He may appear in:

- homepage greetings;
- loot-box reveals;
- casino reactions;
- draft-night feedback;
- empty states;
- seasonal announcements;
- system milestones;
- occasional basement moments.

Tony’s full canon is defined in `12_TONY_PERSONALITY_BIBLE.md`.

### 5.1 Tony’s sentence style

Prefer:

- one to three short sentences;
- a confident first line;
- one comedic turn;
- an optional dry final tag.

Example:

> Legendary. Signed. Completely unnecessary.  
> Tony approves.

### 5.2 Tony phrases

Recurring phrases may include:

- “Fresh outta the oven.”
- “I have questions.”
- “The oven has spoken.”
- “That’s burnt crust.”
- “Somebody explain this to me.”
- “The pizza doesn’t lie.”

These are seasoning, not catchphrases to repeat constantly.

### 5.3 Cursing

Cursing is allowed because the site is for a private adult friend group.

Rules:

- use it for emphasis, not as filler;
- do not place profanity in essential labels;
- avoid profanity in first-run onboarding;
- allow the commissioner to globally reduce or disable explicit dialogue;
- never let profanity become the only source of humor.

---

## 6. League-Member Character Dialogue

Every manager may have a character profile and curated dialogue pool.

Dialogue may reflect:

- known fantasy habits;
- rivalries;
- established personality;
- approved recurring jokes;
- current verified context;
- equipped character cosmetic or entrance animation.

The system must not invent traits for a manager whose canon is incomplete. Zack, for example, should initially receive neutral or event-based dialogue until his personality is documented through real league history or commissioner input.

Manager dialogue should be distributed. The same high-roast member must not become the default punchline for every surface.

---

## 7. NPC Philosophy

NPC hierarchy:

1. Tony;
2. league-member characters;
3. established lore NPCs;
4. future commissioner-approved NPCs.

Do not generate random NPCs simply to fill space.

Rare characters are valuable because they are rare. Their probability, cooldown, and eligible surfaces must preserve surprise.

Approved lore examples include:

- Cottage Inn Delivery Guy;
- Clooner;
- Feasel;
- “Just 18” soccer player.

Detailed canon belongs in `14_WORLD_LORE_AND_CANON.md`.

---

## 8. Surface-Specific Copy

### 8.1 Homepage

Homepage copy should orient the user immediately.

Required priorities:

1. what happened;
2. what is new;
3. what the user can do next;
4. flavor.

Examples:

- `Tuesday Slice is ready`
- `Week 7 data synced`
- `You have 640 tokens`
- `The back door is making that noise again.`

### 8.2 Loot boxes

The reveal copy should escalate with rarity.

**Common**

> Not glamorous. Still yours.

**Rare**

> Alright. Now we’re getting somewhere.

**Epic**

> Tony stopped pretending not to care.

**Legendary**

> The whole shop just heard that.

The collectible name and rarity must remain visually and textually unambiguous.

### 8.3 Casino

Casino language should feel playful and fictional, not like a real-money betting product.

Examples:

- `Bet 25 tokens`
- `Dealer has 17`
- `You won 50 tokens`
- `Tony says double down. Tony is not responsible for Tony’s advice.`

Do not use manipulative retention language, false urgency, loss-chasing prompts, or language that pressures users to continue.

### 8.4 Errors

Errors should be useful first.

Pattern:

1. state what failed;
2. explain what remains safe;
3. provide the next action;
4. optionally add one light flavor line.

Example:

> **Sleeper sync failed.** Your existing data is unchanged. Try again in a few minutes or ask the commissioner to run a manual sync. Tony checked the oven; this one is not the oven.

### 8.5 Empty states

Empty states should explain why the area is empty and what unlocks it.

Example:

> **No collectibles displayed yet.** Open a box, then choose an item from your inventory to place on the shelf.

Do not shame the user for having no content.

### 8.6 Notifications

Notifications should be reserved for meaningful events:

- Gazette published;
- legendary collectible pulled;
- silent-auction result;
- commissioner announcement;
- major seasonal unlock;
- account or security action.

Routine actions should use inline feedback rather than noisy notifications.

---

## 9. Draft-Night Content

Draft night supplements the physical draft board. It does not replace it.

The application may display live reactions based on verified ADP comparisons.

Example categories:

- major reach;
- reasonable reach;
- near ADP;
- value;
- major value.

The threshold model must be configurable and should avoid declaring certainty about player quality.

**Good**

> Alex took him 19 picks ahead of ADP. Tony respects the confidence and fears the consequences.

**Bad**

> This is objectively the worst pick of the draft.

Draft reactions must not delay pick entry or the primary display.

---

## 10. Social Feed Content

The social feed is a record of significant world activity, not an exhaustive transaction log.

Eligible posts include:

- legendary pull;
- newly equipped legendary animation;
- major auction result;
- notable casino swing above configured thresholds;
- new Tuesday Slice;
- championship or season milestone;
- commissioner announcement.

Do not post:

- every box opening;
- every token transaction;
- every casino hand;
- every basement rearrangement.

Every social-feed item must link to a real persisted event.

---

## 11. Seasonal Content

Seasonal copy may temporarily alter:

- homepage greetings;
- loot-box names;
- reveal lines;
- Tony’s appearance descriptions;
- shop announcements;
- basement decorations;
- event messages.

Supported initial seasons:

- Halloween;
- Thanksgiving;
- Christmas.

Seasonal content must be controlled by date windows and feature flags. It must deactivate cleanly without code deletion.

The 2027 anniversary system may be supported in data models but must not be presented as active before the commissioner enables it.

---

## 12. Content Safety and Administration

The commissioner must be able to:

- preview dialogue;
- activate or deactivate entries;
- change weights and cooldowns;
- add restrictions;
- edit text;
- view recent usage;
- test triggers in sandbox mode;
- retire stale jokes;
- reduce explicit language;
- disable a character or lore tag globally.

All content changes should be audit logged.

User-visible content sourced from admin input must be treated as untrusted text and safely escaped.

---

## 13. Prohibited Patterns

Do not use:

- “As an AI...”
- “Let’s dive in.”
- “Based on your manager profile...”
- “According to advanced analytics...” unless the interface is explicitly presenting a verified metric;
- generic motivational quotes;
- constant fourth-wall breaks;
- fake quotations attributed to real users;
- invented private thoughts;
- unexplained acronyms;
- jokes that require the interface to misstate a fact.

Do not make Tony the narrator of every neutral system action. The world should breathe without constant commentary.

---

## 14. Acceptance Criteria

The content system is ready when:

- every runtime dialogue surface uses curated content or verified templates;
- no ordinary interaction calls a generative model;
- exact lines and lore tags have cooldown enforcement;
- missing variables fail safely;
- all copy remains understandable without the joke;
- profanity can be centrally controlled;
- admin changes are audited;
- usage can be inspected;
- rare NPCs remain rare;
- errors tell users what to do;
- no content invents fantasy or account facts.

---

## 15. Final Principle

The best line is not the line with the most jokes.

It is the line that feels like this exact league, in this exact pizza shop, reacting to something that actually happened.
