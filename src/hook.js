'use strict';
const fs = require('fs');
const path = require('path');
const { homeDir } = require('./scan');
const { stateDir } = require('./core');

const MARK = 'haloguard-guard-hook';
function settingsPath() { return path.join(homeDir(), '.claude', 'settings.json'); }
function hookPath() { return path.join(stateDir(), `${MARK}.js`); }

function readSettings() {
  try { return JSON.parse(fs.readFileSync(settingsPath(), 'utf8')); } catch (e) {
    if (e.code === 'ENOENT') return {};
    throw new Error(`${settingsPath()} is not valid JSON; not touching it`);
  }
}
function writeSettings(s) {
  fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
  fs.writeFileSync(settingsPath(), JSON.stringify(s, null, 2) + '\n');
}

function isInstalled(s = readSettings()) {
  return ((s.hooks && s.hooks.PreToolUse) || []).some((g) => (g.hooks || []).some((h) => String(h.command || '').includes(MARK)));
}

function install() {
  const s = readSettings();
  fs.mkdirSync(stateDir(), { recursive: true, mode: 0o700 });
  fs.copyFileSync(path.join(__dirname, 'guard-hook.js'), hookPath());
  if (isInstalled(s)) return { changed: false, settings: settingsPath(), hook: hookPath() };
  s.hooks = s.hooks || {};
  s.hooks.PreToolUse = s.hooks.PreToolUse || [];
  s.hooks.PreToolUse.push({ matcher: 'Bash', hooks: [{ type: 'command', command: `node "${hookPath()}"` }] });
  writeSettings(s);
  return { changed: true, settings: settingsPath(), hook: hookPath() };
}

function uninstall() {
  const s = readSettings();
  if (!isInstalled(s)) return { changed: false, settings: settingsPath() };
  s.hooks.PreToolUse = s.hooks.PreToolUse
    .map((g) => ({ ...g, hooks: (g.hooks || []).filter((h) => !String(h.command || '').includes(MARK)) }))
    .filter((g) => g.hooks.length);
  if (!s.hooks.PreToolUse.length) delete s.hooks.PreToolUse;
  if (!Object.keys(s.hooks).length) delete s.hooks;
  writeSettings(s);
  try { fs.unlinkSync(hookPath()); } catch {}
  return { changed: true, settings: settingsPath() };
}

module.exports = { install, uninstall, isInstalled, settingsPath, MARK };
