/**
 * bridge/proc-table.mjs — a snapshot of the machine's processes, the same shape on Windows and POSIX.
 *
 * Two callers need to know who owns a process: a Playwright lane that asks "is the session that started me still
 * there?" (bridge/lane-watchdog.mjs) and the reaper that lists the lanes whose session is gone
 * (scripts/lanes-reap.mjs). Both read this table and decide with the pure helpers below.
 *
 * A row: { pid, ppid, name, cmd, startMs } — `startMs` is the process's start time (epoch ms), 0 when unknown.
 * Windows has no process group to kill and does not reparent an orphan, so a dead parent's pid stays in `ppid`: an
 * "orphan" there is a row whose `ppid` is not in the table.
 */
import { execFile } from "node:child_process";

const PS_LIST =
  "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,CommandLine," +
  "@{n='Start';e={if($_.CreationDate){$_.CreationDate.ToUniversalTime().ToString('o')}else{''}}} | ConvertTo-Json -Compress";

/** `[[dd-]hh:]mm:ss` (ps etime) → seconds. Pure. */
export function etimeSeconds(s) {
  const m = /^(?:(?:(\d+)-)?(\d+):)?(\d+):(\d+)$/.exec(String(s || "").trim());
  if (!m) return 0;
  return (Number(m[1] || 0) * 24 + Number(m[2] || 0)) * 3600 + Number(m[3]) * 60 + Number(m[4]);
}

/** The Windows listing (ConvertTo-Json of Win32_Process) → rows. Pure. */
export function parseWindows(json) {
  let data;
  try { data = JSON.parse(String(json || "[]")); } catch { return []; }
  if (!Array.isArray(data)) data = [data];
  return data
    .filter((p) => p && Number.isInteger(p.ProcessId))
    .map((p) => ({
      pid: p.ProcessId,
      ppid: Number.isInteger(p.ParentProcessId) ? p.ParentProcessId : 0,
      name: String(p.Name || ""),
      cmd: String(p.CommandLine || ""),
      startMs: p.Start ? Date.parse(p.Start) || 0 : 0,
    }));
}

/** `ps -eo pid=,ppid=,etime=,comm=,args=` → rows. Pure. */
export function parsePs(text, now = Date.now()) {
  const rows = [];
  for (const line of String(text || "").split(/\r?\n/)) {
    const m = /^\s*(\d+)\s+(\d+)\s+(\S+)\s+(\S+)\s*(.*)$/.exec(line);
    if (!m) continue;
    rows.push({ pid: +m[1], ppid: +m[2], name: m[4].split("/").pop(), cmd: m[5] || m[4], startMs: now - etimeSeconds(m[3]) * 1000 });
  }
  return rows;
}

function run(file, args, timeout) {
  return new Promise((resolve) => {
    execFile(file, args, { timeout, maxBuffer: 64 * 1024 * 1024, windowsHide: true }, (err, stdout) => resolve(err ? "" : stdout));
  });
}

/** Every process on the machine. Resolves to [] when the listing cannot be taken (callers then decide nothing). */
export async function listProcesses({ platform = process.platform } = {}) {
  if (platform === "win32") return parseWindows(await run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", PS_LIST], 60_000));
  return parsePs(await run("ps", ["-eo", "pid=,ppid=,etime=,comm=,args="], 30_000));
}

/** Whether `pid` is a live process. EPERM means it exists but is not ours. */
export function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e?.code === "EPERM";
  }
}

/** The ancestors of `pid` in the table, nearest first. Stops at a missing row, a cycle, or pid <= 1. Pure. */
export function ancestorsOf(rows, pid) {
  const byPid = new Map(rows.map((r) => [r.pid, r]));
  const out = [];
  const seen = new Set([pid]);
  let cur = byPid.get(pid)?.ppid;
  while (cur && cur > 1 && !seen.has(cur) && byPid.has(cur)) {
    seen.add(cur);
    out.push(byPid.get(cur));
    cur = byPid.get(cur).ppid;
  }
  return out;
}

/** `pid` and everything below it, leaf first (the order to kill them in). Pure. */
export function descendantsLeafFirst(rows, pid) {
  const kids = new Map();
  for (const r of rows) (kids.get(r.ppid) ?? kids.set(r.ppid, []).get(r.ppid)).push(r.pid);
  const order = [];
  const walk = (p, seen) => {
    if (seen.has(p)) return;
    seen.add(p);
    for (const k of kids.get(p) ?? []) walk(k, seen);
    order.push(p);
  };
  walk(pid, new Set());
  return order;
}
