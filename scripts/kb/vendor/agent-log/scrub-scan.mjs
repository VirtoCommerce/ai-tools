/* Scan a tree for secrets BEFORE it enters git or leaves the machine.
 * Secret values are read from the env layer at runtime and never printed — only counts. */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/* Which files hold the secret values. VC_MEASURE_SECRETS is honoured here for the same reason
 * tool-log.mjs honours it: the scan must look in exactly the files whose values the hook is
 * redacting, or the two disagree about what a secret is. Fallback: the two conventional names
 * under VC_ENV_ROOT (default: the current directory). */
const REPO = (process.env.VC_ENV_ROOT || ".").replace(/[\\/]?$/, "/");
const SECRET_FILES = process.env.VC_MEASURE_SECRETS
  ? process.env.VC_MEASURE_SECRETS.split(";")
  : [REPO + ".env.local", REPO + ".env.playwright.local"];
const ROOT = process.argv[2] || ".";  // scan any tree before it enters git

const SECRET_NAME = /password|passwd|pwd|token|secret|api[_-]?key|access[_-]?key/i;
const looksLikePath = (v) =>
  /^[A-Za-z]:[\\/]/.test(v) || /^[\\/]/.test(v) || /^\w+:\/\//.test(v) || (v.match(/[\\/]/g) || []).length >= 2;

const secrets = new Set();
for (const f of SECRET_FILES) {
  let t = "";
  try { t = readFileSync(f, "utf8"); } catch { continue; }
  for (const raw of t.split(/\r?\n/)) {
    const l = raw.trim();
    if (!l || l.startsWith("#")) continue;
    const e = l.indexOf("=");
    if (e < 1) continue;
    const name = l.slice(0, e).trim();
    let v = l.slice(e + 1).trim();
    const q = v.charAt(0);
    if ((q === '"' || q === "'") && v.endsWith(q) && v.length > 1) v = v.slice(1, -1);
    if (SECRET_NAME.test(name) && v.length >= 6 && !looksLikePath(v)) secrets.add(v);
  }
}
console.log("secret values loaded from the env layer: " + secrets.size + " (values never printed)");

/* `.git` and `node_modules` are skipped, and the first is not a nicety. Point this at a repository
 * root and every commit SHA in .git/logs/HEAD matches the 40-hex token shape, so the scan reports
 * five files needing a scrub and none of them contains a secret. A safety tool that cries wolf on
 * every repository is a safety tool people stop reading, which is the one failure mode it cannot
 * afford. Content in a working tree is still scanned; only git's own bookkeeping is not. */
const SKIP = new Set([".git", "node_modules"]);
const walk = (d, acc = []) => {
  for (const n of readdirSync(d)) {
    if (SKIP.has(n)) continue;
    const p = join(d, n);
    if (statSync(p).isDirectory()) walk(p, acc); else acc.push(p);
  }
  return acc;
};

const TOKENS = [
  ["github PAT", /\b(?:gh[pousr]_|github_pat_)[A-Za-z0-9_]{20,}\b/g],
  ["JWT", /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g],
  ["Bearer", /\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/-]{20,}=*/g],
  ["sha1+ hash", /\b[0-9a-fA-F]{40,}\b/g],
];

let hits = 0;
for (const f of walk(ROOT)) {
  if (/[\\/]backup[\\/]/.test(f)) continue; // the backup is not being committed
  let t = "";
  try { t = readFileSync(f, "utf8"); } catch { continue; }
  const found = [];
  for (const v of secrets) { const n = t.split(v).length - 1; if (n) found.push("SECRET-VALUE x" + n); }
  for (const [name, re] of TOKENS) { const m = t.match(re); if (m) found.push(name + " x" + m.length); }
  if (found.length) { hits += 1; console.log("  " + f.replace(ROOT, ".") + "   " + found.join(", ")); }
}
console.log("");
console.log(hits ? "SCRUB REQUIRED: " + hits + " file(s)" : "CLEAN: no secret value or token shape in any file to be committed");
