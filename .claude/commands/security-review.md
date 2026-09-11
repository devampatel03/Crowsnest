---
description: Review the current diff for security issues before opening a PR.
---

Run `git diff main...HEAD` (or `git diff` if uncommitted) and review it
specifically for security issues — not style, not correctness, only
security. For each finding:

1. State the file and line.
2. State the vulnerability class (e.g. injection, auth bypass, SSRF,
   insecure deserialization, secrets in code, missing input validation,
   path traversal, broken access control).
3. **Write a short proof it's real** — a concrete input or scenario that
   triggers it. If you can't construct one, don't report it as a finding;
   note it as a lower-confidence observation instead. This is the single
   biggest lever against false positives.
4. Propose the minimal fix.

Do not comment on code style, naming, or anything non-security — that's a
separate pass. If you find nothing, say so explicitly rather than
manufacturing minor findings to seem thorough. Fix anything you're
confident about directly; leave anything uncertain as a flagged comment
for human review rather than guessing.