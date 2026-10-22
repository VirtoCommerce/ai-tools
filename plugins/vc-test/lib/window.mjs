// plugins/vc-test/lib/window.mjs — the global settings window (U68): a run may change a GLOBAL platform setting only
// inside a short window, one window at a time, announced in the team channel when it opens and when it closes.
// The lock is one file, created with an exclusive create (never read-then-write); a lock past `expiresAt` is reclaimed
// once. Two processes reclaiming one stale lock at the same instant can have the second rm delete the first one's fresh
// lock; the window is microseconds against a 120 s, human-gated lock, so it is accepted.
// The webhook URL is a secret: it is never printed and never put into a reason.
// CLI: node plugins/vc-test/lib/window.mjs open|close --key <KEY> --setting <name> --value <v> [--max-s 120]
//      node plugins/vc-test/lib/window.mjs check   → exit 0 when TEAMS_WEBHOOK_URL is set, 1 when not; prints nothing
//   open = acquire, announce (a failed announce releases the lock again); close = announce, release (always).
//   Every subcommand loads the project's config.js first, so a webhook kept in .env.local is seen.
//   exit 0: done; 1: usage (check: not set); 2: refused (window held, or no announcement); 3: no config.js here
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
  const [key, setting, value] = ["key", "setting", "value"].map((n) => argOf(process.argv, n));
  const maxSeconds = Number(argOf(process.argv, "max-s") ?? 120);
  if (!["open", "close"].includes(cmd) || !key || !setting || value === undefined || !(maxSeconds > 0)) {
    console.error("usage: window.mjs open|close --key <KEY> --setting <name> --value <v> [--max-s 120] | window.mjs check"); process.exit(1);
  }
  await import(pathToFileURL(config).href); // runs the layered env loader into process.env (TEAMS_WEBHOOK_URL from .env.local)
  const say = (o) => console.log(JSON.stringify(o));
  if (cmd === "open") {
    const got = acquire({ key, setting, maxSeconds });
    if (!got.ok) {
      const lock = defaultLockPath(); // an unreadable lock is never reclaimed automatically: a human decides
      say(got.holder ? { status: "refused", reason: "another window is open", holder: got.holder }
        : { status: "refused", reason: `unreadable lock file — delete ${lock} if no window is open`, lock });
      process.exit(2);
    }
    const told = await announce({ phase: "open", key, setting, value, maxSeconds });
    if (!told.ok) { release({ key }); say({ status: "refused", reason: told.reason, released: true }); process.exit(2); }
    say({ status: "open", key, setting, maxSeconds });
  } else {
    const told = await announce({ phase: "close", key, setting, value, maxSeconds });
    const freed = release({ key });
    say({ status: told.ok ? "closed" : "closed-unannounced", reason: told.reason, released: freed.ok });
    if (!told.ok || !freed.ok) process.exit(2);
  }
}
