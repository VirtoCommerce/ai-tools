// plugins/vc-test/lib/window.mjs — the global settings window (U68): a run may change a GLOBAL platform setting only
// inside a short window, one window at a time, announced in the team channel when it opens and when it closes.
// The lock is one file, created with an exclusive create (never read-then-write); a lock past `expiresAt` is reclaimed
// once. Two processes reclaiming one stale lock at the same instant can have the second rm delete the first one's fresh
// lock; the window is microseconds against a 120 s, human-gated lock, so it is accepted.
// The webhook URL is a secret: it is never printed and never put into a reason.
// CLI: node plugins/vc-test/lib/window.mjs run --key <KEY> --setting <name> --value <v> --out <file> [--max-s 120] -- <cmd…>
//      node plugins/vc-test/lib/window.mjs open|close --key <KEY> --setting <name> --value <v> [--max-s 120]
//      node plugins/vc-test/lib/window.mjs check   → exit 0 when TEAMS_WEBHOOK_URL is set, 1 when not; prints nothing
//   run = open, the command (its stdout+stderr to --out), close — with the deadline ENFORCED: the command gets
//   VC_TEST_WINDOW_DEADLINE (epoch ms, RESERVE_S before the end) to stop its steps and restore in its `finally`, and is
//   killed with its process tree at --max-s; the lock is held GRACE_S longer than that, so no other run can reclaim it
//   while the command lives. The close announces the command's last output line (the value on the stand).
//   open = acquire, announce (a failed announce releases the lock again); close = announce, release (always).
//   Every subcommand loads the project's config.js first, so a webhook kept in .env.local is seen.
//   exit 0: done; 1: usage (check: not set); 2: refused (window held, or no announcement); 3: no config.js here;
//   4 (run): the command was killed at the window's end — the value on the stand is unknown
import { spawn, spawnSync } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { argOf, outputRoot } from "./paths.mjs";

export const defaultLockPath = () => join(outputRoot(), ".vc-fix", "vc-test", "global-window.lock");
const readHolder = (lockPath) => { try { return JSON.parse(readFileSync(lockPath, "utf8")); } catch { return null; } };

export function acquire({ key, setting, maxSeconds = 120, now = Date.now, lockPath = defaultLockPath() }) {
  mkdirSync(dirname(lockPath), { recursive: true });
  const data = JSON.stringify({ key, setting, pid: process.pid, expiresAt: now() + maxSeconds * 1000 });
  const create = () => { try { writeFileSync(lockPath, data, { flag: "wx" }); return true; } catch (err) { if (err.code === "EEXIST") return false; throw err; } };
  if (create()) return { ok: true };
  const holder = readHolder(lockPath);
  if (!holder || !(holder.expiresAt <= now())) return { ok: false, holder }; // live, or unreadable (maybe mid-write): not ours to remove
  rmSync(lockPath, { force: true });
  return create() ? { ok: true } : { ok: false, holder: readHolder(lockPath) };
}

export function release({ key, lockPath = defaultLockPath() }) {
  const holder = readHolder(lockPath);
  if (!holder) return { ok: false, reason: "no lock held" };
  if (holder.key !== key) return { ok: false, reason: "the lock belongs to another run", holder };
  rmSync(lockPath, { force: true });
  return { ok: true };
}

export async function announce({ webhook = process.env.TEAMS_WEBHOOK_URL, phase, key, setting, value, maxSeconds = 120, fetch = globalThis.fetch }) {
  if (!webhook) return { ok: false, reason: "no channel to announce the window" };
  const open = phase === "open";
  const title = open ? `Global settings window OPEN — ${key}` : `Global settings window CLOSED — ${key}`;
  const facts = [{ title: "Ticket", value: key }, { title: "Setting", value: setting }, { title: "Value", value: String(value) }];
  if (open) facts.push({ title: "Window", value: `at most ${maxSeconds} s` });
  const card = { type: "message", attachments: [{ contentType: "application/vnd.microsoft.card.adaptive", contentUrl: null, content: {
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json", type: "AdaptiveCard", version: "1.4", msteams: { width: "Full" },
    body: [{ type: "TextBlock", size: "Medium", weight: "Bolder", text: title }, { type: "FactSet", facts }] } }] };
  try {
    const res = await fetch(webhook, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(card), signal: AbortSignal.timeout(10_000) });
    return res.ok ? { ok: true } : { ok: false, reason: `the channel answered status ${res.status}` };
  } catch (err) { return { ok: false, reason: `the announcement request failed (${err?.name ?? "error"})` }; } // never err.message: it can carry the URL
}

// The CLI's open and close, for a caller in this process (teardown.mjs). The env must already be loaded.
export async function openWindow({ key, setting, value, maxSeconds = 120, lockSeconds = maxSeconds, lockPath = defaultLockPath(), fetch }) {
  const got = acquire({ key, setting, maxSeconds: lockSeconds, lockPath });
  if (!got.ok) { // an unreadable lock is never reclaimed automatically: a human decides
    return { code: 2, out: got.holder ? { status: "refused", reason: "another window is open", holder: got.holder }
      : { status: "refused", reason: `unreadable lock file — delete ${lockPath} if no window is open`, lock: lockPath } };
  }
  const told = await announce({ phase: "open", key, setting, value, maxSeconds, ...(fetch ? { fetch } : {}) });
  if (!told.ok) { release({ key, lockPath }); return { code: 2, out: { status: "refused", reason: told.reason, released: true } }; }
  return { code: 0, out: { status: "open", key, setting, maxSeconds } };
}

export async function closeWindow({ key, setting, value, maxSeconds = 120, lockPath = defaultLockPath(), fetch }) {
  const told = await announce({ phase: "close", key, setting, value, maxSeconds, ...(fetch ? { fetch } : {}) });
  const freed = release({ key, lockPath });
  return { code: told.ok && freed.ok ? 0 : 2, out: { status: told.ok ? "closed" : "closed-unannounced", reason: told.reason, released: freed.ok } };
}

export const RESERVE_S = 20; // the command's steps stop this long before the end, so its `finally` restore fits
export const GRACE_S = 30; // the lock outlives the kill by this much: the kill and the close fit inside it
const killTree = (child) => {
  if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  else try { process.kill(-child.pid, "SIGKILL"); } catch { child.kill("SIGKILL"); } // detached: its own process group
};
const lastLine = (file) => { try { return readFileSync(file, "utf8").trimEnd().split(/\r?\n/).pop() || null; } catch { return null; } };

// open → the command → close, with the window's end enforced rather than promised (U68). `ran: false` means no window
// was opened and nothing ran; a refused open is never closed (the lock is released by ticket key, not by holder).
export async function runWindow({ key, setting, value, maxSeconds = 120, cmd, out, lockPath = defaultLockPath(), fetch, spawnImpl = spawn }) {
  const opened = await openWindow({ key, setting, value, maxSeconds, lockSeconds: maxSeconds + GRACE_S, lockPath, fetch });
  if (opened.code) return { code: opened.code, out: { ...opened.out, ran: false } };
  const deadline = Date.now() + (maxSeconds - RESERVE_S) * 1000;
  const fd = openSync(out, "w");
  let killed = false;
  let exit;
  try {
    exit = await new Promise((done) => {
      let child;
      try {
        child = spawnImpl(cmd[0], cmd.slice(1), { stdio: ["ignore", fd, fd], detached: process.platform !== "win32",
          env: { ...process.env, VC_TEST_WINDOW_DEADLINE: String(deadline) } });
      } catch (err) { done({ error: err?.code ?? "spawn failed" }); return; }
      const timer = setTimeout(() => { killed = true; killTree(child); }, maxSeconds * 1000);
      child.once("error", (err) => { clearTimeout(timer); done({ error: err?.code ?? "spawn failed" }); });
      child.once("exit", (code, signal) => { clearTimeout(timer); done({ code, signal }); });
    });
  } finally { closeSync(fd); }
  const stand = killed ? null : lastLine(out);
  const closed = await closeWindow({ key, setting, value: stand ?? "unknown — the command was stopped at the window's end", lockPath, fetch });
  return { code: killed ? 4 : closed.code, out: { status: killed ? "killed" : closed.out.status, ran: true, killed, exit, stand: stand ?? null,
    out, released: closed.out.released, ...(closed.out.reason ? { reason: closed.out.reason } : {}) } };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const [cmd] = process.argv.slice(2);
  const config = join(process.cwd(), "config.js");
  if (!existsSync(config)) { console.error("no config.js here — run from the project root"); process.exit(3); }
  if (cmd === "check") {
    // The layered env loader prints its own lines; check prints nothing, so they are silenced while it loads.
    const saved = { log: console.log, warn: console.warn, info: console.info, error: console.error };
    const quiet = () => {};
    Object.assign(console, { log: quiet, warn: quiet, info: quiet, error: quiet });
    try { await import(pathToFileURL(config).href); } finally { Object.assign(console, saved); }
    process.exit(process.env.TEAMS_WEBHOOK_URL ? 0 : 1); // the value itself is never printed
  }
  const dd = process.argv.indexOf("--");
  const flags = dd < 0 ? process.argv : process.argv.slice(0, dd); // run: everything after `--` is the command
  const [key, setting, value, out] = ["key", "setting", "value", "out"].map((n) => argOf(flags, n));
  const maxSeconds = Number(argOf(flags, "max-s") ?? 120);
  const command = dd < 0 ? [] : process.argv.slice(dd + 1);
  const runBad = cmd === "run" && (!out || !command.length || !(maxSeconds > RESERVE_S));
  if (!["run", "open", "close"].includes(cmd) || !key || !setting || value === undefined || !(maxSeconds > 0) || runBad) {
    console.error(`usage: window.mjs run --key <KEY> --setting <name> --value <v> --out <file> [--max-s 120 (> ${RESERVE_S})] -- <cmd…> | window.mjs open|close --key <KEY> --setting <name> --value <v> [--max-s 120] | window.mjs check`); process.exit(1);
  }
  await import(pathToFileURL(config).href); // runs the layered env loader into process.env (TEAMS_WEBHOOK_URL from .env.local)
  const r = cmd === "run" ? await runWindow({ key, setting, value, maxSeconds, cmd: command, out })
    : await (cmd === "open" ? openWindow : closeWindow)({ key, setting, value, maxSeconds });
  console.log(JSON.stringify(r.out));
  process.exit(r.code);
}
