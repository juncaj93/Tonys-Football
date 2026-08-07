# Retired workflows

## `.github/workflows/orchestrator.yml` — removed 2026-08-06

The model-driven delivery loop. It is preserved in Git history and can be
restored with `git show <commit>:.github/workflows/orchestrator.yml`.

### Why it was removed rather than left disabled

It had been inert since the **2026-07-30 commissioner decision that the league
does not pay for API use** (`AUTONOMY.md §4`): reduced to `workflow_dispatch`
only, with `ANTHROPIC_API_KEY` unset so its preflight skipped the job. Nothing
routine invoked it and no product scope depended on it — generative AI is
limited to the Tuesday Slice, which `16 §9` already requires to publish
correctly with the key unset.

What changed on 2026-08-06 is that the repository is being made **temporarily
public**. Inert is not the same as absent, and this was the only workflow in the
repository that combined:

- `permissions: contents: write, pull-requests: write, issues: write`;
- a paid third-party credential (`ANTHROPIC_API_KEY`);
- an entry point (`workflow_dispatch`) that a repository admin can fire.

A file under `.github/workflows/` is executable configuration. Leaving one with
write permissions and a paid key sitting in a public repository is a standing
invitation to a mistake — a restored secret, a mis-clicked dispatch — for a
capability nobody currently wants. The audit's judgement was that it is not a
blocker; removing it is cheap, reversible, and removes the question entirely.

It was **not** renamed or moved elsewhere inside `.github/workflows/`. A renamed
file with a workflow trigger is still a workflow.

### What is required before restoring it

1. A new commissioner decision reversing the no-paid-API ruling, recorded in
   `AUTONOMY.md §1`'s precedence list.
2. The repository back to **private**, or the workflow re-scoped so it cannot be
   triggered from a public fork or by an untrusted actor.
3. Least-privilege `permissions:` re-derived from what the loop actually needs,
   rather than restored verbatim.
4. A `timeout-minutes` cap, which it never had — the same exposure `ci.yml` and
   `visual-qa.yml` were capped for on 2026-08-06.

### What was deliberately left alone

`ci.yml` and `visual-qa.yml` are untouched. They are the two required gates,
they reference **zero secrets**, they declare `permissions: contents: read`, and
they carry 15- and 35-minute caps. Public fork pull requests can run them and
learn nothing.
