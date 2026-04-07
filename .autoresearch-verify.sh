#!/bin/bash
# Autoresearch verify script — outputs quality score (1000 - errors)
cd /Users/connorgray/Desktop/marine-tech-app

TS_ERRORS=$(npx tsc --noEmit 2>&1 | grep -c "error TS" || true)
LINT_ERRORS=$(npx eslint . 2>&1 | tail -3 | grep "problems" | awk -F'[()]' '{print $2}' | awk '{print $1}')
LINT_ERRORS=${LINT_ERRORS:-0}

TOTAL_ERRORS=$((TS_ERRORS + LINT_ERRORS))
SCORE=$((1000 - TOTAL_ERRORS))
echo "$SCORE"
