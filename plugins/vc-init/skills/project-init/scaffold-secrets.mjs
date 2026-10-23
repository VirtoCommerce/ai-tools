#!/usr/bin/env node
/**
 * skills/project-init/scaffold-secrets.mjs
 *
 * Writes a COMMENTED `.env.local` TEMPLATE (Bucket #3) after the /project-init interview —
 * PASSWORDS ONLY since VCST-6402. The operator fills the placeholders this script emits, each
 * preceded by a comment that says WHAT it is, WHY it's needed, and WHERE to get it.
 *
 *   - ADMIN_PASSWORD / USER_PASSWORD — always (app test-user creds; per-env → the `_<ENV>` suffix
 *     config.js promotes to the base name when TEST_ENV matches). Test-user passwords stay here
 *     (VCST-6346 owns moving them).
 *
 * TOKENS ARE NOT WRITTEN HERE ANY MORE. GITHUB_FIX_BUGS_TOKEN / ADO_PAT / JIRA_API_TOKEN live in
 * vc-secrets: write-secrets-decl.mjs declares one secret per PAT axis, the operator stores each with
 * `node "$VC_SECRETS" set <name>` at a hidden prompt, and a process receives it only through the
 * $VC_RUN bridge. This script prints which tokens that is (from the same auth answers) so its output
 * and the pause step agree; the what/why/where texts live in lib/token-guide.mjs. The postman and
 * context7 API keys are gone with their MCP servers (VCST-6402 D2).
 *
 * Auth axes (each maps from its own interview question) — they only decide the token report:
 *   --ado-auth    pat | az-login   (Azure Boards + Azure Repos)
 *   --github-auth pat | gh-cli     (client GitHub repos and/or the platform upstream)
 *   --jira-auth   pat | token | oauth   (Jira; `token` is the old spelling of pat)
 *
 * --admin-passwords / --user-passwords  vc-secrets | env-local  (§2d, lib/passwords.mjs) where each role's
 *   password lives. A vc-secrets role gets no placeholder here — the report names the secret
 *   write-secrets-decl.mjs declares instead. Omitted ⇒ what the project's declaration already keeps in
 *   vc-secrets (so --add-env needs no flag), else .env.local.
 *
 * IDEMPOTENT: appends only the placeholders not already present in `.env.local` (a line matching
 * `^KEY=`), so a re-run never clobbers values the operator has already filled.
 *
 * Usage:
 *   node skills/project-init/scaffold-secrets.mjs --env myqa --tracker jira --jira-auth pat  *     --client-vcs github --github-auth pat --print
 *
 * Flags: --out <path> (default .env.local), --print (list the keys emitted).
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolveOutPath, outputRoot } from "./lib/paths.mjs";
// Protect BEFORE creating. `.env.local` is where the operator pastes the test-user passwords, and the
// flow then PAUSES while they do it. gen-mcp's .gitignore block only ran at §7, so that whole window — and
// every onboarding that aborted before §7 — left the densest secret file unignored (review #4).
import { ensureProjectIgnores } from "./lib/gitignore.mjs";
import { PASSWORD_GUIDE, TOKEN_GUIDE } from "./lib/token-guide.mjs";
import { LOCAL_HEADER } from "./lib/project-env.mjs";
import { ROLES, ROLE_PASSWORD, declaredPasswords, passwordSecret, vcSecretsRoles } from "./lib/passwords.mjs";
import { join } from "node:path";
import { emitObservations } from "./lib/diag-obs.mjs";
import { isHostGoverned } from "./lib/governance.mjs";

function parseArgs(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    const k = argv[i].slice(2);
    const n = argv[i + 1];
    if (n === undefined || n.startsWith("--")) a[k] = true;
    else { a[k] = n; i++; }
  }
  return a;
}

function fail(msg) { console.error(`[scaffold-secrets] ${msg}`); process.exit(1); }

// Secret catalog: what / why / where + whether it is a per-env credential.
const CATALOG = {
  ADMIN_PASSWORD: { perEnv: true, include: (o) => !o.hostGoverned && (o.inVcSecrets !== true || !o.vcRoles.includes("admin")), ...PASSWORD_GUIDE.ADMIN_PASSWORD },
  USER_PASSWORD: { perEnv: true, include: (o) => !o.hostGoverned && (o.inVcSecrets !== true || !o.vcRoles.includes("user")), ...PASSWORD_GUIDE.USER_PASSWORD },
};

function main() {
  const args = parseArgs(process.argv.slice(2));
  const env = args.env;
  if (!env || typeof env !== "string") fail('missing --env <name> (needed for the per-env credential suffix).');
  if (!/^[a-z0-9_]+$/.test(env)) fail(`invalid --env "${env}". Must match [a-z0-9_]+ (underscores, no hyphens).`);

  const vcsAuth = args["vcs-auth"] || "pat";        // legacy single flag (fallback)
  const opts = {
    tracker: args.tracker || "jira",
    jiraAuth: args["jira-auth"] || "pat",           // pat (token) | oauth
    clientVcs: args["client-vcs"] || "github",
    adoAuth: args["ado-auth"] || (vcsAuth === "az-login" ? "az-login" : "pat"),   // pat | az-login
    githubAuth: args["github-auth"] || (vcsAuth === "gh-cli" ? "gh-cli" : "pat"), // pat | gh-cli
  };
  // Which tokens this topology needs — reported, never written (they go to vc-secrets).
  const patAxes = {
    github: opts.githubAuth === "pat",
    ado: (opts.tracker === "azure" || opts.clientVcs === "azure-repos") && opts.adoAuth === "pat",
    jira: opts.tracker === "jira" && (opts.jiraAuth === "pat" || opts.jiraAuth === "token"),
  };
  // A host-governed project (VCST-6402 step 8) has no token of ours at all — the host's wrapper owns them.
  let hostGoverned = false;
  try {
    hostGoverned = isHostGoverned(JSON.parse(readFileSync(resolveOutPath(undefined, "project-profile.json"), "utf-8")));
  } catch {
    /* no profile yet — not governed */
  }
  const tokens = hostGoverned ? [] : Object.values(TOKEN_GUIDE).filter((g) => patAxes[g.axis]).map((g) => g.secret);

  // Where each role's password lives: the flags, else what the declaration already keeps in vc-secrets.
  let declared = [];
  try {
    declared = vcSecretsRoles(declaredPasswords(JSON.parse(readFileSync(join(outputRoot(), ".claude", "vc-secrets.local.json"), "utf8"))));
  } catch {
    /* no declaration yet — every role defaults to .env.local */
  }
  const vcRoles = [];
  for (const role of ROLES) {
    const flag = args[`${role}-passwords`];
    if (flag !== undefined && !["vc-secrets", "env-local"].includes(flag)) fail(`--${role}-passwords must be vc-secrets or env-local, got "${flag}"`);
    // A back-office (admin) password never goes to a file: only a storefront user's may (§2d). An admin
    // already kept in .env.local by an older onboarding still works — only a NEW choice of a file is refused.
    if (role === "admin" && flag === "env-local") fail("--admin-passwords env-local is not offered: an admin password goes to vc-secrets only (--admin-passwords vc-secrets)");
    if (!hostGoverned && (flag === "vc-secrets" || (flag === undefined && declared.includes(role)))) vcRoles.push(role);
  }
  // A host-governed project keeps no password in a file of ours: the host's wrapper holds them
  // (add-user hands out its slots), or the operator signs in by hand.
  opts.hostGoverned = hostGoverned;
  opts.inVcSecrets = vcRoles.length > 0;
  opts.vcRoles = vcRoles;
  if (vcRoles.length) {
    console.log(`[scaffold-secrets] ${vcRoles.join(" + ")} passwords go to vc-secrets, not .env.local: ${vcRoles.map((r) => passwordSecret(ROLE_PASSWORD[r], env)).join(", ")} (declared by write-secrets-decl.mjs --password-envs ${env} --password-roles ${vcRoles.join(",")})`);
  }
  const SUFFIX = `_${env.toUpperCase()}`;
  // Default output → the deployment project (process.cwd()); .env.local is loaded from
  // cwd by config.js. --out still overrides.
  const outPath = resolveOutPath(args.out, ".env.local");
  const existing = existsSync(outPath) ? readFileSync(outPath, "utf-8") : "";

  const emitted = [];
  const skipped = [];
  const blocks = [];
  for (const [key, meta] of Object.entries(CATALOG)) {
    if (!meta.include(opts)) continue;
    const name = meta.perEnv ? `${key}${SUFFIX}` : key;
    const present = new RegExp(`^\\s*${name}=`, "m").test(existing);
    if (present) { skipped.push(name); continue; }
    blocks.push(
      `# ${key} — ${meta.what}\n` +
      `#   Why:   ${meta.why}\n` +
      `#   Where: ${meta.where}\n` +
      (meta.optional ? `#   Optional: leave blank to skip — the MCP server above just stays disabled; no plugin requires it.\n` : ``) +
      (meta.perEnv ? `#   (per-env: config.js promotes ${name} → ${key} when TEST_ENV=${env})\n` : ``) +
      `${name}=\n`
    );
    emitted.push(name);
  }

  if (blocks.length) {
    const header = existing
      ? `\n# === /project-init secret placeholders (${env}) — fill in the values below ===\n`
      : LOCAL_HEADER;
    const body = header + blocks.join("\n");
    const ignored = ensureProjectIgnores(outputRoot());
    if (ignored.length) console.log(`[scaffold-secrets] .gitignore += ${ignored.join(", ")}`);
    writeFileSync(outPath, existing + body);
  }

  console.log(`[scaffold-secrets] ${blocks.length ? "wrote" : "no new placeholders for"} ${outPath}`);
  if (emitted.length) console.log(`[scaffold-secrets] to fill: ${emitted.join(", ")}`);
  if (skipped.length) console.log(`[scaffold-secrets] already present (kept): ${skipped.join(", ")}`);
  if (args.print && emitted.length) console.log(`[scaffold-secrets] placeholders emitted: ${emitted.length}`);
  if (tokens.length) console.log(`[scaffold-secrets] tokens go to vc-secrets, not .env.local: ${tokens.join(", ")}`);
  const legacy = Object.keys(TOKEN_GUIDE).filter((k) => new RegExp(`^\\s*${k}(_[A-Z0-9_]+)?=\\S`, "m").test(existing));
  if (legacy.length) {
    console.log(`[scaffold-secrets] ⚠ ${outPath} still holds ${legacy.join(", ")} in plaintext — run /project-init --check to move it into vc-secrets and strip it`);
    emitObservations([{ class: "self_reported_warn", subject: "plaintext_token_in_env_local", code: "NONE", evidence: { snippet: `${legacy.length} token key(s) still in .env.local` } }], { skill: "project-init" });
  }
}

main();
