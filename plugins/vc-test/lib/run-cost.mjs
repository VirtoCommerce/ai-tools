// plugins/vc-test/lib/run-cost.mjs — tokens and minutes per step of a run, read from the Claude Code session logs
// (spec U30, U42). inputTotal = input + cache creation + cache read, the input-equivalent measure of §2b; output is
// reported beside it. A subagent's step is its dispatch description's `[vc-test:<id>]` prefix.
// CLI: node plugins/vc-test/lib/run-cost.mjs --since <iso> [--session <id>|latest] [--key <KEY>] [--out <file>]
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { argOf, workDir } from "./paths.mjs";

const ACTIVE_GAP_S = 120;
const FIELDS = ["input", "cacheCreation", "cacheRead", "output", "inputTotal"];

export const projectDirName = (cwd) => String(cwd).replace(/[^A-Za-z0-9]/g, "-");
const stepOf = (description) => /^\[vc-test:([a-z0-9-]+)\]/.exec(description ?? "")?.[1] ?? "other";
const min = (s) => Math.round((s / 60) * 10) / 10;

export function cost({ mainLines, subagents, since }) {
  const t0 = Date.parse(since);
  let skipped = 0;
  const parse = (lines) => lines.flatMap((l) => {
    try { const r = JSON.parse(l); const t = Date.parse(r.timestamp); return Number.isFinite(t) && t >= t0 ? [{ ...r, t }] : []; }
    catch { skipped++; return []; }
  });
  const groups = [{ step: "orchestrator", records: parse(mainLines) },
    ...subagents.map((s) => ({ step: stepOf(s.description), records: parse(s.lines) }))];

  const seen = new Set();
  const steps = new Map();
  let first = Infinity, last = -Infinity;
  for (const { step, records } of groups) {
    const acc = steps.get(step) ?? { step, ...Object.fromEntries(FIELDS.map((f) => [f, 0])), activeS: 0 };
    records.sort((a, b) => a.t - b.t);
    records.forEach((r, i) => {
      first = Math.min(first, r.t); last = Math.max(last, r.t);
      if (i > 0 && r.t - records[i - 1].t <= ACTIVE_GAP_S * 1000) acc.activeS += (r.t - records[i - 1].t) / 1000;
      const u = r.type === "assistant" ? r.message?.usage : null;
      const id = r.requestId ?? r.message?.id;
      if (!u || (id && seen.has(id))) return;
      if (id) seen.add(id);
      acc.input += u.input_tokens ?? 0;
      acc.cacheCreation += u.cache_creation_input_tokens ?? 0;
      acc.cacheRead += u.cache_read_input_tokens ?? 0;
      acc.output += u.output_tokens ?? 0;
      acc.inputTotal = acc.input + acc.cacheCreation + acc.cacheRead;
    });
    steps.set(step, acc);
  }
  const list = [...steps.values()].map(({ activeS, ...s }) => ({ ...s, activeMin: min(activeS) }));
  const total = Object.fromEntries(FIELDS.map((f) => [f, list.reduce((n, s) => n + s[f], 0)]));
  total.activeMin = min(list.reduce((n, s) => n + s.activeMin * 60, 0));
  total.wallMin = Number.isFinite(first) ? min((last - first) / 1000) : 0;
  return { steps: list.sort((a, b) => b.inputTotal - a.inputTotal), total, skipped };
}

export function toMarkdown({ steps, total }) {
  const pct = (n) => (total.inputTotal ? `${((n / total.inputTotal) * 100).toFixed(1)}%` : "—");
  const m = (n) => `${(n / 1e6).toFixed(2)}M`;
  const rows = steps.map((s) => `| ${s.step} | ${m(s.inputTotal)} | ${pct(s.inputTotal)} | ${m(s.output)} | ${s.activeMin} |`);
  return ["| Step | Input-equivalent | Share | Output | Active min |", "|---|---|---|---|---|", ...rows,
    `| **total** | ${m(total.inputTotal)} | 100% | ${m(total.output)} | ${total.activeMin} (wall ${total.wallMin}) |`].join("\n");
}

function sessionFiles(sessionArg) {
  const dir = join(homedir(), ".claude", "projects", projectDirName(process.cwd()));
  const id = !sessionArg || sessionArg === "latest"
    ? readdirSync(dir).filter((f) => f.endsWith(".jsonl")).sort((a, b) => statSync(join(dir, b)).mtimeMs - statSync(join(dir, a)).mtimeMs)[0]?.replace(/\.jsonl$/, "")
    : sessionArg;
  if (!id || !existsSync(join(dir, `${id}.jsonl`))) throw new Error(`no session log ${id ?? "(none)"} in ${dir}`);
  const subDir = join(dir, id, "subagents");
  const subagents = existsSync(subDir) ? readdirSync(subDir).filter((f) => f.endsWith(".jsonl")).map((f) => {
    const meta = join(subDir, f.replace(/\.jsonl$/, ".meta.json"));
    return { description: existsSync(meta) ? JSON.parse(readFileSync(meta, "utf8")).description : "", lines: readFileSync(join(subDir, f), "utf8").split("\n").filter(Boolean) };
  }) : [];
  return { id, mainLines: readFileSync(join(dir, `${id}.jsonl`), "utf8").split("\n").filter(Boolean), subagents };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const since = argOf(process.argv, "since");
  if (!since || !Number.isFinite(Date.parse(since))) { console.error("usage: run-cost.mjs --since <iso> [--session <id>|latest] [--key <KEY>] [--out <file>]"); process.exit(1); }
  const { id, mainLines, subagents } = sessionFiles(argOf(process.argv, "session"));
  const result = { session: id, since, ...cost({ mainLines, subagents, since }) };
  const key = argOf(process.argv, "key");
  const out = argOf(process.argv, "out") ?? (key ? join(workDir(key), "run-cost.json") : null);
  if (out) writeFileSync(out, JSON.stringify(result, null, 2) + "\n");
  console.log(toMarkdown(result));
}
