#!/usr/bin/env node
'use strict';
// Claude Code PreToolUse hook. Reads the tool call from stdin; exit code 2 blocks it and the
// reason on stderr is shown to Claude. Offline: no network, no file writes.
const RULES = [
  { id: 'rm-broad', re: /\brm\s+(-[a-zA-Z]*[rR][a-zA-Z]*\s+-?[a-zA-Z]*f?|-[a-zA-Z]*f[a-zA-Z]*[rR][a-zA-Z]*|--recursive\s+--force|--force\s+--recursive)\s*(\/|~\/?|\$HOME\/?|\*|\.\/?|\.\.\/?|\/\*)(\s|$|;|&|\|)/, why: 'recursive force delete on a broad path (/, ~, $HOME, *, . or ..)' },
  { id: 'rm-no-preserve', re: /--no-preserve-root/, why: 'rm with --no-preserve-root' },
  { id: 'sql-drop', re: /\b(DROP\s+(DATABASE|SCHEMA|TABLE)|TRUNCATE\s+TABLE)\b/i, why: 'SQL DROP/TRUNCATE statement' },
  { id: 'sql-delete-all', re: /\bDELETE\s+FROM\s+[\w."`]+\s*(;|$|")/i, why: 'SQL DELETE without WHERE' },
  { id: 'git-force-main', re: /\bgit\s+push\b(?=.*(\s-f\b|--force(?!-with-lease)))(?=.*\b(main|master)\b)/, why: 'git push --force to main/master' },
  { id: 'git-reset-hard', re: /\bgit\s+(reset\s+--hard|clean\s+-[a-zA-Z]*f[a-zA-Z]*d|clean\s+-[a-zA-Z]*d[a-zA-Z]*f)/, why: 'git reset --hard / git clean -fd discards uncommitted work' },
  { id: 'disk', re: /\b(mkfs(\.\w+)?|dd\s+[^|]*of=\/dev\/(sd|nvme|disk|hd))/, why: 'disk format / raw disk write' },
  { id: 'chmod-777-root', re: /\bchmod\s+(-R\s+)?777\s+\/(\s|$)/, why: 'chmod 777 on /' },
  { id: 'fork-bomb', re: /:\(\)\s*\{\s*:\|:&\s*\};:/, why: 'fork bomb' },
  { id: 'pipe-shell', re: /\b(curl|wget)\b[^|]*\|\s*(sudo\s+)?(ba|z)?sh\b/, why: 'downloads a script and pipes it into a shell' },
  { id: 'env-write', re: /(>|>>|\btee\b)\s*\S*\.env(\.\w+)?(\s|$)/, why: 'overwrites a .env file' },
  { id: 'terraform-destroy', re: /\b(terraform\s+destroy|kubectl\s+delete\s+(ns|namespace)\b)/, why: 'infrastructure destroy' },
];

function check(command) {
  const c = String(command || '');
  for (const r of RULES) if (r.re.test(c)) return r;
  return null;
}

function allowed(command) {
  const list = (process.env.HALOGUARD_ALLOW || '').split(';;').filter(Boolean);
  return list.some((s) => command.includes(s));
}

if (require.main === module) {
  let input = '';
  process.stdin.on('data', (d) => { input += d; });
  process.stdin.on('end', () => {
    let cmd = '';
    try { const j = JSON.parse(input); cmd = (j.tool_input && (j.tool_input.command || '')) || ''; } catch { process.exit(0); }
    const hit = check(cmd);
    if (hit && !allowed(cmd)) {
      process.stderr.write(`haloguard blocked this command (${hit.id}): ${hit.why}. If it is intended, ask the user to run it themselves.\n`);
      process.exit(2);
    }
    process.exit(0);
  });
}

module.exports = { check, RULES };
