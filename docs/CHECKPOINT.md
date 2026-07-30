# Durable delivery checkpoint

**Resume instruction:** `Read CLAUDE.md and AUTONOMY.md, load the latest durable checkpoint, and continue autonomous delivery.`

This file is the handover record between Claude Code sessions. **Session memory is not a record** — if it is not here, in a PR comment, or in a label, it did not happen (`AUTONOMY.md §0`).

Update it whenever a slice lands, a gate result changes, or the next task changes. Keep it short enough to be read in full at the start of a session.

---

## Where the product is — 2026-07-30

**Active milestone: M2 — the complete pizza-box loot loop.**

The commissioner's M2 definition is the *whole* dopamine loop, twelve items: acquire → box on the counter → select → anticipation and animation → rarity-legible reveal → transactional idempotent write → server-side persistence → appears in the collection → equip/showcase → the parlor reflects it → duplicate/retry/refresh correct → passes iPhone visual QA. **M2 is not complete after acquisition, storage, a route, or a static reveal.**

Milestones after M2, in order and one at a time: **M3** modular character identity · **M4** Back Hall / Rooms / basement · **M5** one polished server-authoritative casino game.

**M1 (parlor homepage) is a preserved visual baseline.** No later milestone may reintroduce Tony clipping, tiny type, contaminated colour, blurred pixel art, generic web boxes, debug hit regions, legacy homepage art, or visibly unfinished states. A visible regression is a failed gate even when CI is green.

### Branches

| Branch | Role |
|---|---|
| `main` | production. Merging it deploys — `vercel-build` runs migrate → seed → build. There is no quiet merge to `main`. |
| `integration/m2-loot-box` | **the active M2 integration branch.** Every M2 slice PRs into this. One PR to `main` when the loop is coherent as a product. |
| `claude/tonys-pizza-tech-lead-iq2n38` | M2 slice 1. **PR #19 → `integration/m2-loot-box`.** |

Base slice branches on `integration/m2-loot-box`, never on `main`, for the rest of M2.

### Slices

| # | Slice | State |
|---|---|---|
| 1 | Box on the tray · open in place · reveal · persistence | ✅ **merged** (PR #19) |
| 2 | Acquisition — ledger, trigger balance, opening grant, purchase | ✅ built, PR pending |
| 3 | `/counter/collection` — where a pull can be looked at | **next** |
| 4 | Showcase / equip, and the parlor reflecting the result | not started |

**Slices 1–2 cover milestone items 1–7 and 11.** Items 8, 9, 10 are slices 3–4.

### Exact next task

Open the slice 2 PR (`claude/m2-slice2-tokens` → `integration/m2-loot-box`), drive it green, merge. Then **slice 3 — `/counter/collection`**: the route where a pulled collectible can actually be looked at. Until it exists the loop has a dead end, which is why nothing merges to `main` yet.

---

## Gate results last recorded

| Gate | Result | Where |
|---|---|---|
| `npm run check` | green — 524 tests, 31 files | local, throwaway Postgres |
| `npm run visual:qa` | green — 14 states × 3 widths, production build | local |
| `ci.yml` + `visual-qa.yml` on slice 1 | green on real runners; merged at `bd50a16` | PR #19 |
| Reduced motion | verified in-browser: reveal at 106 ms, `opacity: 1`, `transform: none`, no console errors | local |
| `ci.yml` / `visual-qa.yml` on GitHub | see PR #19 | — |

**Preview and production URLs cannot be reached from the sandbox** — the proxy denies CONNECT to `*.vercel.app`. Verify GitHub-side and say so explicitly. Never claim a URL was smoke-tested when it was not.

---

## Authoritative Markdown, in reading order

1. `CLAUDE.md` — identity, scope, invariants, current status
2. `AUTONOMY.md` — lifecycle, labels, precedence (`§1`), escalation (`§6`)
3. `VISUAL_ACCEPTANCE.md` — the gates CI is not, and the fixed room geometry
4. `docs/TECH_LEAD_OPERATING_MODEL.md §8` — **the ruling index. Read before any design decision.**
5. `PROJECT_SPEC/16_FINAL_RECONCILED_PLAN.md` — architecture and scope
6. `PROJECT_SPEC/17_ACCELERATED_ROADMAP.md` — ordering only
7. `PROJECT_SPEC/18_PARLOR_NAVIGATION_MAP.md` — the room. `§4` is the counter and the tray.
8. `docs/IMPLEMENTATION_HANDOFF.md` — "Where M2 slice 1 landed" and "What slice 2 owns"
9. `art/ASSET_PIPELINE.md` — art is placeholder-first, swapped by registry row

Precedence when they conflict: commissioner ruling → Technical Lead ruling → approved visual references → `PROJECT_SPEC` → architecture/art specs → handoffs → code → superseded plans. **Correct the loser durably; do not stop to ask for a reconciliation.**

---

## Standing constraints that bite

- **No paid API use** (commissioner, 2026-07-30). The orchestrator is manual-dispatch only and `ANTHROPIC_API_KEY` is unset. Do not recreate a paid cron, add an automatic paid trigger, request reversal, or treat a present secret as authorization to spend. No product scope depends on it — `16 §9` requires the Slice to publish with the key unset.
- **`npm run test` truncates league tables.** Never point `DATABASE_URL` at preview or production. This rule exists because it was broken once and a preview dataset was destroyed. After running tests, re-seed before visual QA.
- **All token movement through `apply_token_delta`** with an idempotency key, balance trigger-maintained, `CHECK (balance >= 0)`. No feature gets its own balance-writing path.
- **`box_openings.box_id UNIQUE` is the idempotency mechanism for opening** — the operation has a natural key. Do not add a client-supplied key there; that invariant is about `apply_token_delta`, where a delta is an event with no natural key.
- **`season_memberships.token_balance` has exactly one write path.** A direct `UPDATE` raises; only the ledger trigger may change it. Move tokens with `apply_token_delta` — the Postgres function, not a TypeScript helper.
- **Never disable a control on a client-read balance.** `CHECK (token_balance >= 0)` is the authority; a client check is a race and a second copy of the rule.
- **Body copy in a cream `PixelPanel` is `text-ink-700`.** `text-paper-*` on a paper panel is invisible, and it shipped on three routes.
- **A Tailwind class naming an undefined `--color-*` token silently inherits.** `lib/design/colour-tokens.test.ts` fails the build for it now.
- **Reward weights and prices are simulation-gated to P3.** Nothing locks before the multi-season simulation. Do not tune to taste.
- **Every asset by slug through the registry.** Swapping art is a registry row, never a code change.
- **The injected clock and the injected RNG.** `new Date()` / `Date.now()` are lint errors outside `lib/clock.ts`; randomness only via `lib/counter/rng.ts`.
- **Never delete an approved slug, record or asset to satisfy an older count.** Recalculate the count.
- **Body copy floor is 17px.** Size the container to the type.
- **`PlaceholderSign` is for surfaces.** Small objects use `AssetView … compact`, or a 44-unit slot becomes a 133px slab.

---

## Local environment recipe

The sandbox has no Docker. Postgres 16 binaries are at `/usr/lib/postgresql/16/bin` and `initdb` refuses to run as root:

```bash
export PGDATA=/tmp/tonyspg
mkdir -p $PGDATA /tmp/pgsock && chown postgres:postgres $PGDATA /tmp/pgsock
su postgres -s /bin/bash -c "/usr/lib/postgresql/16/bin/initdb -D $PGDATA -A trust -U tonys"
su postgres -s /bin/bash -c "/usr/lib/postgresql/16/bin/pg_ctl -D $PGDATA -l /tmp/pg.log \
  -o '-p 5432 -k /tmp/pgsock -c listen_addresses=127.0.0.1' start"
su postgres -s /bin/bash -c "/usr/lib/postgresql/16/bin/createdb -h /tmp/pgsock -U tonys tonys_dev"

export DATABASE_URL=postgres://tonys@127.0.0.1:5432/tonys_dev
export SESSION_SECRET=local_throwaway_secret_thirty_two_chars_min
export SLEEPER_LEAGUE_ID=1385016656425668608
npm ci && npm run db:migrate && npm run db:seed
```

Visual QA needs a **production build** on port 3111:

```bash
npm run build
setsid nohup npx next start -p 3111 > /tmp/next.log 2>&1 < /dev/null & disown
export PLAYWRIGHT_CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome
npm run visual:qa                              # all required states
npm run visual:qa -- --state=tray-reveal       # required; buys its own box per width
```

Gotchas that have cost time:
- Sign in as **Alex by name** via `/door`, never by UUID — reseeding regenerates every id. Script PIN is `461902`.
- **Never `pkill -f next-server`, and do not trust `pgrep -f next-server` either** — both match this shell's own command line, so `pkill` kills the session (exit 144) and `pgrep` reports a server that is not running. Use `ps -eo pid,args | grep -F next-server | grep -v grep`, and confirm with `ss -ltnp | grep 3111`.
- A stale `next start` serves old CSS. Confirm the served hash matches `.next/static/css/` on disk.
- Never run `playwright install` here; use the `PLAYWRIGHT_CHROMIUM` path above.
- `visual-qa-*/` and `visual-qa/` are gitignored. Screenshots belong to a workflow run, not to git history.
- `capturing tray-reveal consumes the box.` Restore with:
  `psql "$DATABASE_URL" -c "truncate table collectibles, box_openings, loot_boxes, token_transactions, economy_configs cascade" && npm run db:seed`

---

## Unresolved / carried forward

- **Reward weights provisional** until the P3 simulation. `PROVISIONAL_RARITY_MASS` in `lib/counter/rewards.ts`.
- **Collectible art is placeholder**, so an unopened box and an unfinished collectible are drawn as the same carton. Specified behaviour; the plate carries identity and every reveal is lifted so the moment reads. Real art is a registry row.
- **Group B content still needs commissioner approval**; seed Group A only.
- **One greeting pair still shared** (SuggMyNick / cheeseking). Two lines of markdown, no code. Asserted in `lib/content/greeting.test.ts`.
