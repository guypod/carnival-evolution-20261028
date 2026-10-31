#!/usr/bin/env bash
# Runs from the clone root on the Tessl cloud machine before each agent run.
# The machine already has Node 24, which package.json accepts, so the first
# step is installing dependencies. It's safe to run more than once.
set -eo pipefail

echo "Installing dependencies with npm ci"
npm ci

# An implementation run must claim its issue's immutable identity before any
# coding, so two accepted requests for the same work never both implement it.
# The recipe passes SKILL, INPUTS, TRIGGER_EVENTS and TESSL_LAUNCH_RUN_ID to
# this hook. Every other action skips the guard. A refusal fails the run here.
case "${SKILL:-}" in
  *"#implement-github-issue")
    echo "Claiming the implementation entry for this issue"
    node scripts/native/entry-guard.mjs
    ;;
esac
