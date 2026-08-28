#!/usr/bin/env node
/**
 * skills/kb/exam.mjs — the retrieval exam, and the load-bearing structure of the
 * whole autonomy layer.
 *
 * This module is built BEFORE consolidation on purpose. Once a human reviewer is
 * removed from the pipeline (D5), the only thing left standing between the corpus and
 * silent rot is a measurement that says whether the brain still ANSWERS. The exam is
 * that measurement, and `consolidate.mjs` uses it as a gate: a batch that lowers the
 * score is reverted automatically. Without the exam, autonomous consolidation is just
 * unattended writing.
 *
 * A golden is `{id, q, expect, must}`:
 *   q       the question an agent would actually ask,
 *   expect  the ENTRY that answers it — ground truth is an entry id, not answer prose,
 *           so the check is deterministic (the Cortex "ground truth is a FILE" rule),
 *   must    a verbatim marker that entry must still contain, which is what makes the
 *           SET catch its own staleness: rewrite the entry and drop the fact, and
 *           `--check` fails instead of the golden quietly grading a hollow entry.
 *
 * Goldens are HUMAN-OWNED. Nothing in this toolchain writes `exam/goldens.json` — a
 * brain that grades its own misses self-confirms (VCST-5776 §D5).
 *
 * Two failure modes are reported SEPARATELY because they are different diseases with
 * different fixes:
 *   notFound   the expected entry never appears in the ranked results — a vocabulary
 *              or coverage problem; the entry cannot be reached at all.
 *   wrongPlace it appears, but something else was surfaced ahead of it — a ranking
 *              problem; the knowledge is there and retrieval buried it.
 * Collapsing them into one "miss" number hides which of the two you have.
 *
 * Usage:
 *   node exam.mjs --root <dir> [--platform-root <dir>] [--client-root <dir>]
 *                 [--check] [--json] [--k 5] [--run-id <id>] [--no-history]
 *   npm run kb:exam -- --root .knowledge/platform
 *   npm run kb:exam:check -- --root .knowledge/platform
 *
 * Exit code: 0 clean; 1 on a `--check` failure; 2 on a bad root/goldens file.
 */
import { readFileSync, existsSync, appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { loadRoot } from "./gen-index.mjs";
import { lookup } from "./resolve.mjs";
import { LAYOUT, p, readBrain } from "./kb-paths.mjs";

export const GOLDENS_SCHEMA_VERSION = 1;
/** Primary k for the headline hit rate; hit@1 and hit@3 are always reported too. */
export const DEFAULT_K = 5;

const finding = (code, golden, message) => ({ code, golden, message });

/* ------------------------------------------------------------------- goldens */

/** @returns {{goldens: object[], errors: object[]}} */
export function loadGoldens(root) {
  const file = p(root, "goldens");
  if (!existsSync(file)) {
    return { goldens: [], errors: [finding("EXM-005", "", "no " + LAYOUT.goldens + " in " + root + " — the exam has no ground truth, so it cannot gate anything")] };
  }
  let raw;
  try {
    raw = JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    return { goldens: [], errors: [finding("EXM-005", "", LAYOUT.goldens + " is not valid JSON: " + (e && e.message))] };
  }
  const goldens = Array.isArray(raw) ? raw : Array.isArray(raw.goldens) ? raw.goldens : [];
  const errors = [];
  const seen = new Set();
  for (const g of goldens) {
    const id = String((g && g.id) || "");
    if (!id || !String((g && g.q) || "").trim() || !String((g && g.expect) || "").trim() || !String((g && g.must) || "").trim()) {
      errors.push(finding("EXM-004", id, "a golden needs a non-empty id, q, expect and must"));
      continue;
    }
    if (seen.has(id)) errors.push(finding("EXM-003", id, "duplicate golden id"));
    seen.add(id);
  }
  if (!goldens.length) {
    errors.push(finding("EXM-005", "", LAYOUT.goldens + " defines no goldens — an empty exam scores 100% and gates nothing"));
  }
  return { goldens, errors };
}

/** The searchable text of an entry: its title and its body. */
const entryText = (e) => String(e.title || "") + "\n" + String(e.body || "");

/**
 * Self-test the golden set against the corpus: the expected entry must EXIST and must
 * still CONTAIN the `must` marker.
 * @returns {{ok: boolean, errors: object[], checked: number}}
 */
export function checkGoldens(root, opts) {
  const corpus = corpusRoots(root, opts);
  const byId = new Map();
  for (const r of corpus) for (const e of r.entries) if (e.id) byId.set(e.id, e);

  const { goldens, errors } = loadGoldens(root);
  for (const g of goldens) {
    const id = String((g && g.id) || "");
    const expect = String((g && g.expect) || "");
    const must = String((g && g.must) || "");
    if (!id || !expect || !must) continue; // already reported as EXM-004
    const entry = byId.get(expect);
    if (!entry) {
      errors.push(finding("EXM-001", id, "expected entry " + expect + " does not exist in the corpus — the golden points at knowledge that is gone or was renumbered"));
      continue;
    }
    if (!entryText(entry).includes(must)) {
      errors.push(finding("EXM-002", id, "entry " + expect + " no longer contains the marker " + JSON.stringify(must) + " — the entry drifted and this golden would now grade a hollow answer"));
    }
  }
  return { ok: errors.length === 0, errors, checked: goldens.length };
}

/* --------------------------------------------------------------------- run */

function corpusRoots(root, opts) {
  const roots = [];
  const client = opts && opts.client;
  const platform = opts && opts.platform;
  if (client && existsSync(client)) roots.push(loadRoot(client));
  if (platform && existsSync(platform)) roots.push(loadRoot(platform));
  if (!roots.length) roots.push(loadRoot(root));
  return roots;
}

const round = (n) => Math.round(n * 10000) / 10000;

/**
 * The ids that may satisfy a golden: the named entry, plus whatever superseded it.
 *
 * A golden names the KNOWLEDGE, and `supersededBy` is an identity migration the corpus
 * itself declares — a recorded link, not a guess — so following it is deterministic.
 * Without this, superseding any entry a golden points at would always look like a
 * retrieval regression and the exam gate would auto-revert every legitimate correction,
 * which would leave supersede-with-quote unusable for exactly the entries that matter
 * most. The human still owns the golden: `--check` deliberately does NOT follow the
 * chain, so a supersede that drops the `must` marker still surfaces as staleness for a
 * person to resolve.
 */
export function goldenTargets(expect, byId) {
  const out = [];
  const seen = new Set();
  let id = String(expect || "");
  while (id && !seen.has(id)) {
    seen.add(id);
    out.push(id);
    const e = byId.get(id);
    id = e && e.supersededBy ? String(e.supersededBy) : "";
  }
  return out;
}

/**
 * Run the exam.
 * @returns {{metrics: object, perGolden: object[], errors: object[]}}
 */
export function runExam(root, opts) {
  const k = (opts && opts.k) || DEFAULT_K;
  const corpus = corpusRoots(root, opts);
  const { goldens, errors } = loadGoldens(root);

  const byId = new Map();
  for (const r of corpus) for (const e of r.entries) if (e.id) byId.set(e.id, e);

  const perGolden = [];
  let hitAt1 = 0, hitAt3 = 0, hitAtK = 0, rrSum = 0, notFound = 0, wrongPlace = 0;
  for (const g of goldens) {
    const expect = String((g && g.expect) || "");
    if (!expect) continue;
    const ranked = lookup(String(g.q || ""), { roots: corpus }).results;
    const accept = goldenTargets(expect, byId);
    let idx = -1;
    for (const id of accept) {
      const at = ranked.findIndex((r) => r.id === id);
      if (at >= 0 && (idx === -1 || at < idx)) idx = at;
    }
    const rank = idx >= 0 ? idx + 1 : null;
    const matchedId = idx >= 0 ? ranked[idx].id : null;
    if (rank === null) notFound++;
    else {
      rrSum += 1 / rank;
      if (rank === 1) hitAt1++; else wrongPlace++;
      if (rank <= 3) hitAt3++;
      if (rank <= k) hitAtK++;
    }
    perGolden.push({
      id: String(g.id || ""),
      q: String(g.q || ""),
      expect,
      matchedId,
      rank,
      got: ranked.slice(0, k).map((r) => r.id),
      outcome: rank === null ? "notFound" : rank === 1 ? "hit" : "wrongPlace",
    });
  }

  const total = perGolden.length;
  const metrics = {
    k,
    total,
    hitAt1,
    hitAt3,
    ["hitAt" + k]: hitAtK,
    hitRate: total ? round(hitAtK / total) : 0,
    mrr: total ? round(rrSum / total) : 0,
    notFound,
    wrongPlace,
  };
  return { metrics, perGolden, errors };
}

/**
 * Compare two metric snapshots. The consolidation gate calls this: ANY drop in a hit
 * count or in MRR is a regression, because a batch is only allowed to leave retrieval
 * at least as good as it found it.
 * @returns {{regressed: boolean, reasons: string[]}}
 */
export function compareMetrics(before, after) {
  const reasons = [];
  if (!before || !after) return { regressed: false, reasons: ["no baseline to compare against"] };
  const k = after.k || before.k || DEFAULT_K;
  const keys = ["hitAt1", "hitAt3", "hitAt" + k];
  for (const key of keys) {
    const b = Number(before[key] || 0);
    const a = Number(after[key] || 0);
    if (a < b) reasons.push(key + " fell " + b + " -> " + a);
  }
  if (Number(after.mrr || 0) < Number(before.mrr || 0) - 1e-9) {
    reasons.push("MRR fell " + before.mrr + " -> " + after.mrr);
  }
  if (Number(after.notFound || 0) > Number(before.notFound || 0)) {
    reasons.push("notFound rose " + before.notFound + " -> " + after.notFound);
  }
  return { regressed: reasons.length > 0, reasons };
}

/** Append one run to `exam/history.jsonl`. History is a log, not a gate — it may carry a clock. */
export function appendHistory(root, record) {
  const file = p(root, "history");
  try {
    mkdirSync(dirname(file), { recursive: true });
    appendFileSync(file, JSON.stringify(record) + "\n", "utf8");
    return true;
  } catch {
    return false;
  }
}

export function readHistory(root) {
  const file = p(root, "history");
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);
}

/* ----------------------------------------------------------------------- CLI */

export function parseArgs(argv) {
  const args = { root: "", platform: "", client: "", check: false, json: false, k: DEFAULT_K, runId: "", history: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--check") args.check = true;
    else if (a === "--json") args.json = true;
    else if (a === "--no-history") args.history = false;
    else if (a === "--root") args.root = argv[++i] || "";
    else if (a.startsWith("--root=")) args.root = a.slice(7);
    else if (a === "--platform-root") args.platform = argv[++i] || "";
    else if (a.startsWith("--platform-root=")) args.platform = a.slice(16);
    else if (a === "--client-root") args.client = argv[++i] || "";
    else if (a.startsWith("--client-root=")) args.client = a.slice(14);
    else if (a === "--k") args.k = Number(argv[++i]) || DEFAULT_K;
    else if (a.startsWith("--k=")) args.k = Number(a.slice(4)) || DEFAULT_K;
    else if (a === "--run-id") args.runId = argv[++i] || "";
    else if (a.startsWith("--run-id=")) args.runId = a.slice(9);
    else if (!a.startsWith("-") && !args.root) args.root = a;
  }
  return args;
}

function main(argv) {
  const args = parseArgs(argv);
  if (!args.root) {
    process.stderr.write("kb:exam — usage: exam.mjs --root <dir> [--check] [--json] [--k 5] [--run-id <id>]\n");
    return 2;
  }
  if (!readBrain(args.root)) {
    process.stderr.write("kb:exam — " + args.root + " is not a knowledge root (no " + LAYOUT.brain + ")\n");
    return 2;
  }
  const opts = { platform: args.platform, client: args.client, k: args.k };

  if (args.check) {
    const res = checkGoldens(args.root, opts);
    if (args.json) process.stdout.write(JSON.stringify(res, null, 2) + "\n");
    else {
      process.stdout.write("kb exam --check — " + args.root + " (" + res.checked + " goldens)\n");
      for (const e of res.errors) process.stdout.write("  " + e.code + " [" + (e.golden || "-") + "] " + e.message + "\n");
      process.stdout.write(res.ok ? "  OK — every golden points at an entry that still carries its marker\n" : "  STALE — the golden set no longer matches the corpus\n");
    }
    return res.ok ? 0 : 1;
  }

  const res = runExam(args.root, opts);
  const m = res.metrics;
  const record = { runId: args.runId || "adhoc", at: new Date().toISOString(), root: args.root, metrics: m };
  if (args.history) appendHistory(args.root, record);

  if (args.json) process.stdout.write(JSON.stringify({ metrics: m, perGolden: res.perGolden, errors: res.errors }, null, 2) + "\n");
  else {
    process.stdout.write("kb exam — " + args.root + "\n");
    process.stdout.write("  goldens: " + m.total + "   hit@1 " + m.hitAt1 + "   hit@3 " + m.hitAt3 + "   hit@" + m.k + " " + m["hitAt" + m.k] + "   MRR " + m.mrr + "\n");
    process.stdout.write("  wrong place: " + m.wrongPlace + "   not found at all: " + m.notFound + "   (different diseases — ranking vs coverage)\n");
    for (const g of res.perGolden.filter((x) => x.outcome !== "hit")) {
      process.stdout.write("  " + g.outcome + ": " + g.id + " expected " + g.expect + (g.rank ? " at rank " + g.rank : "") + " — got " + (g.got.join(", ") || "nothing") + "\n");
    }
    for (const e of res.errors) process.stdout.write("  " + e.code + " " + e.message + "\n");
  }
  return res.errors.length ? 1 : 0;
}

const invokedDirectly = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (invokedDirectly) process.exit(main(process.argv.slice(2)));

export { main };
