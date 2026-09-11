#!/bin/bash
# .claude/hooks/stop-verify.sh
# Stop. Fires every time Claude tries to finish responding. Exit 2 forces it
# to keep working; stderr becomes its feedback.
#
# CRITICAL: stop_hook_active is true when this Stop hook already fired once
# and Claude is continuing because of it. Without this check, a still-failing
# test suite re-blocks forever. Always check it first.

INPUT=$(cat)

if [ "$(echo "$INPUT" | jq -r '.stop_hook_active')" = "true" ]; then
  exit 0
fi

OUT=""
CODE=0

if [ -f package.json ] && grep -q '"test"' package.json; then
  OUT=$(npm test 2>&1); CODE=$?
elif [ -f pyproject.toml ] || [ -f requirements.txt ]; then
  OUT=$(pytest 2>&1); CODE=$?
fi

if [ $CODE -ne 0 ] && [ -n "$OUT" ]; then
  echo "Tests are failing. Fix them before finishing:" >&2
  echo "$OUT" | tail -50 >&2
  exit 2
fi

exit 0