#!/usr/bin/env node
/**
 * skills/project-init/check-secrets.mjs — is vc-secrets ready, and are this project's tokens stored?
 *
 * Two moments of /project-init call it (VCST-6402):
 *
 *   --preflight   §0d, before the interview: install the vc-secrets shim when it is missing (vc-secrets'
 *                 own install-shim.mjs, documented default path — no settings file is touched; gen-mcp
 *                 writes VC_SECRETS into the PROJECT's .claude/settings.local.json in §7), then check
 *                 that its `doctor` runs. A missing declaration is expected here.
 *   (default)     the token pause, on the operator's "done": run `doctor` and decide, from its LINES
 *                 (an untrusted checkout exits 0), whether every secret this project declared is
 *                 stored and the declarations are trusted. Prints the exact commands still to run.
 *
 * Prints one JSON object on stdout; exit 0 = ready, 1 = not ready (the JSON says why), 2 = vc-secrets
 * cannot be installed. Never prints a token value — doctor itself prints none.
 *
 * Usage:
 *   node check-secrets.mjs --preflight
 *   node check-secrets.mjs --steps                              # the token (and password) block of the §3 pause, as text
 *   node check-secrets.mjs [--secrets github-pat,jira-token]   # default: what the declaration lists
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { outputRoot } from "./lib/paths.mjs";
import { parseDoctor, runDoctor, secretsVerdict } from "./lib/vc-secrets-doctor.mjs";
import { installVcSecretsShim } from "../../bridge/vc-secrets-path.mjs";
import { passwordSteps, tokenSteps } from "./lib/token-guide.mjs";
import { declaredPasswords, passwordSecretNames } from "./lib/passwords.mjs";
import { standDownIfHostGoverned } from "./lib/governance.mjs";

const OWNED = ["github-pat", "ado-pat", "jira-token"];

function readDecl(root) {
  try {
    return JSON.parse(readFileSync(join(root, ".claude", "vc-secrets.local.json"), "utf8"));
  } catch {
    return null;
  }
}

/** The secrets this project declared: its token axes', and (option B) every env's passwords. */
function declaredSecrets(root) {
  const d = readDecl(root);
  return [...Object.keys(d?.secrets || {}).filter((n) => OWNED.includes(n)), ...passwordSecretNames(declaredPasswords(d))];
}

function main() {
  const argv = process.argv.slice(2);
  const root = outputRoot();
  standDownIfHostGoverned(root, "check-secrets skipped: no vc-secrets on a host-governed project", { json: true });
  let doctor = runDoctor({ cwd: root });
  let installed = null;
  if (!doctor.available && argv.includes("--preflight") && !process.env.VC_SECRETS) {
    // Not there yet: put it at the default path. A SET VC_SECRETS naming a missing file is reported
    // below instead — someone chose that path, and installing elsewhere would hide the mistake.
    installed = installVcSecretsShim();
    if (installed.ok) doctor = runDoctor({ cwd: root, shim: installed.path });
  }
  const shim = doctor.shim;
  const q = JSON.stringify(shim || "<VC_SECRETS>");
  if (!doctor.available) {
    console.log(JSON.stringify({
      ready: false, installed: false,
      reason: process.env.VC_SECRETS
        ? `VC_SECRETS points at a missing file (${process.env.VC_SECRETS})`
        : installed && !installed.ok ? installed.reason : "the vc-secrets shim is not installed",
      next: process.env.VC_SECRETS
        ? ["remove or correct VC_SECRETS (it is set outside this project's .claude/settings.local.json, or points at a deleted shim)", "restart Claude Code, then re-run /project-init"]
        : ["fix the reason above, then re-run /project-init"],
    }, null, 2));
    process.exit(2);
  }
  if (argv.includes("--steps")) {
    // The token block of the §3 pause, relayed verbatim: per declared token, what / why / where and
    // the exact `set` command. Plain text, not JSON — it is shown to the operator as is.
    const lines = [...tokenSteps({ secrets: declaredSecrets(root), vcSecrets: shim }), ...passwordSteps({ passwords: declaredPasswords(readDecl(root)), vcSecrets: shim })];
    process.stdout.write(lines.length ? `${lines.join("\n")}\n` : "(no token to store — every axis uses a session login)\n");
    return;
  }
  const parsed = parseDoctor(doctor.text);
  if (argv.includes("--preflight")) {
    // Installed and runnable. A missing declaration is the normal state before onboarding writes one.
    console.log(JSON.stringify({ ready: true, installed: true, shim, shimState: installed?.ok ? installed.state : "present", doctorExit: doctor.code }, null, 2));
    return;
  }
  const at = argv.indexOf("--secrets");
  const needed = at >= 0 ? String(argv[at + 1] || "").split(",").map((s) => s.trim()).filter(Boolean) : declaredSecrets(root);
  const v = secretsVerdict(parsed, needed);
  const next = [];
  if (v.trustNeeded) next.push(`node ${q} trust`);
  for (const n of v.missing) next.push(`node ${q} set ${n}`);
  const local = join(root, ".claude", "vc-secrets.local.json");
  console.log(JSON.stringify({
    ready: v.ready,
    installed: true,
    secrets: needed,
    stored: parsed.resolvable.filter((n) => needed.includes(n)),
    missing: v.missing,
    trustNeeded: v.trustNeeded,
    problems: v.problems,
    declaration: existsSync(local) ? local : null,
    next,
  }, null, 2));
  process.exit(v.ready ? 0 : 1);
}

main();
