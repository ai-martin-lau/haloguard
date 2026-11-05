'use strict';
const fs = require('fs');
const path = require('path');
const { collect, homeDir } = require('./scan');
const { extract, isNetwork } = require('./facts');
const { lineDiff } = require('./diff');

function stateDir() { return process.env.HALOGUARD_STATE || path.join(homeDir(), '.haloguard'); }
function snapDir() { return path.join(stateDir(), 'snapshots'); }

function takeSnapshot(opts = {}) {
  const files = collect(opts);
  const snap = { version: 1, createdAt: new Date().toISOString(), projects: (opts.projects || []).map((p) => path.resolve(p)), files };
  return snap;
}

function saveSnapshot(snap) {
  fs.mkdirSync(snapDir(), { recursive: true, mode: 0o700 });
  const name = snap.createdAt.replace(/[:.]/g, '-') + '.json';
  const p = path.join(snapDir(), name);
  fs.writeFileSync(p, JSON.stringify(snap), { mode: 0o600 });
  return p;
}

function listSnapshots() {
  try { return fs.readdirSync(snapDir()).filter((f) => f.endsWith('.json')).sort().map((f) => path.join(snapDir(), f)); } catch { return []; }
}

function loadSnapshot(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }

function factDelta(oldF, newF) {
  const out = [];
  const kinds = { mcp: 'MCP server', hooks: 'hook', plugins: 'plugin', allow: 'permission rule', network: 'network-capable line', settings: 'setting' };
  for (const k of Object.keys(kinds)) {
    const o = oldF[k] || {}; const n = newF[k] || {};
    for (const key of Object.keys(n)) {
      if (!(key in o)) out.push({ kind: k, change: 'added', key, value: n[key], network: k !== 'network' && isNetwork(n[key]) });
      else if (o[key] !== n[key]) out.push({ kind: k, change: 'changed', key, from: o[key], value: n[key], network: isNetwork(n[key]) && !isNetwork(o[key]) });
    }
    for (const key of Object.keys(o)) if (!(key in n)) out.push({ kind: k, change: 'removed', key, value: o[key] });
  }
  return out.map((x) => ({ ...x, label: kinds[x.kind] }));
}

function compare(oldSnap, newSnap) {
  const result = { from: oldSnap.createdAt, to: newSnap.createdAt, files: [], findings: [] };
  const names = new Set([...Object.keys(oldSnap.files), ...Object.keys(newSnap.files)]);
  for (const f of [...names].sort()) {
    const a = oldSnap.files[f]; const b = newSnap.files[f];
    if (a && b && a.text === b.text) continue;
    const status = !a ? 'added' : !b ? 'removed' : 'modified';
    const mtime = b ? new Date(b.mtime).toISOString() : null;
    const lines = lineDiff(a ? a.text : '', b ? b.text : '').filter((l) => !(l.text === '' && (!a || !b)));
    result.files.push({ file: f, status, mtime, lines });
    const delta = factDelta(a ? extract(f, a.text) : {}, b ? extract(f, b.text) : {});
    for (const d of delta) result.findings.push({ file: f, mtime, ...d });
  }
  return result;
}

module.exports = { takeSnapshot, saveSnapshot, listSnapshots, loadSnapshot, compare, stateDir };
