# Claude Codex Crew

Run a team of AI models from Claude Code. The team spans a Claude subscription and a Codex (OpenAI) subscription. A live org chart beside the chat shows who gives work to whom and who reports back, while the work runs.

<p align="center">
  <img src="docs/crew-demo.gif" alt="The Crew panel: Opus asks Astra, its Co-boss, for a view, then hands work down to Sonnet, Sol and Luna along green command lines, and each reports back up along a blue line" width="400">
  <br>
  <sub>A sample run: green lines are commands, blue lines are report-backs. <a href="docs/crew-demo.mp4">Full-quality video (MP4)</a></sub>
</p>

- **One team, two subscriptions.** Claude Code is the boss. It sends routine work to cheaper Claude models through subagents, and to Codex models through `codex exec`. That keeps your Claude usage for the work that needs it.
- **Live org chart.** The Crew panel draws every member as a card with its tier, model and effort. When a member gets work, a green line runs from the member who gave it. When the member finishes, a blue line runs back. Nothing animates while the crew is idle.
- **Routing rules in the system prompt.** The mod tells Claude how to route work: which tier gets which kind of task, which tasks juniors may never get, and that failed work goes up a tier. Claude announces each delegation in one line.
- **Safe service access, for the services you pick.** You choose which of Shopify, PostHog, Supabase and Cloudflare your crew uses. Per service, you choose whether reads run without asking and writes ask you first. On the Codex side, a hook keeps PostHog and Cloudflare read-only.

## The default crew

| Tier | Member | Uses | Model | Effort | Gets |
| --- | --- | --- | --- | --- | --- |
| 1 Boss | Opus | Claude | claude-opus-5-5 | high | Planning, decisions and the final check |
| 1 Co-boss | Astra | Codex | gpt-6.2-astra | high | Talks every hard call through with Opus |
| 2 Lead | Sonnet | Claude | claude-sonnet-5-5 | high | Building, analysis, and review of junior work |
| 2 Lead | Sol | Codex | gpt-6.1-sol | high | Building and planning |
| 3 Specialist | Terra | Codex | gpt-6.1-terra | medium | Clear tasks with fixed limits |
| 4 Junior | Luna | Codex | gpt-6-luna | xhigh | Chores that need no decisions |
| 4 Junior | Haiku | Claude | claude-haiku-5-5 | xhigh | Chores that need no decisions |

In the panel you can change each member's model, effort and tier, and each service's access:

- **Your changes apply to that chat only.** Each chat's panel shows its own work, and the chat's own member (Opus or Sonnet, whichever model the chat runs) shows the effort you picked for the chat.
- **To use your changes in every new chat,** select **Save as default**. **Discard this chat's changes** goes back to your saved defaults, and **Reset crew to factory settings** goes back to the table above.

## Who did what

Before multi-step work, Claude posts a Crew plan table. The mod also draws a card under every delegation that shows the member, the task and the status. [See examples](docs/transcript.md).

## Requirements

- macOS or Linux, with `bash`, `rsync` and `python3`.
- [Claude Code](https://claude.com/claude-code), in a version that supports mods (plugins with a hooks module). The panel draws in the Claude desktop app and in other surfaces that support panes.
- Optional: the [Codex CLI](https://github.com/openai/codex), signed in. Without Codex, the routing rules send Codex members' work to Claude members, and the chart still shows the whole crew.

## Cost

The crew adds no cost of its own. It runs on the Claude and Codex subscriptions you already have, and each delegation uses that member's model and effort from that subscription's usage.

Sending routine work to cheaper members (Haiku, Luna, Terra) is the point. It saves your Claude usage for work that needs it.

The crew has two bosses and no CTO, so it works on plans that don't include the most expensive models. Opus leads. When a task is complex, risky or uncertain, Opus asks Astra (on your Codex plan) for its view before deciding. If they disagree, Opus decides and tells you both positions. Routine work never goes to Astra.

To spend less on any member, lower its effort or pick a cheaper model in the panel.

## Install

Which setup should I use? Both routes run the same `install.sh` and end with the same result. The Claude route also finds your connector IDs and fills `~/.claude/crew.json` for you, so it is quicker. The by-hand route leaves you to add connector IDs yourself. Both routes still need the Codex steps by hand (`codex login`, and trusting **Crew guard** in `/hooks`), because those need your sign-in.

### Set up with Claude (recommended)

Paste this into Claude Code. Claude asks which services you use, runs the installer, and finds your connector IDs, so you don't look anything up by hand.

```text
Set up Claude Codex Crew for me from https://github.com/sardapv/claude-codex-crew.

1. Clone it to ~/claude-codex-crew (or pull if it is already there). Read README.md and install.sh before running anything.
2. Ask me which services I use (Shopify, PostHog, Supabase, Cloudflare; any or none) and whether to set up Codex members. Then run:
   ~/claude-codex-crew/install.sh --services <my list, comma separated, or none> --codex <yes|no>
3. Find my connector IDs. For each service I chose, look at the MCP tools connected in this session. A claude.ai connector's tools are named mcp__<connector id>__<tool>. Match each connector to a service by its tools: Shopify has tools like get-shop-info and search_products; Supabase has execute_sql and list_projects; PostHog has exec or query tools; Cloudflare has execute plus search or docs. Skip tools named mcp__plugin_posthog_posthog__* or mcp__plugin_cloudflare_cloudflare__*: the mod already knows those. If a service I chose has no connector in this session, tell me to connect it (/mcp), then continue.
4. Merge what you found into the "connectors" object of ~/.claude/crew.json as "<connector id>": "<service>". Keep every other key and entry. Keep the file mode 600.
5. Show me the final ~/.claude/crew.json and the hand steps the installer printed that still apply to me. Tell me to open a new Claude Code session, where the Crew panel opens by itself.
```

### Set up by hand

```bash
git clone https://github.com/sardapv/claude-codex-crew.git ~/claude-codex-crew
cd ~/claude-codex-crew
./install.sh
```

The installer asks which services you use and whether to set up Codex members. To skip the questions, pass your answers:

```bash
./install.sh --services supabase,posthog --codex yes   # or --services all / none, --codex no
./install.sh --yes                                      # all services, Codex if it is installed
```

You can run the installer again at any time to change your answers. It backs up every file before it changes it, with a timestamp in the backup's name. It does these things:

1. Copies the mod to `~/.claude/mods/crew`, registers that folder as a local plugin marketplace named `local-mods`, installs `crew@local-mods` for your user, and runs the mod's tests.
2. Adds a short "Crew" section to `~/.claude/CLAUDE.md`. The section tells Claude to keep the panel open and to follow the routing rules.
3. Writes your answers to `~/.claude/crew.json`, a private file that only you can read. If the file already exists, the installer keeps its connector IDs.
4. If you set up Codex and chose PostHog or Cloudflare: copies `crew-guard.py` to `~/.codex/hooks/`. In `~/.codex/config.toml`, it adds the guard hook for those services, plus a setting that lets their reads run without a prompt. For Cloudflare, it also adds the Cloudflare MCP server.

Then do the steps that the installer prints at the end:

1. **Claude:** connect the services you chose (run `/mcp` to see them).
2. **Connector IDs:** add them to `~/.claude/crew.json` (see the section "~/.claude/crew.json" below).
3. **Codex:** run `codex login`, connect your services in Codex, and for Cloudflare run `codex mcp login cloudflare`.
4. **Codex:** start `codex`, open `/hooks` and trust **Crew guard**. Until you trust it, Codex does not run the guard, so writes are not blocked.
5. Open a new Claude Code session. The Crew panel opens by itself. If you close it, type `/crew`.

## What you should see

- Open a new Claude Code session. The Crew panel opens beside the chat with all members and an "Idle" badge. If it doesn't, type `/crew`.
- Give Claude a multi-step task. It posts a "Crew plan" table before it delegates.
- Each delegation gets a card in the transcript and a green line on the chart. When the member finishes, a blue report-back line runs back.

## ~/.claude/crew.json

This file holds your setup. It stays on your machine and is never part of the repo. The mod reads it each time a session starts.

```json
{
  "services": ["supabase", "posthog"],
  "codex": true,
  "connectors": {
    "00000000-aaaa-0000-0000-000000000000": "supabase",
    "00000000-bbbb-0000-0000-000000000000": "posthog"
  }
}
```

- **`services`**: the services the panel shows and guards. A service that isn't listed gets Claude Code's normal permission prompts. Without this key, the mod uses all four.
- **`codex`**: `false` tells Claude not to delegate to Codex members.
- **`connectors`**: maps each claude.ai connector to its service. Claude names a connector's tools `mcp__<connector id>__<tool>`, and every account has its own IDs. The connector ID is the part between `mcp__` and the next `__`. For example, a tool named `mcp__0f1e2d3c-1111-2222-3333-444455556666__execute_sql` belongs to the connector with ID `0f1e2d3c-1111-2222-3333-444455556666`, and that one is Supabase. To find an ID, look at the connector's tool names in `/mcp`, or let Claude do it with the prompt above.

  Without an entry, the mod first tries the server's name: a server whose name contains "supabase" counts as Supabase. If it still can't tell the service, that connector's calls get Claude Code's normal permission prompts. Nothing becomes less safe. You only lose "reads run without asking" for that connector.

  The official PostHog and Cloudflare plugins (tools named `mcp__plugin_posthog_posthog__*` and `mcp__plugin_cloudflare_cloudflare__*`) need no entry.

## Make it yours

The mod is plain TypeScript in `claude/mods/crew/hooks/`. After you install it, edit the live copy in `~/.claude/mods/crew`. To load your changes, run `claude plugin test ~/.claude/mods/crew`, then `/reload-plugins`.

| To change | Edit |
| --- | --- |
| Default members, models, efforts and tiers | `DEFAULTS` in `hooks/register.tsx` |
| The routing rules that Claude gets, including the Crew plan rule | `routingText` and `toolsRule` in `hooks/register.tsx` |
| The card under each delegation | `delegationCard` and the `ToolUse` and `ToolGroup` render hooks in `hooks/register.tsx` |
| What counts as a read or a write | `isRead` in `hooks/permissions.ts`, and `codex/crew-guard.py` for Codex |
| The look of the chart | `hooks/chart.ts` |

To copy your edits back into the repo, run `./sync-from-this-mac.sh`. Then commit.

## How the Codex guard works

`codex/crew-guard.py` is a Codex `PreToolUse` hook. It runs on every call to the services you chose of PostHog and Cloudflare, and allows only calls it can classify as reads:

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
- `~/.claude/crew.json`
- the folder `~/.claude/mods/crew`

The installer's backups sit beside each file, with names like `*.bak-crew-<timestamp>`.

## License

MIT. See [LICENSE](LICENSE).
