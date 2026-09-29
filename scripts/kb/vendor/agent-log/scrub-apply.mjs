/* Replace secret VALUES with {{VAR}} tokens in captured artifacts.
 *
 * The substitution is same-shape, so a CSV stays parseable — verified by re-parsing and
 * comparing the row count after every write, and refused if the count would change.
 *
 * Values are read from the env layer and never printed.
 */
import { readFileSync, writeFileSync } from "node:fs";

/* Which files hold the secret values. VC_MEASURE_SECRETS is honoured here for the same reason
 * tool-log.mjs honours it: the scan must look in exactly the files whose values the hook is
 * redacting, or the two disagree about what a secret is. Fallback: the two conventional names
 * under VC_ENV_ROOT (default: the current directory). */
const REPO = (process.env.VC_ENV_ROOT || ".").replace(/[\\/]?$/, "/");
const SECRET_FILES = process.env.VC_MEASURE_SECRETS
  ? process.env.VC_MEASURE_SECRETS.split(";")
  : [REPO + ".env.local", REPO + ".env.playwright.local"];
const SECRET_NAME = /password|passwd|pwd|token|secret|api[_-]?key|access[_-]?key/i;
const looksLikePath = (v) =>
  /^[A-Za-z]:[\\/]/.test(v) || /^[\\/]/.test(v) || /^\w+:\/\//.test(v) || (v.match(/[\\/]/g) || []).length >= 2;

/* name -> value, so the replacement token can name the variable that holds it */
const pairs = [];
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
    if (SECRET_NAME.test(name) && v.length >= 6 && !looksLikePath(v)) pairs.push([name, v]);
  }
}
/* longest value first so a value containing another cannot be half-replaced;
 * prefer the shortest variable NAME for a value declared under several names */
pairs.sort((a, b) => b[1].length - a[1].length || a[0].length - b[0].length);
const seen = new Set();
const subs = pairs.filter(([, v]) => (seen.has(v) ? false : (seen.add(v), true)));

const countRows = (text) => {
  let n = 0, q = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (c === '"') { if (q && text[i + 1] === '"') i += 1; else q = !q; continue; }
    if (c === "\n" && !q) n += 1;
  }
  return n;
};

const FILES = process.argv.slice(2);
for (const f of FILES) {
  const before = readFileSync(f, "utf8");
  let after = before;
  const applied = [];
  for (const [name, v] of subs) {
    const n = after.split(v).length - 1;
    if (!n) continue;
    after = after.split(v).join("{{" + name + "}}");
    applied.push(name + " x" + n);
  }
  if (after === before) { console.log("  unchanged: " + f); continue; }
  const isCsv = f.endsWith(".csv");
  if (isCsv && countRows(after) !== countRows(before)) {
    console.log("  REFUSED (row count would change): " + f);
    continue;
  }
  writeFileSync(f, after, "utf8");
  console.log("  scrubbed: " + f + "   " + applied.join(", ") +
    (isCsv ? "   rows " + countRows(after) + " (unchanged)" : ""));
}
