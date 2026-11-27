#!/usr/bin/env node
/**
 * lanes-reap.mjs — list, and with --apply stop, the MCP lane stacks that outlived their Claude session.
 *
 *   node plugins/vc-init/scripts/lanes-reap.mjs [--apply] [--older-than <hours>] [--min-age <minutes>] [--lanes-only] [--all-kinds] [--json]
 *   npm run lanes:reap -- [same flags]            (in the ai-tools repo)
 *
 * A "stack" is one MCP server as a client starts it — `cmd /c npx …` → npx → (cmd →) the server, plus any browser
 * the server launched — so it is stopped whole, leaf first (Windows has no process group to signal). Kinds:
 *   - lane: a Playwright lane (scripts/lanes/playwright-lane.mjs, or the vc-init bridge `--playwright`);
 *   - chrome-devtools-mcp, serena, vc-secrets: the other per-session servers that pile up the same way.
 * A stack is reaped when
 *   - its owner is gone: the process that started it no longer exists (any kind), or
 *   - it is older than --older-than hours (default 24; 0 turns this off) — lanes only, unless --all-kinds. The owner
 *     can be alive and merely idle: a Claude session keeps its servers for as long as it exists, days included. A
 *     session still using a stopped server reconnects it in /mcp; the lane has its own idle exit as well
 *     (bridge/lane-watchdog.mjs).
 * Never touched: a stack younger than --min-age minutes (default 30), and this command's own process tree.
 * Dry run unless --apply. Exit 0 either way; the table is the result.
 */
import { pathToFileURL } from "node:url";
import { ancestorsOf, descendantsLeafFirst, listProcesses } from "../bridge/proc-table.mjs";

export const KINDS = [
  { kind: "lane", re: /playwright-lane\.mjs|--playwright\s+@playwright\/mcp@|bridge[\\/]playwright-mcp\.mjs/i, age: true },
  { kind: "chrome-devtools-mcp", re: /chrome-devtools-mcp/i },
  { kind: "serena", re: /\bserena\b/i },
  { kind: "vc-secrets", re: /vc-secrets[\\/](?:.*[\\/])?(?:proxy|shim|launcher|server|run)[^\\/]*\.mjs|vc-secrets-(?:proxy|shim)/i },
];
/** Process names that are the client, never a stack member, even if their command line mentions a server by name. */
const CLIENT_NAME = /^(claude|claude\.exe|code|cursor|windsurf)$/i;

const kindOf = (row, kinds) => (CLIENT_NAME.test(row.name) ? null : kinds.find((k) => k.re.test(row.cmd))?.kind ?? null);

/**
 * Group the matching processes into stacks and decide each one. Pure.
 * @returns {{ kind, root, members, ageMs, ownerPid, ownerGone, reason: string|null }[]}  every stack, `reason` set when it should be reaped
 */
export function selectStacks(rows, { now = Date.now(), olderThanMs = 24 * 3_600_000, minAgeMs = 30 * 60_000, selfPid = process.pid, kinds = KINDS, ageAllKinds = false } = {}) {
  const byPid = new Map(rows.map((r) => [r.pid, r]));
  const protectedPids = new Set([selfPid, ...ancestorsOf(rows, selfPid).map((a) => a.pid)]);
  const stacks = new Map();
  for (const row of rows) {
    const kind = kindOf(row, kinds);
    if (!kind || protectedPids.has(row.pid)) continue;
    // Climb through the wrappers that carry the same server's command line: the stack root is the last of them.
    let root = row;
    for (const a of ancestorsOf(rows, row.pid)) {
      if (kindOf(a, kinds) === kind && !protectedPids.has(a.pid)) root = a;
      else break;
    }
    const s = stacks.get(root.pid) ?? { kind, root, members: [] };
    s.members.push(row.pid);
    stacks.set(root.pid, s);
  }
  const out = [];
  for (const s of stacks.values()) {
    const { root } = s;
    const ownerGone = root.ppid > 1 ? !byPid.has(root.ppid) : true;
    const ageMs = root.startMs ? now - root.startMs : Number.POSITIVE_INFINITY;
    const byAge = ageAllKinds || kinds.find((k) => k.kind === s.kind)?.age;
    let reason = null;
    if (ageMs >= minAgeMs) {
      if (ownerGone) reason = "owner gone";
      else if (byAge && olderThanMs > 0 && ageMs >= olderThanMs) reason = `older than ${Math.round(olderThanMs / 3_600_000)} h`;
    }
    out.push({ kind: s.kind, root: root.pid, members: s.members, ageMs, ownerPid: root.ppid, ownerGone, reason });
  }
  return out.sort((a, b) => b.ageMs - a.ageMs);
}

const fmtAge = (ms) => (!Number.isFinite(ms) ? "?" : ms >= 86_400_000 ? `${(ms / 86_400_000).toFixed(1)} d` : ms >= 3_600_000 ? `${(ms / 3_600_000).toFixed(1)} h` : `${Math.round(ms / 60_000)} min`);

/** Stop `root` and everything below it, leaf first. Returns { killed, failed }. */
export function stopStack(rows, root, kill = (pid) => process.kill(pid)) {
  let killed = 0;
  const failed = [];
  for (const pid of descendantsLeafFirst(rows, root)) {
    try { kill(pid); killed++; } catch (e) { if (e?.code !== "ESRCH") failed.push(`${pid}: ${e?.code || e?.message}`); }
  }
  return { killed, failed };
}

function parseArgs(argv) {
  const o = { apply: false, olderThanH: 24, minAgeMin: 30, lanesOnly: false, allKinds: false, json: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--apply") o.apply = true;
    else if (a === "--lanes-only") o.lanesOnly = true;
    else if (a === "--all-kinds") o.allKinds = true;
    else if (a === "--json") o.json = true;
    else if (a === "-h" || a === "--help") o.help = true;
    else if (a === "--older-than") o.olderThanH = Number(argv[++i]);
    else if (a === "--min-age") o.minAgeMin = Number(argv[++i]);
    else throw new Error(`unknown argument ${JSON.stringify(a)}`);
  }
  if (!Number.isFinite(o.olderThanH) || o.olderThanH < 0) throw new Error("--older-than needs a number of hours (0 = off)");
  if (!Number.isFinite(o.minAgeMin) || o.minAgeMin < 0) throw new Error("--min-age needs a number of minutes");
  return o;
}

async function main() {
  let o;
  try { o = parseArgs(process.argv.slice(2)); } catch (e) { console.error(`lanes-reap: ${e.message}`); return 64; }
  if (o.help) { console.log("usage: lanes-reap [--apply] [--older-than <hours, default 24, 0 = off>] [--min-age <minutes, default 30>] [--lanes-only] [--all-kinds] [--json]"); return 0; }
  const rows = await listProcesses();
  if (!rows.length) { console.error("lanes-reap: could not list the processes — nothing decided"); return 1; }
  const kinds = o.lanesOnly ? KINDS.filter((k) => k.kind === "lane") : KINDS;
  const stacks = selectStacks(rows, { olderThanMs: o.olderThanH * 3_600_000, minAgeMs: o.minAgeMin * 60_000, kinds, ageAllKinds: o.allKinds });
  const doomed = stacks.filter((s) => s.reason);
  const result = [];
  for (const s of doomed) {
    const below = descendantsLeafFirst(rows, s.root).length;
    const r = o.apply ? stopStack(rows, s.root) : null;
    result.push({ kind: s.kind, root: s.root, processes: below, age: fmtAge(s.ageMs), reason: s.reason, ...(r ? { killed: r.killed, failed: r.failed } : {}) });
  }
  if (o.json) { console.log(JSON.stringify({ apply: o.apply, stacks: stacks.length, reaped: result }, null, 2)); return 0; }
  const live = stacks.length - doomed.length;
  console.log(`${stacks.length} MCP stack(s): ${live} kept (owner alive, young enough), ${doomed.length} ${o.apply ? "stopped" : "would be stopped"}`);
  const byKind = new Map();
  for (const s of stacks) { const c = byKind.get(s.kind) ?? { total: 0, doomed: 0 }; c.total++; if (s.reason) c.doomed++; byKind.set(s.kind, c); }
  for (const [k, c] of byKind) console.log(`  ${k.padEnd(20)} ${String(c.total).padStart(3)} stacks, ${c.doomed} reapable`);
  if (result.length) {
    console.log("\n  kind                  root pid  procs  age       reason");
    for (const r of result) console.log(`  ${r.kind.padEnd(20)}  ${String(r.root).padStart(8)}  ${String(r.processes).padStart(5)}  ${r.age.padEnd(8)}  ${r.reason}${r.failed?.length ? `  (could not stop: ${r.failed.join(", ")})` : ""}`);
    const total = result.reduce((n, r) => n + r.processes, 0);
    console.log(`\n${o.apply ? "stopped" : "would stop"} ${total} process(es) in ${result.length} stack(s)${o.apply ? "" : " — re-run with --apply"}`);
  }
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) process.exit(await main());
