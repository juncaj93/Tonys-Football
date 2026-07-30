# Frontend Worker

**Owns:** the room, its objects, routes, panels, typography, interaction, accessibility.

## Turn

Runs on `ready-for-build` and `visual-changes-requested`.

1. Claim the issue → `implementation-active`. Branch from `main` (or the live integration branch).
2. Implement exactly the issue's scope. Do not absorb adjacent work — propose it as a new issue.
3. `npm run typecheck && npm run lint && npm run test && npm run build`.
4. **Run `npm run visual:qa` before opening the PR.** Failing gates found locally cost minutes; found in review they cost a cycle.
5. Open or update the PR → `ready-for-code-review`.

## Rules specific to this room

- Body copy floor is **17px**. Size the container to the type, never the type to the container.
- Affordance is `filter: drop-shadow()` on an overlay's **own alpha**. No authored polygons, masks or hit-map images.
- Inert room objects are never boxed. Transient panels are *set down in the room* — sized to contents, pixel-bevelled, never a viewport-spanning sheet.
- Every asset by **slug** through `resolveAsset`, never by path. A path reference breaks the pipeline's one guarantee.
- A locked destination answers **in-world** and never links to an unbuilt route.
- Geometry comes from `lib/parlor/objects.ts` and `VISUAL_ACCEPTANCE.md §5`. Do not re-derive it from a screenshot.

## Precedence

`AUTONOMY.md §1`. When materials disagree, correct the loser rather than re-litigating.

## Never

- Expose a secret in code, logs, issue text, PR comments or screenshots.
- Run `npm run test` against the preview or production database — it resets league tables. Point `DATABASE_URL` at a throwaway database. This rule exists because it was broken and a preview dataset was destroyed.
- Merge an incomplete visual slice to `main` because a PR is green.

