# 06 — Art Bible: Pixel Style and Asset Rules

**Version:** 2.0  
**Status:** Canonical specification  
**Primary question:** What should Tony’s Pizza look, sound, and feel like?

---

## 1. Purpose

This document establishes the visual and audio language for Tony’s Pizza Fantasy Football Hub.

The product should feel like a polished interactive world inspired by a 1990s or early-2000s neighborhood pizza arcade in Metro Detroit. It should evoke memory without becoming an unreadable collage of nostalgia.

The design must balance:

- warmth;
- mischief;
- collectibility;
- clarity;
- restrained arcade energy;
- modern usability.

The target is not a generic “retro website.” It is a believable, specific place.

---

## 2. Core Art Direction

### 2.1 The place

Tony’s Pizza should feel like:

- red-and-white checkered table covering;
- worn wood and laminate;
- amber incandescent lighting;
- neon beer and sports signs;
- faded Detroit football memorabilia;
- arcade carpet;
- CRT glow;
- pizza-box print graphics;
- local newspaper clippings;
- a suspicious employee-only door.

The parlor is cozy and familiar above ground. The underground casino is brighter, stranger, and more energetic, but still belongs to the same building.

### 2.2 Emotional goals

Users should feel:

- “I know this place.”
- “Something funny might happen.”
- “I want to see what everyone else has.”
- “This looks handcrafted.”
- “I understand where to click.”

### 2.3 Visual hierarchy

Nostalgia must not compete with usability.

Every screen must clearly distinguish:

1. primary action;
2. current status;
3. meaningful content;
4. decorative world-building.

Textures, props, scanlines, animation, and clutter must remain subordinate to interaction.

---

## 3. Pixel-Art Strategy

### 3.1 Hybrid presentation

Use pixel art for:

- characters;
- room environments;
- collectibles;
- short animations;
- scene props;
- game surfaces;
- illustrative moments.

Use crisp modern UI for:

- forms;
- tables;
- long text;
- admin tools;
- accessibility controls;
- dense statistics;
- account and security surfaces.

Do not force every interface element into low-resolution pixel art.

### 3.2 Resolution discipline

Choose a master pixel grid for each asset family and preserve integer scaling.

Recommended approach:

- character sprites authored at a fixed small canvas;
- room props authored to a consistent environmental grid;
- UI icons authored as a separate family;
- nearest-neighbor scaling for pixel assets;
- no fractional scaling that blurs edges;
- no mixed pixel density within the same scene.

The implementation team must document final base resolutions before producing the full asset library.

### 3.3 Silhouette first

Characters and collectibles must remain identifiable at small sizes.

Prioritize:

- strong silhouette;
- readable pose;
- limited internal detail;
- clear contrast from background;
- consistent facing direction and perspective.

---

## 4. Character Design

### 4.1 Shared character system

League-member characters should feel related without looking interchangeable.

Each character needs:

- default standing pose;
- idle animation;
- front or three-quarter portrait;
- expression variants;
- optional entrance animation;
- optional equipped aura;
- optional equipped costume or skin.

Character bodies should share enough structure to make animation production manageable.

### 4.2 Perspective

Choose one consistent world perspective for parlor and basement scenes. Do not mix top-down, side-view, and isometric assets in the same environment.

The exact perspective may be finalized during prototype evaluation, but the decision must be frozen before asset scale-up.

### 4.3 Animation restraint

Default animations should use few frames and strong poses.

Priorities:

- idle;
- walk;
- react;
- celebrate;
- lose;
- entrance;
- equipped special animation.

Animation should not delay navigation or block controls.

A user must be able to skip or reduce repeated animation.

---

## 5. Tony’s Visual Canon

Tony is a middle-aged neighborhood pizza-shop owner with the energy of a man who has seen every bad beat and claims to have predicted all of them.

Required traits:

- slightly balding;
- dark mustache or similarly strong face identifier;
- pizza apron;
- Detroit Lions-style football jersey beneath the apron without copying protected team artwork unless licensed or safely abstracted;
- cigarette tucked behind one ear;
- compact, expressive posture;
- confident, mildly exhausted expression.

Tony should evoke classic platform-game energy without copying Mario’s exact design, proportions, clothing, face, or protected iconography.

He may appear in different roles—shop owner, blackjack observer, event announcer—but he remains visibly the same person.

---

## 6. Environments

### 6.1 Tony’s Pizza Parlor

The homepage environment should contain a curated set of recognizable zones:

- counter or register;
- booths;
- wall memorabilia;
- newspaper location for Tuesday Slice;
- vending or claw-machine shortcut to collectibles;
- visible hallway or door to basements;
- suspicious back door leading toward the underground casino;
- seasonal decoration anchor points.

Not every object must be interactive. Interactive objects must clearly signal affordance.

### 6.2 Manager basements

Every manager owns a permanent basement.

Baseline room system:

- room shell or theme;
- shelf display zone;
- wall display zone;
- character zone;
- optional interactive prop zone;
- optional seasonal zone.

Placement is curated and slot-based. Do not implement unrestricted drag-and-drop furnishing.

Provide approximately five to ten starter basement themes over time, with a smaller polished subset in MVP.

### 6.3 Underground casino

The casino should feel inspired by colorful handheld or console mini-games, not a realistic casino floor.

Use:

- strong game-table silhouettes;
- chunky readable cards and chips;
- exaggerated reactions;
- simple animation;
- playful signs;
- Tony’s improvised decorations;
- token iconography rather than currency imagery.

Avoid:

- photorealistic gambling visuals;
- dark luxury-casino clichés;
- real sportsbook branding;
- manipulative jackpot effects.

---

## 7. Collectible Asset System

### 7.1 Collectible categories

Initial visual categories:

- physical shelf objects;
- signed football memorabilia;
- wall décor;
- character cosmetics;
- auras;
- entrance or idle animations;
- basement themes;
- lore objects.

### 7.2 Display requirements

Every collectible should define:

- inventory thumbnail;
- reveal artwork or sprite;
- display asset;
- rarity treatment;
- display-slot compatibility;
- optional interaction;
- optional sound;
- optional animation;
- accessible text label.

A collectible may reuse one source asset where appropriate, but the system must support separate inventory and world representations.

### 7.3 Signed memorabilia

Signed jerseys and football memorabilia are a major collection pillar.

Visual requirements:

- recognizable jersey form;
- framed and unframed variants where needed;
- signature region;
- player-era cues without copying protected photography;
- rarity-specific frame treatment;
- readable owner/player label in UI, not necessarily embedded into pixel art.

Use licensed or appropriately original representations. Do not assume team logos, player likenesses, or signatures can be copied freely.

---

## 8. Rarity Language

Rarity must be recognizable through more than color.

### Common

- simple frame;
- minimal reveal;
- no persistent effect;
- clean static presentation.

### Rare

- enhanced border or emblem;
- short sparkle or motion accent;
- slightly richer reveal.

### Epic

- distinctive frame geometry;
- stronger entrance animation;
- optional ambient effect;
- more prominent sound cue.

### Legendary

- unique reveal composition;
- special sound;
- environmental reaction;
- social-feed eligibility;
- optional item-specific animation;
- visually unmistakable presentation.

Color may reinforce rarity but must not be the only signal.

---

## 9. Legendary Reveal Sequence

A legendary pull should be a short event.

Recommended sequence:

1. box anticipation;
2. brief pause;
3. unique light or silhouette;
4. item reveal;
5. rarity and item name;
6. Tony or environment reaction;
7. clear action to continue;
8. optional social-feed notice.

The sequence should usually remain under several seconds and become skippable after the first viewing.

Do not imitate a specific commercial game’s reveal exactly.

---

## 10. Interactive Objects

Interactive collectibles are allowed only when they can be reliable, quick, and replayable.

Possible examples:

- CRT television;
- novelty singing fish;
- lava lamp;
- pinball machine;
- Bapple Tree;
- arcade cabinet;
- burn barrel.

Each interaction needs:

- an obvious trigger;
- a short result;
- a cooldown if it contains a rare joke;
- no disruption to navigation;
- reduced-motion behavior;
- keyboard and touch accessibility.

Do not mark a prop as interactive if it only produces an inconsistent decorative effect.

---

## 11. UI Art Direction

### 11.1 Interface surfaces

Use modern responsive layout beneath themed surfaces.

Suitable motifs:

- menu boards;
- pizza coupons;
- receipt strips;
- newspaper clippings;
- plastic table signs;
- arcade labels;
- handwritten Tony notes.

The metaphor must never reduce readability.

### 11.2 Typography

Use decorative display type sparingly.

Requirements:

- highly readable body font;
- strong hierarchy;
- adequate line spacing;
- no long paragraphs in pixel fonts;
- accessible contrast;
- numerical tables aligned clearly;
- fallback fonts that preserve layout.

### 11.3 Textures

Textures should be subtle and optimized.

Use:

- light paper grain;
- restrained checkers;
- occasional grease marks;
- soft CRT treatment;
- worn signage.

Avoid full-screen heavy noise, aggressive scanlines, or high-frequency patterns behind text.

### 11.4 Responsive behavior

The world must work on phone, tablet, and desktop.

Desktop may present the parlor as a spatial scene. Mobile may reorganize the same destinations into a vertically guided layout while retaining environmental flavor.

Do not shrink an entire desktop scene until targets become unusable.

---

## 12. Motion Design

Motion should communicate:

- selection;
- rarity;
- state change;
- character;
- reward.

It should not become constant background movement.

Rules:

- preserve a calm default state;
- avoid multiple competing loops;
- stop or simplify motion when offscreen;
- respect `prefers-reduced-motion`;
- provide skip behavior for repeat cinematics;
- avoid flashes that create accessibility risks;
- keep loading animations honest about actual loading.

---

## 13. Audio Direction

Audio is optional by default and must never surprise users at high volume.

Sound categories:

- UI tick or selection;
- door or environment cue;
- box opening;
- rarity reveal;
- casino result;
- rare NPC sting;
- seasonal ambience;
- Tony reaction.

Requirements:

- master mute;
- separate music/effects controls if music is introduced;
- conservative default volume;
- no audio required to understand an event;
- no copyrighted music or recognizable commercial jingles without rights;
- compressed, web-appropriate formats.

Rare audio cues should remain rare.

---

## 14. Seasonal Art

Seasonal systems should reskin or decorate existing structures rather than replace the whole visual language.

### Halloween

- dimmer ambience;
- haunted props;
- restrained fog;
- themed box;
- optional ghost or rare event.

### Thanksgiving

- football-heavy décor;
- warm autumn palette;
- food-table accents;
- rivalry presentation.

### Christmas

- lights;
- winter window treatment;
- wrapped-box motifs;
- Santa-style Tony variant that remains recognizably Tony.

All seasonal assets require explicit activation windows and clean fallback states.

---

## 15. Casino Game Art Scope

Launch:

- blackjack;
- slots.

Prepared but disabled:

- roulette.

Removed from current scope unless later approved:

- Crash or similarly named multiplier game.

Blackjack and slots must share the casino’s visual language while remaining immediately understandable.

Cards, totals, bet sizes, win/loss outcomes, paylines, and token changes must be legible without relying on animation.

---

## 16. Asset Production Rules

Every asset requires metadata:

- canonical name;
- asset type;
- source;
- creator;
- license or rights status;
- version;
- dimensions;
- animation frame data;
- rarity if applicable;
- display surfaces;
- alt text;
- active status.

Do not ship an asset with unclear rights.

### Naming convention

Use stable lowercase identifiers with hyphens or snake case consistently.

Examples:

- `character_tony_idle_v1`
- `collectible_bapple_tree_legendary`
- `basement_theme_wood_paneling`
- `npc_cottage_inn_entrance`
- `sfx_legendary_reveal_01`

Do not use filenames such as `final-final-new2.png`.

### Organization

Recommended asset families:

- `/characters`;
- `/npcs`;
- `/collectibles`;
- `/basements`;
- `/parlor`;
- `/casino`;
- `/ui`;
- `/seasonal`;
- `/audio`;
- `/fonts`;
- `/source`.

Production files and optimized web exports must be separated.

---

## 17. AI-Assisted Asset Generation

AI tools may assist concept exploration and asset production, but generated assets must be reviewed for:

- stylistic consistency;
- anatomy and object errors;
- accidental trademarks;
- copied characters;
- legibility at target size;
- animation compatibility;
- licensing and provider terms;
- continuity across frames.

Do not ask an image model to create “Mario as a pizza owner” or reproduce a living artist’s exact style. Describe original visual traits instead.

Generated art does not become canonical until approved and entered into the asset registry.

---

## 18. Performance Requirements

Visual ambition must not compromise responsiveness.

Requirements:

- optimized image formats;
- sprite sheets or atlases where useful;
- lazy loading for offscreen basement assets;
- preloading only for imminent reveals;
- size budgets for major routes;
- no unbounded animated GIF usage;
- pause hidden animations;
- graceful low-bandwidth fallback;
- stable layout while assets load.

The homepage must become interactive before every decorative asset finishes loading.

---

## 19. Accessibility Requirements

The visual system must include:

- sufficient contrast;
- keyboard-accessible interactions;
- visible focus states;
- text alternatives;
- non-color rarity indicators;
- reduced-motion mode;
- captions or text equivalents for audio-significant events;
- scalable text;
- touch targets appropriate for mobile.

Pixel art is decoration and world-building. It cannot replace accessible labels.

---

## 20. Acceptance Criteria

The art system is ready when:

- Tony is recognizable at small size;
- all character assets share a frozen perspective and scale;
- collectible rarity is readable without color alone;
- parlor destinations are visually obvious;
- mobile layouts do not depend on a shrunken desktop scene;
- legendary reveals are short and skippable;
- reduced-motion behavior exists;
- audio is controllable;
- asset rights are recorded;
- protected logos and likenesses are not casually copied;
- performance budgets are documented;
- every interactive prop has a reliable interaction.

---

## 21. Final Principle

Tony’s Pizza should look like a place the league has been visiting for years—even though it has never existed.

The nostalgia earns attention. The clarity keeps people there.
