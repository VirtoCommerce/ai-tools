#!/usr/bin/env node
/**
 * skills/project-init/scaffold-secrets.mjs
 *
 * Scaffolds the TEST ACCOUNTS of one environment in the test-account store, `test-accounts.local.json`
 * (gitignored; scripts/lib/test-accounts.mjs), after the /project-init interview: under `envs.<env>.accounts`
 *
 *   ADMIN  { login: <the env's ADMIN from a .env file, else "admin">, password: "", vars: { login: ["ADMIN"] } }
 *   USER   { login: <the env's USER_EMAIL from a .env file, else "">, password: "" }
 *
 * The operator fills the empty fields in their editor; the loader exposes them as ADMIN / ADMIN_PASSWORD and
 * USER_EMAIL / USER_PASSWORD, and the Playwright lanes read them at start. A field the env already has (in its own
 * section or the top level) is never overwritten, so a re-run changes nothing. Prints field NAMES only.
 *
 * --admin-passwords / --user-passwords  store | vc-secrets  (§2d, lib/passwords.mjs) where each role's password
 *   lives. `store` is the default; `env-local` is accepted as its old spelling. A vc-secrets role (option B) gets its
 *   login in the store and NO password field — the report names the secret write-secrets-decl.mjs declares
 *   instead. Omitted ⇒ what the project's declaration already keeps in vc-secrets (so --add-env needs no flag),
 *   else the store.
 *
 * TOKENS ARE NOT WRITTEN HERE. GITHUB_FIX_BUGS_TOKEN / ADO_PAT / JIRA_API_TOKEN live in vc-secrets:
 * write-secrets-decl.mjs declares one secret per PAT axis, the operator stores each with
 * `node "$VC_SECRETS" set <name>` at a hidden prompt, and a process receives it only through the $VC_RUN bridge.
 * This script prints which tokens that is (from the same auth answers) so its output and the pause step agree;
 * the what/why/where texts live in lib/token-guide.mjs.
 *
 * Auth axes (each maps from its own interview question) — they only decide the token report:
 *   --ado-auth    pat | az-login   (Azure Boards + Azure Repos)
 *   --github-auth pat | gh-cli     (client GitHub repos and/or the platform upstream)
 *   --jira-auth   pat | token | oauth   (Jira; `token` is the old spelling of pat)
 *
 * A host-governed project scaffolds no account: its passwords are the host's (add-user takes its slots).
 *
 * Usage:
 *   node skills/project-init/scaffold-secrets.mjs --env myqa --tracker jira --jira-auth pat \
 *     --client-vcs github --github-auth pat --print
 *
 * Flags: --print (also the what/where line of each password still to fill).
 */
import { readFileSync, existsSync } from "fs";
import { join } from "node:path";
import { resolveOutPath, outputRoot } from "./lib/paths.mjs";
// Protect BEFORE creating: the store is where the operator types the passwords, and the flow then PAUSES while
// they do it (review #4 — gen-mcp's .gitignore block used to run only at §7).
import { ensureProjectIgnores } from "./lib/gitignore.mjs";
import { PASSWORD_GUIDE, TOKEN_GUIDE } from "./lib/token-guide.mjs";
import { ROLES, ROLE_PASSWORD, declaredPasswords, passwordSecret, vcSecretsRoles } from "./lib/passwords.mjs";
import { STORE_FILE, fileValue, fillAccount, readStore, writeStore } from "./lib/store-accounts.mjs";
import { envView } from "../../scripts/lib/test-accounts.mjs";
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

/** Each role's built-in account: its key, its login variable and the login a fresh env starts with. */
const ROLE_ACCOUNT = {
  admin: { key: "ADMIN", loginVar: "ADMIN", defaultLogin: "admin" },
  user: { key: "USER", loginVar: "USER_EMAIL", defaultLogin: "" },
};

function main() {
  const args = parseArgs(process.argv.slice(2));
  const env = args.env;
  if (!env || typeof env !== "string") fail("missing --env <name> (the store keeps one section per environment).");
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
  // A host-governed project (VCST-6402 step 8) has no token and no password of ours — the host owns them.
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
    /* no declaration yet — every role defaults to the store */
  }
  const vcRoles = [];
  for (const role of ROLES) {
    const flag = args[`${role}-passwords`];
    if (flag !== undefined && !["store", "vc-secrets", "env-local"].includes(flag)) fail(`--${role}-passwords must be store or vc-secrets, got "${flag}"`);
    if (!hostGoverned && (flag === "vc-secrets" || (flag === undefined && declared.includes(role)))) vcRoles.push(role);
  }
  if (vcRoles.length) {
    console.log(`[scaffold-secrets] ${vcRoles.join(" + ")} passwords go to vc-secrets, not ${STORE_FILE}: ${vcRoles.map((r) => passwordSecret(ROLE_PASSWORD[r], env)).join(", ")} (declared by write-secrets-decl.mjs --password-envs ${env} --password-roles ${vcRoles.join(",")})`);
  }

  const root = outputRoot();
  if (hostGoverned) {
    console.log("[scaffold-secrets] host-governed project: no test account of ours — the host keeps the passwords (add-user takes its slots)");
  } else {
    let store;
    try { store = readStore(root); } catch (e) { fail(e.message); }
    const set = [];
    for (const role of ROLES) {
      const { key, loginVar, defaultLogin } = ROLE_ACCOUNT[role];
      // The login an older onboarding wrote into .env.<env> (or .env.local) is this account's login.
      const login = fileValue(root, env, loginVar) || defaultLogin;
      const fields = vcRoles.includes(role) ? { login, loginVar } : { login, password: "", loginVar };
      for (const f of fillAccount(store, env, key, fields)) set.push(`${key}.${f}`);
    }
    if (set.length) {
      const ignored = ensureProjectIgnores(root);
      if (ignored.length) console.log(`[scaffold-secrets] .gitignore += ${ignored.join(", ")}`);
      try { writeStore(root, store); } catch (e) { fail(e.message); }
    }
    // What is still empty for this env — the operator's to-do, by name.
    const view = envView(store, env).accounts;
    const toFill = [];
    const filled = [];
    for (const role of ROLES) {
      const { key } = ROLE_ACCOUNT[role];
      const a = view[key] ?? {};
      if (!a.login) toFill.push(`${key}.login`);
      if (!vcRoles.includes(role)) (a.password ? filled : toFill).push(`${key}.password`);
    }
    console.log(`[scaffold-secrets] ${set.length ? "wrote" : "nothing new in"} ${join(root, STORE_FILE)} — envs.${env}.accounts: ADMIN, USER${set.length ? ` (set: ${set.join(", ")})` : ""}`);
    if (toFill.length) console.log(`[scaffold-secrets] to fill in ${STORE_FILE} (in your editor, never in chat): ${toFill.map((f) => `envs.${env}.accounts.${f}`).join(", ")}`);
    if (filled.length) console.log(`[scaffold-secrets] already filled (kept): ${filled.join(", ")}`);
    if (args.print) {
      for (const f of toFill.filter((x) => x.endsWith(".password"))) {
        const g = PASSWORD_GUIDE[`${f.split(".")[0]}_PASSWORD`];
        if (g) console.log(`[scaffold-secrets]   ${f} — ${g.what} Where: ${g.where}`);
      }
    }
  }

  if (tokens.length) console.log(`[scaffold-secrets] tokens go to vc-secrets, not .env.local: ${tokens.join(", ")}`);
  const localPath = resolveOutPath(undefined, ".env.local");
  const existing = existsSync(localPath) ? readFileSync(localPath, "utf-8") : "";
  const legacy = Object.keys(TOKEN_GUIDE).filter((k) => new RegExp(`^\\s*${k}(_[A-Z0-9_]+)?=\\S`, "m").test(existing));
  if (legacy.length) {
    console.log(`[scaffold-secrets] ⚠ ${localPath} still holds ${legacy.join(", ")} in plaintext — run /project-init --check to move it into vc-secrets and strip it`);
    emitObservations([{ class: "self_reported_warn", subject: "plaintext_token_in_env_local", code: "NONE", evidence: { snippet: `${legacy.length} token key(s) still in .env.local` } }], { skill: "project-init" });
  }
}

main();
