/**
 * skills/project-init/lib/passwords.mjs — test-user passwords in vc-secrets: the names (option B).
 *
 * Two ways a project keeps the passwords its agents log in with:
 *
 *   A (file)        `.env.local` holds `ADMIN_PASSWORD_<ENV>` …; sync-browser-secrets.mjs generates
 *                   `.env.playwright.local` from it, which gen-mcp passes to every Playwright lane as
 *                   `--secrets`. Two files at rest.
 *   B (vc-secrets)  no password in any file. Each one is a vc-secrets `local` secret, one per name per
 *                   environment, and reaches a process only through a declaration:
 *                     - server `playwright-<lane>.<env>` — the lane's Playwright MCP, run in-process by
 *                       bridge/playwright-mcp.mjs with the passwords in memory (`config.secrets`);
 *                       `.mcp.json` says `node ${VC_RUN} playwright <lane>`, and the bridge picks the
 *                       server of the CURRENT env (TEST_ENV);
 *                     - task `vc-init-onboard.<env>` — the onboarding scripts that log in over the API
 *                       (verify-access, discover-repos), with the token axes' secrets as before.
 *
 * Why one secret per environment and one launchable per environment: vc-secrets refuses a launch whose
 * referenced secret is not stored, so a declaration that bound every env's passwords at once would take
 * the browser down for all of them the moment one new env is declared and not yet filled. Per env, an
 * unfilled env breaks only itself, and switching TEST_ENV changes which declaration runs — not the
 * declaration — so it asks for no new `vc-secrets trust`. Declaring an env (/project-init, --add-env) does.
 *
 * The declaration file is the record of mode B: it is on exactly when a `vc-init-onboard.<env>` task is
 * declared, and that task's env names the passwords of that env. Nothing else stores the list.
 *
 * Node built-ins only: bridge/run.mjs and bridge/playwright-mcp.mjs import this.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Passwords every environment has; others (`MULTI_ORG_USER_PASSWORD`, …) are added by name. */
export const ALWAYS_PASSWORDS = Object.freeze(["ADMIN_PASSWORD", "USER_PASSWORD"]);

/** A password env name: upper snake case ending in PASSWORD, never token-shaped. */
export const PASSWORD_NAME_RE = /^[A-Z][A-Z0-9_]*PASSWORD$/;
const TOKEN_SHAPED = /TOKEN|API|KEY|SECRET|PAT\b|_PAT_/;
export const isPasswordName = (n) => PASSWORD_NAME_RE.test(String(n)) && !TOKEN_SHAPED.test(String(n));

/** An environment name as /project-init writes it ([a-z0-9_]+). */
export const ENV_NAME_RE = /^[a-z0-9_]+$/;

const kebab = (s) => String(s).toLowerCase().replace(/_/g, "-");

/** vc-secrets name of one password in one env: ADMIN_PASSWORD + vcptcore_qa1 → admin-password-vcptcore-qa1. */
export function passwordSecret(name, env) {
  if (!isPasswordName(name)) throw new Error(`not a password name: ${JSON.stringify(name)}`);
  if (!ENV_NAME_RE.test(String(env))) throw new Error(`not an environment name: ${JSON.stringify(env)}`);
  return `${kebab(name)}-${kebab(env)}`;
}

/** The onboarding task that carries an env's passwords. */
export const onboardTask = (env) => `vc-init-onboard.${env}`;

/** The Playwright lane server of an env. */
export const laneServer = (lane, env) => `playwright-${lane}.${env}`;

const ONBOARD_ENV_TASK_RE = /^vc-init-onboard\.([a-z0-9_]+)$/;
const LANE_SERVER_RE = /^playwright-([a-z0-9]+)\.([a-z0-9_]+)$/;

/** Is `name` a task or server this module names? */
export const isPasswordLaunchable = (name) => ONBOARD_ENV_TASK_RE.test(name) || LANE_SERVER_RE.test(name);

/**
 * The passwords a declaration file keeps in vc-secrets: { <env>: [<NAME>, …] }, read from its
 * `vc-init-onboard.<env>` tasks. Empty object ⇒ mode A. Pure.
 */
export function declaredPasswords(decl) {
  const out = {};
  for (const [name, task] of Object.entries(decl?.tasks || {})) {
    const m = ONBOARD_ENV_TASK_RE.exec(name);
    if (!m) continue;
    out[m[1]] = Object.keys(task?.env || {}).filter(isPasswordName).sort();
  }
  return out;
}

/** The lane servers a declaration file carries: { <lane>: { command, args } } (any env's copy — they share argv). */
export function declaredLanes(decl) {
  const out = {};
  for (const [name, server] of Object.entries(decl?.servers || {})) {
    const m = LANE_SERVER_RE.exec(name);
    if (m && !out[m[1]]) out[m[1]] = { command: server.command, args: server.args };
  }
  return out;
}

/** Every password secret name a { env: names } map declares. Pure. */
export function passwordSecretNames(byEnv) {
  return Object.entries(byEnv).flatMap(([env, names]) => names.map((n) => passwordSecret(n, env))).sort();
}

/**
 * The environment a launch is for: TEST_ENV, else `.env.test-env` in `dir` (the same precedence as
 * scripts/lib/resolve-test-env.js, read without dotenv — the bridge imports this and must not depend
 * on the plugin's npm install), else the only env the declaration has, else "vcst" (the repo default).
 */
export function currentEnv(dir, envs = [], { env = process.env, read = (p) => readFileSync(p, "utf8") } = {}) {
  const set = String(env.TEST_ENV || "").trim();
  if (set) return set;
  try {
    const m = /^\s*TEST_ENV\s*=\s*["']?([^"'\s#]+)/m.exec(read(join(dir, ".env.test-env")));
    if (m) return m[1];
  } catch {
    /* no .env.test-env */
  }
  return envs.length === 1 ? envs[0] : "vcst";
}

/** `ADMIN_PASSWORD_VCST` → { name: "ADMIN_PASSWORD", env: "vcst" } when `env` is one of `envs`, else null. Pure. */
export function splitSuffixedKey(key, envs) {
  for (const env of envs) {
    const suffix = `_${env.toUpperCase()}`;
    if (key.endsWith(suffix) && isPasswordName(key.slice(0, -suffix.length))) return { name: key.slice(0, -suffix.length), env };
  }
  return null;
}
