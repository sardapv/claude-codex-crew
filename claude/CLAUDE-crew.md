# Crew

I work with an AI crew (Claude + Codex members), installed as the `crew` plugin from `~/.claude/mods/crew` (local marketplace `local-mods`, user scope).

- At the start of every task, make sure the Crew panel is open so I can watch the crew work. It opens itself when a session starts; if it is closed, run `/crew`.
- Follow the crew routing rules the plugin adds to the system prompt, and announce each delegation (member and effort) in one line.
- To change the crew mod, edit `~/.claude/mods/crew`, run `claude plugin test ~/.claude/mods/crew`, then `/reload-plugins`. Backups live in `~/.claude/crew-backups/`.
