#!/bin/bash
# Crew setup: installs the Crew mod for Claude Code and the Crew guard for Codex.
# Safe to run more than once. Backs up anything it changes.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
HOME_DIR="${CREW_HOME:-$HOME}"          # CREW_HOME is only for testing
STAMP="$(date +%Y%m%d%H%M%S)"
SKIP_CLI="${CREW_SKIP_CLI:-0}"          # 1 = do not call the claude/codex CLIs (testing)

say()  { printf '\033[1m==> %s\033[0m\n' "$*"; }
note() { printf '    %s\n' "$*"; }

# ---------- Claude Code ----------
say "Claude Code: Crew mod"
MODS="$HOME_DIR/.claude/mods"
mkdir -p "$HOME_DIR/.claude/crew-backups"
if [ -d "$MODS/crew" ]; then
  cp -R "$MODS/crew" "$HOME_DIR/.claude/crew-backups/crew-$STAMP"
  note "Old mod backed up to ~/.claude/crew-backups/crew-$STAMP"
fi
mkdir -p "$MODS"
rsync -a --delete --exclude '.claude-plugin/types' "$HERE/claude/mods/crew/" "$MODS/crew/"
mkdir -p "$MODS/.claude-plugin"
cp "$HERE/claude/mods/.claude-plugin/marketplace.json" "$MODS/.claude-plugin/marketplace.json"
note "Mod copied to ~/.claude/mods/crew"

if [ "$SKIP_CLI" != 1 ]; then
  if command -v claude >/dev/null 2>&1; then
    claude plugin marketplace list 2>/dev/null | grep -q 'local-mods' \
      || claude plugin marketplace add "$MODS"
    claude plugin install crew@local-mods --scope user || true
    claude plugin test "$MODS/crew" || note "Mod tests failed: see output above."
  else
    note "claude CLI not found: install Claude Code, then run this script again."
  fi
fi

CONNECTORS="$HOME_DIR/.claude/crew-connectors.json"
if [ ! -f "$CONNECTORS" ]; then
  (umask 077; printf '{}\n' > "$CONNECTORS")
  note "Created ~/.claude/crew-connectors.json: add your connector ids there (see README)"
fi

CLAUDE_MD="$HOME_DIR/.claude/CLAUDE.md"
touch "$CLAUDE_MD"
if grep -q '^# Crew$' "$CLAUDE_MD"; then
  note "~/.claude/CLAUDE.md already has the Crew section"
else
  cp "$CLAUDE_MD" "$CLAUDE_MD.bak-crew-$STAMP"
  [ -s "$CLAUDE_MD" ] && printf '\n' >> "$CLAUDE_MD"
  cat "$HERE/claude/CLAUDE-crew.md" >> "$CLAUDE_MD"
  note "Crew section added to ~/.claude/CLAUDE.md"
fi

# ---------- Codex ----------
say "Codex: Crew guard"
CODEX="$HOME_DIR/.codex"
CONF="$CODEX/config.toml"
if [ ! -d "$CODEX" ] && [ "$SKIP_CLI" != 1 ] && ! command -v codex >/dev/null 2>&1; then
  note "Codex not installed: skipping. Install it (brew install codex), sign in, then run this script again."
else
  mkdir -p "$CODEX/hooks"
  cp "$HERE/codex/crew-guard.py" "$CODEX/hooks/crew-guard.py"
  chmod +x "$CODEX/hooks/crew-guard.py"
  touch "$CONF"
  cp "$CONF" "$CONF.bak-crew-$STAMP"
  note "config.toml backed up to config.toml.bak-crew-$STAMP"

  if ! grep -q '^\[mcp_servers\.cloudflare\]' "$CONF"; then
    printf '\n[mcp_servers.cloudflare]\nurl = "https://mcp.cloudflare.com/mcp"\n' >> "$CONF"
    note "Cloudflare MCP server added"
  fi
  if ! grep -q 'crew-guard.py' "$CONF"; then
    cat >> "$CONF" <<EOF

# Crew guard: keeps PostHog and Cloudflare read-only for Codex members.
[[hooks.PreToolUse]]
matcher = ".*(posthog|cloudflare).*"
[[hooks.PreToolUse.hooks]]
type = "command"
command = "python3 -I $CODEX/hooks/crew-guard.py"
timeout = 10
statusMessage = "Crew guard"
EOF
    note "Crew guard hook added"
  fi
  if ! grep -q '^\[apps\.asdk_app_699caef2d680819188727b0ddbb349dd\]' "$CONF"; then
    cat >> "$CONF" <<'EOF'

# Crew: Codex may call PostHog and Cloudflare without an approval prompt.
# Crew guard (PreToolUse hook above) denies every call that may change data.
[apps.asdk_app_699caef2d680819188727b0ddbb349dd]
default_tools_approval_mode = "approve"
EOF
  fi
  if ! grep -q '^\[mcp_servers\.cloudflare\.tools\.execute\]' "$CONF"; then
    printf '\n[mcp_servers.cloudflare.tools.execute]\napproval_mode = "approve"\n' >> "$CONF"
  fi
  note "PostHog and Cloudflare reads set to run without asking (guard blocks writes)"
fi

say "Done. Finish these by hand:"
cat <<'EOF'
  1. Claude: connect the services your crew uses (check with /mcp).
  2. Codex: run `codex login`, and `codex mcp login cloudflare` if you use Cloudflare.
     Connect any other apps you use (Shopify, Supabase, PostHog...) in Codex.
  3. Codex: start `codex`, open /hooks and trust "Crew guard".
     Until you trust it, Codex skips the guard.
  4. Open a new Claude Code session: the Crew panel opens by itself (or type /crew).
EOF
