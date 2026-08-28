#!/usr/bin/env node
/**
 * skills/kb/resolve.mjs — the one door (D4).
 *
 * Two entry points into the corpus, both of which ALWAYS answer with a typed object:
 *
 *   resolveId(id, {roots})   `@kb(<id>)` — the precedence chain below.
 *   lookup(query, {roots})   topical retrieval, deterministic and model-free.
 *
 * Precedence, exactly as decided in VCST-5776 §D4:
 *
 *   client suppress → client override → client extend → client new → platform → MISS
 *
 * A MISS is an OBJECT, never an empty string or a null. That is the whole point: an
 * agent that greps and finds nothing concludes "no rule exists" and invents one, while
 * an agent handed `{outcome: "MISS", searched: [...]}` knows the corpus was asked and
 * had no answer. Silence and absence are different facts and must look different.
 *
 * Containment (§2a) is enforced BY TYPE, not by care: `assertPlatformSafe()` throws a
 * `KbContainmentError` on any result whose winning entry is `scope: client`, and every
 * platform-bound emit path calls it. `resolveForPlatform()` is that call already wired
 * in — a caller cannot forget it and still be on the platform path.
 *
 * Retrieval is deliberately deterministic first (id index → lexical scoring), with no
 * embeddings. Cortex measured its own largest retrieval win coming from model-free
 * selection rules (hits 53.3%→60%, MRR 0.308→0.403) while a weight reranker gave
 * +0.007 MRR and was switched off as overfitting; embeddings arrive here only against
 * a measured need, and `exam.mjs` is what would measure it.
 *
 * Usage:
 *   node resolve.mjs "@kb(BL-CART-010)" --platform-root <dir> [--client-root <dir>] [--json]
 *   node resolve.mjs --topic "cart tax before address" --platform-root <dir> [--k 5] [--json]
 *
 * Exit code: 0 when the query resolved; 1 on a MISS; 2 on bad arguments; 3 on a
 * containment refusal.
 */
import { pathToFileURL } from "node:url";
import { loadRoot } from "./gen-index.mjs";
import { claimTokens } from "./fingerprint.mjs";
import { KbContainmentError, platformRoot, clientRoot } from "./kb-paths.mjs";

/** Only an ACTIVE client entry participates in the overlay; a superseded override is history. */
const isActive = (e) => String(e.status || "") === "active";

/**
 * Load the roots the resolver reads, client first (the overlay), platform last (the base).
 * @param {{platform?: string, client?: string, roots?: object[]}} opts
 * @returns {object[]} loaded roots in precedence order
 */
export function loadRoots(opts) {
  if (opts && Array.isArray(opts.roots) && opts.roots.length) {
    // Already-loaded roots (tests and consolidation pass these) — respect the given order.
    return opts.roots.map((r) => (r.entries ? r : loadRoot(r.root || r)));
  }
  const out = [];
  const client = opts && opts.client;
  const platform = opts && opts.platform;
  if (client) out.push(loadRoot(client));
  if (platform) out.push(loadRoot(platform));
  return out;
}

const summarize = (e) => e && {
  id: e.id,
  title: String(e.title || ""),
  scope: String(e.scope || ""),
  kind: String(e.kind || ""),
  status: String(e.status || ""),
  file: e.file,
  startLine: e.startLine,
  endLine: e.endLine,
  body: String(e.body || ""),
};

/**
 * Resolve one id through the precedence chain.
 * @param {string} id
 * @param {{platform?: string, client?: string, roots?: object[]}} opts
 * @returns {object} always a typed result; `outcome` is one of
 *   suppressed | override | extend | client-new | platform | superseded | retired | MISS
 */
export function resolveId(id, opts) {
  const roots = loadRoots(opts);
  const searched = roots.map((r) => ({ root: r.root, scope: r.scope }));
  const wanted = String(id || "").trim();

  const clientRoots = roots.filter((r) => r.scope === "client");
  const platformRoots = roots.filter((r) => r.scope !== "client");

  const base = platformRoots
    .flatMap((r) => r.entries)
    .find((e) => e.id === wanted) || null;

  const related = clientRoots
    .flatMap((r) => r.entries)
    .filter((e) => isActive(e) && e.relationParsed && e.relationParsed.target === wanted);

  const pick = (verb) => related.find((e) => e.relationParsed.verb === verb) || null;

  const suppress = pick("suppress");
  if (suppress) {
    return {
      query: wanted, outcome: "suppressed", found: true, searched,
      entry: summarize(suppress), base: summarize(base),
      reason: String(suppress.reason || ""),
      body: String(suppress.body || ""),
      note: "This deployment SUPPRESSES the platform rule. Do not test it here; the reason field says why.",
    };
  }

  const override = pick("override");
  if (override) {
    return {
      query: wanted, outcome: "override", found: true, searched,
      entry: summarize(override), base: summarize(base),
      quotes: String(override.quotes || ""),
      body: String(override.body || ""),
      note: "The client entry REPLACES the platform rule. `quotes` holds the platform wording it was written against — drift-check.mjs compares it against the live platform entry.",
    };
  }

  const extend = pick("extend");
  if (extend) {
    const merged = base
      ? String(base.body || "") + "\n\n<!-- client extension: " + extend.id + " -->\n\n" + String(extend.body || "")
      : String(extend.body || "");
    return {
      query: wanted, outcome: "extend", found: true, searched,
      entry: summarize(extend), base: summarize(base),
      body: merged,
      note: base
        ? "Platform base plus this deployment's addition; both apply."
        : "The client extension has no platform base to extend — the platform entry is missing or retired.",
    };
  }

  const clientOwn = clientRoots.flatMap((r) => r.entries).find((e) => e.id === wanted);
  if (clientOwn) {
    return {
      query: wanted, outcome: "client-new", found: true, searched,
      entry: summarize(clientOwn), base: null,
      body: String(clientOwn.body || ""),
      note: "Client-only knowledge — true on this deployment, not on a clean platform.",
    };
  }

  if (base) {
    const status = String(base.status || "active");
    const outcome = status === "active" ? "platform" : status; // superseded | retired
    return {
      query: wanted, outcome, found: true, searched,
      entry: summarize(base), base: null,
      body: String(base.body || ""),
      supersededBy: base.supersededBy || null,
      note: status === "active"
        ? "Platform base, no client delta."
        : "This entry is " + status + " and is retained, not deleted — it still resolves so existing citations keep working. " + (base.supersededBy ? "See " + base.supersededBy + "." : ""),
    };
  }

  return {
    query: wanted,
    outcome: "MISS",
    found: false,
    searched,
    entry: null,
    base: null,
    body: "",
    reason: searched.length
      ? "no entry with this id in any searched root"
      : "no knowledge root was searched — the resolver was called without roots",
    note: "An explicit MISS, not an empty answer. The corpus was asked and had nothing; do not infer that no rule exists, and do not invent one.",
  };
}

/* ------------------------------------------------------------- containment (§2a) */

/**
 * Refuse a client-scope result on a platform-bound path. Throws rather than returning
 * a flag, so an emit path physically cannot carry client knowledge upstream by
 * forgetting to check a boolean.
 */
export function assertPlatformSafe(result) {
  const scope = result && (result.scope || (result.entry && result.entry.scope));
  if (scope === "client") {
    throw new KbContainmentError(
      "refusing to emit " + ((result.entry && result.entry.id) || result.query || "an entry") +
      " on a platform-bound path: it is scope:client. Client knowledge crosses the boundary only through the closed-schema promotion contract, never through a resolver read.",
    );
  }
  return result;
}

/** `resolveId` with the containment assertion already wired in. */
export function resolveForPlatform(id, opts) {
  return assertPlatformSafe(resolveId(id, opts));
}

/* ------------------------------------------------------------------- topical */

const FIELD_WEIGHTS = Object.freeze({ title: 6, tags: 4, kind: 2, body: 1 });
/** A superseded entry is readable but must not out-rank the entry that replaced it. */
const STATUS_WEIGHTS = Object.freeze({ active: 1, superseded: 0.5, retired: 0.25, draft: 0.4 });
/** Long bodies win by accident otherwise — the file-specificity damping Cortex measured. */
const BODY_DAMP_TOKENS = 40;

const overlap = (queryTokens, tokens) => {
  const set = new Set(tokens);
  let n = 0;
  for (const t of queryTokens) if (set.has(t)) n++;
  return n;
};

/**
 * Score every entry in the effective corpus against a natural-language query.
 * Deterministic: same corpus + same query -> same ranking, ties broken by id.
 * @returns {{query: string, results: object[]}} results are ALL entries scoring > 0,
 *          ranked. Callers slice for hit@k; `exam.mjs` needs the untruncated list to
 *          tell "found in the wrong place" from "not found at all".
 */
export function lookup(query, opts) {
  const roots = loadRoots(opts);
  const qTokens = claimTokens(query);
  const qRaw = String(query || "").toLowerCase();

  // Effective corpus: platform entries with the client overlay applied, plus client-only entries.
  const seen = new Set();
  const candidates = [];
  for (const r of roots) {
    for (const e of r.entries) {
      if (!e.id || seen.has(e.id)) continue;
      seen.add(e.id);
      candidates.push(e);
    }
  }
  // A platform id the client suppresses or overrides is answered by the client entry;
  // drop the shadowed base so one question does not return two rival answers.
  const shadowed = new Set();
  for (const r of roots.filter((x) => x.scope === "client")) {
    for (const e of r.entries) {
      if (isActive(e) && e.relationParsed && e.relationParsed.target &&
          (e.relationParsed.verb === "override" || e.relationParsed.verb === "suppress")) {
        shadowed.add(e.relationParsed.target);
      }
    }
  }

  const results = [];
  for (const e of candidates) {
    if (shadowed.has(e.id)) continue;
    const titleTokens = claimTokens(e.title);
    const bodyTokens = claimTokens(e.body);
    const tagTokens = claimTokens((Array.isArray(e.tags) ? e.tags : []).join(" "));
    let score =
      FIELD_WEIGHTS.title * overlap(qTokens, titleTokens) +
      FIELD_WEIGHTS.tags * overlap(qTokens, tagTokens) +
      FIELD_WEIGHTS.kind * overlap(qTokens, claimTokens(e.kind)) +
      (FIELD_WEIGHTS.body * overlap(qTokens, bodyTokens)) /
        Math.sqrt(Math.max(1, bodyTokens.length / BODY_DAMP_TOKENS));
    // An id typed straight into the query is an exact intent, not a keyword.
    if (e.id && qRaw.includes(String(e.id).toLowerCase())) score += 100;
    score *= STATUS_WEIGHTS[String(e.status || "active")] ?? 1;
    if (score > 0) {
      results.push({ id: e.id, title: String(e.title || ""), scope: String(e.scope || ""), kind: String(e.kind || ""), status: String(e.status || ""), file: e.file, score: Math.round(score * 1000) / 1000 });
    }
  }
  results.sort((a, b) => (b.score - a.score) || (a.id < b.id ? -1 : 1));
  return { query: String(query || ""), results };
}

/* ----------------------------------------------------------------------- CLI */

const ID_QUERY_RE = /^@kb\(([^)]+)\)$/;

export function parseArgs(argv) {
  const args = { id: "", topic: "", platform: "", client: "", k: 5, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") args.json = true;
    else if (a === "--topic") args.topic = argv[++i] || "";
    else if (a.startsWith("--topic=")) args.topic = a.slice(8);
    else if (a === "--platform-root") args.platform = argv[++i] || "";
    else if (a.startsWith("--platform-root=")) args.platform = a.slice(16);
    else if (a === "--client-root") args.client = argv[++i] || "";
    else if (a.startsWith("--client-root=")) args.client = a.slice(14);
    else if (a === "--k") args.k = Number(argv[++i]) || 5;
    else if (a.startsWith("--k=")) args.k = Number(a.slice(4)) || 5;
    else if (!a.startsWith("-")) {
      const m = a.match(ID_QUERY_RE);
      if (m) args.id = m[1].trim();
      else if (!args.id && !args.topic) args.id = a;
    }
  }
  return args;
}

function main(argv) {
  const args = parseArgs(argv);
  const opts = {
    platform: args.platform || platformRoot(),
    client: args.client || clientRoot(),
  };
  // A root that does not exist is simply not searched; `searched` reports what was.
  if (!args.id && !args.topic) {
    process.stderr.write('kb:resolve — usage: resolve.mjs "@kb(<id>)" | --topic "<question>" [--platform-root <dir>] [--client-root <dir>] [--json]\n');
    return 2;
  }

  if (args.topic) {
    const found = lookup(args.topic, opts);
    const top = found.results.slice(0, args.k);
    if (args.json) process.stdout.write(JSON.stringify({ query: found.query, k: args.k, results: top }, null, 2) + "\n");
    else {
      process.stdout.write("kb:resolve --topic " + JSON.stringify(found.query) + "\n");
      if (!top.length) process.stdout.write("  MISS — nothing in the corpus scored against this question.\n");
      for (const r of top) process.stdout.write("  " + r.score.toFixed(2) + "  " + r.id + " [" + r.scope + "/" + r.kind + "] " + r.title + "\n");
    }
    return top.length ? 0 : 1;
  }

  let result;
  try {
    result = resolveId(args.id, opts);
  } catch (e) {
    process.stderr.write("kb:resolve — " + e.message + "\n");
    return 3;
  }
  if (args.json) process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  else {
    process.stdout.write("@kb(" + result.query + ") -> " + result.outcome + "\n");
    if (result.entry) process.stdout.write("  " + result.entry.id + " [" + result.entry.scope + "/" + result.entry.kind + "/" + result.entry.status + "] " + result.entry.title + "\n  " + result.entry.file + ":" + result.entry.startLine + "\n");
    if (result.reason) process.stdout.write("  reason: " + result.reason + "\n");
    if (result.note) process.stdout.write("  note: " + result.note + "\n");
  }
  return result.found ? 0 : 1;
}

const invokedDirectly = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (invokedDirectly) process.exit(main(process.argv.slice(2)));

export { main };
