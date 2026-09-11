#!/bin/bash
# .claude/hooks/protect-files.sh
# PreToolUse (matcher: Write|Edit). Belt-and-suspenders alongside the
# permissions.deny block in settings.json — catches paths a glob might miss.

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
[ -z "$FILE_PATH" ] && exit 0

if echo "$FILE_PATH" | grep -qE '(^|/)(\.env(\.[a-zA-Z0-9_]+)?$|.*secrets?.*|.*credentials?.*|id_rsa$|.*\.pem$)'; then
  echo "BLOCKED: $FILE_PATH looks like a secrets/credentials file. Ask the human to edit it directly." >&2
  exit 2
fi

exit 0