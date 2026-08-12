# The Back Hall, photographed — 2026-08-11

Captured for the Back Hall art-direction investigation. Every picture in this
folder is a **production build** (`next build` + `next start`) against a freshly
reset `tonys_visual`, at the visual driver's own conditions — viewport
`width × 664`, `deviceScaleFactor: 3`, `isMobile`, `hasTouch`, signed in through
the real door as Alex, and reaching `/back-hall` by tapping the parlor's rear
doorway rather than by typing the URL.

`DEMO_FIXTURES=1` on the server, which is what makes `?open=none` resolve.

---

## What is here

| File | State |
|---|---|
| `<w>-back-hall-art.png` | **`/back-hall` as it ships now** — the painted shell, stairs open, curtain shut |
| `<w>-back-hall-art-shut.png` | the painted hall with both doors shut, chain across the stairs |
| `<w>-art-shut-<door>-answers.png` | each shut door tapped, its in-world line on screen |
| `before-after-390.png` | the drawn stand-in beside the painting, at 390 |
| `<w>-back-hall.png` | *(before)* the drawn stand-in — stairs open, curtain shut |
| `<w>-back-hall-shut.png` | *(before)* `/back-hall?open=none` — both shut |
| `<w>-shut-<door>-answers.png` | *(before)* each shut door tapped. **The stairs' line is off-screen at 390** |
| `<w>-parlor.png` | the approved parlor, same conditions — the primary benchmark |
| `<w>-rooms.png` | the approved storeroom, same conditions — the secondary benchmark |
| `world-comparison-360.png` | the three rooms side by side at 360 |
| `back-hall-layout-plate.png` | the geometry the brief asked for, drawn at 3×. **Superseded** by the measurements the delivered art produced — kept as the record of what was asked |

`<w>` is `390`, `375`, `360` — except the two benchmarks, which are kept at `390`
(the width the colour counts below are measured at) and `360` (the width the
comparison sheet is built from). A third copy of each would be 780 KB of the
same picture.

---

## The measurements these pictures were taken to establish

The room is a `320 × 569` box locked to `aspect-ratio` and anchored `self-start`
inside a `100dvh` column, so how much of it a phone shows is arithmetic:

| Width | Rendered room | Viewport | Visible room units | Verdict |
|---|---|---|---|---|
| 390 | 390 × 693.47 | 664 | rows 0–**544** | **rows 545–568 are cropped** (4.2% of the room) |
| 375 | 375 × 666.80 | 664 | rows 0–**566** | rows 567–568 cropped |
| 360 | 360 × 640.13 | 664 | rows 0–568, all of it | 23.9 CSS px of `#1a1214` below the art |

`roomTop` is **0** at all three widths — this route has no utility bar and no
status-bar scrim, unlike the homepage, so on a real iPhone the top ≈48 room units
sit under the clock and battery with nothing between them.

And the in-world answer a shut door gives, measured by tapping it:

| Width | The stairs' line | The curtain's line |
|---|---|---|
| 390 | top at **670.3px** in a 664px viewport — **entirely off-screen** | 472.9px, fine |
| 375 | top at 644.5px, 67.6px tall — **all but 19px below the fold** | 454.7px, fine |
| 360 | top at 618.8px — bottom 22px clipped | 436.5px, fine |

Recorded as visual debt 19. Nobody sees it today because `rooms` is open, and it
is exactly the state a one-line revert produces.

---

## Colour vocabulary, measured on these captures

Distinct colours covering at least 0.5% of the frame — a plain count of how much
of a palette each room actually spends:

| | ≥ 0.5% of frame | ≥ 0.1% | distinct |
|---|---|---|---|
| `/back-hall` @390 — **the drawn stand-in** | **9** | 16 | 409 |
| `/rooms` @390 (painted storeroom) | 25 | 38 | 428 |
| `/` @390 (painted parlor) | **48** | 83 | 11,915 |

The back hall's two darkest fills alone cover **56.9%** of the screen; its four
largest cover **77.7%**. The parlor's largest single colour covers 12.4%.

Measured again on the **delivered shells themselves**, which removes the
rendering and the page furniture from the comparison:

| 320 × 569 asset | ≥ 0.5% | ≥ 0.1% | distinct | top colour |
|---|---|---|---|---|
| `zone_back_hall_shell` | **19** | 25 | 82 | 15.9% |
| `zone_room_shell_storeroom` | 25 | 31 | 73 | 19.8% |
| `zone_parlor_shell` | 52 | 64 | 90 | 4.2% |

`BATCH_G §5.10` asked for 25–48 and the hall landed at 19. Recorded rather than
rounded up. It is a proxy, the room genuinely has a large plain floor, and
`docs/PALETTE_FIDELITY_BOUNDARY.md` is the standing evidence that these proxies
can prefer the worse picture — so the picture decided.

---

## After: the shut doors can be heard

The defect this investigation found, and the same measurement after the shell
landed and the geometry moved with it:

| Width | The stairs' line, before | After |
|---|---|---|
| 390 | **670.3 – 737.9** in a 664px viewport | **365.6 – 433.2** |
| 375 | 644.5 – 712.1 | 351.5 – 419.1 |
| 360 | 618.8 – 686.3 | 337.5 – 405.1 |

`checkBackHall` taps each shut door and fails if the answer is not wholly on
screen. Restoring the old `stairs` rectangle turns it red at all three widths
with exactly the "before" numbers — done, and then reverted.

---

## Reproducing

```
npm run db:visual
DATABASE_URL=postgres://tonys@127.0.0.1:5432/tonys_visual \
  SESSION_SECRET=… npm run build
DATABASE_URL=… DEMO_FIXTURES=1 npx next start -p 3111
```

then drive Playwright at `http://localhost:3111` with the conditions above. The
capture script is not committed — it is `scripts/visual-qa.mts`'s own setup with
`back-hall` and `back-hall-shut` as the only states, plus a tap on each shut
door.
