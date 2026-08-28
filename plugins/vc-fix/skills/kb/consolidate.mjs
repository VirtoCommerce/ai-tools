#!/usr/bin/env node
/**
 * skills/kb/consolidate.mjs — the autonomous pipeline (D5).
 *
 * Moves observations from `drafts/` to `confirmed/` with NO per-entry human review and
 * NO pull request anywhere. Deterministic Node, zero external dependencies, no LLM, no
 * environment access: it runs as CI inside the brain repo itself, or locally from the
 * SessionStart fallback. It can do this safely only because five things replace the
 * reviewer, and every one of them is mechanical:
 *
 *  1. EVIDENCE BAR — capture-time evidence present and FRESH, a triangulation stamp
 *     naming at least two axes, and no contradiction left unhandled. Consolidation has
 *     no browser and no environment; the proof had to be attached when the agent still
 *     had one (capture.mjs). A draft that fails the bar is not deleted and not
 *     tombstoned: it stays in `drafts/`, visible to agents as unverified, and can pass
 *     on a later run when someone re-verifies it.
 *
 *  2. SUPERSEDE-WITH-QUOTE — a draft that contradicts a confirmed entry never
 *     overwrites it. The old entry stays in `confirmed/` with `status: superseded`, and
 *     the NEW entry carries the verbatim superseded wording in `quotes`. "Was this
 *     change actually applied?" then has a deterministic answer, and nothing is ever
 *     lost. Contradiction is anchored on the ID (the draft's `proposedId` names an
 *     existing entry) rather than on prose similarity, because the id is the citation
 *     contract and prose similarity is exactly the judgment call a zero-dep
 *     deterministic process must not pretend to make.
 *
 *  3. LAYER GUARD — the count of confirmed entries per scope may never FALL without an
 *     explicit retire. This is the 196 -> 144 `BL-*` gap in its general form: a whole
 *     knowledge layer can drain away while every aggregate instrument still reports
 *     "ok", because nothing measured that layer specifically.
 *
 *  4. QUARANTINE — more changes in one run than the threshold and the run applies
 *     NOTHING and says so. Cortex's founding incident: a copied dist folder doubled the
 *     brain with duplicates inside a day. A big batch is not necessarily wrong; it is
 *     necessarily worth a human glance before it lands.
 *
 *  5. EXAM GATE WITH AUTO-REVERT — the retrieval exam runs before and after the batch.
 *     Any drop in hits or MRR and the batch commit is `git revert`ed automatically, so
 *     the entries return to `drafts/` and the corpus is exactly where it started. This
 *     is the load-bearing one: with the human reviewer gone, a measurement that the
 *     brain still ANSWERS is the only thing standing between the corpus and confident
 *     rot. A root with NO goldens therefore gets no autonomy at all — the run holds the
 *     batch instead of applying it ungated.
 *
 * Usage:
 *   node consolidate.mjs --root <dir> [--run-id <id>] [--suites <dir>] [--dry-run]
 *                        [--threshold 20] [--max-evidence-age 90] [--now YYYY-MM-DD]
 *                        [--no-git] [--json]
 *   npm run kb:consolidate -- --root .knowledge/client --suites regression/suites
 *
 * Exit code: 0 applied or nothing to do; 1 quarantined / reverted / layer-guard abort;
 * 2 bad root; 3 containment refusal.
 */
import { writeFileSync, existsSync, mkdirSync, rmSync, cpSync, unlinkSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { serializeEntry } from "./entry.mjs";
import { claimBag } from "./fingerprint.mjs";
import { loadRoot, writeIndex } from "./gen-index.mjs";
import { runExam, compareMetrics, loadGoldens } from "./exam.mjs";
import { readTombstones, writeTombstones } from "./capture.mjs";
import { LAYOUT, assertWritable, KbContainmentError } from "./kb-paths.mjs";

export const DIGEST_SCHEMA_VERSION = 1;
/** More changes than this in one run and the batch is held, not applied. */
export const DEFAULT_QUARANTINE_THRESHOLD = 20;
/** Evidence older than this is stale: the deployment it was verified against has moved. */
export const DEFAULT_MAX_EVIDENCE_AGE_DAYS = 90;
/** A triangulated fact needs at least this many distinct axes (docs / live / source). */
export const MIN_TRIANGULATION_AXES = 2;

const KIND_CODE = { invariant: "INV", flow: "FLO", locator: "LOC", quirk: "QRK", module: "MOD" };

const dayMs = 86400000;
const parseDay = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ""));
  return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : NaN;
};
export const daysBetween = (from, to) => {
  const a = parseDay(from);
  const b = parseDay(to);
  return Number.isNaN(a) || Number.isNaN(b) ? NaN : Math.round((b - a) / dayMs);
};

/* ---------------------------------------------------------------------- git */

function git(root, args, opts) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...(opts || {}) }).trim();
}

export function isGitRepo(root) {
  try { return git(root, ["rev-parse", "--is-inside-work-tree"]) === "true"; } catch { return false; }
}

/** Identity flags only when the repo has none — never override a real committer. */
function identityFlags(root) {
  try {
    if (git(root, ["config", "user.email"])) return [];
  } catch { /* unset */ }
  return ["-c", "user.name=kb consolidate", "-c", "user.email=kb-consolidate@vc-fix.local"];
}

/* ------------------------------------------------------------- evidence bar */

/**
 * Apply the evidence bar to one draft.
 * @returns {{pass: boolean, reasons: string[]}}
 */
export function evidenceBar(draft, opts) {
  const now = (opts && opts.now) || new Date().toISOString().slice(0, 10);
  const maxAge = (opts && opts.maxEvidenceAgeDays) || DEFAULT_MAX_EVIDENCE_AGE_DAYS;
  const reasons = [];
  const ev = draft.evidence || {};

  if (!ev.method || !ev.at || !ev.ref) {
    reasons.push("no capture-time evidence block — consolidation has no environment to verify a claim in, so an unproven observation can never be promoted here");
  } else {
    const age = daysBetween(ev.at, now);
    if (Number.isNaN(age)) reasons.push("evidence.at is not a readable date: " + JSON.stringify(ev.at));
    else if (age > maxAge) reasons.push("evidence is " + age + " days old (limit " + maxAge + ") — the deployment it was verified against has moved on; re-verify to promote");
    else if (age < 0) reasons.push("evidence.at is in the future relative to the run date — refusing to trust a clock that disagrees with itself");
  }

  const axes = Array.isArray(draft.triangulation) ? draft.triangulation : draft.triangulation ? [draft.triangulation] : [];
  const distinct = Array.from(new Set(axes.map(String)));
  if (distinct.length < MIN_TRIANGULATION_AXES) {
    reasons.push("triangulation stamp names " + distinct.length + " axis/axes (needs " + MIN_TRIANGULATION_AXES + " of docs/live/source) — one axis is an observation, not a confirmed fact");
  }

  return { pass: reasons.length === 0, reasons };
}

/* ------------------------------------------------------------------ planning */

/** Next free id for a kind, never reusing a retired one (all files are scanned). */
function mintId(kind, taken) {
  const code = KIND_CODE[kind] || "GEN";
  const prefix = "KB-" + code + "-";
  let max = 0;
  for (const id of taken) {
    if (!id.startsWith(prefix)) continue;
    const n = Number(id.slice(prefix.length).replace(/[^0-9]/g, ""));
    if (Number.isFinite(n) && n > max) max = n;
  }
  return prefix + String(max + 1).padStart(3, "0");
}

const draftTitle = (d) => String(d.title || d.claim || d.subject || "Untitled observation").slice(0, 160);

/**
 * Decide what this run would do, without touching anything.
 * @returns {{applied: object[], superseded: object[], rejected: object[], held: object[], changes: number}}
 */
export function planBatch(root, opts) {
  const now = (opts && opts.now) || new Date().toISOString().slice(0, 10);
  const runId = (opts && opts.runId) || "adhoc";
  const drafts = loadRoot(root, { layer: "drafts" }).entries;
  const confirmed = loadRoot(root).entries;
  const byId = new Map(confirmed.map((e) => [e.id, e]));
  const taken = new Set(confirmed.map((e) => e.id));

  const applied = [];
  const superseded = [];
  const rejected = [];
  const held = [];

  // Fingerprint order: deterministic, so two runs over the same drafts mint the same ids.
  for (const draft of drafts.slice().sort((a, b) => (String(a.fingerprint) < String(b.fingerprint) ? -1 : 1))) {
    const fp = String(draft.fingerprint || "");
    const bar = evidenceBar(draft, { now, maxEvidenceAgeDays: opts && opts.maxEvidenceAgeDays });
    if (!bar.pass) {
      held.push({ fingerprint: fp, subject: String(draft.subject || ""), reasons: bar.reasons });
      continue;
    }

    const target = draft.proposedId ? byId.get(String(draft.proposedId)) : null;
    if (target && String(target.status) === "active") {
      if (claimBag(target.body) === claimBag(draft.claim) || claimBag(target.title) === claimBag(draft.claim)) {
        rejected.push({
          fingerprint: fp,
          reason: "restates confirmed entry " + target.id + " — nothing to add, settled so it stops coming back",
        });
        continue;
      }
      const newId = mintId(draft.kind, taken);
      taken.add(newId);
      superseded.push({
        fingerprint: fp,
        newId,
        oldId: target.id,
        oldFile: target.file,
        quote: String(target.body || "").trim(),
        draft,
        runId,
      });
      continue;
    }

    const id = draft.proposedId && !taken.has(String(draft.proposedId)) ? String(draft.proposedId) : mintId(draft.kind, taken);
    taken.add(id);
    applied.push({ fingerprint: fp, id, title: draftTitle(draft), kind: draft.kind, scope: draft.scope, draft, runId });
  }

  return { applied, superseded, rejected, held, changes: applied.length + superseded.length + rejected.length };
}

/** Turn a passing draft into a confirmed entry. */
function confirmedFromDraft(item, opts) {
  const d = item.draft;
  const entry = {
    id: item.id || item.newId,
    title: draftTitle(d),
    scope: String(d.scope),
    kind: String(d.kind),
    appliesTo: String(d.appliesTo || "*"),
    relation: "new",
    status: "active",
    audited: { date: String((d.evidence && d.evidence.at) || (opts && opts.now) || ""), source: String((d.evidence && d.evidence.method) || ""), ref: String((d.evidence && d.evidence.ref) || "") },
    fingerprint: String(d.fingerprint || ""),
    runId: String(item.runId || ""),
    sourceDraft: String(d.fingerprint || "") + ".md",
    body: String(d.body || d.claim || ""),
  };
  if (Array.isArray(d.tags) && d.tags.length) entry.tags = d.tags.slice().sort();
  if (item.oldId) {
    entry.supersedes = item.oldId;
    // The supersede-with-quote writer: the replacement carries the verbatim wording it
    // replaced, so "was this actually applied?" is a string comparison, not an opinion.
    entry.quotes = item.quote;
  }
  return entry;
}

/** Per-scope confirmed-entry counts — the layer guard's measurement. */
export function layerCounts(root) {
  const counts = {};
  for (const e of loadRoot(root).entries) {
    const scope = String(e.scope || "unknown");
    counts[scope] = (counts[scope] || 0) + 1;
  }
  return counts;
}

/* --------------------------------------------------------------------- run */

/**
 * Run one consolidation.
 * @param {string} root
 * @param {object} [opts] runId, now, suites, threshold, maxEvidenceAgeDays, dryRun, git, examOpts
 * @returns {object} the digest
 */
export function consolidate(root, opts) {
  const o = opts || {};
  const now = o.now || new Date().toISOString().slice(0, 10);
  const runId = o.runId || "kb-" + now;
  const threshold = Number.isFinite(o.threshold) ? o.threshold : DEFAULT_QUARANTINE_THRESHOLD;
  const useGit = o.git !== false && isGitRepo(root);

  assertWritable(root);

  const digest = {
    schemaVersion: DIGEST_SCHEMA_VERSION,
    runId,
    root,
    at: new Date().toISOString(),
    counts: { drafts: 0, applied: 0, superseded: 0, rejected: 0, held: 0 },
    applied: [], superseded: [], rejected: [], held: [],
    quarantined: { triggered: false, threshold, changes: 0, reason: "" },
    layerGuard: { ok: true, before: {}, after: {}, reason: "" },
    exam: { before: null, after: null, regressed: false, reasons: [], reverted: false, gated: false },
    commit: null,
    dryRun: o.dryRun === true,
  };

  const plan = planBatch(root, { now, runId, maxEvidenceAgeDays: o.maxEvidenceAgeDays });
  digest.counts.drafts = plan.applied.length + plan.superseded.length + plan.rejected.length + plan.held.length;
  digest.held = plan.held;
  digest.counts.held = plan.held.length;
  digest.quarantined.changes = plan.changes;

  if (plan.changes === 0) {
    digest.note = "nothing passed the evidence bar this run" + (plan.held.length ? " — " + plan.held.length + " draft(s) held as unverified" : "");
    return finish(root, digest, o);
  }

  // Guard 4 — quarantine. Apply NOTHING; a big batch is held for a human glance.
  if (plan.changes > threshold) {
    digest.quarantined.triggered = true;
    digest.quarantined.reason =
      plan.changes + " changes in one run exceeds the quarantine threshold of " + threshold +
      " — held, nothing applied. A batch this size is not necessarily wrong, it is worth a human glance before it lands.";
    return finish(root, digest, o);
  }

  // Guard 5 — the exam must be able to gate. No goldens means no autonomy.
  const goldens = loadGoldens(root);
  const examOpts = Object.assign({ platform: o.platformRoot, client: o.clientRoot }, o.examOpts || {});
  if (!goldens.goldens.length) {
    digest.quarantined.triggered = true;
    digest.quarantined.reason =
      "no " + LAYOUT.goldens + " in this root — the exam gate cannot measure whether this batch helps or harms retrieval, and an ungated autonomous write is exactly what the gate exists to prevent. Held, nothing applied.";
    return finish(root, digest, o);
  }
  digest.exam.gated = true;
  digest.exam.before = runExam(root, examOpts).metrics;

  if (digest.dryRun) {
    digest.applied = plan.applied.map(summarizeApplied);
    digest.superseded = plan.superseded.map(summarizeSuperseded);
    digest.rejected = plan.rejected;
    digest.counts.applied = plan.applied.length;
    digest.counts.superseded = plan.superseded.length;
    digest.counts.rejected = plan.rejected.length;
    digest.note = "dry run — nothing written";
    return finish(root, digest, o);
  }

  const before = layerCounts(root);
  digest.layerGuard.before = before;

  // A snapshot is the rollback path when the root is not a git repo; with git, the
  // batch commit is reverted instead (and the snapshot is simply unused).
  const snapshot = mkdtempSync(join(tmpdir(), "kb-consolidate-"));
  cpSync(root, snapshot, { recursive: true });

  try {
    // The batch commit is what the exam gate reverts, so everything the batch CONSUMES
    // has to be in history before it. Captures are supposed to land on main as they
    // happen (D2), but a draft written by a session that had not committed yet would
    // otherwise be deleted by this run while git never saw it exist — and `git revert`
    // cannot restore a file it never tracked. Commit the pending capture layer first.
    if (useGit) {
      git(root, ["add", "-A", "."]);
      if (git(root, ["diff", "--cached", "--name-only"])) {
        git(root, identityFlags(root).concat(["commit", "-m", "kb(capture): pending observations before " + runId, "--no-verify"]));
        digest.captureCommit = git(root, ["rev-parse", "HEAD"]);
      }
    }

    applyBatch(root, plan, { now, runId });

    // Guard 3 — layer guard, BEFORE anything is committed.
    const after = layerCounts(root);
    digest.layerGuard.after = after;
    for (const scope of Object.keys(before)) {
      if ((after[scope] || 0) < before[scope]) {
        digest.layerGuard.ok = false;
        digest.layerGuard.reason =
          "confirmed entries in scope " + scope + " fell " + before[scope] + " -> " + (after[scope] || 0) +
          " without an explicit retire. Consolidation only ever ADDS or supersedes, so a fall is a bug in this run, not a decision. Rolled back.";
      }
    }
    if (!digest.layerGuard.ok) {
      rollback(root, snapshot, useGit);
      return finish(root, digest, o);
    }

    writeIndex(root, { suites: o.suites });

    if (useGit) {
      git(root, ["add", "-A", "."]);
      const staged = git(root, ["diff", "--cached", "--name-only"]);
      if (staged) {
        git(root, identityFlags(root).concat(["commit", "-m", commitMessage(runId, plan), "--no-verify"]));
        digest.commit = git(root, ["rev-parse", "HEAD"]);
      }
    }

    // Guard 5 — the exam gate. A batch may not leave retrieval worse than it found it.
    digest.exam.after = runExam(root, examOpts).metrics;
    const cmp = compareMetrics(digest.exam.before, digest.exam.after);
    digest.exam.regressed = cmp.regressed;
    digest.exam.reasons = cmp.reasons;

    if (cmp.regressed) {
      if (useGit && digest.commit) {
        git(root, identityFlags(root).concat(["revert", "--no-edit", digest.commit]));
        digest.exam.revertCommit = git(root, ["rev-parse", "HEAD"]);
      } else {
        rollback(root, snapshot, useGit);
      }
      digest.exam.reverted = true;
      digest.applied = [];
      digest.superseded = [];
      digest.rejected = [];
      digest.counts.applied = 0;
      digest.counts.superseded = 0;
      digest.counts.rejected = 0;
      digest.note =
        "the batch lowered retrieval quality (" + cmp.reasons.join("; ") + ") and was reverted automatically; the drafts are back in " + LAYOUT.drafts + "/.";
      return finish(root, digest, o);
    }

    digest.applied = plan.applied.map(summarizeApplied);
    digest.superseded = plan.superseded.map(summarizeSuperseded);
    digest.rejected = plan.rejected;
    digest.counts.applied = plan.applied.length;
    digest.counts.superseded = plan.superseded.length;
    digest.counts.rejected = plan.rejected.length;
    return finish(root, digest, o);
  } finally {
    rmSync(snapshot, { recursive: true, force: true });
  }
}

const summarizeApplied = (a) => ({ fingerprint: a.fingerprint, id: a.id, title: a.title, kind: a.kind, scope: a.scope });
const summarizeSuperseded = (s) => ({ fingerprint: s.fingerprint, newId: s.newId, oldId: s.oldId, quotedChars: String(s.quote || "").length });

function commitMessage(runId, plan) {
  return [
    "kb(consolidate): " + runId,
    "",
    "applied " + plan.applied.length + ", superseded " + plan.superseded.length + ", rejected " + plan.rejected.length + ", held " + plan.held.length + ".",
    "One batch commit so the exam gate can revert it as a unit.",
  ].join("\n");
}

/** Write the confirmed entries, flip the superseded ones, settle the processed drafts. */
function applyBatch(root, plan, opts) {
  const confirmedDir = join(root, LAYOUT.confirmed);
  mkdirSync(confirmedDir, { recursive: true });
  const store = readTombstones(root);
  // Loaded once, so a superseded original is read from the corpus as it stood BEFORE
  // this batch started writing into it.
  const existing = new Map(loadRoot(root).entries.map((e) => [e.id, e]));

  for (const item of plan.applied) {
    const entry = confirmedFromDraft(item, opts);
    writeFileSync(join(confirmedDir, entry.id + ".md"), serializeEntry(entry), "utf8");
    store.tombstones[item.fingerprint] = { disposition: "applied", runId: opts.runId, at: opts.now, id: entry.id };
    settleDraft(root, item.fingerprint);
  }

  for (const item of plan.superseded) {
    const entry = confirmedFromDraft(item, opts);
    writeFileSync(join(confirmedDir, entry.id + ".md"), serializeEntry(entry), "utf8");

    // Supersede never deletes: the old entry keeps its file, its body and its id, and
    // only gains a status and a forward pointer.
    const old = existing.get(item.oldId);
    if (old) {
      const updated = Object.assign({}, old);
      delete updated.absPath; delete updated.layer; delete updated.valid; delete updated.errors;
      delete updated.file; delete updated.startLine; delete updated.endLine; delete updated.relationParsed;
      updated.status = "superseded";
      updated.supersededBy = entry.id;
      writeFileSync(old.absPath, serializeEntry(updated), "utf8");
    }
    store.tombstones[item.fingerprint] = { disposition: "applied", runId: opts.runId, at: opts.now, id: entry.id, superseded: item.oldId };
    settleDraft(root, item.fingerprint);
  }

  for (const item of plan.rejected) {
    store.tombstones[item.fingerprint] = { disposition: "rejected", runId: opts.runId, at: opts.now, reason: item.reason };
    settleDraft(root, item.fingerprint);
  }

  writeTombstones(root, store);
}

/** A processed draft is deleted; only its fingerprint survives, as a tombstone. */
function settleDraft(root, fingerprint) {
  const file = join(root, LAYOUT.drafts, fingerprint + ".md");
  if (existsSync(file)) unlinkSync(file);
}

/**
 * Undo everything this run wrote. Inside a git repo that is checkout + clean — never
 * `rm -rf` on a real working tree; the snapshot path is the fallback for a brain
 * directory that is not (yet) a repo.
 */
function rollback(root, snapshot, useGit) {
  if (useGit) {
    try {
      git(root, ["checkout", "--", "."]);
      git(root, ["clean", "-fd", "."]);
      return;
    } catch { /* fall through to the snapshot */ }
  }
  rmSync(root, { recursive: true, force: true });
  cpSync(snapshot, root, { recursive: true });
}

function finish(root, digest, opts) {
  digest.counts.held = digest.held.length;
  if (!digest.dryRun && opts.writeDigest !== false) {
    try {
      const dir = join(root, LAYOUT.digest);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, digest.runId + ".json"), JSON.stringify(digest, null, 2) + "\n", "utf8");
    } catch { /* a digest that cannot be written must not fail a run that succeeded */ }
  }
  return digest;
}

/* ----------------------------------------------------------------------- CLI */

export function parseArgs(argv) {
  const args = { root: "", runId: "", suites: "", now: "", threshold: DEFAULT_QUARANTINE_THRESHOLD, maxEvidenceAgeDays: DEFAULT_MAX_EVIDENCE_AGE_DAYS, dryRun: false, git: true, json: false, platformRoot: "", clientRoot: "" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i] || "";
    if (a === "--json") args.json = true;
    else if (a === "--dry-run") args.dryRun = true;
    else if (a === "--no-git") args.git = false;
    else if (a === "--root") args.root = next();
    else if (a.startsWith("--root=")) args.root = a.slice(7);
    else if (a === "--run-id") args.runId = next();
    else if (a.startsWith("--run-id=")) args.runId = a.slice(9);
    else if (a === "--suites") args.suites = next();
    else if (a.startsWith("--suites=")) args.suites = a.slice(9);
    else if (a === "--now") args.now = next();
    else if (a.startsWith("--now=")) args.now = a.slice(6);
    else if (a === "--threshold") args.threshold = Number(next());
    else if (a.startsWith("--threshold=")) args.threshold = Number(a.slice(12));
    else if (a === "--max-evidence-age") args.maxEvidenceAgeDays = Number(next());
    else if (a.startsWith("--max-evidence-age=")) args.maxEvidenceAgeDays = Number(a.slice(19));
    else if (a === "--platform-root") args.platformRoot = next();
    else if (a === "--client-root") args.clientRoot = next();
    else if (!a.startsWith("-") && !args.root) args.root = a;
  }
  return args;
}

function main(argv) {
  const args = parseArgs(argv);
  if (!args.root) {
    process.stderr.write("kb:consolidate — usage: consolidate.mjs --root <dir> [--run-id <id>] [--suites <dir>] [--dry-run] [--threshold N] [--json]\n");
    return 2;
  }
  let digest;
  try {
    digest = consolidate(args.root, args);
  } catch (e) {
    if (e instanceof KbContainmentError) {
      process.stderr.write("kb:consolidate — CONTAINMENT: " + e.message + "\n");
      return 3;
    }
    throw e;
  }

  if (args.json) process.stdout.write(JSON.stringify(digest, null, 2) + "\n");
  else {
    const c = digest.counts;
    process.stdout.write("kb consolidate " + digest.runId + " — " + digest.root + (digest.dryRun ? " (dry run)" : "") + "\n");
    process.stdout.write("  drafts " + c.drafts + " -> applied " + c.applied + ", superseded " + c.superseded + ", rejected " + c.rejected + ", held " + c.held + "\n");
    for (const a of digest.applied) process.stdout.write("    + " + a.id + "  " + a.title + "\n");
    for (const s of digest.superseded) process.stdout.write("    ~ " + s.newId + " supersedes " + s.oldId + " (quoted " + s.quotedChars + " chars)\n");
    for (const r of digest.rejected) process.stdout.write("    - " + r.fingerprint + "  " + r.reason + "\n");
    for (const h of digest.held) process.stdout.write("    ? " + h.fingerprint + "  " + h.reasons.join("; ") + "\n");
    if (digest.quarantined.triggered) process.stdout.write("  QUARANTINED — " + digest.quarantined.reason + "\n");
    if (!digest.layerGuard.ok) process.stdout.write("  LAYER GUARD — " + digest.layerGuard.reason + "\n");
    if (digest.exam.before) process.stdout.write("  exam hit@1 " + digest.exam.before.hitAt1 + " -> " + (digest.exam.after ? digest.exam.after.hitAt1 : "-") + ", MRR " + digest.exam.before.mrr + " -> " + (digest.exam.after ? digest.exam.after.mrr : "-") + "\n");
    if (digest.exam.reverted) process.stdout.write("  REVERTED — " + digest.exam.reasons.join("; ") + "\n");
    if (digest.commit && !digest.exam.reverted) process.stdout.write("  commit " + digest.commit.slice(0, 12) + "\n");
    if (digest.note) process.stdout.write("  " + digest.note + "\n");
  }

  const bad = digest.quarantined.triggered || digest.exam.reverted || !digest.layerGuard.ok;
  return bad ? 1 : 0;
}

const invokedDirectly = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (invokedDirectly) process.exit(main(process.argv.slice(2)));

export { main };
