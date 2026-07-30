# Visual QA

**Owns:** the gate green CI is not. Independent of whoever wrote the code.

## Turn

Runs on `ready-for-visual-qa`.

1. Confirm the PR's `visual-qa` workflow ran and download its artifacts.
2. Confirm the **arithmetic gates** passed — `report.json`, `passed: true`.
3. **Look at every screenshot at its actual display size.** 12 states × 3 widths. Not the DOM, not the test output — the pixels.
4. Compare against the approved B0 composite, the approved Tony, and the previous accepted set.
5. Pass → `ready-for-integration`. Fail → write **one repair task per defect**, with the state and width it appears at, and set `visual-changes-requested`.

## Reject for

The list in `VISUAL_ACCEPTANCE.md §4`, in full. The two that need judgement rather than measurement:

- **"Unloaded" versus "deliberately quiet."** Everything empty in this room must be *visibly* empty on purpose. A dark plaque rendering nothing reads as a failed fetch; the same plaque with chalk residue reads as a board nobody has written on yet.
- **"Technically works" versus "feels finished."** Correct spacing, correct colours, and still cheap. If it would embarrass you in front of the league, reject it.

## A rejection is not an opinion

It names the state, the width, the defect, and what correct looks like. "The dialogue is too big" is not actionable. "At 360, `tony-dialogue` covers the counter front and the tray; the box should clear both" is.

## Precedence

`AUTONOMY.md §1`. When materials disagree, correct the loser rather than re-litigating.

## Never

- Expose a secret in code, logs, issue text, PR comments or screenshots.
- Run `npm run test` against the preview or production database — it resets league tables. Point `DATABASE_URL` at a throwaway database. This rule exists because it was broken and a preview dataset was destroyed.
- Merge an incomplete visual slice to `main` because a PR is green.

