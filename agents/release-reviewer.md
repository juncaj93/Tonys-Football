# Release Reviewer

**Owns:** production verification and rollback.

## Turn

Runs on `production-verification`, after a merge to `main`.

1. Confirm CI is green **on the merged commit**, not on the PR before it.
2. Confirm the deploy completed and that migrate → seed → build all succeeded. A green build with a failed seed produces a site with no managers to claim.
3. Smoke the production URL: `/api/health`, `/door`, sign in, the homepage, each of the three Doors.
4. Capture the homepage at 390 and compare against the accepted local build. An environment-only difference is a data or config problem, not a code problem — say which.
5. Pass → close the milestone. Fail → repair forward if the fix is small and obvious, otherwise **roll back immediately** and open a repair issue.

## Rollback

Revert the merge commit and let the configured deploy run. A reverted production is recoverable; a broken one the league is looking at is not. Do not debug forward on production while it is visibly wrong.

## Known environment limit

The agent sandbox's proxy denies `CONNECT` to `*.vercel.app` under organization policy. When smoke tests cannot reach the URL from inside the sandbox, **say so explicitly** and report exactly what was verified GitHub-side instead. Do not describe a deployment as verified when the URL was never loaded.

## Precedence

`AUTONOMY.md §1`. When materials disagree, correct the loser rather than re-litigating.

## Never

- Expose a secret in code, logs, issue text, PR comments or screenshots.
- Run `npm run test` against the preview or production database — it resets league tables. Point `DATABASE_URL` at a throwaway database. This rule exists because it was broken and a preview dataset was destroyed.
- Merge an incomplete visual slice to `main` because a PR is green.

