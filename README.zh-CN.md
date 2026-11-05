# haloguard

**看清你的 AI 编程工具配置被改了什么——那个 MCP 服务器是谁加的。**

[English](README.md)

各种工具和安装脚本可能悄悄往 `~/.claude`、`~/.codex` 里加 hook、MCP 服务器和插件。`haloguard` 给这些配置拍快照，用事实告诉你改了什么：哪个文件、哪一行、什么时候。

- **完全离线。** 不联网、不上报、不自动更新。零依赖，大约 600 行代码，可以自己读完。
- **不显示你的密钥。** 看起来像 API key、token、密码、Bearer 头的值，在保存或打印之前就会被替换成 `***`。凭据文件（`.credentials.json`、`auth.json`、`.env`）根本不会打开。
- **只说事实，不下结论。** 它会告诉你「新增了 MCP 服务器 `foo`，运行 `npx -y foo-mcp`」，不会替你判断好坏。
- **没有回滚。** 只展示变化，不改你的配置。想要历史版本，可以在 `~/.claude` 里 `git init`，两者可以一起用。

## 安装

```bash
npx github:ai-martin-lau/haloguard --help
# 或
npm install -g github:ai-martin-lau/haloguard
```

需要 Node.js 18 以上。

## 用法

```bash
haloguard snapshot          # 保存一份（已脱敏的）快照到 ~/.haloguard/snapshots
haloguard snapshot -p .     # 同时盯当前项目的 CLAUDE.md、AGENTS.md、.mcp.json、.claude/settings*.json
haloguard status            # 跟上次快照比，改了什么？
haloguard diff              # 比较最近两次快照
haloguard drift .           # AGENTS.md 和 CLAUDE.md 内容是否不一致？
```

## 会标出哪些变化

- 新增、修改、删除的 **MCP 服务器**，以及它运行的命令或 URL
- 新增、删除的 **hook**（任何事件）和对应命令
- 新增的 **插件**和插件市场
- **权限被放宽**：新的 `permissions.allow` / `ask` 规则、`additionalDirectories`、`defaultMode`，Codex 的 `approval_policy`、`sandbox_mode`
- 含**网络请求**的命令（`curl`、`wget`、`nc`、`ssh`、URL 等）

加 `--json` 方便脚本处理，加 `--strict` 在有变化时以退出码 1 结束，适合放进 cron。

## 可选：Claude Code 危险命令护栏（需主动开启）

```bash
haloguard hook install          # 只说明会改什么，不做任何改动
haloguard hook install --yes    # 往 ~/.claude/settings.json 加一个 PreToolUse hook
haloguard hook test "rm -rf ~"  # 显示是否会拦截
haloguard hook uninstall        # 只删除 haloguard 自己加的那一条
```

会拦截：对 `/`、`~`、`$HOME`、`*`、`.`、`..` 的 `rm -rf`；SQL 的 `DROP DATABASE/SCHEMA/TABLE`、`TRUNCATE`、不带 `WHERE` 的 `DELETE`；对 `main`/`master` 的 `git push --force`（`--force-with-lease` 放行）；`git reset --hard`、`git clean -fd`；`mkfs`、`dd of=/dev/…`；`curl … | sh`；写 `.env` 文件；`terraform destroy`、`kubectl delete namespace`。
用 `HALOGUARD_ALLOW="片段1;;片段2"` 放行特定命令。它是安全带不是沙箱：只匹配命令文本，可以被绕过。

## 隐私

快照存在 `~/.haloguard/snapshots`（权限 600），里面只有脱敏后的文本，随时可以删除。

## 许可证

MIT。作者 Martin Lau，欢迎提 issue。
