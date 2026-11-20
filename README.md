# Claude Codex Crew

Run a team of AI models from Claude Code. The team spans a Claude subscription and a Codex (OpenAI) subscription. A live org chart beside the chat shows who gives work to whom and who reports back, while the work runs.

- **One team, two subscriptions.** Claude Code is the boss. It sends routine work to cheaper Claude models through subagents, and to Codex models through `codex exec`. That keeps your Claude usage for the work that needs it.
- **Live org chart.** The Crew panel draws every member as a card with its tier, model and effort. When a member gets work, a green line runs from the member who gave it. When the member finishes, a blue line runs back. Nothing animates while the crew is idle.
- **Routing rules in the system prompt.** The mod tells Claude how to route work: which tier gets which kind of task, which tasks juniors may never get, and that failed work goes up a tier. Claude announces each delegation in one line.
- **Safe service access.** Per service, you choose whether reads run without asking and writes ask you first. On the Codex side, a hook keeps PostHog and Cloudflare read-only.

## The default crew

| Tier | Member | Vendor | Model | Effort | Gets |
| --- | --- | --- | --- | --- | --- |
| 0 CTO | Fable | Claude | claude-fable-5-2 | xhigh | Only problems that the Boss and the Advisor both failed to solve |
| 1 Boss | Opus | Claude | claude-opus-5-5 | high | Planning, decisions and the final check |
| 1 Advisor | Astra | Codex | gpt-6.2-astra | high | Second opinions on risky calls |
| 2 Lead | Sonnet | Claude | claude-sonnet-5-5 | high | Building, analysis, and review of junior work |
| 2 Lead | Sol | Codex | gpt-6.1-sol | high | Building and planning |
| 3 Specialist | Terra | Codex | gpt-6.1-terra | medium | Clear tasks with fixed limits |
| 4 Junior | Luna | Codex | gpt-6-luna | xhigh | Chores that need no decisions |
| 4 Junior | Haiku | Claude | claude-haiku-5-5 | xhigh | Chores that need no decisions |

In the panel you can change each member's model, effort and tier. Your changes are saved across sessions. To restore the defaults, select **Reset crew to defaults**.

## Requirements

- macOS or Linux, with `bash`, `rsync` and `python3`.
- [Claude Code](https://claude.com/claude-code), in a version that supports mods (plugins with a hooks module). The panel draws in the Claude desktop app and in other surfaces that support panes.
- Optional: the [Codex CLI](https://github.com/openai/codex), signed in. Without Codex, the Codex members can't run, but the chart and the Claude members still work.

## Install

```bash
git clone https://github.com/sardapv/claude-codex-crew.git
cd claude-codex-crew
./install.sh
```

You can run the installer more than once. It backs up every file before it changes it, with a timestamp in the backup's name. It does these things:

1. Copies the mod to `~/.claude/mods/crew`, registers that folder as a local plugin marketplace named `local-mods`, installs `crew@local-mods` for your user, and runs the mod's tests.
2. Adds a short "Crew" section to `~/.claude/CLAUDE.md`. The section tells Claude to keep the panel open and to follow the routing rules.
3. If Codex is installed, copies `crew-guard.py` to `~/.codex/hooks/`. In `~/.codex/config.toml`, it then adds the guard hook, the Cloudflare MCP server, and a setting that lets PostHog and Cloudflare reads run without a prompt.

Then do these steps by hand:

1. **Claude:** connect the services your crew uses (run `/mcp` to see them).
2. **Codex:** run `codex login`. For Cloudflare, also run `codex mcp login cloudflare`. Connect the other apps you use in Codex.
3. **Codex:** start `codex`, open `/hooks` and trust **Crew guard**. Until you trust it, Codex does not run the guard, so writes are not blocked.
4. Open a new Claude Code session. The Crew panel opens by itself. If you close it, type `/crew`.

## Make it yours

The mod is plain TypeScript in `claude/mods/crew/hooks/`. After you install it, edit the live copy in `~/.claude/mods/crew`. To load your changes, run `claude plugin test ~/.claude/mods/crew`, then `/reload-plugins`.

| To change | Edit |
| --- | --- |
| Default members, models, efforts and tiers | `DEFAULTS` in `hooks/register.tsx` |
| The routing rules that Claude gets | `routingText` in `hooks/register.tsx` |
| Which services the panel controls | `SERVICES` and its labels in `hooks/permissions.ts` |
| Which of your connectors belong to which service | `~/.claude/crew-connectors.json` (see below) |
| What counts as a read or a write | `isRead` in `hooks/permissions.ts`, and `codex/crew-guard.py` for Codex |
| The look of the chart | `hooks/chart.ts` |

**Map your connectors.** Claude names the tools of a claude.ai connector `mcp__<connector id>__<tool>`. Every account has its own IDs, so the mod reads them from a private file in your home folder, never from the repo. The installer creates `~/.claude/crew-connectors.json` as `{}`. Add one line per connector, using the services `shopify`, `posthog`, `supabase` and `cloudflare`:

```json
{
  "00000000-aaaa-0000-0000-000000000000": "shopify",
  "00000000-bbbb-0000-0000-000000000000": "supabase"
}
```

To find an ID, look at the connector's tool names in `/mcp`, or at a tool call in a transcript. The mod reads the file when a session starts. Without an entry, the mod falls back to the server's name: a tool whose server name contains "shopify" counts as Shopify. The official PostHog and Cloudflare plugins need no entry. A connector the mod can't match gets Claude's normal permission prompts.

**The routing rules describe the author's setup.** Rule 6 names the services the author tested. Change it to describe your own.

To copy your edits back into the repo, run `./sync-from-this-mac.sh`. Then commit.

## How the Codex guard works

`codex/crew-guard.py` is a Codex `PreToolUse` hook. It runs on every PostHog and Cloudflare tool call and allows only calls it can classify as reads:

- **PostHog:** `learn`, `help`, `tools`, `search`, `info` and `schema`, plus `call <tool>` when the tool is a query, get, list, retrieve or search, and the call has no `--confirm`.
- **Cloudflare:** `execute` code that has no POST, PUT, PATCH or DELETE request, and no create, update or delete call.

The guard denies everything else, including calls it can't read or classify. Send writes to a Claude member, where Claude Code asks you first.

To test it:

```bash
echo '{"tool_name":"mcp__cloudflare__execute","tool_input":{"code":"cloudflare.request({method:\"DELETE\"})"}}' \
  | python3 -I ~/.codex/hooks/crew-guard.py; echo "exit $?"   # exit 2 = blocked
```

## Uninstall

```bash
claude plugin uninstall crew@local-mods
claude plugin marketplace remove local-mods
```

Then delete these:

- the "Crew" section in `~/.claude/CLAUDE.md`
- the "Crew" blocks in `~/.codex/config.toml`
- the folder `~/.claude/mods/crew`

The installer's backups sit beside each file, with names like `*.bak-crew-<timestamp>`.

## License

MIT. See [LICENSE](LICENSE).
