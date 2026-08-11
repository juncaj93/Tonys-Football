# `avatar_body_head` — the painted head prototype

**One asset.** Commissioner ruling, 2026-08-11: the T-shirt body is **accepted**,
and the head is now the weakest part of the character. Exactly one painted
head/face prototype is authorised. The other five builds, hairstyles, facial hair
and wearables are not.

- **Production slug:** `avatar_body_head`
- **Upload:** `art/jigs/manager_head_paintover_672x1008.png` and
  `art/jigs/manager_reference_sheet.png`
- **Deliver:** one PNG at the plate's 2:3 aspect — 672 × 1008 or 1024 × 1536
- **Then run:** `npm run art:mask -- <file.png> avatar_body_head --head`

---

## Why this is not "add detail to the existing head"

From the production screenshot: the current head reads as **too round, too flat,
too symmetric, too geometrically simple**, and markedly less sophisticated than
the body now standing under it. Its *construction* is the problem — it is an
ellipse with a jaw stuck under it. Refining that ellipse cannot fix it.

## What is fixed, and why — the registration contract

Six hairstyles and four facial-hair layers are already drawn against these
numbers. They are not suggestions; a head that moves them makes ten other assets
wrong.

| Landmark | Row / columns | Who depends on it |
|---|---|---|
| **Skull top** | row 24 | all six hairstyles are drawn to this envelope |
| **Skull sides** | columns 43–68 | long hair and the ponytail hang just outside |
| **Brow** | row 31 | hat brims clear it at row 29 |
| **Eye line** | row 37, eyes at columns 48–52 and 59–63 | the customiser's whole face |
| **Nose tip** | row 42 | — |
| **Mouth** | row 47 | the moustache and goatee are drawn to it |
| **Jaw** | row 52 | the full beard is drawn to it |
| **Ears** | centred row 40, columns 42–46 and 66–70 | — |
| **Neck** | columns 50–61, rows 48–63 | the collar closes over it at row 63 |

**What is free**: everything *inside* that envelope. The jaw and chin may be
narrowed and squared; the brow, cheek planes, nose and eye construction are the
whole point. The one thing that must not move outward is the **cranium** — rows
24 to about 33 — because hair is painted to that curve and a wider skull pushes
hair off it.

Measured: hair occupies rows 11–50 and facial hair rows 39–57, which is where
those two constraints come from.

---

## The prompt

Paste everything between the rules. Upload the two images with it.

---

> **What this is.** The head for a character sprite in a late-1990s /
> early-2000s pixel-art game set in a neighbourhood pizza parlour. The body is
> already painted and approved — **you can see it on the plate** — and you are
> painting the head that belongs on it.
>
> **Paint the head, ears, face and neck. Nothing else.** The body below is
> finished; the hatching over it means do not touch. Paint only into the empty
> space above it.
>
> ### The brief in one sentence
>
> The current head looks like an avatar-builder part — a flat round oval with
> features placed on it. Replace it with a **genuinely constructed adult head**
> of the same quality as the body underneath.
>
> ### What has to be true
>
> - **believable adult head anatomy** — not a circle, not an oval with a chin
> - a **jaw and chin with real shape**, narrower than the cranium
> - a **readable brow** with weight over the eyes
> - **cheek and temple planes**, so the face turns rather than sitting flat
> - a **dimensional nose** with a bridge, a tip and a shadow
> - **eye construction** — lid, lash line, iris, a catch light
> - **ears that grow out of the skull**, not discs stuck on the sides
> - a **neck that plainly belongs to the painted body** below it — same weight of
>   line, same lighting, same skin
> - **warm light from the upper left**, matching the body exactly
> - deliberate pixel clusters and shading of the same sophistication as the body
> - a **neutral, friendly** expression — this person is standing in their own
>   basement, not posing
> - enough character that it reads as illustrated rather than assembled
>
> ### What it must NOT have
>
> **Bald. Clean-shaven. No hat, no glasses, no earrings, no accessories of any
> kind.** Hair and beards are separate layers painted later and drawn on top of
> this one; anything here would show through them.
>
> ### Registration — these must land where the plate marks them
>
> The plate has each of these ruled and labelled:
>
> - the **skull outline** must follow the marked box, especially across the top —
>   six hairstyles are drawn to that curve;
> - the **eye line**, and both eye boxes;
> - the **brow**, **nose tip**, **mouth** and **jaw** rows — beards are drawn to
>   the mouth and jaw;
> - the **ear boxes**;
> - the **neck columns**, running down to the marked collar line.
>
> Inside the skull outline you are free. The jaw may be narrower and squarer than
> the marked box; it may not be wider.
>
> ### Quality benchmark
>
> **Tony**, on the reference sheet. Match how his head is built — the brow, the
> cheek, the nose, the ear, the jaw. **Do not copy his identity**: not his
> moustache, his hair, his colouring or his face. This is a different, ordinary
> person.
>
> ### The palette
>
> | Where | Highlight | Light | Base | Shade |
> |---|---|---|---|---|
> | Outline, pupils, lash line, mouth | | | `#1A1214` | |
> | **Skin** | `#FFD98A` | `#F2C9A0` | `#D9A173` | `#9C6640` |
> | **Eye whites** | | | `#F5EDDC` | |
>
> Four skin tones plus the outline. Use the highlight on the brow, the cheekbone
> and the bridge of the nose — that is what it is for. No other colours.
>
> ### The file
>
> Transparent background, no glow, no vignette. Flat blocks, no gradients, no
> anti-aliasing, no soft edges. A thick fully-closed dark outline around the head
> and neck. Deliver at 672 × 1008 or 1024 × 1536.

---

## What happens to the returned file

`--head` crops to the head plate's own rows and validates against the table
above: the skull envelope, the eye line, the mouth and jaw rows, the neck
columns, a closed outline, and nothing painted below the collar line. Placement
normalisation is **not** available for a head — a build may be a few rows out
because only its own silhouette depends on it, whereas ten other layers are drawn
to these landmarks, so a head that misses them is regenerated.

Two things rounds 2 and 3 settled, so they are not asked for again: **the canvas
size does not matter** at the right aspect, and **feathered edges do not matter**
— the ingest snaps at source resolution and votes by majority. What does matter,
and what broke round 2, is a **thick outline**.
