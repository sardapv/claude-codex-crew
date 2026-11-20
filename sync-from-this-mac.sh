#!/bin/bash
# Copies the live Crew files on this Mac back into this repo, so you can commit your changes.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
rsync -a --delete --exclude '.claude-plugin/types' --exclude 'node_modules' \
  "$HOME/.claude/mods/crew/" "$HERE/claude/mods/crew/"
cp "$HOME/.claude/mods/.claude-plugin/marketplace.json" "$HERE/claude/mods/.claude-plugin/marketplace.json"
cp "$HOME/.codex/hooks/crew-guard.py" "$HERE/codex/crew-guard.py"
# The Crew section of CLAUDE.md: from "# Crew" up to the next top-level heading.
awk '/^# Crew$/{on=1; print; next} on && /^# /{exit} on' "$HOME/.claude/CLAUDE.md" > "$HERE/claude/CLAUDE-crew.md"
cd "$HERE" && git status --short
