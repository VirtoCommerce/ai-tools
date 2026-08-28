#!/usr/bin/env node
/**
 * skills/kb/capture.mjs — the capture layer (D2 "trust boundary = folder").
 *
 * A skill that learned something during a run writes it HERE, into `drafts/`, directly
 * on main: append-only, no branch, no PR. Nothing a capture writes is knowledge yet —
 * `drafts/` is the untrusted half of the corpus, and only `consolidate.mjs` promotes
 * anything out of it.
 *
 * Four properties this module has to guarantee:
 *
 * 1. APPEND-ONLY, ONE FILE PER FINGERPRINT. A repeat observation increments `count`
 *    on the existing draft and appends its raw phrasing to `observations[]`; it never
 *    creates a second file and never rewrites the claim. The fingerprint scheme and
 *    its accepted trade-off live in `fingerprint.mjs`.
 *
 * 2. TOMBSTONES ARE FINAL. Once consolidation settles a fingerprint — applied OR
 *    rejected — the fingerprint is tombstoned, and a later sighting cannot resurrect
 *    it. Without this, a rejected observation returns every single run and the
 *    evidence bar re-litigates the same thing forever.
 *
 * 3. EVIDENCE IS ATTACHED AT CAPTURE TIME, NOT LATER. The capturing agent has a live
 *    browser, the run's artifacts and the source in front of it right now;
 *    consolidation runs later in a CI container with no environment access at all
 *    (D5). An observation with no evidence block is REFUSED here rather than
 *    accepted and quietly dropped downstream — a capture that cannot show its work is
 *    not an observation, it is a guess.
 *
 * 4. THE BOUNDARY IS ENFORCED BY THE ROOT, NOT BY THE CALLER. `assertWritable()` reads
 *    the target root's `brain.json`: a pinned platform cache declares `readOnly: true`
 *    and refuses every write, and a platform brain refuses a `scope: client` entry.
 *    So "nothing in this toolchain ever writes to a platform brain from a client
 *    context" holds even when a caller passes the wrong `--root`.
 *
 * Usage:
 *   node capture.mjs --root <dir> --input <observation.json>
 *   echo '{...}' | node capture.mjs --root <dir>
 *   node capture.mjs --root <dir> --kind quirk --scope client --subject checkout-payment \
 *     --claim "..." --evidence-method live --evidence-at 2026-08-28 --evidence-ref RUN/CASE
 *
 * Observation shape (the only accepted input):
 *   { kind, scope, subject, claim, evidence: {method, at, ref}, [triangulation],
 *     [tags], [appliesTo], [title], [proposedId], [body] }
 *
 * Exit code: 0 created/deduped; 1 rejected (validation or tombstone); 3 containment.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseEntry, serializeEntry, validateEntry } from "./entry.mjs";
import { fingerprint, fingerprintParts } from "./fingerprint.mjs";
import { LAYOUT, p, assertWritable, KbContainmentError } from "./kb-paths.mjs";

/** How many distinct raw phrasings a draft keeps. Enough to audit a merge, not a log. */
export const OBSERVATION_CAP = 5;
const ONE_LINE_CAP = 240;

const today = (now) => String(now || new Date().toISOString().slice(0, 10)).slice(0, 10);
const oneLine = (s) => String(s || "").replace(/\s+/g, " ").trim().slice(0, ONE_LINE_CAP);

/* --------------------------------------------------------------- tombstones */

export function readTombstones(root) {
  const file = p(root, "tombstones");
  if (!existsSync(file)) return { schemaVersion: 1, tombstones: {} };
  try {
    const raw = JSON.parse(readFileSync(file, "utf8"));
    return { schemaVersion: raw.schemaVersion || 1, tombstones: raw.tombstones || {} };
  } catch {
    // A corrupt tombstone file must not silently un-settle everything; treat it as
    // empty but say so, so the caller can see why a resurrection got through.
    return { schemaVersion: 1, tombstones: {}, corrupt: true };
  }
}

export function writeTombstones(root, store) {
  const file = p(root, "tombstones");
  mkdirSync(join(root, LAYOUT.drafts), { recursive: true });
  const sorted = {};
  for (const k of Object.keys(store.tombstones || {}).sort()) sorted[k] = store.tombstones[k];
  writeFileSync(file, JSON.stringify({ schemaVersion: store.schemaVersion || 1, tombstones: sorted }, null, 2) + "\n", "utf8");
}

/** Record a fingerprint as settled. Called by consolidation, never by capture. */
export function tombstone(root, fp, record) {
  const store = readTombstones(root);
  store.tombstones[fp] = Object.assign({ disposition: "applied" }, record || {});
  writeTombstones(root, store);
  return store;
}

/* ------------------------------------------------------------------ capture */

/**
 * Normalize free input into the draft frontmatter shape.
 * @returns {{draft: object, errors: object[]}}
 */
export function buildDraft(observation, opts) {
  const now = today(opts && opts.now);
  const obs = observation || {};
  const ev = obs.evidence || {};
  const fp = fingerprint(obs);
  const draft = {
    kind: String(obs.kind || ""),
    scope: String(obs.scope || ""),
    subject: String(obs.subject || ""),
    claim: oneLine(obs.claim),
    status: "draft",
    fingerprint: fp,
    count: 1,
    firstSeen: now,
    lastSeen: now,
    evidence: { method: String(ev.method || ""), at: String(ev.at || now), ref: String(ev.ref || "") },
    observations: [oneLine(obs.claim)],
    body: String(obs.body || obs.claim || "").trim(),
  };
  if (obs.title) draft.title = oneLine(obs.title);
  if (obs.appliesTo) draft.appliesTo = String(obs.appliesTo);
  if (obs.proposedId) draft.proposedId = String(obs.proposedId);
  if (Array.isArray(obs.tags) && obs.tags.length) draft.tags = obs.tags.map(String).slice().sort();
  if (obs.triangulation) {
    const axes = Array.isArray(obs.triangulation) ? obs.triangulation : [obs.triangulation];
    draft.triangulation = Array.from(new Set(axes.map(String))).sort();
  }
  // `body` is the markdown BELOW the frontmatter, not a frontmatter field — validate
  // the frontmatter alone, or the closed-schema check flags the body as unknown.
  const frontmatter = Object.assign({}, draft);
  delete frontmatter.body;
  const errors = validateEntry(frontmatter, { profile: "draft" });
  return { draft, errors };
}

/**
 * Capture one observation into a root's `drafts/`.
 * @param {string} root
 * @param {object} observation
 * @param {{now?: string}} [opts]
 * @returns {{outcome: string, fingerprint: string, file?: string, count?: number, errors?: object[], reason?: string, parts?: object}}
 *          outcome ∈ created | deduped | tombstoned | rejected
 * @throws {KbContainmentError} when the root refuses the write
 */
export function capture(root, observation, opts) {
  assertWritable(root, observation && observation.scope);

  const built = buildDraft(observation, opts);
  const fp = built.draft.fingerprint;
  const parts = fingerprintParts(observation || {});
  if (built.errors.length) {
    return {
      outcome: "rejected", fingerprint: fp, errors: built.errors, parts,
      reason: "the observation does not satisfy the draft contract — an observation with no evidence block is a guess, and consolidation later has no environment to check it in",
    };
  }

  const store = readTombstones(root);
  if (store.tombstones[fp]) {
    const t = store.tombstones[fp];
    return {
      outcome: "tombstoned", fingerprint: fp, parts,
      reason: "this fingerprint was already settled (" + (t.disposition || "settled") + (t.runId ? " by " + t.runId : "") + ") — a settled observation cannot be resurrected by seeing it again",
    };
  }

  const draftsDir = join(root, LAYOUT.drafts);
  mkdirSync(draftsDir, { recursive: true });
  const file = join(draftsDir, fp + ".md");

  if (existsSync(file)) {
    const parsed = parseEntry(readFileSync(file, "utf8"), { file: fp + ".md", profile: "draft" });
    const prev = parsed.entry || {};
    const merged = Object.assign({}, prev);
    delete merged.absPath; delete merged.layer; delete merged.valid; delete merged.errors;
    delete merged.file; delete merged.startLine; delete merged.endLine; delete merged.relationParsed;
    merged.count = Number(prev.count || 1) + 1;
    merged.lastSeen = built.draft.lastSeen;
    // The freshest evidence wins: consolidation checks evidence FRESHNESS, so a repeat
    // sighting verified today is exactly what should keep the draft alive.
    merged.evidence = built.draft.evidence;
    if (built.draft.triangulation) {
      const prevAxes = Array.isArray(prev.triangulation) ? prev.triangulation : prev.triangulation ? [prev.triangulation] : [];
      merged.triangulation = Array.from(new Set(prevAxes.concat(built.draft.triangulation))).sort();
    }
    const prevObs = Array.isArray(prev.observations) ? prev.observations : prev.observations ? [prev.observations] : [];
    const phrasing = built.draft.observations[0];
    if (!prevObs.includes(phrasing)) {
      // Keep the audit trail bounded, and say so in the file rather than truncating silently.
      if (prevObs.length < OBSERVATION_CAP) merged.observations = prevObs.concat([phrasing]);
      else merged.observations = prevObs.slice(0, OBSERVATION_CAP - 1).concat(["(+ further phrasings not kept — observations capped at " + OBSERVATION_CAP + ")"]);
    } else {
      merged.observations = prevObs;
    }
    writeFileSync(file, serializeEntry(merged), "utf8");
    return { outcome: "deduped", fingerprint: fp, file, count: merged.count, parts };
  }

  writeFileSync(file, serializeEntry(built.draft), "utf8");
  return { outcome: "created", fingerprint: fp, file, count: 1, parts };
}

/* ----------------------------------------------------------------------- CLI */

export function parseArgs(argv) {
  const args = { root: "", input: "", json: false, now: "", obs: {}, evidence: {} };
  const set = (k, v) => { args.obs[k] = v; };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i] || "";
    if (a === "--json") args.json = true;
    else if (a === "--root") args.root = next();
    else if (a.startsWith("--root=")) args.root = a.slice(7);
    else if (a === "--input") args.input = next();
    else if (a.startsWith("--input=")) args.input = a.slice(8);
    else if (a === "--now") args.now = next();
    else if (a.startsWith("--now=")) args.now = a.slice(6);
    else if (a === "--kind") set("kind", next());
    else if (a === "--scope") set("scope", next());
    else if (a === "--subject") set("subject", next());
    else if (a === "--claim") set("claim", next());
    else if (a === "--title") set("title", next());
    else if (a === "--applies-to") set("appliesTo", next());
    else if (a === "--proposed-id") set("proposedId", next());
    else if (a === "--tags") set("tags", next().split(",").map((s) => s.trim()).filter(Boolean));
    else if (a === "--triangulation") set("triangulation", next().split(",").map((s) => s.trim()).filter(Boolean));
    else if (a === "--evidence-method") args.evidence.method = next();
    else if (a === "--evidence-at") args.evidence.at = next();
    else if (a === "--evidence-ref") args.evidence.ref = next();
  }
  if (Object.keys(args.evidence).length) args.obs.evidence = args.evidence;
  return args;
}

function readStdin() {
  try { return readFileSync(0, "utf8"); } catch { return ""; }
}

function main(argv) {
  const args = parseArgs(argv);
  if (!args.root) {
    process.stderr.write("kb:capture — usage: capture.mjs --root <dir> (--input <file> | stdin JSON | --kind/--scope/--subject/--claim/--evidence-* flags)\n");
    return 2;
  }
  let observation = args.obs;
  if (args.input) {
    try { observation = JSON.parse(readFileSync(args.input, "utf8")); }
    catch (e) { process.stderr.write("kb:capture — cannot read --input: " + (e && e.message) + "\n"); return 2; }
  } else if (!observation.claim) {
    const raw = readStdin();
    if (raw.trim()) {
      try { observation = JSON.parse(raw); }
      catch (e) { process.stderr.write("kb:capture — stdin is not JSON: " + (e && e.message) + "\n"); return 2; }
    }
  }

  let result;
  try {
    result = capture(args.root, observation, { now: args.now });
  } catch (e) {
    if (e instanceof KbContainmentError) {
      process.stderr.write("kb:capture — CONTAINMENT: " + e.message + "\n");
      return 3;
    }
    throw e;
  }

  if (args.json) process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  else {
    process.stdout.write("kb:capture " + result.outcome + " " + result.fingerprint + (result.count ? " (count " + result.count + ")" : "") + "\n");
    if (result.file) process.stdout.write("  " + result.file + "\n");
    if (result.reason) process.stdout.write("  " + result.reason + "\n");
    for (const e of result.errors || []) process.stdout.write("  " + e.code + " " + e.field + ": " + e.message + "\n");
  }
  return result.outcome === "created" || result.outcome === "deduped" ? 0 : 1;
}

const invokedDirectly = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (invokedDirectly) process.exit(main(process.argv.slice(2)));

export { main };
