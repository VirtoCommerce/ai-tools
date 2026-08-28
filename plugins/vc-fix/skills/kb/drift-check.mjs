#!/usr/bin/env node
/**
 * skills/kb/drift-check.mjs — the deterministic staleness sensor (D2).
 *
 * A client `override` must quote the verbatim platform wording it replaces. That quote
 * is not documentation, it is an INSTRUMENT: when the platform brain moves, comparing
 * the quote against the current platform entry answers "is this override still written
 * against the rule it thinks it is?" without judgment, without an LLM and without a
 * network call.
 *
 *   ok       the quoted wording is still present upstream — the override stands.
 *   changed  the platform entry still exists but no longer contains that wording — the
 *            override was written against a rule that has since moved, so it may now be
 *            overriding something it was never meant to. Held for a human.
 *   retired  the platform id is gone (or itself retired) — the override has nothing
 *            left to override.
 *
 * "Not ok" is deliberately never auto-resolved. Rewriting a client override to match a
 * changed platform rule is a knowledge decision about THIS deployment, and the client
 * brain is the one place this toolchain has no authority to guess. `kb-sync.mjs` uses
 * this report to decide what to hold back on a platform-brain fast-forward: the clean
 * overrides update silently, the conflicting ones wait with a short review list.
 *
 * Usage:
 *   node drift-check.mjs --platform-root <dir> --client-root <dir> [--json] [--fail-on-drift]
 *   npm run kb:drift -- --platform-root .knowledge/platform --client-root .knowledge/client
 *
 * Exit code: 0 always, unless `--fail-on-drift` and something is not `ok` (then 1);
 * 2 on a bad root.
 */
import { pathToFileURL } from "node:url";
import { loadRoot } from "./gen-index.mjs";
import { readBrain, LAYOUT, platformRoot, clientRoot } from "./kb-paths.mjs";

/** Whitespace-insensitive comparison: a re-wrapped paragraph is not a wording change. */
const normalize = (s) => String(s === undefined || s === null ? "" : s).replace(/\s+/g, " ").trim();

/** Everything of an entry a quote could have been taken from. */
const quotableText = (e) => normalize(String(e.title || "") + " " + String(e.body || ""));

/**
 * Compare every client entry that depends on a platform entry against the current
 * platform corpus.
 * @param {{platform: string, client: string}} opts
 * @returns {{results: object[], counts: {ok: number, changed: number, retired: number}, ok: boolean}}
 */
export function driftCheck(opts) {
  const platform = loadRoot((opts && opts.platform) || "");
  const client = loadRoot((opts && opts.client) || "");
  const byId = new Map(platform.entries.filter((e) => e.id).map((e) => [e.id, e]));

  const results = [];
  for (const entry of client.entries) {
    const rel = entry.relationParsed;
    if (!rel || !rel.target) continue;
    if (String(entry.status || "") !== "active") continue;

    const base = byId.get(rel.target) || null;
    const common = {
      id: entry.id,
      relation: rel.verb,
      target: rel.target,
      file: entry.file,
      title: String(entry.title || ""),
    };

    if (!base) {
      results.push({ ...common, verdict: "retired", detail: "platform entry " + rel.target + " is absent from the platform brain — this " + rel.verb + " has nothing left to act on" });
      continue;
    }
    if (String(base.status || "") === "retired") {
      results.push({ ...common, verdict: "retired", detail: "platform entry " + rel.target + " is marked retired upstream" });
      continue;
    }
    if (rel.verb !== "override") {
      // extend / suppress carry no quote, so the only failure they can have is a
      // missing base — already handled above.
      results.push({ ...common, verdict: "ok", detail: "platform base " + rel.target + " is present" });
      continue;
    }

    const quote = normalize(entry.quotes);
    if (!quote) {
      results.push({ ...common, verdict: "changed", detail: "override carries no quote, so its staleness cannot be measured — the quote is the sensor" });
      continue;
    }
    if (quotableText(base).includes(quote)) {
      results.push({ ...common, verdict: "ok", detail: "quoted wording still present in " + rel.target });
    } else {
      results.push({
        ...common,
        verdict: "changed",
        detail: "the wording this override quotes is no longer in " + rel.target + " — the platform rule moved; review whether this override still expresses the intended delta",
        quote: String(entry.quotes || "").trim(),
        currentBase: base.file + ":" + base.startLine,
      });
    }
  }

  results.sort((a, b) => (String(a.id) < String(b.id) ? -1 : 1));
  const counts = { ok: 0, changed: 0, retired: 0 };
  for (const r of results) counts[r.verdict]++;
  return { results, counts, ok: counts.changed === 0 && counts.retired === 0 };
}

/** The ids a sync must hold back: everything whose verdict is not `ok`. */
export const conflicting = (report) => report.results.filter((r) => r.verdict !== "ok").map((r) => r.id);

/* ----------------------------------------------------------------------- CLI */

export function parseArgs(argv) {
  const args = { platform: "", client: "", json: false, failOnDrift: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") args.json = true;
    else if (a === "--fail-on-drift") args.failOnDrift = true;
    else if (a === "--platform-root") args.platform = argv[++i] || "";
    else if (a.startsWith("--platform-root=")) args.platform = a.slice(16);
    else if (a === "--client-root") args.client = argv[++i] || "";
    else if (a.startsWith("--client-root=")) args.client = a.slice(14);
  }
  return args;
}

function main(argv) {
  const args = parseArgs(argv);
  const platform = args.platform || platformRoot();
  const client = args.client || clientRoot();
  for (const [label, root] of [["platform", platform], ["client", client]]) {
    if (!readBrain(root)) {
      process.stderr.write("kb:drift — " + label + " root " + root + " is not a knowledge root (no " + LAYOUT.brain + ")\n");
      return 2;
    }
  }

  const report = driftCheck({ platform, client });
  if (args.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  } else {
    process.stdout.write("kb drift-check — client " + client + " vs platform " + platform + "\n");
    process.stdout.write("  ok " + report.counts.ok + ", changed " + report.counts.changed + ", retired " + report.counts.retired + "\n");
    for (const r of report.results) {
      if (r.verdict === "ok") continue;
      process.stdout.write("  " + r.verdict.toUpperCase() + " " + r.id + " (" + r.relation + " " + r.target + ") — " + r.detail + "\n");
    }
    if (report.ok) process.stdout.write("  every client override is still written against the wording it quotes\n");
  }
  return args.failOnDrift && !report.ok ? 1 : 0;
}

const invokedDirectly = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (invokedDirectly) process.exit(main(process.argv.slice(2)));

export { main };
