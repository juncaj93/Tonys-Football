# Recorded Sleeper fixtures

Everything under `sleeper/` is a byte-stable recording of the live Sleeper API,
captured by `npm run sleeper:record`.

**Nothing in the application or the test suite reaches the network.** The
adapter talks to a `SleeperSource`, and the fixture source implements the same
interface as the live one — so the chain adapter, and everything built on it
later, cannot tell which one it has. That symmetry is what `16 §12` means by
"all sync development runs against recorded fixtures regardless, which is the
intended design."

Recording against a provider that is undocumented, carries no SLA, and — during
the 2026 preseason — has no current-season data to test against is not a
workaround. The completed 2024 and 2025 seasons are the only realistic data
that exists, and a committed copy of them is worth more than live access.

## What is recorded

| | |
|---|---|
| Seasons | 2026 (`1385016656425668608`) · 2025 (`1240008879295713280`) · 2024 (`1113249275284205568`) |
| Per season | league · users · rosters · winners bracket · losers bracket · matchups 1–18 · transactions 1–18 |
| Global | `state/nfl` · a projected player catalog |
| Size | ~1.2 MB |

## The manifest is load-bearing

`sleeper/manifest.json` is not documentation. It records:

- **which endpoints came back empty** — a fact with no file to live in. Sleeper
  answers "no transactions that week" with a 404, `null`, or `[]`, and all three
  mean the same ordinary thing about a quiet week;
- **a sha256 of every payload**, so a fixture edited by hand to make a test pass
  fails loudly instead of quietly changing what the tests believe about the
  league.

## The player catalog is projected, deliberately

`/players/nfl` is a **14.6 MB** response covering all ~12,200 players in the
NFL. Committing it whole would make the repository unpleasant to clone and every
diff unreadable; fetching it in a request path would be indefensible.

So the recorder projects it down to the ~350 players this league has actually
rostered across all three seasons, keeping four fields. This is the **one**
endpoint where the recorded fixture is not the live payload, which is why it
sits outside the manifest's endpoint entries rather than pretending to the
symmetry the rest of the transport guarantees.

## Re-recording

```
npm run sleeper:record     # re-record from the live API
npm run sleeper:check      # re-record and fail if anything changed
```

Output is byte-stable — keys sorted, two-space indent, trailing newline — so
re-recording an unchanged season produces no diff at all. That turns "did
upstream change?" into a question `git status` can answer, and `sleeper:check`
into an on-demand drift alarm.

Re-record the **whole set**, never one file. Partial re-recording leaves the
manifest hashes inconsistent, and the fixture source will reject it.

## What is not here

Historical seasons are read-only forever, so these fixtures change only if
Sleeper rewrites the past. The 2026 files will change constantly once that
season starts — re-record when the live season needs to be reflected in tests.
