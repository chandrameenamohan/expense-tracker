#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-build}"
PROMPT_FILE="PROMPT_${MODE}.md"

if [[ ! -f "$PROMPT_FILE" ]]; then
  echo "Error: $PROMPT_FILE not found"
  echo "Usage: ./loop.sh [plan|build]"
  exit 1
fi

echo "=== Expense Tracker Loop ==="
echo "Mode: $MODE"
echo "Prompt: $PROMPT_FILE"
echo ""

ITERATION=0
MAX_ITERATIONS="${MAX_ITERATIONS:-50}"

while [[ $ITERATION -lt $MAX_ITERATIONS ]]; do
  ITERATION=$((ITERATION + 1))
  echo "--- Iteration $ITERATION ---"

  claude --print "$PROMPT_FILE" \
    --allowedTools "Bash,Read,Write,Edit,Glob,Grep" \
    2>&1 | tee ".loop_output_${MODE}.log"

  EXIT_CODE=${PIPESTATUS[0]}
  if [[ $EXIT_CODE -ne 0 ]]; then
    echo "Claude exited with code $EXIT_CODE"
    break
  fi

  if grep -q "ALL_TASKS_COMPLETE" ".loop_output_${MODE}.log"; then
    echo "All tasks complete!"
    break
  fi

  echo "Continuing loop..."
done

echo "=== Loop finished after $ITERATION iterations ==="
