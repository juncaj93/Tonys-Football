# The 2026-08-04 economy ruling — what was built and where the edges are

**Status:** shipped. The box costs **200**, every active seat is given **two free
boxes a season**, and a spare from a completed tier **converts to tokens**.

`docs/ECONOMY_SIMULATION.md` is the measurement. This is the runtime.

---

## 1. One ruling, three changes, and why they are one slice

The P3 simulation failed its first run and it failed four ways, which turned out
to be one finding: a median manager earning up to 550 tokens a week against a
**50-token box** bought 31.5 boxes a season against a range of 6–12, which
dragged legendaries to 8 league-wide against a target of 2–3.

**The legendary rate per opening was inside its range the whole time** (~2.4%).
The rate was right and the number of openings was wrong. So the commissioner's
ruling moved the price and explicitly did **not** touch the rarity table:

> Do not solve excess legendary volume by making individual boxes less exciting.

The other two changes exist because of what the first one costs. At 200 an
opening balance buys **one** box instead of five, so:

- **two seasonal grants** keep a manager who never wins a game opening something
  twice a year;
- **salvage** stops a completed tier turning every subsequent box into nothing.

Shipping the price without them would have been the ruling's first sentence
without its last two.

## 2. The price is one number in one place

`PROVISIONAL_ECONOMY.standardBoxPriceTokens`, stored per season in
`economy_configs` under a content hash, read by `economyFor`. **No component
holds a price.** `content/box-offer.md` had already anticipated this and said so
before it mattered:

> `{price}` is a variable rather than a word because the price is provisional
> until the P3 simulation. A line that says "fifty" would be silently wrong the
> day the simulation moves it, and nothing would fail.

The simulation moved it, and something *did* fail: `preview.test.ts` compares the
preview's literals against the rendered entry, and three of them still said
fifty. They now interpolate.

**`weeklyLineStakeTokens` was deliberately not re-derived.** It was set as a
fifth of a 50-token box, so a fifth of 200 would be 40. The ruling moved the box
price and nothing else, Tony's Line is flag-gated shut in v1 (`18 §3.4`), and
re-deriving a stake on a market no manager can reach would be inventing an
economy decision nobody asked for. The rationale in the code is marked stale on
purpose rather than quietly rewritten.

## 3. The grants are owed to a seat, not earned by anybody

`lib/counter/grants.ts`. Two milestones, `SEASON_OPENING` and `MIDSEASON`, and
the whole idempotency mechanism is `loot_boxes.grant_key UNIQUE` on a key that
names the occasion:

```
season-grant:<seasonId>:<milestone>:<userId>
```

There is no `SELECT ... WHERE already_granted` anywhere in the module. That check
is a race with a comfortable-looking body — two Tuesdays overlapping a deploy
both read "not yet" — and the unique index is what actually saves it.

**Keyed to the milestone, not to the moment.** `milestonesDue(week)` is monotonic:
once a milestone is due it stays due. That is what makes a **late-joining
manager** correct rather than a special case — a replacement seated in week 9
receives both boxes the first time the job runs, because both are owed to the
seat they now hold. It is also what makes the whole thing a **catch-up** rather
than a schedule: a failed Tuesday retried on Thursday, or an environment seeded
halfway through a season, settles the season's grants in one pass. A job that
granted only on weeks 1 and 7 would silently skip all three, and the silence is
the problem — nothing about a missing box looks like an error.

**Two callers, one key.** The seed grants the opening box (week 0), because
"season opening" means before a ball is thrown and the Tuesday job first runs
after week one. The Tuesday job grants both, every week. Whichever arrives first
is the only one that writes anything.

### What the grants deliberately are not

- **Not an achievement, level, streak or login calendar** — `16 §8`'s named
  non-goals. Every active manager gets the same two, at the same two moments,
  whatever their record.
- **Not coupled to Slice approval.** `16 §9` requires a person to approve the
  *paper*. Nothing makes a manager's free box wait on an editor, and the coupling
  would be invisible because the desk would look merely quiet.
- **Not available to a retired seat.** `season_memberships.is_active` is the
  whole eligibility rule, and it is the same column the rest of the product reads
  — no second opinion about who is in this league.
- **Not clawed back.** A manager who goes inactive *after* a grant keeps the box.
  Boxes hang off `users.id` and persist across seasons (`16 §5.1`); reclaiming
  one would be the first destructive operation in the economy and nothing asks
  for it.
- **Not written into a closed season.** Not because a box is seasonal — it is not
  — but because these are dated events, and writing 2024's opening box in 2026 is
  a record of something that did not happen.

## 4. Salvage is `16 §8`'s sentence, finally implemented in full

> roll rarity → pick an **unowned** item in that tier → if exhausted, salvage
> tokens. No pity timer.

M2 shipped the first clause and skipped the rest. `0014` ships the rest.

**The roll still decides, and it decides first.** `selectAward` receives a tier
from `resolveRoll` and never leaves it. A legendary roll stays legendary however
much of the catalog is owned — which is the ruling's §1 as a property of the
code rather than as an intention.

**Within the tier, the walk starts where the roll landed** and wraps. Starting at
the top of the tier would make the alphabetically-first unowned item the answer
to nearly every redirect, so a manager filling a set would receive it in
near-alphabetical order and the box would feel like a list.

**The values are `03 §12`'s, per rarity** — 10 / 20 / 35 / 60 percent of the box
price, so **20 / 40 / 70 / 120** — and explicitly not the flat half-price refund
that section rules out. They can climb that steeply because salvage is rare by
construction: a manager sees common salvage after owning all ten commons.

**Salvage's share of openings rises with the collection** — about 60% over five
seasons and 96% over fifty, because once a set is complete every further box is
salvage by definition. That is the shape to keep in mind when these are retuned:
not a rare consolation, but what a finished collection converts boxes into.

### The fourth lock

`openBox` already had three, all scoped to a *box*: `FOR UPDATE`,
`box_openings.box_id UNIQUE`, `collectibles.source_opening_id UNIQUE`. Selecting
an unowned item reads the manager's *collection*, and a read-then-write across
two different boxes is a race none of the three can see — both would find the
rolled item unowned and the manager would end with two copies.

So a **transaction-scoped advisory lock on the manager** is taken first, before
the box is even read. It serializes one manager's openings against each other and
nobody else's; two managers opening simultaneously never wait. It is taken before
the row lock, always, so the two are acquired in one order everywhere and cannot
deadlock.

### Why there is no `UNIQUE (user_id, slug)`

Under this policy a manager can never acquire a second copy, so the constraint
looks free. It is not.

Every database that has opened a box since M2 legitimately holds duplicates,
acquired under the rule that was live at the time — they are somebody's real
property. Retrofitting the index would either fail the deploy or require deleting
rows from a manager's shelf, and `collectibles_undeletable` exists to make that
second option impossible on purpose.

The schema comment that used to justify the absence — *"duplicates are an
ordinary outcome of a weighted table"* — was **wrong about the specification the
whole time**, and has been corrected rather than left standing. The absence
survives; its reason changed.

### What the database enforces instead

| Constraint | What it stops |
|---|---|
| `box_openings_salvage_pays_tokens` | a salvage with no amount, or an amount on an opening that kept its item |
| `box_openings_salvage_is_positive` | a salvage worth nothing |
| `box_openings_salvage_is_paid` | **a salvage with no ledger row behind it** — the ruling's "must never silently disappear", as a check constraint |
| `collectibles_never_from_salvage` | a converted spare also minting an item |
| `token_transactions.idempotency_key UNIQUE` on `salvage:<boxId>` | paying twice for one box |
| `box_openings_append_only` | editing what a spare was worth after the fact |

The idempotency key names the **box** and omits the amount, so a mid-season
reprice raises instead of quietly paying a second time at a second price.

### When salvage cannot be paid

A closed season, or a manager holding no seat in the open one. `openBox` answers
`salvage_unavailable` and **leaves the box unopened**. The two alternatives are
handing over a duplicate the rules forbid, or opening the box and paying nothing
— and the ruling's own wording rules out the second. Nothing is lost; the box is
still on the tray when they hold a wallet again.

## 5. What the plate says

A spare is a **fourth composition**, and it takes precedence over the other three
because all of them would be lies: nothing went on the shelf.

- the rarity word gains `· spare`;
- the meaning line says *why* — "You have every legendary. Tony gives you 120 for
  the spare." `16 §8` only converts once a tier is complete, so the sentence can
  name the achievement rather than only the consolation;
- the onward link reads "Look at the shelf" rather than "Put it on the shelf".

`?preview_stage=spare` photographs it, and `checkReveal` fails a plate that
renders without it — a lost line would still show an item, a rarity and an offer,
and would look entirely fine.

## 6. What the demo state used to assert, and why it changed

`pull-duplicate` opened two boxes forced to one slug and photographed the second
copy. That state is now **unreachable**, and the applier would have kept passing
— the second pull simply returns a different common. It now fills the legendary
tier (the smallest, so three boxes rather than eleven) and photographs what the
next legendary roll becomes. Four unit tests moved with it, each rewritten to
assert the rule rather than deleted.

The two tests that genuinely need a duplicate — the Collection's copy count and
the Showcase picker's de-duplication — now insert one directly, because the
schema still permits what `openBox` no longer produces. That path is not dead
code: it is what a pre-`0014` manager's shelf still renders through.

## 7. What was deliberately left alone

- **The rarity table.** Untouched, by ruling.
- **`weeklyLineStakeTokens`.** See §2.
- **Vending prices.** `16 §8`'s seventh range derives them from box EV and the
  vending machine is deferred to P7. Reporting a pass on a feature that does not
  exist would be worse than the gap.
- **Retroactive salvage for pre-`0014` duplicates.** No migration converts them.
  Paying tokens into possibly-closed seasons for openings that happened under a
  different rule would be inventing ledger movements, and `MANDATE §9` is firmer
  about fabricated records than about tidiness.
