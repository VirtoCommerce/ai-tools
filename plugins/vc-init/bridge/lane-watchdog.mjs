/**
 * bridge/lane-watchdog.mjs — a Playwright lane that does not outlive its session.
 *
 * Measured 2026-11-27: 244 lane processes (and a browser's worth of wrappers around them) were alive on one machine,
 * some eight days old, ~26 GB of RAM — one set of four lanes per Claude session that was idle or long gone. A lane
 * that gets its stdin closed exits by itself (verified: killing the session's process takes the lane and its browser
 * down), but two cases leave it standing:
 *   - the session is still open and idle — nothing ever closes the pipe, so the lane waits forever;
 *   - the session died while another process kept a copy of the pipe — no end-of-input, and the owner is gone.
 * This watches for both. Every poll it checks
 *   - ORPHANED: a process that was above the lane when it started (the immediate parent at once, the whole chain a
 *     little later) no longer exists;
 *   - IDLE: nothing crossed stdin or stdout for `idleHours`. A request in flight writes to stdout as it runs, and a
 *     lane that is serving anything sees traffic at least that often, so a lane in use is never stopped.
 * and then ends the lane the way a closed stdin would, so Playwright MCP closes its browser; a hard exit follows if it
 * does not finish. After an idle exit the client shows the lane as disconnected — reconnect it in /mcp.
 *
 * VC_LANE_IDLE_HOURS (default 4) sets the idle limit; 0 turns the idle check off (the orphan check stays).
 */
import { ancestorsOf, isAlive, listProcesses } from "./proc-table.mjs";

export const DEFAULT_IDLE_HOURS = 4;
/** The chain is read this long after start, when every ancestor is certainly up and the start-up burst is over. */
export const CHAIN_DELAY_MS = 30_000;
export const POLL_MS = 60_000;
const HARD_EXIT_MS = 10_000;

/** The idle limit in ms from VC_LANE_IDLE_HOURS: unset or invalid → the default, 0 → null (no idle exit). Pure. */
export function idleLimitMs(value) {
  if (value === undefined || value === null || String(value).trim() === "") return DEFAULT_IDLE_HOURS * 3_600_000;
  const h = Number(value);
  if (!Number.isFinite(h) || h < 0) return DEFAULT_IDLE_HOURS * 3_600_000;
  return h === 0 ? null : h * 3_600_000;
}

/**
 * What the watchdog decides at `now`. Pure.
 * @returns {null | { reason: "orphaned" | "idle", detail: string }}
 */
export function verdict({ now, lastActivity, idleMs, watched, alive }) {
  for (const p of watched) {
    if (!alive(p.pid)) return { reason: "orphaned", detail: `${p.name || "process"} ${p.pid} above this lane is gone` };
  }
  if (idleMs !== null && now - lastActivity >= idleMs) {
    return { reason: "idle", detail: `no request for ${Math.round((now - lastActivity) / 60_000)} min (limit ${Math.round(idleMs / 60_000)} min)` };
  }
  return null;
}

/**
 * Start watching. Returns { stop(), touch() }. `onExpire(reason, detail)` is called once.
 * Injectable parts exist for the tests; a lane passes only `tell` and `onExpire`.
 */
export function startLaneWatchdog({
  tell = () => {},
  onExpire,
  env = process.env,
  stdin = process.stdin,
  stdout = process.stdout,
  ppid = process.ppid,
  now = Date.now,
  alive = isAlive,
  list = listProcesses,
  pollMs: pollOverride,
  chainDelayMs = CHAIN_DELAY_MS,
} = {}) {
  const idleMs = idleLimitMs(env.VC_LANE_IDLE_HOURS);
  // A minute is fine for hours; a short limit (a test's) gets a proportionally short poll.
  const pollMs = pollOverride ?? (idleMs === null ? POLL_MS : Math.max(1000, Math.min(POLL_MS, Math.floor(idleMs / 4))));
  let lastActivity = now();
  const touch = () => { lastActivity = now(); };
  const watched = ppid && ppid > 1 ? [{ pid: ppid, name: "parent" }] : [];
  let done = false;

  // Count traffic without touching how the streams flow: a 'data' listener would start stdin flowing before the MCP
  // transport attaches its own, and the client's first message (it arrives while npx is still installing) would be lost.
  const wrap = (stream, method, event) => {
    const original = stream[method];
    if (typeof original !== "function") return () => {};
    stream[method] = function patched(first, ...rest) {
      if (event === undefined || first === event) touch();
      return original.call(this, first, ...rest);
    };
    return () => { stream[method] = original; };
  };
  const unwrap = [wrap(stdin, "emit", "data"), wrap(stdout, "write")];

  const check = () => {
    if (done) return;
    const v = verdict({ now: now(), lastActivity, idleMs, watched, alive });
    if (!v) return;
    done = true;
    stop();
    tell(`stopping — ${v.reason}: ${v.detail}`);
    onExpire?.(v.reason, v.detail);
  };

  const timer = setInterval(check, pollMs);
  timer.unref?.();
  const chainTimer = setTimeout(async () => {
    try {
      const rows = await list();
      for (const a of ancestorsOf(rows, process.pid)) {
        if (!watched.some((w) => w.pid === a.pid)) watched.push({ pid: a.pid, name: a.name });
      }
    } catch { /* the immediate parent stays the only one watched */ }
  }, chainDelayMs);
  chainTimer.unref?.();

  function stop() {
    clearInterval(timer);
    clearTimeout(chainTimer);
    for (const u of unwrap) u();
  }
  return { stop, touch };
}

/**
 * End the lane as a closed stdin would: Playwright MCP shuts its browser down on it. If the process is still here
 * HARD_EXIT_MS later, exit anyway.
 */
export function endLane(stdin = process.stdin) {
  try { stdin.destroy(); } catch { /* already closed */ }
  setTimeout(() => process.exit(0), HARD_EXIT_MS);
}
