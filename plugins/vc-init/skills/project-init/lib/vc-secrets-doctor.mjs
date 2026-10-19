/**
 * skills/project-init/lib/vc-secrets-doctor.mjs — run `vc-secrets doctor` and read its verdict.
 *
 * /project-init never sees a token (VCST-6402): the operator stores each one with
 * `node "$VC_SECRETS" set <name>` in a terminal and approves the declarations with
 * `node "$VC_SECRETS" trust`. Whether they did is answered by `vc-secrets doctor`, and its EXIT CODE
 * is not enough: an untrusted checkout that declares only secrets exits 0, reporting each one as
 * `SKIP secret "x" not read -- this checkout is not trusted …`. So the lines are read:
 *
 *   OK secret "<name>" resolvable                     → stored
 *   FAIL secret "<name>" not resolvable -- …          → not stored (run `set <name>`)
 *   SKIP secret "<name>" not read -- … not trusted …  → trust not given yet
 *   FAIL task|server "<name>" … not trusted …         → trust not given (or the declaration changed)
 *   FAIL <anything else>                              → reported as is
 *
 * The output carries names and statuses only — doctor never prints a value.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { vcSecretsShim } from "../../../bridge/vc-secrets-path.mjs";

/** Parse doctor's lines. Pure. */
export function parseDoctor(text) {
  const out = { resolvable: [], unresolvable: [], skippedUntrusted: [], untrustedLaunchables: [], fails: [], noDeclaration: false };
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    let m;
    if ((m = /^OK secret "([^"]+)" resolvable/.exec(line))) out.resolvable.push(m[1]);
    else if ((m = /^FAIL secret "([^"]+)" not resolvable/.exec(line))) out.unresolvable.push(m[1]);
    else if ((m = /^SKIP secret "([^"]+)" not read -- this checkout is not trusted/.exec(line))) out.skippedUntrusted.push(m[1]);
    else if ((m = /^FAIL (task|server) "([^"]+)" .*not trusted/.exec(line))) out.untrustedLaunchables.push(`${m[1]} ${m[2]}`);
    else if (/^FAIL no declaration file found/.test(line)) out.noDeclaration = true;
    else if (line.startsWith("FAIL ")) out.fails.push(line.slice(5));
  }
  return out;
}

/**
 * The verdict for a set of secrets this project needs.
 * @param {ReturnType<typeof parseDoctor>} parsed
 * @param {string[]} needed  secret names (write-secrets-decl's report)
 * @returns {{ ready: boolean, missing: string[], trustNeeded: boolean, problems: string[] }}
 */
export function secretsVerdict(parsed, needed) {
  const missing = needed.filter((n) => !parsed.resolvable.includes(n) && !parsed.skippedUntrusted.includes(n));
  const trustNeeded = parsed.skippedUntrusted.some((n) => needed.includes(n)) || parsed.untrustedLaunchables.length > 0;
  const problems = [...parsed.fails];
  if (needed.length && parsed.noDeclaration) problems.push("no vc-secrets declaration file was found — run write-secrets-decl.mjs");
  const ready = !trustNeeded && missing.length === 0 && problems.length === 0 && needed.every((n) => parsed.resolvable.includes(n));
  return { ready, missing, trustNeeded, problems };
}

/**
 * Run doctor through the installed shim — VC_SECRETS, else the default path (before the restart that
 * brings the project's settings env in). `available:false` when vc-secrets is not installed — the
 * caller says so instead of reporting every secret as missing.
 * @param {{ cwd?: string, shim?: string }} [opts]
 */
export function runDoctor({ cwd = process.cwd(), shim = vcSecretsShim().path } = {}) {
  if (!shim || !existsSync(shim)) return { available: false, shim: shim || "", code: null, text: "" };
  const r = spawnSync(process.execPath, [shim, "doctor"], { cwd, encoding: "utf8", timeout: 120000, windowsHide: true });
  return { available: true, shim, code: r.status, text: `${r.stdout || ""}\n${r.stderr || ""}` };
}
