#!/bin/bash
# .claude/hooks/review-flag.sh
# PostToolUse (matcher: Write|Edit). Tracks cumulative lines written/edited
# this session. Past a threshold, it flags the session for human review —
# it does NOT block (a big diff isn't a safety violation, just a signal).
#
# Optional Slack: set SLACK_WEBHOOK_URL (an Incoming Webhook URL from your
# Slack app settings) and this posts there too, once per session. Without
# it, the flag still surfaces to Claude via additionalContext and you'll see
# it in the transcript.

INPUT=$(cat)
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // "unknown"')
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
[ -z "$FILE_PATH" ] && exit 0

THRESHOLD="${HARNESS_REVIEW_LINE_THRESHOLD:-300}"
STATE_DIR=".claude/.harness-state"
mkdir -p "$STATE_DIR"
COUNT_FILE="$STATE_DIR/$SESSION_ID.lines"

# New content for a Write, or the replacement text for an Edit
NEW_CONTENT=$(echo "$INPUT" | jq -r '.tool_input.content // .tool_input.new_string // empty')
LINES=$(printf '%s' "$NEW_CONTENT" | wc -l)

PREV=0
[ -f "$COUNT_FILE" ] && PREV=$(cat "$COUNT_FILE")
TOTAL=$((PREV + LINES))
echo "$TOTAL" > "$COUNT_FILE"

if [ "$TOTAL" -ge "$THRESHOLD" ] && [ ! -f "$COUNT_FILE.flagged" ]; then
  touch "$COUNT_FILE.flagged"
  MSG="This session has generated roughly $TOTAL lines without a human checkpoint (threshold: $THRESHOLD). Pause and summarize what's changed so far before continuing, so it can be reviewed."
  echo "{\"additionalContext\": \"$MSG\"}"

  if [ -n "$SLACK_WEBHOOK_URL" ]; then
    PROJECT_NAME=$(basename "$(pwd)")
    curl -s -X POST -H 'Content-type: application/json' \
      --data "{\"text\": \":warning: Claude Code — *$PROJECT_NAME*: $MSG\"}" \
      "$SLACK_WEBHOOK_URL" >/dev/null 2>&1 &
  fi
fi

exit 0