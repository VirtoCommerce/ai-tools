// .claude/skills/ticket-context/lib/scrub.mjs — S2. Nothing an agent reads still carries a credential.
// COPIED from scripts/kb/core/secret-gate.mjs (design D11, M1): SECRET_NAME, looksLikePath,
// MIN_SECRET_LENGTH, TOKEN_SHAPES, secretValuesFrom, the env-file list, stringsOf. Keep in step by hand —
// it is a value scan of the real env secrets first, shapes second, never a 40-hex guess.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const SCRUB_MARKER = "# scrubbed-by: ticket-context/scrub@1";
export const SECRET_NAME = /password|passwd|pwd|token|secret|api[_-]?key|access[_-]?key/i;
export const looksLikePath = (v) => /^[A-Za-z]:[\\/]/.test(v) || /^[\\/]/.test(v)
  || /^\w+:\/\//.test(v) || (v.match(/[\\/]/g) || []).length >= 2;
export const MIN_SECRET_LENGTH = 6;
export const TOKEN_SHAPES = Object.freeze([
  ["github-pat", /\b(?:gh[pousr]_|github_pat_)[A-Za-z0-9_]{20,}\b/],
  ["jwt", /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/],
  ["bearer", /\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/-]{20,}=*/],
]);
const QUERY_VALUE = /([?&][^=&#\s"']+)=([^&#\s"']+)/g;

export function secretValuesFrom(text) {
  const out = new Set();
  for (const raw of String(text).split(/\r?\n/)) {
    const l = raw.trim();
    if (!l || l.startsWith("#")) continue;
    const e = l.indexOf("=");
    if (e < 1) continue;
    const name = l.slice(0, e).trim();
    let v = l.slice(e + 1).trim();
    const q = v.charAt(0);
    if ((q === '"' || q === "'") && v.endsWith(q) && v.length > 1) v = v.slice(1, -1);
    if (SECRET_NAME.test(name) && v.length >= MIN_SECRET_LENGTH && !looksLikePath(v)) out.add(v);
  }
  return out;
}

export function loadSecretValues(root, env = process.env) {
  const files = env.VC_MEASURE_SECRETS ? env.VC_MEASURE_SECRETS.split(";").filter(Boolean) : [join(root, ".env.local"), join(root, ".env.playwright.local")];
  const values = new Set();
  for (const f of files) if (existsSync(f)) for (const v of secretValuesFrom(readFileSync(f, "utf8"))) values.add(v);
  return values;
}

export function redactText(text, secrets = new Set()) {
  let s = String(text);
  // Fix 4: Also redact JSON-escaped and URL-encoded variants of env secrets
  const secretVariants = new Set();
  for (const v of secrets) {
    if (v) {
      secretVariants.add(v);
      // Add JSON-escaped variant (e.g., pa"ss\word1 -> pa\"ss\\word1)
      secretVariants.add(JSON.stringify(v).slice(1, -1));
      // Add URL-encoded variant
      try { secretVariants.add(encodeURIComponent(v)); } catch {}
    }
  }
  for (const v of secretVariants) if (v && s.includes(v)) s = s.split(v).join("[REDACTED:env-secret]");

  for (const [name, re] of TOKEN_SHAPES) s = s.replace(new RegExp(re.source, "g"), `[REDACTED:${name}]`);

  // Fixed header rule: match built-in headers + x-csrf/xsrf with suffixes + any header name containing SECRET_NAME word
  // Build with String.raw to handle escapes properly
  const headerPrefixPattern = String.raw`(^|[\s"'{,;\[(>])`;
  const headerNamePattern = String.raw`(authorization|proxy-authorization|cookie|set-cookie|x-api-key|x-csrf[\w-]{0,64}|x-xsrf[\w-]{0,64}|ocp-apim-subscription-key|session|sid|x-auth-token|[\w-]{0,64}(?:password|passwd|pwd|token|secret|api[_-]?key|access[_-]?key)[\w-]{0,64})`;
  const headerValuePattern = String.raw`("(?:[^"\\]|\\.)*"|[^\r\n"]*)`;
  const secretHeaderPattern = headerPrefixPattern + headerNamePattern + String.raw`\s*:\s*(?!\[REDACTED)` + headerValuePattern;

  // ONE unified header rule: not anchored, handles full value (to EOL or close-quote), escape-aware strings
  s = s.replace(new RegExp(secretHeaderPattern, "gi"),
    (m, prefix, hname, value) => {
      return prefix + hname + ": [REDACTED:header]";
    });

  // JSON secret-key rule: ONLY match keys that are secret-named (password, token, cookie, authorization, session, sid, refresh_token, etc.)
  // Use String.raw to fix the \s bug: without it, \s becomes s in template literals
  const keyNamePattern = String.raw`(authorization|cookie|session|sid|[\w-]{0,64}(?:password|passwd|pwd|token|secret|api[_-]?key|access[_-]?key|refresh[_-]?token)[\w-]{0,64})`;
  const jsonValuePattern = String.raw`("(?:[^"\\]|\\.)*"|[^,}\]\s]+)`;
  const secretKeyPattern = String.raw`"` + keyNamePattern + String.raw`"\s*:\s*(?!\[REDACTED)` + jsonValuePattern;
  s = s.replace(new RegExp(secretKeyPattern, "gi"), (m, k, v) => {
    return `"${k}": [REDACTED:secret-key]`;
  });

  // Form data format: key=value (at start or after &, ?, or whitespace)
  // Skip values that are already redacted (from env-secret or token redaction)
  s = s.replace(/([?&\s=]|^)([^=&\s#\n"']+)=([^&#\s"'\n]+)/g, (m, prefix, k, v) => {
    if (SECRET_NAME.test(k) && !v.startsWith("[REDACTED:")) {
      return `${prefix}${k}=[REDACTED:secret-key]`;
    }
    return m;
  });

  return s.replace(QUERY_VALUE, "$1=[REDACTED:query]");
}

/** A URL as a label (an inventory ref): every query value redacted, and any token shape in the path. The gate
 *  scans the bundle for token shapes, so a ref carrying one could never pass — and a ref is the script's, not
 *  the agent's, so nothing could fix it. The full URL stays in prepare.json only. */
export function redactUrlLabel(url) {
  let s = String(url).replace(QUERY_VALUE, "$1=[REDACTED:query]");
  for (const [name, re] of TOKEN_SHAPES) s = s.replace(new RegExp(re.source, "g"), `[REDACTED:${name}]`);
  return s;
}

function operationsOf(postText) {
  try {
    const j = JSON.parse(postText);
    const ops = (Array.isArray(j) ? j : [j]).map((x) => x?.operationName).filter(Boolean);
    return ops.length ? ops.join(",") : null;
  } catch { return null; }
}

function stripQuery(url, secrets) {
  try {
    const u = new URL(url);
    const keys = [...new Set(u.searchParams.keys())];
    return redactText(`${u.origin}${u.pathname}${keys.length ? `?${keys.map((k) => `${k}=[REDACTED:query]`).join("&")}` : ""}`, secrets);
  } catch { return redactText(url, secrets); }
}

/** A HAR reduced to what a reader needs: no header, cookie or query value survives. */
export function reduceHar(har, secrets = new Set()) {
  const entries = har?.log?.entries;
  if (!Array.isArray(entries)) throw new Error("not a HAR: no log.entries");
  return {
    scrubbed_by: "ticket-context/scrub@1",
    entries: entries.map((e) => {
      const status = e.response?.status ?? null;
      const content = e.response?.content ?? {};
      const body = content.encoding === "base64" ? null : String(content.text ?? "");
      const isError = (status ?? 0) >= 400 || (body !== null && /"errors"\s*:/.test(body));
      return {
        started: e.startedDateTime ?? null,
        method: e.request?.method ?? null,
        url: e.request?.url ? stripQuery(e.request.url, secrets) : null,
        status,
        operation: operationsOf(e.request?.postData?.text ?? ""),
        error: !isError ? null : body === null ? "[binary body]" : redactText(body, secrets).slice(0, 500),
      };
    }),
  };
}

/** A HAR is a HAR whatever its file name: a JSON object with log.entries[]. */
export function isHarText(raw) {
  if (!/^s*{/.test(raw)) return false;
  try { return Array.isArray(JSON.parse(raw)?.log?.entries); } catch { return false; }
}

/** Write the scrubbed copy beside the raw file and return its path. The caller deletes the raw file.
 *  A HAR saved under another name (.json, .txt) is REDUCED like a .har, never only redacted. */
export function scrubFile(path, kind, secrets) {
  const raw = readFileSync(path, "utf8");
  if (kind === "har" || isHarText(raw)) {
    const out = `${path}.scrubbed.json`;
    writeFileSync(out, JSON.stringify(reduceHar(JSON.parse(raw), secrets), null, 1));
    return out;
  }
  const out = `${path}.scrubbed.txt`;
  writeFileSync(out, `${SCRUB_MARKER}\n${redactText(raw, secrets)}`);
  return out;
}

export function hasScrubMarker(path) {
  const head = readFileSync(path, "utf8").slice(0, 200);
  return head.startsWith(SCRUB_MARKER) || /"scrubbed_by"\s*:\s*"ticket-context\/scrub@1"/.test(head);
}

export function stringsOf(value, out = []) {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const v of value) stringsOf(v, out);
  else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) { out.push(k); stringsOf(v, out); }
  return out;
}

/** Hit KINDS only — a scanner that prints what it found has published it. */
export function scanStrings(value, secrets = new Set()) {
  const parts = stringsOf(value);
  const hits = [];
  for (const v of secrets) if (v && parts.some((s) => s.includes(v))) { hits.push("env-secret-value"); break; }
  for (const [name, re] of TOKEN_SHAPES) if (parts.some((s) => re.test(s))) hits.push(name);
  return hits;
}
