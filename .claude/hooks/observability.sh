#!/bin/bash
# Log Claude's decisions

echo "$(date '+%Y-%m-%d %H:%M:%S') | Tool: $TOOL | Status: $STATUS | Tokens: $TOKENS | Duration: ${DURATION}s" >> .claude/logs/decisions.log

TOTAL_COST=$(grep "Tokens:" .claude/logs/decisions.log | awk '{sum+=$NF} END {print sum}')
if (( $(echo "$TOTAL_COST > 5.00" | bc -l) )); then
  echo " Cost alert: $TOTAL_COST USD today"
fi

ERROR_RATE=$(grep "FAILED" .claude/logs/decisions.log | wc -l)
if (( ERROR_RATE > 5 )); then
  echo " High error rate detected: $ERROR_RATE failures in last hour"
fi