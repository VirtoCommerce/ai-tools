// scripts/deploy/lib/env.ts — layered .env loading + the deploy coordinates of an env (vc-deploy-dev repo, branch, paths, BACK_URL).
// Shared by `vc-deploy.ts pr` and `vc-deploy.ts upgrade`.

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { basename, dirname, resolve } from 'node:path';
import { parse as parseDotenv } from 'dotenv';

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const OWNER = 'VirtoCommerce';
const DEPLOY_REPO_DEFAULT = 'VirtoCommerce/vc-deploy-dev';
const PACKAGES_PATH_DEFAULT = 'backend/packages.json';
const THEME_PATH_DEFAULT = 'theme/artifact.json';
// vcst / vcptcore are the two QA envs; their vc-deploy-dev branches carry a -qa suffix the env name
// doesn't (there is no bare `vcst` or `vcptcore` branch), and neither .env carries a DEPLOY_* block.
// Every other env's branch equals the env name (underscores → hyphens) unless .env.<env> overrides it.
const BRANCH_MAP: Record<string, string> = { vcst: 'vcst-qa', vcptcore: 'vcptcore-qa' };

export interface EnvCoords {
  env: string; deployOwner: string; deployRepo: string; branch: string;
  packagesPath: string; themePath: string; backUrl: string; admin: string; password: string;
}

/**
 * Layered load with the SAME precedence as config.js (`override: true`): a LATER file wins over
 * an earlier one, so `.env.local` (per-developer secrets + the identities they pair with) beats a
 * committed `.env.<env>`. First-wins here silently mismatched a committed `.env.<env>` JIRA_EMAIL
 * against the `.env.local` JIRA_API_TOKEN of whoever ran it → Jira 404 on a ticket that exists.
 * An AMBIENT value (real process env — an inline `VAR=x npm run …`, or CI) still outranks every
 * file, which is why this tracks file-supplied keys instead of using dotenv's own `override`.
 */
export function loadEnvFiles(testEnv: string): void {
  const fromFile = new Set<string>();
  for (const f of ['.env.defaults', `.env.${testEnv}`, '.env.local']) {
    const p = resolve(REPO_ROOT, f);
    if (!existsSync(p)) continue;
    for (const [k, v] of Object.entries(parseDotenv(readFileSync(p)))) {
      if (process.env[k] === undefined || fromFile.has(k)) { process.env[k] = v; fromFile.add(k); }
    }
  }
}
export function readEnvFile(path: string): Record<string, string> {
  return existsSync(path) ? parseDotenv(readFileSync(path)) : {};
}

/** The .env file that describes `env`: stable/regression live in .env.vcptcore_<key>, everything else in .env.<env>. */
export function envFilePath(env: string): string {
  const vcpt = /^vcptcore[_-](stable|regression)$/i.exec(env);
  return resolve(REPO_ROOT, vcpt ? `.env.vcptcore_${vcpt[1].toLowerCase()}` : `.env.${env}`);
}

/** The env's gitignored password file, next to its .env file: `.env.playwright.<env>` (also its Playwright MCP --secrets file). */
function envSecretsPath(env: string): string {
  const envFile = envFilePath(env);
  return resolve(dirname(envFile), basename(envFile).replace(/^\.env\./, '.env.playwright.'));
}

/** Resolve deploy + connection coords for an env. `.env.<env>` DEPLOY_* wins; else convention. */
export function resolveEnvCoords(env: string, passwordOverride?: string): EnvCoords {
  const e = readEnvFile(envFilePath(env));
  const local = readEnvFile(resolve(REPO_ROOT, '.env.local'));
  const repoSpec = e.DEPLOY_REPO || DEPLOY_REPO_DEFAULT;
  const [deployOwner, deployRepo] = repoSpec.includes('/') ? repoSpec.split('/') : [OWNER, repoSpec];
  const branch = e.DEPLOY_BRANCH || BRANCH_MAP[env] || env.replace(/_/g, '-');
  // Per-env secret lookup, in config.js's own order: a `.env.local` pin in its promotion form FIRST
  // (`ADMIN_PASSWORD_${TEST_ENV}` upper-cased), then the env's own password file. Without that file a
  // machine that keeps env passwords only there fell through to `Password1`; without the promotion
  // form a plain `vcptcore` stripped to "" in the suffix forms below (they only ever produce
  // STABLE/REGRESSION) and fell through to the generic ADMIN_PASSWORD. Either way: wrong account →
  // no admin token → --verify's live column reads "unavailable" instead of the version.
  const envKey = env.toUpperCase().replace(/[^A-Z0-9]/g, '_');
  const suffix = env.replace(/^vcptcore[_-]?/, '').replace(/[^a-z0-9]/gi, '').toUpperCase();
  const password = passwordOverride
    || local[`ADMIN_PASSWORD_${envKey}`]
    || readEnvFile(envSecretsPath(env)).ADMIN_PASSWORD
    || local[`ADMIN_PASSWORD_VCPTCORE_${suffix}`] || local[`ADMIN_PASSWORD_${suffix}`]
    || local.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || 'Password1';
  return {
    env, deployOwner, deployRepo, branch,
    packagesPath: e.DEPLOY_PACKAGES_PATH || PACKAGES_PATH_DEFAULT,
    themePath: e.DEPLOY_THEME_PATH || THEME_PATH_DEFAULT,
    backUrl: (e.BACK_URL || process.env.BACK_URL || '').replace(/\/$/, ''),
    admin: e.ADMIN || process.env.ADMIN || 'admin', password,
  };
}
