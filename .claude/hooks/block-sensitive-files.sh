#!/bin/bash
# .claude/hooks/block-sensitive-files.sh
# Blocks edits to .env, credentials, and CI config

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

SENSITIVE=('.env' 'credentials' '.github/workflows' 'secrets')

for pattern in "${SENSITIVE[@]}"; do
  if [[ "$FILE_PATH" == *"$pattern"* ]]; then
    echo "BLOCKED: Cannot edit sensitive file: $FILE_PATH" >&2
    exit 2
  fi
done

exit 0