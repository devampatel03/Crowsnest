#!/bin/bash
# .claude/hooks/pre-tool-guard.sh
# PreToolUse (matcher: Bash). Deterministic — exit 2 blocks, stderr is shown
# to the model as feedback so it can try a different approach.

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

block() {
  echo "BLOCKED: $1" >&2
  exit 2
}

# 1. Force-push to a protected branch
if echo "$COMMAND" | grep -qE 'git push.*(--force|-f)\b' \
   && echo "$COMMAND" | grep -qE '\b(main|master|production)\b'; then
  block "force push to a protected branch. Use --force-with-lease on a feature branch, or ask the human."
fi

# 2. Recursive force-delete
if echo "$COMMAND" | grep -qE '\brm\s+(-[a-zA-Z]*r[a-zA-Z]*f|-[a-zA-Z]*f[a-zA-Z]*r)\b'; then
  block "recursive force-delete (rm -rf). Delete specific named paths instead."
fi

# 3. Destructive SQL outside dev (set APP_ENV in your shell/CI as needed)
if echo "$COMMAND" | grep -qiE '\b(drop|truncate)\s+(table|database)\b' \
   && [ "${APP_ENV:-dev}" != "dev" ]; then
  block "destructive SQL outside a dev environment: $COMMAND"
fi

exit 0