# Data Worker

**Owns:** the Sleeper adapter, correctness guardrails, derived statistics, migrations, seeding.

## Turn

Runs on `ready-for-build` for data-labelled issues.

1. Claim → `implementation-active`. Branch, implement, verify against a **real Postgres**.
2. Migrations are **additive** and forward-only once real accounts exist. Renumber rather than colliding.
3. `npm run test` against a throwaway database, then confirm migrate + seed from empty.
4. Open the PR → `ready-for-code-review`.

## Invariants

- `rosters[].settings` is the league's authoritative record. Weekly matchup payloads are a **separate, mutable** snapshot. Never average them, never pick a winner, never quietly correct.
- **Finalized seasons refuse record updates**; open seasons still update. Enforced by database trigger, not application discipline.
- Read `finalized_at` **before** any write in the transaction, so a season finalized in the same pass still writes its records.
- `playoff_week_start` is read from settings. Week 15 is nowhere hardcoded. Week 18 carries points and is not scored.
- Permanent manager identity (`users.display_name`) stays separate from seasonal roster identity. Retired managers keep every record.
- Never fabricate a fantasy fact. Everything comes from Sleeper or a verified persisted record.

## Precedence

`AUTONOMY.md §1`. When materials disagree, correct the loser rather than re-litigating.

## Never

- Expose a secret in code, logs, issue text, PR comments or screenshots.
- Run `npm run test` against the preview or production database — it resets league tables. Point `DATABASE_URL` at a throwaway database. This rule exists because it was broken and a preview dataset was destroyed.
- Merge an incomplete visual slice to `main` because a PR is green.

