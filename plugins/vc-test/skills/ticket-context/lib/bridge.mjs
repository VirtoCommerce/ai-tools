// plugins/vc-test/skills/ticket-context/lib/bridge.mjs — one tracker or code-host read = one `node "$VC_RUN" <tool> …`
// launch (spec §7, U20). This process never holds a token: the bridge hands the child one group's secret. A failed
// launch becomes ONE gap from the closed vocabulary; only the first meaningful stderr line ever reaches it.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { CAPS } from "./fetch.mjs";
import { GapError } from "./gap.mjs";
import { cacheDir } from "./paths.mjs";

/** A maker of fresh file paths under the ticket's .vc-fix/context/<key>/ — where a bridge tool may write. */
export function bridgeTempFiles(key, root) {
  let n = 0;
  return (ext) => { const d = cacheDir(key, root); mkdirSync(d, { recursive: true }); return join(d, `bridge-${process.pid}-${Date.now()}-${++n}.${ext}`); };
}

/** One capped download: the tool writes ≤ CAPS.attachmentBytes to `out`; the bytes are read and the file removed. */
export async function bridgeDownload(run, tool, args, out) {
  try {
    await run(tool, [...args, "--out", out, "--max-bytes", String(CAPS.attachmentBytes)], { ms: CAPS.downloadTimeoutMs });
    return readFileSync(out);
  } catch (e) {
    if (/over-cap/.test(e?.detail ?? e?.message ?? "")) throw new GapError("over-cap", `more than ${CAPS.attachmentBytes} bytes: attachment download`);
    throw e;
  } finally { rmSync(out, { force: true }); }
}

/** The bridge answered 78: a host-governed project, where the host's MCP servers read instead (P1d-3). */
export class HostGoverned extends Error {
  constructor(detail = "host-governed project: the bridge runs nothing here") { super(detail); }
}

/** VC_RUN when it names an existing file, else null. */
export function vcRun(env = process.env) {
  const p = env.VC_RUN?.trim();
  return p && existsSync(p) ? p : null;
}

/** The line that says what went wrong: no blank line, no `[env]` warning; an error line beats a stack frame. ≤ 200 chars. */
function firstLine(stderr) {
  const lines = String(stderr ?? "").split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("[env]"));
  const line = lines.find((l) => /^(\[[\w-]+\]|gh:|\w*Error\b)/.test(l)) ?? lines[0] ?? "no output";
  return line.slice(0, 200);
}

/** The one mapping from a failed launch to a gap. Pure. */
export function bridgeGap(tool, { code, stderr = "", timedOut = false, ms = CAPS.fetchTimeoutMs }) {
  const all = String(stderr);
  const line = firstLine(all);
  const status = Number(/\bHTTP (\d{3})\b/.exec(all)?.[1]) || null;
  const with_ = (g, extra) => Object.assign(g, extra);
  if (timedOut) return new GapError("unreadable", `${tool} timed out after ${Math.round(ms / 1000)} s`);
  if (code === 78) return new HostGoverned();
  if (code === 64) return new GapError("access-denied", `refused by the $VC_RUN allowlist: ${line}`);
  if (code === 69) return new GapError("no-credential", `${line} — run /project-init, or install vc-fix's dependencies`);
  if (/rate limit/i.test(all)) return new GapError("unreadable", `${tool} rate limit reached — wait for the reset`);
  if (status === 401 || status === 403) return new GapError("access-denied", `${tool} ${status} — the stored token was refused; never retried with another`);
  if (status === 404) return new GapError("deleted", `${tool} 404: ${line}`);
  if (status === 400) return with_(new GapError("unreadable", `${tool} 400: ${line}`), { status, keys: [...new Set(all.match(/\b[A-Z][A-Z0-9]*-\d+\b/g) ?? [])] });
  if (status === 406) return with_(new GapError("unreadable", `${tool} 406: ${line}`), { status });
  return new GapError("unreadable", `${tool} failed: ${line}`);
}

/** Starts `node <VC_RUN> <tool> …args` with no shell; kills it at `ms + graceMs`. Resolves {code, stdout, stderr, timedOut}. */
function spawnRun(vcRunPath, tool, args, { ms, graceMs, env }) {
  return new Promise((done) => {
    const child = spawn(process.execPath, [vcRunPath, tool, ...args], { shell: false, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, ...env }, windowsHide: true });
    const out = [];
    const err = [];
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, ms + graceMs);
    child.stdout.on("data", (b) => out.push(b));
    child.stderr.on("data", (b) => err.push(b));
    const finish = (code) => { clearTimeout(timer); done({ code, stdout: Buffer.concat(out).toString("utf8"), stderr: Buffer.concat(err).toString("utf8"), timedOut }); };
    child.on("error", (e) => { err.push(Buffer.from(String(e?.message ?? e))); finish(1); });
    child.on("close", (code) => finish(code ?? 1));
  });
}

/**
 * One bridge launch. `as`: "json" parses stdout, "text" returns it, "none" returns null. Rejects with a GapError (or
 * HostGoverned) — never with the child's stderr. `graceMs` is the launch's own cost on top of the request's `ms`.
 */
export async function bridgeRun(tool, args, { as = "json", ms = CAPS.fetchTimeoutMs, graceMs = 15_000, env = process.env, run = null } = {}) {
  const path = vcRun(env);
  if (!path) throw new GapError("no-credential", "VC_RUN is not set — run /project-init");
  const r = run ? await run(path, tool, args, { ms, graceMs, env }) : await spawnRun(path, tool, args, { ms, graceMs, env });
  if (r.timedOut || r.code !== 0) throw bridgeGap(tool, { ...r, ms });
  if (as === "none") return null;
  if (as === "text") return r.stdout;
  try { return JSON.parse(r.stdout); } catch { throw new GapError("unreadable", `${tool} ${args[0] ?? ""} printed no JSON`); }
}
