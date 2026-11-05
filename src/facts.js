'use strict';
// Extracts structured facts (MCP servers, hooks, plugins, permissions) from masked file text.

const NETWORK_RE = /\b(curl|wget|nc|ncat|netcat|socat|telnet|ssh|scp|rsync|ftp|Invoke-WebRequest|Invoke-RestMethod|iwr|irm)\b|https?:\/\/|\bfetch\(|requests\.(get|post)|urllib|http\.request/i;

function isNetwork(s) { return NETWORK_RE.test(String(s || '')); }

function cmdString(o) {
  if (!o || typeof o !== 'object') return String(o ?? '');
  if (o.url) return `${o.type || 'remote'} ${o.url}`;
  const args = Array.isArray(o.args) ? o.args.join(' ') : '';
  return `${o.command || ''} ${args}`.trim();
}

function findKey(obj, key, trail, out) {
  if (!obj || typeof obj !== 'object') return;
  for (const [k, v] of Object.entries(obj)) {
    if (k === key && v && typeof v === 'object') out.push({ trail: [...trail, k].join('.'), value: v });
    else findKey(v, key, [...trail, k], out);
  }
}

function parseJson(text) { try { return JSON.parse(text); } catch { return null; } }

// Minimal TOML reader for Codex config: [mcp_servers.name] sections + key = value lines.
function parseCodexToml(text) {
  const mcp = {}; const top = {}; let section = null;
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\s+#.*$/, '').trim();
    if (!line || line.startsWith('#')) continue;
    const sec = line.match(/^\[([^\]]+)\]$/);
    if (sec) { section = sec[1]; continue; }
    const kv = line.match(/^([A-Za-z0-9_\-."]+)\s*=\s*(.+)$/);
    if (!kv) continue;
    const key = kv[1].replace(/"/g, ''); let val = kv[2].trim();
    try { val = JSON.parse(val.replace(/'/g, '"')); } catch {}
    const m = section && section.match(/^mcp_servers\.("?)([^".]+)\1$/);
    if (m) { (mcp[m[2]] = mcp[m[2]] || {})[key] = val; }
    else if (!section) top[key] = val;
  }
  return { mcp, top };
}

function extract(file, text) {
  const f = { mcp: {}, hooks: {}, plugins: {}, allow: {}, network: {}, settings: {} };
  if (text.startsWith('symlink -> ')) return f;
  if (file.endsWith('.toml')) {
    const { mcp, top } = parseCodexToml(text);
    for (const [n, v] of Object.entries(mcp)) f.mcp[`mcp_servers.${n}`] = cmdString(v);
    for (const k of ['approval_policy', 'sandbox_mode', 'model']) if (top[k] !== undefined) f.settings[k] = String(top[k]);
    return f;
  }
  if (file.endsWith('.json')) {
    const j = parseJson(text);
    if (!j) return f;
    const servers = []; findKey(j, 'mcpServers', [], servers);
    for (const s of servers) for (const [n, v] of Object.entries(s.value)) f.mcp[`${s.trail}.${n}`] = cmdString(v);
    if (j.hooks && typeof j.hooks === 'object') {
      for (const [event, groups] of Object.entries(j.hooks)) {
        (Array.isArray(groups) ? groups : []).forEach((g) => {
          (g.hooks || []).forEach((h) => {
            const c = h.command || h.url || JSON.stringify(h);
            f.hooks[`${event}[${g.matcher || '*'}] ${c}`] = c;
          });
        });
      }
    }
    for (const k of ['enabledPlugins', 'extraKnownMarketplaces']) {
      if (j[k] && typeof j[k] === 'object') for (const [n, v] of Object.entries(j[k])) f.plugins[`${k}.${n}`] = JSON.stringify(v);
    }
    if (j.plugins && typeof j.plugins === 'object' && !Array.isArray(j.plugins)) {
      for (const n of Object.keys(j.plugins)) f.plugins[`installed.${n}`] = 'installed';
    }
    const perms = j.permissions || {};
    for (const k of ['allow', 'ask', 'additionalDirectories']) (perms[k] || []).forEach((r) => { f.allow[`${k}: ${r}`] = r; });
    if (perms.defaultMode) f.settings['permissions.defaultMode'] = perms.defaultMode;
    for (const k of ['dangerouslySkipPermissions', 'skipDangerousModePermissionPrompt', 'apiKeyHelper', 'model']) if (j[k] !== undefined) f.settings[k] = String(j[k]);
    return f;
  }
  if (/\.(sh|js|mjs|cjs|py)$/.test(file)) {
    text.split('\n').forEach((l, i) => { if (isNetwork(l)) f.network[`${i + 1}: ${l.trim()}`] = l.trim(); });
  }
  return f;
}

module.exports = { extract, isNetwork, parseCodexToml, cmdString };
