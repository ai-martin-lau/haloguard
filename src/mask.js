'use strict';
// Masks anything that looks like a secret. Applied to every line before it is stored or printed.
const SECRET_NAME = /(api[_-]?key|apikey|token|secret|passw(or)?d|pwd|auth(orization)?|bearer|cookie|credential|private[_-]?key|session)/i;
const VALUE_PATTERNS = [
  /\b(sk|pk|rk)-[A-Za-z0-9_\-]{12,}/g,             // OpenAI / Anthropic / Stripe style
  /\bsk-ant-[A-Za-z0-9_\-]{8,}/g,
  /\bgh[pousr]_[A-Za-z0-9]{20,}/g,                // GitHub
  /\bgithub_pat_[A-Za-z0-9_]{20,}/g,
  /\bxox[abprs]-[A-Za-z0-9\-]{10,}/g,             // Slack
  /\bAKIA[0-9A-Z]{16}\b/g,                         // AWS
  /\bAIza[0-9A-Za-z_\-]{30,}/g,                    // Google
  /\beyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{5,}/g, // JWT
  /\b[A-Fa-f0-9]{32,}\b/g,                         // long hex
  /\b[A-Za-z0-9+\/_\-]{40,}={0,2}/g,               // long base64-ish
];
const MASK = '***';

function maskValueString(s) {
  let out = s;
  for (const re of VALUE_PATTERNS) out = out.replace(re, MASK);
  // Bearer / Basic headers
  out = out.replace(/\b(Bearer|Basic|token)\s+[^\s"',]+/gi, (m, p) => `${p} ${MASK}`);
  // URL credentials and secret-looking query params
  out = out.replace(/(\/\/)[^\/\s:@]+:[^\/\s@]+@/g, `$1${MASK}@`);
  out = out.replace(/([?&][^=&\s]*(key|token|secret|sig|password)[^=&\s]*=)[^&\s"']+/gi, `$1${MASK}`);
  return out;
}

function maskLine(line) {
  let out = line.replace(/\b(Bearer|Basic)\s+[^\s"',]+/g, `$1 ${MASK}`);
  // "name": "value"  /  name = "value"  /  NAME=value  /  --api-key value
  out = out.replace(/(["']?)([A-Za-z0-9_.\-]+)\1(\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s,}\[{#][^\s,}#]*)/g, (m, q, name, sep, val) => {
    if (SECRET_NAME.test(name) && !/^(true|false|null|\d+)$/.test(val.replace(/["']/g, ''))) {
      const quote = val[0] === '"' || val[0] === "'" ? val[0] : '';
      return `${q}${name}${q}${sep}${quote}${MASK}${quote}`;
    }
    return m;
  });
  out = out.replace(/(--?[A-Za-z0-9\-]*(key|token|secret|password)[A-Za-z0-9\-]*[ =])("?)[^\s"]+\3/gi, `$1$3${MASK}$3`);
  return maskValueString(out);
}

function maskText(text) {
  return text.split('\n').map(maskLine).join('\n');
}

module.exports = { maskLine, maskText, maskValueString, MASK, SECRET_NAME };
