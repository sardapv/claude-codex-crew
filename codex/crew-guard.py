#!/usr/bin/env python3
"""Crew guard: a Codex PreToolUse hook for PostHog and Cloudflare.

Codex is allowed to run these two do-everything tools without asking, so
this hook is what keeps them read-only: every call that may change data is
denied, and the Claude side (where the user is asked) does the write instead.
Fails closed: anything it cannot read or classify is denied.
"""
import json
import re
import sys

POSTHOG_READ_CMD = re.compile(r"^\s*(learn|help|tools|search|info|schema)\b")
POSTHOG_CALL = re.compile(r"^\s*call\s+((?:--\w+\s+)*)([\w-]+)")
POSTHOG_READ_TOOL = re.compile(
    r"(^query-|^execute-sql$|^read-data-schema$|^docs-search$|(^|-)(get|list|retrieve|get-all|search|info)$)"
)
HTTP_WRITE = re.compile(
    r"\bmethod\s*:\s*[\"'`](POST|PUT|PATCH|DELETE)\b|\.(create|update|delete|edit|put|post|patch|purge|remove|set)\s*\(",
    re.I,
)
HTTP_GET = re.compile(r"\bmethod\s*:\s*[\"'`]GET\b|\.(get|list)\s*\(|cloudflare\.request\(\s*\{(?![^}]*method)", re.I)


def is_read(tool: str, args: dict) -> bool:
    if tool.endswith("posthog_exec") or tool.endswith("posthog__exec"):
        cmd = str(args.get("command", ""))
        if POSTHOG_READ_CMD.search(cmd):
            return True
        m = POSTHOG_CALL.search(cmd)
        if not m or "--confirm" in (m.group(1) or ""):
            return False
        return bool(POSTHOG_READ_TOOL.search(m.group(2)))
    if tool.endswith("cloudflare__execute"):
        code = str(args.get("code", ""))
        return bool(code) and not HTTP_WRITE.search(code)
    # Any other tool this hook is wired to: only clearly read-only names pass.
    return bool(re.search(r"__(search|docs|whoami|list|get)[\w-]*$", tool))


def deny(reason: str) -> None:
    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "deny",
            "permissionDecisionReason": reason,
        }
    }))
    sys.stderr.write(reason + "\n")
    sys.exit(2)


def main() -> None:
    try:
        event = json.load(sys.stdin)
        tool = str(event.get("tool_name", ""))
        args = event.get("tool_input") or {}
        if isinstance(args, str):
            args = json.loads(args)
    except Exception:
        deny("Crew guard: could not read this call, so it is blocked.")
        return
    if is_read(tool, args if isinstance(args, dict) else {}):
        sys.exit(0)
    deny(
        "Crew guard: Codex members may only read PostHog and Cloudflare. "
        "This call may change data, so hand it back to a Claude member, where the user is asked."
    )


if __name__ == "__main__":
    main()
