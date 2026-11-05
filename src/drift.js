'use strict';
const fs = require('fs');
const path = require('path');
const { lineDiff } = require('./diff');
const { maskText } = require('./mask');

const FILES = ['AGENTS.md', 'CLAUDE.md', 'GEMINI.md', '.cursorrules'];

function norm(t) { return t.split('\n').map((l) => l.trim()).filter((l) => l && !/^@(\.\/)?AGENTS\.md$/i.test(l) && !/^@(\.\/)?CLAUDE\.md$/i.test(l)).join('\n'); }

function checkDrift(dir) {
  dir = path.resolve(dir);
  const present = {};
  for (const n of FILES) {
    const p = path.join(dir, n);
    try {
      const st = fs.lstatSync(p);
      present[n] = st.isSymbolicLink() ? { link: fs.readlinkSync(p), text: maskText(fs.readFileSync(p, 'utf8')) } : { text: maskText(fs.readFileSync(p, 'utf8')) };
    } catch {}
  }
  const report = { dir, files: Object.keys(present), pairs: [] };
  const a = present['AGENTS.md']; const c = present['CLAUDE.md'];
  if (a && c) {
    let state;
    if (c.link && path.basename(c.link) === 'AGENTS.md') state = 'CLAUDE.md is a symlink to AGENTS.md (in sync)';
    else if (a.link && path.basename(a.link) === 'CLAUDE.md') state = 'AGENTS.md is a symlink to CLAUDE.md (in sync)';
    else if (/^@(\.\/)?AGENTS\.md\s*$/im.test(c.text) && !norm(c.text)) state = 'CLAUDE.md only imports AGENTS.md (in sync)';
    const d = state ? [] : lineDiff(norm(a.text), norm(c.text));
    if (!state) state = d.length ? `${d.filter((x) => x.op === '-').length} line(s) only in AGENTS.md, ${d.filter((x) => x.op === '+').length} line(s) only in CLAUDE.md` : 'same content';
    const imports = /^@(\.\/)?AGENTS\.md\s*$/im.test(c.text);
    report.pairs.push({ a: 'AGENTS.md', b: 'CLAUDE.md', state, imports, diff: d, inSync: d.length === 0 });
  } else if (a || c) {
    report.pairs.push({ a: 'AGENTS.md', b: 'CLAUDE.md', state: `only ${a ? 'AGENTS.md' : 'CLAUDE.md'} exists`, diff: [], inSync: true });
  }
  return report;
}

module.exports = { checkDrift };
