/**
 * bridge/vc-secrets-path.mjs — where the vc-secrets shim is, and how /project-init puts it there.
 *
 * VC_SECRETS is a PROJECT setting: /project-init writes it into the project's
 * `.claude/settings.local.json` `env` next to VC_RUN, and nothing asks the operator to edit
 * `~/.claude/settings.json`. That env reaches only sessions started after it was written, so until the
 * restart every caller here falls back to the shim's documented default path — the one vc-secrets'
 * `install-shim.mjs` writes when given no `--data-dir`, which is how `installVcSecretsShim` runs it.
 *
 * A SET VC_SECRETS is used as is, even when it names a missing file: someone chose that path, and
 * quietly running a different launcher would hide the mistake.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolvePluginRoot } from "./resolve-plugin.mjs";

// Mirrors vc-secrets' scripts/shim-path.mjs (CANONICAL_DATA_ID + SHIM). Read there, not here, when
// the plugin is resolvable; these two names are the fallback for a caller that cannot resolve it.
const DATA_ID = "vc-secrets-ai-tools";
const SHIM = "vc-secrets-shim.mjs";

/** The documented default location of the vc-secrets shim. */
export function defaultVcSecretsShim(env = process.env) {
  return path.join(env.HOME || os.homedir(), ".claude", "plugins", "data", DATA_ID, SHIM);
}

/**
 * The shim to use: VC_SECRETS when set, else the default path when a shim is there.
 * @returns {{ path: string, present: boolean, source: "VC_SECRETS" | "default" | "none" }}
 */
export function vcSecretsShim(env = process.env) {
  if (env.VC_SECRETS) return { path: env.VC_SECRETS, present: existsSync(env.VC_SECRETS), source: "VC_SECRETS" };
  const fallback = defaultVcSecretsShim(env);
  return existsSync(fallback) ? { path: fallback, present: true, source: "default" } : { path: "", present: false, source: "none" };
}

/**
 * Run vc-secrets' own installer (no --data-dir ⇒ the documented default) and return the shim path.
 * Writes nothing but the shim — the installer never touches a settings file.
 * @returns {{ ok: true, path: string, state: string } | { ok: false, reason: string }}
 */
export function installVcSecretsShim(opts = {}) {
  const root = resolvePluginRoot("vc-secrets", opts);
  if (!root) return { ok: false, reason: "the vc-secrets plugin is not installed — /plugin install vc-secrets@ai-tools, restart Claude Code" };
  const script = path.join(root, "scripts", "install-shim.mjs");
  if (!existsSync(script)) return { ok: false, reason: `${script} not found — the vc-secrets install is incomplete` };
  const r = spawnSync(process.execPath, [script], { encoding: "utf8", timeout: 60000, windowsHide: true });
  const target = defaultVcSecretsShim();
  if (r.status !== 0 || !existsSync(target)) {
    return { ok: false, reason: `install-shim failed (exit ${r.status}): ${String(r.stderr || r.stdout || "").trim().split(/\r?\n/)[0] || "no output"}` };
  }
  const m = /\((installed|replaced a different copy|already up to date);/.exec(r.stdout || "");
  return { ok: true, path: target, state: m ? m[1] : "installed" };
}
