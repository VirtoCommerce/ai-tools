// plugins/vc-test/lib/run-cost.mjs — tokens and minutes per step of a run, read from the Claude Code session logs
// (spec U30, U42). inputTotal = input + cache creation + cache read, the input-equivalent measure of §2b; output is
// reported beside it. A subagent's step is its dispatch description's `[vc-test:<id>]` prefix.
// Any session can be read (`--session-file`, any project folder), and its subagents in the layout it actually has:
// `<session>/subagents/*.jsonl` (today), else `agent-*.jsonl` tied to it (in `<session>/`, or beside the session file
// with its sessionId), else the `isSidechain` lines inside the session file. `subagentSource` names the one found;
// "none" is said under the table, never silent, as are sidechain lines left uncounted beside subagent files
// (`sidechainNotCounted`). Without `--since` the session's first record is the start.
// CLI: node plugins/vc-test/lib/run-cost.mjs [--since <iso>] [--session-file <path>|--session <id>|latest (default: this session)] [--key <KEY>] [--out <file>]
// Exit 0 table printed (JSON written with --out/--key); 1 usage error or no such session log.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { argOf, workDir } from "./paths.mjs";

const ACTIVE_GAP_S = 120;
const FIELDS = ["input", "cacheCreation", "cacheRead", "output", "inputTotal"];
const USAGE = "usage: run-cost.mjs [--since <iso>] [--session-file <path>|--session <id>|latest (default: this session)] [--key <KEY>] [--out <file>]";

export const projectDirName = (cwd) => String(cwd).replace(/[^A-Za-z0-9]/g, "-");
const stepOf = (description) => /^\[vc-test:([A-Za-z0-9:._-]+)\]/.exec(description ?? "")?.[1] ?? "other";
const min = (s) => Math.round((s / 60) * 10) / 10;
const readLines = (file) => readFileSync(file, "utf8").split("\n").filter(Boolean);
const tryParse = (l) => { try { return JSON.parse(l); } catch { return null; } };

export function cost({ mainLines, subagents, since, subagentSource }) {
  const t0 = since == null ? -Infinity : Date.parse(since);
  let skipped = 0;
  const parse = (lines) => lines.flatMap((l) => {
    try { const r = JSON.parse(l); const t = Date.parse(r.timestamp); return Number.isFinite(t) && t >= t0 ? [{ ...r, t }] : []; }
    catch { skipped++; return []; }
  });
  // A sidechain line in the session file is a subagent's, never the orchestrator's. readSession hands those lines
  // over only when no subagent files exist; otherwise they are not counted, and how many is said, never merged.
  const mainRecords = parse(mainLines);
  const source = subagents.length ? (subagentSource ?? "subagents") : "none";
  const sidechainNotCounted = source === "sidechain" ? 0 : mainRecords.filter((r) => r.isSidechain).length;
  const groups = [{ step: "orchestrator", records: mainRecords.filter((r) => !r.isSidechain) },
    ...subagents.map((s) => ({ step: stepOf(s.description), records: parse(s.lines) }))];

  // One API message is written as several records (one per content block). Each is counted once, under the step
  // that wrote it first, with the largest value of each field: an early record's output_tokens is a streaming
  // partial (a subagent's first record says 9 where its last says 538), its input fields are already final.
  const messages = new Map();
  const steps = new Map();
  let first = Infinity, last = -Infinity, anonymous = 0;
  for (const { step, records } of groups) {
    const acc = steps.get(step) ?? { step, ...Object.fromEntries(FIELDS.map((f) => [f, 0])), activeS: 0 };
    records.sort((a, b) => a.t - b.t);
    records.forEach((r, i) => {
      first = Math.min(first, r.t); last = Math.max(last, r.t);
      if (i > 0 && r.t - records[i - 1].t <= ACTIVE_GAP_S * 1000) acc.activeS += (r.t - records[i - 1].t) / 1000;
      const u = r.type === "assistant" ? r.message?.usage : null;
      if (!u) return;
      const key = r.requestId ?? r.message?.id ?? `#${anonymous++}`;
      const m = messages.get(key) ?? messages.set(key, { acc, input: 0, cacheCreation: 0, cacheRead: 0, output: 0 }).get(key);
      m.input = Math.max(m.input, u.input_tokens ?? 0);
      m.cacheCreation = Math.max(m.cacheCreation, u.cache_creation_input_tokens ?? 0);
      m.cacheRead = Math.max(m.cacheRead, u.cache_read_input_tokens ?? 0);
      m.output = Math.max(m.output, u.output_tokens ?? 0);
    });
    steps.set(step, acc);
  }
  for (const { acc, ...m } of messages.values()) {
    for (const f of ["input", "cacheCreation", "cacheRead", "output"]) acc[f] += m[f];
    acc.inputTotal = acc.input + acc.cacheCreation + acc.cacheRead;
  }
  const list = [...steps.values()].map(({ activeS, ...s }) => ({ ...s, activeMin: min(activeS) }));
  const total = Object.fromEntries(FIELDS.map((f) => [f, list.reduce((n, s) => n + s[f], 0)]));
  total.activeMin = min(list.reduce((n, s) => n + s.activeMin * 60, 0));
  total.wallMin = Number.isFinite(first) ? min((last - first) / 1000) : 0;
  return {
    start: Number.isFinite(first) ? new Date(first).toISOString() : null,
    subagentSource: source, sidechainNotCounted,
    steps: list.sort((a, b) => b.inputTotal - a.inputTotal), total, skipped,
  };
}

export function toMarkdown({ steps, total, subagentSource, sidechainNotCounted = 0 }) {
  const pct = (n) => (total.inputTotal ? `${((n / total.inputTotal) * 100).toFixed(1)}%` : "—");
  const m = (n) => `${(n / 1e6).toFixed(2)}M`;
  const rows = steps.map((s) => `| ${s.step} | ${m(s.inputTotal)} | ${pct(s.inputTotal)} | ${m(s.output)} | ${s.activeMin} |`);
  const source = subagentSource === "none"
    ? "Subagents: none found — the total is the main session only."
    : `Subagents: read from \`${subagentSource}\`.`;
  return ["| Step | Input-equivalent | Share | Output | Active min |", "|---|---|---|---|---|", ...rows,
    `| **total** | ${m(total.inputTotal)} | 100% | ${m(total.output)} | ${total.activeMin} (wall ${total.wallMin}) |`, "", source,
    ...(sidechainNotCounted > 0 ? [`${sidechainNotCounted} sidechain lines not counted (subagents read from \`${subagentSource}\`).`] : [])].join("\n");
}

// An older layout has no .meta.json: a subagent is matched to its Task/Agent dispatch by its first prompt.
const firstPrompt = (records) => {
  const c = records.find((r) => r?.type === "user")?.message?.content;
  return (typeof c === "string" ? c : Array.isArray(c) ? c.map((x) => x?.text ?? "").join("") : "").trim();
};
function dispatches(mainRecords) {
  const byPrompt = new Map();
  for (const r of mainRecords) {
    if (r?.type !== "assistant" || !Array.isArray(r.message?.content)) continue;
    for (const b of r.message.content) {
      if (b?.type === "tool_use" && (b.name === "Task" || b.name === "Agent") && b.input?.prompt) byPrompt.set(String(b.input.prompt).trim(), b.input.description ?? "");
    }
  }
  return byPrompt;
}

// One session .jsonl → { id, mainLines, subagents: [{ description, lines }], subagentSource }.
export function readSession(file) {
  if (!existsSync(file)) throw new Error(`no session log ${file}`);
  const dir = dirname(file);
  const id = basename(file).replace(/\.jsonl$/, "");
  const ownDir = join(dir, id);
  const mainLines = readLines(file);
  const mainRecords = mainLines.map(tryParse);
  let byPrompt;
  const describe = (records) => (byPrompt ??= dispatches(mainRecords)).get(firstPrompt(records)) ?? "";

  const subDir = join(ownDir, "subagents");
  const today = existsSync(subDir) ? readdirSync(subDir).filter((f) => f.endsWith(".jsonl")) : [];
  if (today.length) {
    return { id, mainLines, subagentSource: "subagents", subagents: today.map((f) => {
      const meta = join(subDir, f.replace(/\.jsonl$/, ".meta.json"));
      const lines = readLines(join(subDir, f));
      return { description: existsSync(meta) ? JSON.parse(readFileSync(meta, "utf8")).description : describe(lines.map(tryParse)), lines };
    }) };
  }

  // agent-*.jsonl in the session's own folder belong to it; beside the session file, only those carrying its sessionId.
  const agentFiles = [ownDir, dir].filter((d) => existsSync(d) && statSync(d).isDirectory())
    .flatMap((d) => readdirSync(d).filter((f) => /^agent-.*\.jsonl$/.test(f)).map((f) => ({ d, lines: readLines(join(d, f)) })))
    .filter(({ d, lines }) => d === ownDir || lines.some((l) => tryParse(l)?.sessionId === id));
  if (agentFiles.length) {
    return { id, mainLines, subagentSource: "agent-files",
      subagents: agentFiles.map(({ lines }) => ({ description: describe(lines.map(tryParse)), lines })) };
  }

  // Sidechain lines inside the session file: one subagent per chain, its root found by walking parentUuid.
  const side = mainRecords.map((r, i) => ({ r, l: mainLines[i] })).filter(({ r }) => r?.isSidechain);
  if (side.length) {
    const parent = new Map(side.map(({ r }) => [r.uuid, r.parentUuid]));
    const rootOf = (u) => { const hops = new Set(); while (parent.has(parent.get(u)) && !hops.has(u)) { hops.add(u); u = parent.get(u); } return u; };
    const chains = new Map();
    for (const x of side) { const k = rootOf(x.r.uuid); chains.set(k, [...(chains.get(k) ?? []), x]); }
    return { id, mainLines, subagentSource: "sidechain",
      subagents: [...chains.values()].map((xs) => ({ description: describe(xs.map((x) => x.r)), lines: xs.map((x) => x.l) })) };
  }
  return { id, mainLines, subagentSource: "none", subagents: [] };
}

function sessionFile(sessionArg) {
  const dir = join(homedir(), ".claude", "projects", projectDirName(process.cwd()));
  // This session by default: with two sessions open in one repo, the newest log may be the other one.
  const wanted = sessionArg ?? process.env.CLAUDE_CODE_SESSION_ID;
  const id = !wanted || wanted === "latest"
    ? (existsSync(dir) ? readdirSync(dir) : []).filter((f) => f.endsWith(".jsonl")).sort((a, b) => statSync(join(dir, b)).mtimeMs - statSync(join(dir, a)).mtimeMs)[0]?.replace(/\.jsonl$/, "")
    : wanted;
  if (!id || !existsSync(join(dir, `${id}.jsonl`))) throw new Error(`no session log ${id ?? "(none)"} in ${dir}`);
  return join(dir, `${id}.jsonl`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const since = argOf(process.argv, "since");
  if (since != null && !Number.isFinite(Date.parse(since))) { console.error(USAGE); process.exit(1); }
  let session;
  try { session = readSession(argOf(process.argv, "session-file") ?? sessionFile(argOf(process.argv, "session"))); }
  catch (e) { console.error(e.message); process.exit(1); }
  const measured = cost({ ...session, since });
  const result = { session: session.id, since: since ?? measured.start, ...measured };
  const key = argOf(process.argv, "key");
  const out = argOf(process.argv, "out") ?? (key ? join(workDir(key), "run-cost.json") : null);
  if (out) writeFileSync(out, JSON.stringify(result, null, 2) + "\n");
  console.log(toMarkdown(result));
}
