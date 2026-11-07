#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const core = require('../src/core');
const { checkDrift } = require('../src/drift');
const hook = require('../src/hook');
const { check } = require('../src/guard-hook');
const pkg = require('../package.json');

const HELP = `haloguard ${pkg.version} - watch your AI coding agent config (~/.claude, ~/.codex) for changes.
Fully offline. Common secret patterns are masked best-effort before text is stored or printed. Review output before sharing; this is not a secret scanner.

Usage:
  haloguard snapshot [-p DIR...]     Save a best-effort masked snapshot to ~/.haloguard/snapshots
  haloguard status   [-p DIR...]     Compare current config with the latest snapshot
  haloguard diff [A] [B]             Compare two snapshots (default: the last two)
  haloguard list                     List snapshots
  haloguard drift [DIR]              Check AGENTS.md vs CLAUDE.md drift in DIR (default .)
  haloguard hook install --yes       Opt-in: add a Claude Code PreToolUse hook that blocks
                                     dangerous shell commands (edits ~/.claude/settings.json)
  haloguard hook uninstall           Remove that hook
  haloguard hook test "<command>"    Show whether the hook would block a command

Options:
  -p, --project DIR   Also watch CLAUDE.md, AGENTS.md, .mcp.json, .claude/settings*.json in DIR
  --json              Machine-readable output
  --no-lines          Only list facts and files, not changed lines
  --strict            Exit 1 if anything changed (for CI / cron)
`;

const C = process.stdout.isTTY && !process.env.NO_COLOR;
const col = (n, s) => (C ? `\x1b[${n}m${s}\x1b[0m` : s);

function parse(argv) {
  const o = { _: [], projects: [], json: false, lines: true, strict: false, yes: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-p' || a === '--project') o.projects.push(argv[++i]);
    else if (a === '--json') o.json = true;
    else if (a === '--no-lines') o.lines = false;
    else if (a === '--strict') o.strict = true;
    else if (a === '--yes' || a === '-y') o.yes = true;
    else if (a === '-h' || a === '--help') o.help = true;
    else if (a === '-v' || a === '--version') o.version = true;
    else o._.push(a);
  }
  return o;
}

function printCompare(r, o) {
  if (o.json) { console.log(JSON.stringify(r, null, 2)); return; }
  console.log(`Comparing ${r.from} -> ${r.to}`);
  if (!r.files.length) { console.log(col(32, 'No changes.')); return; }
  if (r.findings.length) {
    console.log(col(1, '\nFacts:'));
    for (const f of r.findings) {
      const net = f.network ? col(33, ' [contains a network call]') : '';
      const extra = f.change === 'changed' ? ` (was: ${f.from})` : '';
      const val = f.kind === 'mcp' || f.kind === 'hooks' ? ` -> ${f.value}` : '';
      console.log(`  ${f.change.toUpperCase()} ${f.label}: ${f.key}${val}${extra}${net}`);
      console.log(col(2, `      in ${f.file}${f.mtime ? ` (modified ${f.mtime})` : ''}`));
    }
  }
  console.log(col(1, '\nFiles:'));
  for (const f of r.files) {
    console.log(`  ${f.status.padEnd(8)} ${f.file}${f.mtime ? col(2, `  (mtime ${f.mtime})`) : ''}`);
    if (o.lines) for (const l of f.lines.slice(0, 200)) console.log(`      ${l.op === '+' ? col(32, '+') : col(31, '-')} ${String(l.line).padStart(4)}: ${l.text}`);
    if (o.lines && f.lines.length > 200) console.log(`      ... ${f.lines.length - 200} more line(s)`);
  }
}

function main(argv) {
  const o = parse(argv);
  if (o.version) { console.log(pkg.version); return 0; }
  const cmd = o._[0];
  if (!cmd || o.help) { console.log(HELP); return 0; }
  if (cmd === 'snapshot') {
    const s = core.takeSnapshot({ projects: o.projects });
    const p = core.saveSnapshot(s);
    console.log(o.json ? JSON.stringify({ path: p, files: Object.keys(s.files).length }) : `Saved ${Object.keys(s.files).length} file(s) to ${p}`);
    return 0;
  }
  if (cmd === 'list') {
    const l = core.listSnapshots();
    console.log(o.json ? JSON.stringify(l) : l.join('\n') || 'No snapshots yet. Run: haloguard snapshot');
    return 0;
  }
  if (cmd === 'status') {
    const l = core.listSnapshots();
    if (!l.length) { console.log('No snapshot yet. Run: haloguard snapshot'); return 0; }
    const last = core.loadSnapshot(l[l.length - 1]);
    const projects = o.projects.length ? o.projects : last.projects || [];
    const r = core.compare(last, core.takeSnapshot({ projects }));
    printCompare(r, o);
    return o.strict && r.files.length ? 1 : 0;
  }
  if (cmd === 'diff') {
    const l = core.listSnapshots();
    const pick = (x) => (fs.existsSync(x) ? x : path.join(core.stateDir(), 'snapshots', x));
    const a = o._[1] ? pick(o._[1]) : l[l.length - 2];
    const b = o._[2] ? pick(o._[2]) : l[l.length - 1];
    if (!a || !b) { console.log('Need two snapshots.'); return 0; }
    const r = core.compare(core.loadSnapshot(a), core.loadSnapshot(b));
    printCompare(r, o);
    return o.strict && r.files.length ? 1 : 0;
  }
  if (cmd === 'drift') {
    const r = checkDrift(o._[1] || '.');
    if (o.json) { console.log(JSON.stringify(r, null, 2)); return o.strict && r.pairs.some((p) => !p.inSync) ? 1 : 0; }
    console.log(`Instruction files in ${r.dir}: ${r.files.join(', ') || 'none'}`);
    for (const p of r.pairs) {
      console.log(`  ${p.a} vs ${p.b}: ${p.state}`);
      if (o.lines) for (const l of p.diff.slice(0, 100)) console.log(`      ${l.op === '-' ? `only in ${p.a}` : `only in ${p.b}`}: ${l.text}`);
      if (!p.inSync && !p.imports) console.log('  Tip: keep one source of truth, e.g. put "@AGENTS.md" in CLAUDE.md or symlink CLAUDE.md -> AGENTS.md.');
    }
    return o.strict && r.pairs.some((p) => !p.inSync) ? 1 : 0;
  }
  if (cmd === 'hook') {
    const sub = o._[1];
    if (sub === 'install') {
      if (!o.yes) {
        console.log(`This adds a PreToolUse hook for the Bash tool to ${hook.settingsPath()}.\nIt blocks: rm -rf on broad paths, SQL DROP/TRUNCATE/DELETE without WHERE, git push --force to main/master,\ngit reset --hard / clean -fd, disk formatting, curl|sh, writing .env files, terraform destroy.\nRe-run with --yes to install.`);
        return 0;
      }
      const r = hook.install();
      console.log(r.changed ? `Installed. Hook script: ${r.hook}\nSettings updated: ${r.settings}\nRemove with: haloguard hook uninstall` : 'Already installed (hook script refreshed).');
      return 0;
    }
    if (sub === 'uninstall') { const r = hook.uninstall(); console.log(r.changed ? `Removed from ${r.settings}` : 'Not installed.'); return 0; }
    if (sub === 'test') {
      const hit = check(o._.slice(2).join(' '));
      console.log(hit ? `BLOCK (${hit.id}): ${hit.why}` : 'allow');
      return hit ? 2 : 0;
    }
    if (sub === 'status' || !sub) { console.log(hook.isInstalled() ? 'installed' : 'not installed'); return 0; }
  }
  console.error(`Unknown command: ${cmd}\n`); console.log(HELP);
  return 64;
}

if (require.main === module) {
  try { process.exitCode = main(process.argv.slice(2)); } catch (e) { console.error(`haloguard: ${e.message}`); process.exitCode = 1; }
}
module.exports = { main };
