// plugins/vc-test/skills/ticket-context/lib/replay.mjs — the host-governed route's transport (spec U23, B9). The
// connectors call run(tool, args) exactly as on the bridge route; here each call is answered from a raw folder, one
// file per request, holding what the bridge command would have printed. A call with no answer is recorded, so the
// orchestrator's fetch agent can answer it through the host's MCP servers and prepare can run its next pass.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { GapError } from "./gap.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
let CATALOG = null;
const loadCatalog = () => (CATALOG ??= JSON.parse(readFileSync(join(HERE, "fetch-catalog.json"), "utf8")));

/** The argv a request is known by: a --body-file stands for its JSON content, an --out for "<out>" (both carry a
 *  fresh temp path each run, and the same call in the next pass must find this pass's answer). */
function normalised(args) {
  const out = [];
  for (let i = 0; i < args.length; i++) {
    const a = String(args[i]);
    if ((a === "--body-file" || a === "--out") && i + 1 < args.length) {
      out.push(a);
      const v = String(args[++i]);
      if (a === "--out") out.push("<out>");
      else { try { out.push(JSON.parse(readFileSync(v, "utf8"))); } catch { out.push(`<unreadable body ${v}>`); } }
    } else out.push(a);
  }
  return out;
}

/** A missing answer's closed reason → the gap reason the bridge route would have given (bridge.mjs bridgeGap): the
 *  floors read `deleted` and `access-denied` differently from a plain unreadable read. The agent picks the reason;
 *  its words are only a capped detail, never parsed. */
const MISSING_REASONS = { "no-tool": "connector-unavailable", binary: "connector-unavailable", "not-found": "deleted", denied: "access-denied", error: "unreadable" };
const DETAIL_MAX = 120;

export function requestId(tool, args) {
  return createHash("sha256").update(JSON.stringify([tool, ...normalised(args)])).digest("hex").slice(0, 16);
}

/** The catalog entry for a call: { key, role, expect, binary }, or null for a command the catalog does not know. */
export function catalogEntry(tool, args, catalog = loadCatalog()) {
  if (tool === "gh") {
    const list = catalog.gh;
    const find = (kind) => list.find((e) => e.kind === kind);
    let hit = null;
    if (args.includes("graphql")) hit = find("graphql");
    else if (args.some((a) => /application\/vnd\.github\.diff/.test(a))) hit = find("diff");
    else {
      const path = args.filter((a, i) => a !== "api" && !String(a).startsWith("-") && args[i - 1] !== "-H")[0] ?? "";
      hit = list.find((e) => e.match && new RegExp(e.match).test(path));
    }
    return hit ? { key: `gh ${hit.kind}`, role: "github", expect: hit.expect, binary: false } : null;
  }
  const key = `${tool} ${args[0]}`;
  const e = catalog.commands[key];
  return e ? { key, role: e.role, expect: e.expect, binary: !!e.binary } : null;
}

/**
 * run(tool, args, { as }) answered from `dir`. `run.pending` lists the calls with no usable answer, in call order,
 * once each. A file with `missing` is a gap with its reason; a file that is not JSON, names another request, or has
 * both `stdout` and `missing` is asked again once with the reason, then it is missing.
 */
export function replayRun({ dir, catalog = loadCatalog() }) {
  const pending = [];
  const ids = new Set();
  const ask = (tool, args, id, note) => {
    if (!ids.has(id)) {
      ids.add(id);
      const entry = catalogEntry(tool, args, catalog);
      if (!entry) throw new Error(`replay: no catalog entry for ${tool} ${args[0]} — add it to fetch-catalog.json`);
      pending.push({ id, tool, command: entry.key.split(" ").slice(1).join(" "), args: normalised(args), role: entry.role,
        expect: note ? `${entry.expect} (the previous answer was unreadable: ${note})` : entry.expect, binary: entry.binary });
    }
    throw new GapError("unreadable", `pending host fetch: ${tool} ${args[0]}`);
  };
  const run = async (tool, args, { as = "json" } = {}) => {
    const id = requestId(tool, args);
    const file = join(dir, `${id}.json`);
    if (!existsSync(file)) return ask(tool, args, id);
    let a = null;
    let why = null;
    try { a = JSON.parse(readFileSync(file, "utf8")); } catch { why = "not JSON"; }
    if (!why && a?.request?.id !== id) why = `it answers request ${a?.request?.id ?? "?"}, not ${id}`;
    if (!why && ("stdout" in a) === ("missing" in a)) why = "it must hold exactly one of stdout and missing";
    if (!why && "missing" in a && !Object.hasOwn(MISSING_REASONS, a.missing?.reason)) why = `missing must be { reason: ${Object.keys(MISSING_REASONS).join(" | ")}, detail }`;
    if (why) {
      const marker = join(dir, `${id}.rejected.json`);
      if (existsSync(marker)) throw new GapError("unreadable", `the host's answer stayed unreadable: ${why}`);
      writeFileSync(marker, JSON.stringify({ id, why }));
      renameSync(file, join(dir, `${id}.bad.json`));
      return ask(tool, args, id, why);
    }
    if ("missing" in a) throw new GapError(MISSING_REASONS[a.missing.reason], `the host's servers could not give it (${a.missing.reason}): ${String(a.missing.detail ?? "").replace(/\s+/g, " ").slice(0, DETAIL_MAX)}`);
    const v = a.stdout;
    if (as === "none") return null;
    if (as === "text") return typeof v === "string" ? v : JSON.stringify(v);
    if (typeof v !== "string") return v;
    try { return JSON.parse(v); } catch { throw new GapError("unreadable", `the host's answer to ${tool} ${args[0]} is not the JSON it must be`); }
  };
  run.pending = pending;
  return run;
}
