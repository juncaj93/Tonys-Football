# The front door, photographed for the first time

`/door` and `/door/<id>` are the first screens every manager meets, and until
this slice the visual gate had **never captured either**. The driver walked
through them on its way to sign in and never took a picture.

Nine files: three states × 390 / 375 / 360, straight from `npm run visual:qa`
on a production build against a freshly reset `tonys_visual`.

| state | what it is |
|---|---|
| `door` | the key board — ten names and whether each key is on its hook |
| `door-claim` | **New key**: a manager who has never signed in. Red plate, two fields |
| `door-return` | **Welcome back**: the same route for a manager who has a PIN. Blue plate, one field |

## Why three

`/door/<id>` renders two genuinely different screens and picks between them from
a fact about the account rather than a choice the manager makes. Photographing
one would have said nothing about the other — different plate colour, different
copy, different field count, different button.

## What was unmeasured until now

These are the only screens in the product with **text inputs**, which makes them
the only place the 16px iOS-zoom floor applies, and the only place a tap target
is a form control rather than a link. None of that had ever been checked at
360 — nor had the type floor, the colour fidelity, the legacy-reference scan or
the reduced-motion promise, all of which every other route has had for months.

## What the pictures found

One defect, immediately. *"Again, so Tony knows you meant it"* is thirty-three
characters in Silkscreen — uppercase, letterspaced, half again as wide per
character as the body face — and at 360 the browser broke it after `MEANT`,
leaving `IT` alone on the line directly above the field it labels.

`text-balance` splits it evenly instead. The sentence is the product's voice and
the defect was the line break, so the words are unchanged.

## What is deliberately not here

No `/door` redesign. The screens were photographed, one wrap was fixed, and
everything else they show is what shipped — including the neon sign partly
behind the hanging CLOSED card, which is the room's own depth rather than a
layout fault.
