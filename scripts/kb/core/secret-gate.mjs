// The gate that runs before anything leaves the machine (PLAN §7 "The base is PUBLIC").
//
// THE BASE IS A PUBLIC REPOSITORY AND THE `question` FIELD IS STORED VERBATIM. That is deliberate
// and it is not negotiable: a hashed or redacted question makes the report's miss panel worthless,
// and the miss panel is the point of the whole exercise. What makes it acceptable is (a) the
// questions are about a public product, (b) the consumer is this repo -- extending the base to
// client deployments must re-decide it first (PLAN §11) -- and (c) THIS.
//
// IT IS A VALUE SCAN, NOT A PATTERN GUESS. The real secrets are read out of the env layer at
// runtime and the queue is searched for those exact strings. A pattern scan cries wolf on every
// 40-hex token, and a safety tool people stop reading is the one failure mode a safety tool cannot
// afford -- which is why this file lifts `vendor/agent-log/scrub-scan.mjs`'s loader and NOT its
// `sha1+ hash` shape. The three token shapes kept below (PAT, JWT, Bearer) have no honest reason to
// appear in a question about platform behaviour, and unlike 40 hex characters they cannot be a
// commit sha somebody legitimately asked about. The one shape rule beyond tokens is a personal
// e-mail address (VCST-6378), held to the same bar by an allow-list of test domains -- see below.
//
// IT RUNS TWICE. At the DOOR (`publishProblems`, called by capture / confirm / dispute), where the
// writer is told what to remove and resends; and at PUSH (`gateQueue`), the backstop for a line
// written by an older client or through any other route.
//
// AT PUSH, A LINE THAT TRIPS IT IS DROPPED, NOT ESCALATED. The push continues without that line, and a
// `{"kind":"redacted","why":"secret-scan"}` marker takes its place so the gap is visible in the
// log rather than invisible. Losing one line is cheap; losing the session's whole log -- which is
// what blocking the push would do -- is not.
//
// AND A DROPPED LINE IS NOT PUSHED EITHER. The scan runs over the WHOLE queue line, payload
// included, because the payload is what becomes an entry BODY in the public base. A gate that
// stripped the log line but still committed its payload would launder the secret into the one
// artifact everybody reads.

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Lifted verbatim from the vendor scanner: which env keys name a secret. */
export const SECRET_NAME = /password|passwd|pwd|token|secret|api[_-]?key|access[_-]?key/i;

/** Lifted verbatim: a value that is a path is a location, not a credential. */
export const looksLikePath = (v) => /^[A-Za-z]:[\\/]/.test(v) || /^[\\/]/.test(v)
  || /^\w+:\/\//.test(v) || (v.match(/[\\/]/g) || []).length >= 2;

/** Lifted: shorter than six characters is a word, not a secret, and would match everything. */
export const MIN_SECRET_LENGTH = 6;

/**
 * Token shapes, for values that are not in our env layer at all -- a token pasted into a question,
 * a bearer header copied out of a HAR. Deliberately NOT the vendor's `sha1+ hash` row: see above.
 */
export const TOKEN_SHAPES = Object.freeze([
  ['github-pat', /\b(?:gh[pousr]_|github_pat_)[A-Za-z0-9_]{20,}\b/],
  ['jwt', /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/],
  ['bearer', /\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/-]{20,}=*/],
  // VCST-6378: shapes a tester on this stack actually holds. An Azure DevOps PAT (the classic 52-char
  // base32 one, and the 84-char one that carries the `AZDO` signature at 76..79), a SAS signature, a
  // storage account key, a PEM private key, an AWS access key id. None of them is a word or a hash
  // somebody asks about, which is the bar the three above were held to.
  ['ado-pat', /\b(?:[a-z2-7]{52}|[A-Za-z0-9]{76}AZDO[A-Za-z0-9]{4})\b/],
  ['sas-signature', /[?&]sig=[A-Za-z0-9%+/=]{20,}/],
  ['storage-key', /\bAccountKey=[A-Za-z0-9+/]{40,}={0,2}/],
  ['private-key', /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/],
  ['aws-access-key', /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/],
]);

// ── e-mail addresses: the one pattern rule, with an allow-list (VCST-6378) ─────────────────────
//
// THE VALUE SCAN COULD NOT SEE THIS, and a person's address is what actually leaked: a teammate's
// personal address and an employee address reached public entries through free prose (evidence
// notes, claims), where no secret-named key ever held them. An address is therefore the one thing
// matched by SHAPE -- and the allow-list is what keeps it from crying wolf, because the base quotes
// fixture addresses on purpose (`AGENT-TEST-…@test-agent.com`, a UI's own placeholder text).

/** Domains that are test data by construction. RFC 2606 / 6761 names, and the fixture domains of this repo. */
export const TEST_EMAIL_DOMAINS = Object.freeze(new Set([
  'example.com', 'example.org', 'example.net', 'test-agent.com', 'yopmail.com',
  'test.virtocommerce.com', 'acme.com',
]));

/** Top-level names that can never be a real mailbox (RFC 2606 / 6761). */
const TEST_TLD = /\.(?:test|example|invalid|localhost)$/;

/**
 * Whole addresses a product prints as its OWN placeholder text, which an observation of that UI has
 * to quote verbatim: the storefront's "Enter a valid email address, e.g. johndoe@gmail.com".
 */
export const UI_PLACEHOLDER_EMAILS = Object.freeze(new Set(['johndoe@gmail.com']));

const EMAIL = /[A-Za-z0-9._%+*-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;

/** Is this one address somebody's real mailbox, as far as a shape can tell? */
export function isPersonalEmail(address) {
  const a = String(address).toLowerCase().replace(/\.$/, '');
  const at = a.lastIndexOf('@');
  if (at < 1) return false;
  const local = a.slice(0, at);
  const domain = a.slice(at + 1);
  // `emails:"*@gmail.com"` is a search pattern, not an address: a wildcard names nobody.
  if (local.includes('*')) return false;
  if (UI_PLACEHOLDER_EMAILS.has(a)) return false;
  if (TEST_TLD.test(domain)) return false;
  for (const d of TEST_EMAIL_DOMAINS) if (domain === d || domain.endsWith(`.${d}`)) return false;
  return true;
}

/** Does any of these strings carry a personal address? */
export function hasPersonalEmail(parts) {
  return parts.some((s) => (String(s).match(EMAIL) ?? []).some(isPersonalEmail));
}

/** One env file's text -> the secret VALUES in it. Pure, so the parsing rule is testable alone. */
export function secretValuesFrom(text) {
  const out = new Set();
  for (const raw of String(text).split(/\r?\n/)) {
    const l = raw.trim();
    if (!l || l.startsWith('#')) continue;
    const e = l.indexOf('=');
    if (e < 1) continue;
    const name = l.slice(0, e).trim();
    let v = l.slice(e + 1).trim();
    const q = v.charAt(0);
    if ((q === '"' || q === "'") && v.endsWith(q) && v.length > 1) v = v.slice(1, -1);
    if (SECRET_NAME.test(name) && v.length >= MIN_SECRET_LENGTH && !looksLikePath(v)) out.add(v);
  }
  return out;
}

/**
 * Which files hold the secret values.
 *
 * `VC_MEASURE_SECRETS` is honoured for the reason the vendor scanner honours it: the scan must look
 * in exactly the files whose values are being protected, or the two disagree about what a secret
 * is. The default root is THE REPO, resolved from this module's own location and not from
 * `process.cwd()` -- a `kb` invoked from somewhere else would otherwise load no secrets at all and
 * report a clean scan it never performed.
 */
export function secretFiles(env = process.env) {
  if (env.VC_MEASURE_SECRETS) return env.VC_MEASURE_SECRETS.split(';').filter(Boolean);
  const root = env.VC_ENV_ROOT || resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
  return [join(root, '.env.local'), join(root, '.env.playwright.local')];
}

// ── deployment hosts: not secrets, but not ours to publish either ─────────────────────────────
//
// A value scan over SECRETS cannot see the other thing that must not reach a public base: where
// the stand is. `qa-admin-<client>.example.com` is not a credential, so no secret-shaped key names
// it, and yet a capture that quotes it tells the world which client runs on which host. The base
// names a stand by its `deployment` label (`vcst`, `leo`), never by its host, so a host in a line
// is never the only way to say what that line says.
//
// Read from EVERY `.env*` file at the root, not only the active `TEST_ENV`'s: a session on `vcst`
// can still paste a URL it saw on another stand, and the host it would leak is exactly the one the
// active layer does not carry.

/** Keys whose value is a location. The suffix, not a substring: `URL_PREFIX_MODE` is not one. */
export const HOST_NAME = /(?:^|_)(?:URL|HOST|HOSTNAME|DOMAIN|ENDPOINT)$/i;

/**
 * Hosts that ARE public and that a question legitimately names: the base's own GitHub, a vendor
 * CMS. A host listed here is never a hit. Kept short on purpose — adding one widens the aperture.
 */
export const PUBLIC_HOSTS = Object.freeze(new Set([
  'github.com', 'api.github.com', 'raw.githubusercontent.com', 'builder.io',
]));

const LOOPBACK = /^(?:localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0|\[?::1\]?)$/i;

/** One URL-ish value -> its host, or null. Scheme optional: `ADMIN_URL=host:8090` is common. */
export function hostOf(value) {
  let v = String(value ?? '').trim();
  const q = v.charAt(0);
  if ((q === '"' || q === "'") && v.endsWith(q) && v.length > 1) v = v.slice(1, -1);
  if (!v) return null;
  let host;
  try { host = new URL(/^\w+:\/\//.test(v) ? v : `https://${v}`).hostname.toLowerCase(); } catch { return null; }
  // A dotless name is a machine on this LAN (or `localhost`), not a stand anybody can reach.
  if (!host.includes('.') || LOOPBACK.test(host) || PUBLIC_HOSTS.has(host)) return null;
  return host;
}

/** One env file's text -> the deployment hosts in it. Pure, like `secretValuesFrom`. */
export function hostValuesFrom(text) {
  const out = new Set();
  for (const raw of String(text).split(/\r?\n/)) {
    const l = raw.trim();
    if (!l || l.startsWith('#')) continue;
    const e = l.indexOf('=');
    if (e < 1) continue;
    if (!HOST_NAME.test(l.slice(0, e).trim())) continue;
    const h = hostOf(l.slice(e + 1));
    if (h) out.add(h);
  }
  return out;
}

/**
 * Every `.env*` file at the env root — the same root `secretFiles` anchors on. `VC_MEASURE_SECRETS`
 * overrides this list too, for the reason it overrides that one: one explicit list of files, so a
 * caller that pinned what the gate reads gets exactly that and nothing from the repo around it.
 */
export function hostFiles(env = process.env) {
  if (env.VC_MEASURE_SECRETS) return env.VC_MEASURE_SECRETS.split(';').filter(Boolean);
  const root = env.VC_ENV_ROOT || resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
  try {
    return readdirSync(root).filter((n) => /^\.env(?:\.|$)/.test(n)).map((n) => join(root, n));
  } catch { return []; }
}

/** The deployment hosts: every root `.env*` file, plus URL-shaped keys of the live environment. */
export function loadHosts(env = process.env) {
  const hosts = new Set();
  for (const f of hostFiles(env)) {
    let text;
    try { text = readFileSync(f, 'utf8'); } catch { continue; }
    for (const h of hostValuesFrom(text)) hosts.add(h);
  }
  for (const [k, v] of Object.entries(env)) {
    if (!HOST_NAME.test(k)) continue;
    const h = hostOf(v);
    if (h) hosts.add(h);
  }
  return hosts;
}

/**
 * The secret values the LIVE environment carries (VCST-6378). A token kept in
 * `.claude/settings.local.json` `env` -- the documented way to keep a PAT out of `.mcp.json` -- is in
 * `process.env` and in no `.env*` file, so the file scan never knew it.
 *
 * Stricter than the file rule, because the live environment is not curated: a secret-named key whose
 * value is a plain word (`PASSWORD_POLICY=strict`) would otherwise make the gate refuse every line
 * that says "strict". A live value counts when it is at least 8 characters, has no whitespace, and
 * is not letters only. A key that POINTS at secrets rather than holding one -- `VC_MEASURE_SECRETS`
 * (a file list), `*_FILE`, `*_PATH`, `*_DIR` -- is skipped: its value is a location.
 */
const POINTER_KEY = /(?:_FILES?|_PATH|_DIR|SECRETS)$/i;

export function secretValuesFromEnv(env = process.env) {
  const out = new Set();
  for (const [k, raw] of Object.entries(env)) {
    if (!SECRET_NAME.test(k) || POINTER_KEY.test(k) || typeof raw !== 'string') continue;
    const v = raw.trim();
    if (v.length >= 8 && !/\s/.test(v) && !/^[A-Za-z]+$/.test(v) && !looksLikePath(v)) out.add(v);
  }
  return out;
}

/**
 * Load the secret values. Values are never returned to a caller that prints them and never logged;
 * the COUNT is reported, so an operator can see the gate loaded something rather than assume it.
 * The deployment hosts ride along as `hosts` (see `loadHosts`); `count` stays the secret count.
 */
export function loadSecrets(env = process.env) {
  const values = new Set();
  const hosts = loadHosts(env);
  const read = [];
  for (const f of secretFiles(env)) {
    let text;
    try {
      text = readFileSync(f, 'utf8');
    } catch {
      continue; // an absent env file is normal on a machine with no secrets, not an error
    }
    read.push(f);
    for (const v of secretValuesFrom(text)) values.add(v);
  }
  for (const v of secretValuesFromEnv(env)) values.add(v);
  return { values, hosts, files: read, count: values.size };
}

/**
 * Every string in a queue line — values AND keys, at any depth — exactly as it will be written.
 *
 * THE SCAN RUNS OVER THESE, NEVER OVER `JSON.stringify(line)`. Serialising first escapes `"`, `\`,
 * a tab and a newline, so a secret containing any of them no longer appears in the serialised text
 * and a substring test passes it straight through — in the flattering direction, on the one control
 * between `.env.local` and a public repo. The raw strings are what the commit will carry once it is
 * serialised the SAME way on the other side, so they are the only honest thing to compare against.
 */
export function stringsOf(value, out = []) {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) for (const v of value) stringsOf(v, out);
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) { out.push(k); stringsOf(v, out); }
  }
  return out;
}

/**
 * What tripped, if anything. Returns the KINDS only -- never the matched text, because a scanner
 * that prints the secret it found has published it to the terminal, the transcript and the log.
 *
 * `text` is one string or an array of them (`stringsOf` of a line). Hosts match case-insensitively:
 * a hostname is, and `VCST-QA.govirto.com` is the same stand.
 */
export function scanText(text, secrets = new Set(), hosts = new Set()) {
  const hits = [];
  const parts = (Array.isArray(text) ? text : [text]).map(String);
  for (const v of secrets) {
    if (v && parts.some((s) => s.includes(v))) { hits.push('env-secret-value'); break; }
  }
  if (hosts.size) {
    const lower = parts.map((s) => s.toLowerCase());
    for (const h of hosts) {
      if (h && lower.some((s) => s.includes(h))) { hits.push('env-host'); break; }
    }
  }
  for (const [name, re] of TOKEN_SHAPES) if (parts.some((s) => re.test(s))) hits.push(name);
  if (hasPersonalEmail(parts)) hits.push('email');
  return hits;
}

/** What to write INSTEAD, per kind: the refusal is the retry prompt, so it says how to fix, not only what. */
export const PUBLISH_FIXES = Object.freeze({
  'env-secret-value': 'a value from your secret env (a password or token) -- drop it; name the role or the @td() alias instead',
  'env-host': 'a deployment host -- name the stand by its deployment label (vcst_qa, vcptcore_qa1) and keep only the path',
  email: 'a personal e-mail address -- name the account by its role or @td() alias ("the B2B org admin"), or use a test domain (…@example.com)',
  'github-pat': 'a GitHub token -- remove it',
  jwt: 'a JWT -- remove it; say which claim you read and its value only if that value is not a credential',
  bearer: 'an Authorization header value -- remove it',
  'ado-pat': 'an Azure DevOps PAT -- remove it',
  'sas-signature': 'a SAS signature -- keep the path, drop the query string',
  'storage-key': 'a storage account key -- remove it',
  'private-key': 'a private key -- remove it',
  'aws-access-key': 'an AWS access key -- remove it',
});

/**
 * THE GATE AT THE DOOR (VCST-6378): which fields of a write would put a secret or a person into the
 * public base, as `[{ field, kinds }]`. The push-time `gateQueue` stays as the backstop, but it can
 * only drop a line after the agent was told "queued" -- the fact is lost and nobody learns why. Here
 * the writer is still in the call and can resend it without the value.
 *
 * Like `scanText`, it names FIELDS and KINDS, never the matched text.
 */
export function publishProblems(fields, { secrets = new Set(), hosts = new Set() } = {}) {
  const out = [];
  for (const [field, value] of Object.entries(fields ?? {})) {
    if (value == null) continue;
    const kinds = scanText(stringsOf(value), secrets, hosts);
    if (kinds.length) out.push({ field, kinds });
  }
  return out;
}

/** One refusal sentence for `publishProblems`' result -- what was found where, and what to write instead. */
export function publishRefusal(problems) {
  const kinds = [...new Set(problems.flatMap((p) => p.kinds))];
  const where = problems.map((p) => `${p.field} (${p.kinds.join(', ')})`).join('; ');
  return `refused: the base is a PUBLIC repository and ${where} would publish `
    + kinds.map((k) => PUBLISH_FIXES[k] ?? k).join('; ')
    + '. Nothing was queued -- resend without it.';
}

/**
 * The gate over a queue: each line survives or is replaced by a marker.
 *
 * The marker keeps the line's `at` and `kind` so the log still says WHEN something happened and
 * WHAT KIND of thing it was -- a gap with a shape is a finding; a gap with no shape is an unexplained
 * hole in the record.
 */
export function gateQueue(lines, secrets = new Set(), hosts = new Set()) {
  const kept = [];
  const dropped = [];
  for (const line of lines) {
    const hits = scanText(stringsOf(line), secrets, hosts);
    if (!hits.length) { kept.push(line); continue; }
    dropped.push({ line, hits });
    // `who` survives with them, off the ORIGINAL line and never off this process: a redaction is a
    // hole in one person's record, and a hole whose owner is unknown is one nobody can go and ask
    // about. A swept foreign line keeps its own writer here, as it does everywhere else.
    kept.push({ at: line.at, kind: 'redacted', why: 'secret-scan', was: line.kind ?? null, hits, ...(line.who ? { who: line.who } : {}) });
  }
  return { kept, dropped };
}
