#!/bin/bash
# .claude/hooks/post-tool-lint.sh
# PostToolUse (matcher: Write|Edit). Can't undo the write, so it never blocks
# (exit 2 here would be pointless) — instead it feeds lint errors back to the
# model as additionalContext so it can fix them on its next turn.

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
[ -z "$FILE_PATH" ] && exit 0

OUT=""

if [[ "$FILE_PATH" =~ \.(js|jsx|ts|tsx)$ ]] && [ -f package.json ]; then
  if [ -x node_modules/.bin/eslint ]; then
    OUT=$(npx --no-install eslint "$FILE_PATH" --quiet 2>&1)
  fi
elif [[ "$FILE_PATH" =~ \.py$ ]]; then
  if command -v ruff >/dev/null 2>&1; then
    OUT=$(ruff check "$FILE_PATH" 2>&1)
  fi
fi

if [ -n "$OUT" ]; then
  TRIMMED=$(echo "$OUT" | head -c 3000 | sed 's/"/\\"/g' | tr '\n' ' ')
  echo "{\"additionalContext\": \"Lint issues in $FILE_PATH: $TRIMMED\"}"
fi

exit 0