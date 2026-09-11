# REVIEW.md

How this repo reviews AI-agent-generated PRs. Read this before opening or
approving one.

## The passes, run separately (don't merge them into one prompt)
1. **Security** — `/security-review` (`.claude/commands/security-review.md`).
   Every finding must include a proof-of-concept, not just a claim.
2. **Correctness** — `bug-hunter` sub-agent. Logic errors and edge cases only.
3. **Intent match** — `intent-checker` sub-agent. Does the diff do what the
   ticket/prompt says, and only that?
4. **Style/lint** — already enforced automatically by
   `.claude/hooks/post-tool-lint.sh` at write-time; don't re-litigate style
   in PR review.

Run them independently, not as one combined "review everything" prompt —
a single reviewer sharing one context tends to share blind spots across
all four concerns. Separate passes catch what a merged pass misses.

## Severity
- **Blocking** — security findings with a working proof-of-concept, or a
  correctness bug with a concrete failing input. Must be fixed before merge.
- **Important** — everything else non-cosmetic. Fix before merge unless
  there's a stated reason not to.
- **Nit** — style/naming preference. Cap at 3 per PR; more than that means
  the lint hook needs tuning, not more comments.

## Separation of duties
The agent that wrote the diff does not approve its own PR. This is
enforced by branch protection (require a review from an identity other
than the one that opened the PR), not by asking nicely.

## What gets auto-merge eligibility vs. requires a human
- **Eligible for AI-approved merge:** small diffs (set your own line-count
  threshold), touching non-critical paths, with passing tests and no
  Blocking findings from any of the four passes above.
- **Always requires a human:** anything touching auth, payments, data
  deletion, migrations, infra/deploy config, or anything the security
  review flagged even at Important severity. Keep this list explicit and
  update it in a PR of its own when a repo's risk profile changes.

## Audit trail
Every AI-approved PR gets the label `ai-reviewed`, and the review output
(all four passes) is saved as PR comments, not summarized away — the raw
findings are the audit record, not a paraphrase of them.