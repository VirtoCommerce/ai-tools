// scripts/maintenance/agent-token-cost.mjs — token cost per subagent type, before/after a cutoff, read from the
// local Claude Code transcripts (~/.claude/projects). Measures a prompt or tool-list change (VCST-6423).
//   npm run agents:cost -- --cutoff <ISO time of the change> [--since 2026-10-01] [--root <projects dir>] [--json]
// Per run: first-turn context (system prompt + tools + agent definition + brief = the fixed cost a prompt or tool
// cut changes), total tokens over all turns (input + cache write + cache read + output) and turns. Medians.
import fs from "node:fs"; import path from "node:path"; import os from "node:os";
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
const root = arg("root", path.join(os.homedir(), ".claude", "projects"));
const since = new Date(arg("since", "2026-10-01")); const cutoff = new Date(arg("cutoff", new Date().toISOString()));
const runs = [];
function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (e.name.endsWith(".meta.json")) one(p); } }
function one(meta) {
  let m; try { m = JSON.parse(fs.readFileSync(meta, "utf8")); } catch { return; }
  const f = meta.replace(/\.meta\.json$/, ".jsonl"); if (!fs.existsSync(f) || fs.statSync(f).mtime < since) return;
  let first = null, total = 0, read = 0, out = 0, turns = 0, peak = 0, start = null, model = null; const seen = new Set();
  for (const line of fs.readFileSync(f, "utf8").split("\n")) {
    if (!line) continue; let j; try { j = JSON.parse(line); } catch { continue; }
    start ??= j.timestamp; const u = j.message?.usage; if (j.type !== "assistant" || !u) continue;
    const id = j.message.id; if (seen.has(id)) continue; seen.add(id); // one API call can span several lines
    const ctx = (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
    first ??= ctx; peak = Math.max(peak, ctx); total += ctx + (u.output_tokens || 0); read += u.cache_read_input_tokens || 0; out += u.output_tokens || 0; turns++; model ??= j.message.model;
  }
  if (!turns || !start || new Date(start) < since) return;
  runs.push({ type: (m.agentType || "general-purpose").replace(/^[\w-]+:/, ""), when: new Date(start) < cutoff ? "before" : "after", first, total, read, out, turns, peak, model });
}
walk(root);
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const g = {}; for (const r of runs) ((g[r.type] ??= { before: [], after: [] })[r.when]).push(r);
const row = (rs) => rs.length ? { n: rs.length, first: med(rs.map((r) => r.first)), total: med(rs.map((r) => r.total)), turns: med(rs.map((r) => r.turns)), cacheRead: Math.round(100 * rs.reduce((a, r) => a + r.read, 0) / Math.max(1, rs.reduce((a, r) => a + r.total, 0))) } : null;
const table = Object.entries(g).map(([t, v]) => ({ type: t, before: row(v.before), after: row(v.after) })).sort((a, b) => ((b.before?.n || 0) + (b.after?.n || 0)) - ((a.before?.n || 0) + (a.after?.n || 0)));
if (process.argv.includes("--json")) { console.log(JSON.stringify(table, null, 1)); process.exit(0); }
const k = (n) => (n == null ? "—" : n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : Math.round(n / 1000) + "K");
console.log(`runs ${runs.length} since ${since.toISOString().slice(0, 10)} · cutoff ${cutoff.toISOString().slice(0, 16)} · medians per run`);
console.log("agent".padEnd(28), "| before: n  first  total turns | after: n  first  total turns");
for (const r of table) { const b = r.before, a = r.after; console.log(r.type.slice(0, 27).padEnd(28), "|", String(b?.n ?? 0).padStart(9), k(b?.first).padStart(6), k(b?.total).padStart(6), String(b?.turns ?? "—").padStart(5), "|", String(a?.n ?? 0).padStart(8), k(a?.first).padStart(6), k(a?.total).padStart(6), String(a?.turns ?? "—").padStart(5)); }
