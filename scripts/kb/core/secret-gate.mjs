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
// commit sha somebody legitimately asked about.
//
// A LINE THAT TRIPS IT IS DROPPED, NOT ESCALATED. The push continues without that line, and a
// `{"kind":"redacted","why":"secret-scan"}` marker takes its place so the gap is visible in the
// log rather than invisible. Losing one line is cheap; losing the session's whole log -- which is
// what blocking the push would do -- is not.
//
// AND A DROPPED LINE IS NOT PUSHED EITHER. The scan runs over the WHOLE queue line, payload
// included, because the payload is what becomes an entry BODY in the public base. A gate that
// stripped the log line but still committed its payload would launder the secret into the one
// artifact everybody reads.

import { readFileSync } from 'node:fs';
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
]);

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

/**
 * Load the secret values. Values are never returned to a caller that prints them and never logged;
 * the COUNT is reported, so an operator can see the gate loaded something rather than assume it.
 */
export function loadSecrets(env = process.env) {
  const values = new Set();
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
  return { values, files: read, count: values.size };
}

/**
 * What tripped, if anything. Returns the KINDS only -- never the matched text, because a scanner
 * that prints the secret it found has published it to the terminal, the transcript and the log.
 */
export function scanText(text, secrets = new Set()) {
  const hits = [];
  const s = String(text);
  for (const v of secrets) {
    if (v && s.includes(v)) { hits.push('env-secret-value'); break; }
  }
  for (const [name, re] of TOKEN_SHAPES) if (re.test(s)) hits.push(name);
  return hits;
}

/**
 * The gate over a queue: each line survives or is replaced by a marker.
 *
 * The marker keeps the line's `at` and `kind` so the log still says WHEN something happened and
 * WHAT KIND of thing it was -- a gap with a shape is a finding; a gap with no shape is an unexplained
 * hole in the record.
 */
export function gateQueue(lines, secrets = new Set()) {
  const kept = [];
  const dropped = [];
  for (const line of lines) {
    const hits = scanText(JSON.stringify(line), secrets);
    if (!hits.length) { kept.push(line); continue; }
    dropped.push({ line, hits });
    kept.push({ at: line.at, kind: 'redacted', why: 'secret-scan', was: line.kind ?? null, hits });
  }
  return { kept, dropped };
}
