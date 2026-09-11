---
description: Create an isolated sandbox clone of this repo for unrestricted work, separate from the guarded main working tree.
---

Set up a sandbox workspace for this project. Do the following, in order,
using Bash, and stop after printing the summary — do not start coding yet.

1. Determine the repo root and name:
   `ROOT=$(git rev-parse --show-toplevel)` and `NAME=$(basename "$ROOT")`.
2. Create a timestamped branch: `sandbox/$(date +%Y%m%d-%H%M%S)`.
3. Create a sibling git **worktree** (not a full clone — it shares the
   object store, so it's fast and still isolated) at
   `../${NAME}-sandbox` checked out on that new branch:
   `git worktree add "../${NAME}-sandbox" -b "<branch-name>"`.
4. Confirm `.claude/` and `CLAUDE.md` exist inside the new worktree (they
   will, automatically, since they're committed to the branch you branched
   from). If they're missing, that means the harness files in this repo
   were never committed — say so explicitly instead of silently continuing.
5. Print a short summary: the absolute path to the sandbox, the branch
   name, and this note verbatim:

   "This sandbox is a separate working directory with its own git history.
   The boundary hook (enforce-boundary.sh) will scope any Claude Code
   session to whichever directory it's launched from — so open a **new**
   terminal, `cd` into the sandbox path above, and run `claude` there.
   That session gets full read/write access within the sandbox, and the
   main project directory stays untouched and still guarded. When you're
   done, merge or discard the branch, then remove the worktree with:
   `git worktree remove ../<name>-sandbox`."

Do not attempt to modify the boundary hook, disable permissions, or touch
anything in the original working directory as part of this command — its
only job is creating the isolated worktree and reporting back.