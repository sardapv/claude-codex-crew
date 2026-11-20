#!/bin/bash
# Crew setup for Claude Code and optional Codex members.
# Safe to run more than once. Backs up existing files before changing them.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
HOME_DIR="${CREW_HOME:-$HOME}"          # CREW_HOME is only for testing
STAMP="$(date +%Y%m%d%H%M%S)-$$"
SKIP_CLI="${CREW_SKIP_CLI:-0}"          # 1 = never call the claude/codex CLIs

say()  { printf '\033[1m==> %s\033[0m\n' "$*"; }
note() { printf '    %s\n' "$*"; }
fail() { printf 'Error: %s\n' "$*" >&2; exit 1; }
backup() { cp -p "$1" "$1.bak-crew-$STAMP"; }

usage() {
  cat <<'EOF'
Usage: ./install.sh [--services <list>] [--codex yes|no] [--yes] [--help]

  --services <list>  Comma-separated shopify,posthog,supabase,cloudflare,
                     or all or none (default: all).
  --codex yes|no    Set up Codex members (default: yes if Codex is installed).
  --yes             Do not ask questions; use defaults for unspecified options.
  --help            Show this help.

With no flags and a terminal on stdin, ask which services and Codex to use.
CREW_HOME overrides the home directory; CREW_SKIP_CLI=1 skips all CLI calls
and treats Codex as installed (for testing).
EOF
}

SERVICES="all"
CODEX_CHOICE=""
HAS_FLAGS=0
while [ "$#" -gt 0 ]; do
  HAS_FLAGS=1
  case "$1" in
    --services)
      [ "$#" -ge 2 ] || fail "--services requires a list"
      SERVICES="$2"
      case "$SERVICES" in
        all|none) ;;
        ''|,*|*,|*,,*) fail "Invalid service list: $SERVICES" ;;
        *)
          remaining="$SERVICES"
          while true; do
            service="${remaining%%,*}"
            case "$service" in
              shopify|posthog|supabase|cloudflare) ;;
              *) fail "Unknown service '$service'; choose shopify, posthog, supabase, cloudflare, all or none" ;;
            esac
            case "$remaining" in
              *,*) remaining="${remaining#*,}" ;;
              *) break ;;
            esac
          done
          ;;
      esac
      shift 2
      ;;
    --codex)
      [ "$#" -ge 2 ] || fail "--codex requires yes or no"
      case "$2" in yes|no) CODEX_CHOICE="$2" ;; *) fail "--codex requires yes or no" ;; esac
      shift 2
      ;;
    --yes) shift ;;
    --help) usage; exit 0 ;;
    *) fail "Unknown option: $1 (use --help)" ;;
  esac
done

CODEX_INSTALLED=no
if [ "$SKIP_CLI" = 1 ] || command -v codex >/dev/null 2>&1; then
  CODEX_INSTALLED=yes
fi
[ -n "$CODEX_CHOICE" ] || CODEX_CHOICE="$CODEX_INSTALLED"

ask() {
  local answer
  while true; do
    printf '%s [Y/n] ' "$1"
    if ! IFS= read -r answer; then printf '\n'; return 0; fi
    case "$answer" in
      ''|y|Y|yes|YES|Yes) return 0 ;;
      n|N|no|NO|No) return 1 ;;
      *) note "Please answer yes or no." ;;
    esac
  done
}

if [ "$HAS_FLAGS" = 0 ] && [ -t 0 ]; then
  SERVICES=""
  for label in Shopify PostHog Supabase Cloudflare; do
    case "$label" in
      Shopify) service=shopify ;;
      PostHog) service=posthog ;;
      Supabase) service=supabase ;;
      Cloudflare) service=cloudflare ;;
    esac
    if ask "Use $label?"; then SERVICES="${SERVICES:+$SERVICES,}$service"; fi
  done
  if [ "$CODEX_INSTALLED" = yes ]; then
    if ask "Set up Codex members?"; then CODEX_CHOICE=yes; else CODEX_CHOICE=no; fi
  else
    note "Codex not found; skipping Codex setup."
  fi
fi

# Canonical order also removes duplicates from the requested list.
CHOSEN=""
GUARDED=""
for service in shopify posthog supabase cloudflare; do
  if [ "$SERVICES" = all ] || [[ ",$SERVICES," = *",$service,"* ]]; then
    CHOSEN="${CHOSEN:+$CHOSEN,}$service"
    case "$service" in
      posthog|cloudflare) GUARDED="${GUARDED:+$GUARDED|}$service" ;;
    esac
  fi
done

# ---------- Claude Code ----------
say "Claude Code: Crew mod"
MODS="$HOME_DIR/.claude/mods"
mkdir -p "$HOME_DIR/.claude/crew-backups"
if [ -d "$MODS/crew" ]; then
  cp -Rp "$MODS/crew" "$HOME_DIR/.claude/crew-backups/crew-$STAMP"
  note "Old mod backed up to ~/.claude/crew-backups/crew-$STAMP"
fi
mkdir -p "$MODS"
rsync -a --delete --exclude '.claude-plugin/types' "$HERE/claude/mods/crew/" "$MODS/crew/"
mkdir -p "$MODS/.claude-plugin"
MARKETPLACE="$MODS/.claude-plugin/marketplace.json"
if ! cmp -s "$HERE/claude/mods/.claude-plugin/marketplace.json" "$MARKETPLACE"; then
  if [ -e "$MARKETPLACE" ]; then backup "$MARKETPLACE"; fi
  cp "$HERE/claude/mods/.claude-plugin/marketplace.json" "$MARKETPLACE"
fi
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

python3 -I - "$HOME_DIR/.claude" "$CHOSEN" "$CODEX_CHOICE" "$STAMP" <<'PY'
import json
import os
from pathlib import Path
import shutil
import stat
import sys

root, services, codex, stamp = sys.argv[1:]
path = Path(root) / 'crew.json'
existing = path.exists()
data = json.loads(path.read_text()) if existing else {}
if not isinstance(data, dict):
    raise SystemExit('Error: crew.json must contain a JSON object')
legacy = Path(root) / 'crew-connectors.json'
if 'connectors' not in data or data['connectors'] == {}:
    if legacy.exists():
        data['connectors'] = json.loads(legacy.read_text())
    else:
        data.setdefault('connectors', {})
data['services'] = services.split(',') if services else []
data['codex'] = codex == 'yes'
content = json.dumps(data, indent=2) + '\n'
if (not existing or path.read_text() != content
        or stat.S_IMODE(path.stat().st_mode) != 0o600):
    if existing:
        shutil.copy2(path, str(path) + '.bak-crew-' + stamp)
    # New files must also be private before their contents are written.
    with os.fdopen(os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600), 'w') as out:
        out.write(content)
    path.chmod(0o600)
print('    Services: ' + (services or 'none') + '; Codex: ' + codex)
print('    Settings saved in ~/.claude/crew.json')
PY

CLAUDE_MD="$HOME_DIR/.claude/CLAUDE.md"
if [ -f "$CLAUDE_MD" ] && grep -q '^# Crew$' "$CLAUDE_MD"; then
  note "~/.claude/CLAUDE.md already has the Crew section"
else
  if [ -e "$CLAUDE_MD" ]; then backup "$CLAUDE_MD"; fi
  [ ! -s "$CLAUDE_MD" ] || printf '\n' >> "$CLAUDE_MD"
  cat "$HERE/claude/CLAUDE-crew.md" >> "$CLAUDE_MD"
  note "Crew section added to ~/.claude/CLAUDE.md"
fi

# ---------- Codex ----------
CODEX="$HOME_DIR/.codex"
CONF="$CODEX/config.toml"
GUARD_INSTALLED=no
if [ "$CODEX_CHOICE" = yes ]; then
  say "Codex: Crew members"
  if [ -n "$GUARDED" ]; then
    mkdir -p "$CODEX/hooks"
    GUARD="$CODEX/hooks/crew-guard.py"
    if ! cmp -s "$HERE/codex/crew-guard.py" "$GUARD" || [ ! -x "$GUARD" ]; then
      if [ -e "$GUARD" ]; then backup "$GUARD"; fi
      cp "$HERE/codex/crew-guard.py" "$GUARD"
      chmod +x "$GUARD"
    fi
    GUARD_INSTALLED=yes
  else
    note "Crew guard is not needed for the chosen services."
  fi
fi

# Inspect existing service blocks even when Codex setup is disabled. Only write
# config.toml when a selected guarded service needs setup.
python3 -I - "$CONF" "$CHOSEN" "$CODEX_CHOICE" "$GUARDED" "$STAMP" <<'PY'
import json
from pathlib import Path
import re
import shlex
import shutil
import sys

filename, services, codex, guarded, stamp = sys.argv[1:]
path = Path(filename)
chosen = set(services.split(',')) if services else set()
if path.exists():
    with path.open(newline='') as source:
        original = source.read()
else:
    original = ''
content = original
posthog = 'apps.asdk_app_699caef2d680819188727b0ddbb349dd'
cloudflare = 'mcp_servers.cloudflare'


def has_table(name):
    parts = [r'(?:' + re.escape(part) + '|' + re.escape('"' + part + '"')
             + '|' + re.escape("'" + part + "'") + ')' for part in name.split('.')]
    return re.search(r'^[ \t]*\[[ \t]*' + r'[ \t]*\.[ \t]*'.join(parts)
                     + r'[ \t]*\][ \t]*(?:#[^\r\n]*)?\r?$',
                     content, re.MULTILINE) is not None


retained = []
if 'posthog' not in chosen and has_table(posthog):
    retained.append('posthog')
if 'cloudflare' not in chosen and (has_table(cloudflare) or has_table(cloudflare + '.tools.execute')):
    retained.append('cloudflare')
if retained:
    print('    Existing blocks retained for unchosen services: ' + ', '.join(retained))

if codex == 'yes' and guarded:
    comment = '# Crew guard: keeps PostHog and Cloudflare read-only for Codex members.'
    matcher = 'matcher = ".*(' + guarded + ').*"'
    lines = content.splitlines(keepends=True)
    marker = next((i for i, line in enumerate(lines) if line.strip() == comment), None)
    if marker is not None:
        # Stop at the next table so another hook's matcher is never rewritten.
        hook = None
        for i in range(marker + 1, len(lines)):
            if lines[i].strip().startswith('['):
                if lines[i].strip() == '[[hooks.PreToolUse]]':
                    hook = i
                break
        if hook is None:
            raise SystemExit('Error: existing Crew guard comment has no PreToolUse hook')
        for i in range(hook + 1, len(lines)):
            if lines[i].strip().startswith('['):
                raise SystemExit('Error: existing Crew guard hook has no matcher')
            if re.match(r'^\s*matcher\s*=', lines[i]):
                ending = ('\r\n' if lines[i].endswith('\r\n') else
                          '\n' if lines[i].endswith('\n') else '')
                lines[i] = matcher + ending
                break
        else:
            raise SystemExit('Error: existing Crew guard hook has no matcher')
        content = ''.join(lines)
    else:
        command = 'python3 -I ' + shlex.quote(str(path.parent / 'hooks' / 'crew-guard.py'))
        content += ('\n' + comment + '\n[[hooks.PreToolUse]]\n' + matcher
                    + '\n[[hooks.PreToolUse.hooks]]\ntype = "command"\ncommand = '
                    + json.dumps(command, ensure_ascii=False)
                    + '\ntimeout = 10\nstatusMessage = "Crew guard"\n')
    if 'posthog' in chosen and not has_table(posthog):
        content += ('\n# Crew: Codex may call PostHog without an approval prompt.\n'
                    '# Crew guard (PreToolUse hook above) denies every call that may change data.\n'
                    '[' + posthog + ']\ndefault_tools_approval_mode = "approve"\n')
    if 'cloudflare' in chosen:
        if not has_table(cloudflare):
            content += '\n[mcp_servers.cloudflare]\nurl = "https://mcp.cloudflare.com/mcp"\n'
        if not has_table(cloudflare + '.tools.execute'):
            content += '\n[mcp_servers.cloudflare.tools.execute]\napproval_mode = "approve"\n'
    if content != original:
        path.parent.mkdir(parents=True, exist_ok=True)
        if path.exists():
            shutil.copy2(path, str(path) + '.bak-crew-' + stamp)
        with path.open('w', newline='') as out:
            out.write(content)
        print('    Codex config updated; Crew guard matcher: .*(' + guarded + ').*')
    else:
        print('    Codex config already up to date')
PY

say "Done. Finish these by hand:"
if [ -n "$CHOSEN" ]; then
  note "Claude: connect $CHOSEN (check with /mcp)."
  note 'Map connector ids in ~/.claude/crew.json "connectors", or use the "Set up with Claude" prompt in README.'
fi
if [ "$CODEX_CHOICE" = yes ]; then
  note 'Codex: run `codex login`.'
  if [[ ",$CHOSEN," = *",cloudflare,"* ]]; then
    note 'Codex: run `codex mcp login cloudflare`.'
  fi
  if [ "$GUARD_INSTALLED" = yes ]; then
    note 'Codex: open /hooks and trust "Crew guard".'
  fi
fi
note 'Open a new Claude Code session: the Crew panel opens by itself (or type /crew).'
