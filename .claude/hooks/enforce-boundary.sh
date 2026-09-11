#!/bin/bash
# .claude/hooks/enforce-boundary.sh
# PreToolUse (matcher: Read|Write|Edit|Bash|Glob|Grep).
# Blocks any tool call touching a path outside the project root — absolute
# paths, ../ traversal, or `cd` inside a Bash command all get caught.
# $CLAUDE_PROJECT_DIR is set by Claude Code to the project root at launch.

INPUT=$(cat)
ROOT=$(cd "${CLAUDE_PROJECT_DIR:-.}" && pwd)
TOOL=$(echo "$INPUT" | jq -r '.tool_name // empty')

block() {
  echo "BLOCKED: $1. This session is scoped to $ROOT — stay inside the project directory." >&2
  exit 2
}

check_path() {
  local p="$1"
  [ -z "$p" ] && return 0
  local resolved
  if command -v realpath >/dev/null 2>&1; then
    resolved=$(realpath -m "$p" 2>/dev/null)
  else
    resolved=$(python3 -c "import os,sys; print(os.path.abspath(sys.argv[1]))" "$p" 2>/dev/null)
  fi
  [ -z "$resolved" ] && return 0
  case "$resolved" in
    "$ROOT"|"$ROOT"/*) return 0 ;;
    *) block "path outside project root: $resolved" ;;
  esac
}

case "$TOOL" in
  Read|Glob)
    check_path "$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.path // empty')"
    ;;
  Write|Edit)
    check_path "$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')"
    ;;
  Grep)
    check_path "$(echo "$INPUT" | jq -r '.tool_input.path // empty')"
    ;;
  Bash)
    COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')
    if echo "$COMMAND" | grep -qE '\bcd\s+/'; then
      block "Bash command cd's to an absolute path outside the project: $COMMAND"
    fi
    if echo "$COMMAND" | grep -qE '(^|[[:space:]])(\.\./){3,}'; then
      block "Bash command traverses 3+ levels up, likely escaping the project: $COMMAND"
    fi
    ;;
esac

exit 0