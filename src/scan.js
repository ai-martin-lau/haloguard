'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { maskText } = require('./mask');

const MAX_BYTES = 2 * 1024 * 1024;
const TEXT_EXT = new Set(['.json', '.toml', '.md', '.sh', '.yaml', '.yml', '.mjs', '.cjs', '.js', '.py']);
// Never opened, even to hash: credential stores and bulky session data.
const NEVER_READ = new Set(['.credentials.json', 'auth.json', 'credentials.json', '.env']);
const SKIP_DIRS = new Set(['projects', 'todos', 'shell-snapshots', 'statsig', 'logs', 'log', 'sessions', 'cache',
  'node_modules', '.git', 'ide', 'debug', 'file-history', 'archived_sessions', 'tmp', 'history', 'sqlite', 'telemetry', 'paste-cache', 'repos']);
const MAX_DEPTH = 4;

function homeDir() { return process.env.HALOGUARD_HOME || os.homedir(); }

function globalTargets(home = homeDir()) {
  return [
    { root: path.join(home, '.claude'), label: '~/.claude' },
    { root: path.join(home, '.codex'), label: '~/.codex' },
    { file: path.join(home, '.claude.json'), label: '~/.claude.json' },
  ];
}

function projectTargets(dir) {
  const names = ['CLAUDE.md', 'CLAUDE.local.md', 'AGENTS.md', '.mcp.json', 'GEMINI.md', '.cursorrules',
    '.claude/settings.json', '.claude/settings.local.json', '.codex/config.toml'];
  return names.map((n) => ({ file: path.join(dir, n), label: path.join(dir, n) }));
}

function readTextFile(p) {
  const base = path.basename(p);
  if (NEVER_READ.has(base) || /\.(pem|key|p12)$/.test(base)) return null;
  let st;
  try { st = fs.lstatSync(p); } catch { return null; }
  if (st.isSymbolicLink()) {
    let target = '';
    try { target = fs.readlinkSync(p); } catch {}
    return { mtime: st.mtimeMs, text: `symlink -> ${target}` };
  }
  if (!st.isFile() || st.size > MAX_BYTES) return null;
  const buf = fs.readFileSync(p);
  if (buf.includes(0)) return null;
  // Masking happens immediately; raw content never leaves this function.
  return { mtime: st.mtimeMs, text: maskText(buf.toString('utf8')) };
}

function walk(root, depth, out) {
  let entries;
  try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const p = path.join(root, e.name);
    if (e.isDirectory()) {
      if (depth < MAX_DEPTH && !SKIP_DIRS.has(e.name)) walk(p, depth + 1, out);
    } else if ((e.isFile() || e.isSymbolicLink()) && TEXT_EXT.has(path.extname(e.name)) && !e.name.endsWith('.jsonl')) {
      out.push(p);
    }
  }
}

function collect({ home = homeDir(), projects = [] } = {}) {
  const files = {};
  const add = (p) => {
    const r = readTextFile(p);
    if (r) files[p] = r;
  };
  for (const t of globalTargets(home)) {
    if (t.file) add(t.file);
    else { const list = []; walk(t.root, 0, list); list.forEach(add); }
  }
  for (const dir of projects) for (const t of projectTargets(path.resolve(dir))) add(t.file);
  return files;
}

module.exports = { collect, homeDir, readTextFile, projectTargets, NEVER_READ };
