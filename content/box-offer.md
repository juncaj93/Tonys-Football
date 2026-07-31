# Approved — the other end of the pizza-box loop

**Status:** Approved by the commissioner, 2026-07-30, as one of the two Tony dialogue groups for the pizza-box loop. There is no held-back second half, so the whole file is readable and `parseBoxOffers` reads to the end.

**Surface:** `counter_box_offer` · **kind:** `tony_line` · **where:** the reveal plate, after the collectible, its rarity, and what it means for the shelf.

---

## What these are

`content/counter-greetings.md` covers Tony at the *start* of the loop — he hands over the first box. These are the *other* end: a box has just been opened, the collectible is on the plate, and Tony offers another one across the counter.

**They are an offer, not a listing.** The commissioner's ruling is explicit that the experience must "feel like Tony is handing something across the counter, not like the application generated inventory", so the price is spoken in a sentence by a person rather than printed beside a button.

## When they appear, and when they must not

Selection runs on **authoritative server state** (`lib/counter/offer.ts`), never on anything the browser believed about a balance. All of the following must be true before a line is even considered:

| Condition | Why |
|---|---|
| A season is open | `apply_token_delta` refuses a finalized season, so there is nothing to offer |
| The manager holds a seat this season | No seat, no tab, no purchase |
| An economy config is stored | The price is a stored value, never a literal |
| Their balance is **at least** the price | *"Do not advertise an unavailable purchase"* |

When any of those is false there is **no line and no offer** — not a greyed-out one, not a smaller one, not an explanation of why. The ruling names all three: do not advertise an unavailable purchase, do not shame the manager, do not display a disabled sales pitch. Tony simply talks about the collectible instead.

## Conditions these lines may use

| Tag | True when |
|---|---|
| `can_afford_another` | Everything in the table above holds. Every line requires it. |
| `first_pull` | The collectible just revealed is the first they have ever owned |
| `shelf_complete` | They now hold every item in the catalog |

The selector prefers the line true of the fewest people, so a two-tag line beats the generic one whenever it applies — the manager who just opened their very first box hears about that, and everybody else hears the plain offer.

## The one variable

`{price}` — the standard box price, in Tony Tokens, read from the stored economy config for the open season.

It is a variable rather than a word because the price is **provisional until the P3 simulation** (`16`). A line that says "fifty" would be silently wrong the day the simulation moves it, and nothing would fail.

## Voice rules applied (`12 §8`)

Short. One setup, one turn. Dry. Slightly judgemental, warm underneath. No instructional paragraphs, no ecommerce vocabulary, and nothing that implies real money, chance, a limited-time offer, a guaranteed rarity, or any urgency. The box will still be there tomorrow at the same price and Tony has no reason to push.

---

# Approved lines

**O1** · `can_afford_another` + `first_pull` · *pleased*
> First one was free. Next one's {price}.

**O2** · `can_afford_another` + `first_pull` · *neutral*
> That one was on me. The next one's {price}, same as anybody.

**O3** · `can_afford_another` · *neutral*
> {price} tokens gets you another.

**O4** · `can_afford_another` · *neutral*
> There's more where that came from. {price} a box.

**O5** · `can_afford_another` · *unimpressed*
> Another one's {price}. Your tab covers it, if you're feeling brave.

**O6** · `can_afford_another` · *pleased*
> Tony's got another box back there. {price}, whenever you like.

**O7** · `can_afford_another` + `shelf_complete` · *unimpressed*
> Shelf's full. Another's {price}, and it'd be a spare.
