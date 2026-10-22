// scripts/deploy/lib/env.ts — layered .env loading + the deploy coordinates of an env (vc-deploy-dev repo, branch, paths, BACK_URL).
// Shared by `vc-deploy.ts pr` and `vc-deploy.ts upgrade`.

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { parse as parseDotenv } from 'dotenv';
import { findEnv, ownEnv, readMaster, usesMaster } from '../../lib/env-layers.mjs';
import { layeredEnv } from '../../lib/env-core.js';
import { loadEnvFor } from '../../lib/load-env.mjs';

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const OWNER = 'VirtoCommerce';
const DEPLOY_REPO_DEFAULT = 'VirtoCommerce/vc-deploy-dev';
const PACKAGES_PATH_DEFAULT = 'backend/packages.json';
const THEME_PATH_DEFAULT = 'theme/artifact.json';
const STORYBOOK_PATH_DEFAULT = 'storybook/image.json';
// vcst / vcptcore are the two QA envs; their vc-deploy-dev branches carry a -qa suffix the env name
// doesn't (there is no bare `vcst` or `vcptcore` branch), and neither .env carries a DEPLOY_* block.
// Every other env's branch equals the env name (underscores → hyphens) unless .env.<env> overrides it.
const BRANCH_MAP: Record<string, string> = { vcst: 'vcst-qa', vcptcore: 'vcptcore-qa' };

export interface EnvCoords {
  env: string; deployOwner: string; deployRepo: string; branch: string;
  packagesPath: string; themePath: string; storybookPath: string; backUrl: string; admin: string; password: string;
}

/**
 * Layered load with the SAME precedence as config.js (scripts/lib/env-layers.mjs, the one every loader applies): a
 * LATER file wins over an earlier one, so `.env.local` (per-developer secrets + the identities they pair with) beats a
 * committed `.env.<env>`, and the env's QA_ENV_PATH files beat both. First-wins here silently mismatched a committed
 * `.env.<env>` JIRA_EMAIL against the `.env.local` JIRA_API_TOKEN of whoever ran it → Jira 404 on a ticket that
 * exists. An AMBIENT value (real process env — an inline `VAR=x npm run …`, or CI) still outranks every file, except
 * an UNEXPANDED placeholder (`${env:ADMIN}`), which counts as unset — env-layers.mjs `layered` (#503).
 */
export function loadEnvFiles(testEnv: string): void {
  loadEnvFor(testEnv, { root: REPO_ROOT, ambientWins: true });
}
export function readEnvFile(path: string): Record<string, string> {
  return existsSync(path) ? parseDotenv(readFileSync(path)) : {};
}

/** The env's file name: stable/regression live in .env.vcptcore_<key>, everything else in .env.<env>. */
function envFileName(env: string): string {
  const vcpt = /^vcptcore[_-](stable|regression)$/i.exec(env);
  return vcpt ? `vcptcore_${vcpt[1].toLowerCase()}` : env;
}

/**
 * The .env file that describes `env`: its own in a QA_ENV_PATH folder (a ticket's stand, filled with `ticket` or the
 * run's ticket — scripts/lib/env-layers.mjs), else the project root's. A path that does not exist means no such env.
 */
export function envFilePath(env: string, ticket?: string | null): string {
  const name = envFileName(env);
  return findEnv(name, { root: REPO_ROOT, ticket }) ?? resolve(REPO_ROOT, `.env.${name}`);
}

/**
 * A BACK_URL on this machine: a local stand, which nothing deploys to. localhost, a loopback or unspecified address
 * in IPv4 or IPv6 form — IPv4-mapped too, which the URL parser writes in hex (`[::ffff:127.0.0.1]` → `::ffff:7f00:1`)
 * — and Docker's names for the host (`host.docker.internal`, any `*.docker.internal`).
 */
export function isLocalUrl(url: string): boolean {
  let host: string;
  try { host = new URL(url).hostname.replace(/^\[|\]$/g, ''); } catch { return false; }
  return host === 'localhost' || host.endsWith('.localhost') || /^127\./.test(host) || host === '0.0.0.0'
    || host === '::1' || host === '::' || /^::ffff:(7f[0-9a-f]{2}:[0-9a-f]{1,4}|0:0)$/.test(host)
    || host.endsWith('.docker.internal');
}

/** What says where an env is deployed and probed, and as whom. */
const DEPLOY_KEYS = ['DEPLOY_REPO', 'DEPLOY_BRANCH', 'DEPLOY_PACKAGES_PATH', 'DEPLOY_THEME_PATH', 'DEPLOY_STORYBOOK_PATH', 'BACK_URL', 'ADMIN'];

/**
 * Resolve deploy + connection coords for an env. The env's own files' DEPLOY_* win; else convention. An env the
 * project root defines is read from the root's files only: a ticket folder's override of a shared env is for that
 * ticket's runs, never for which branch a deploy changes or where it verifies (a changed key is named and ignored).
 * An env only QA_ENV_PATH defines is read from its folders; `ticket` fills `<ticket>` (default: the run's ticket).
 */
export function resolveEnvCoords(env: string, passwordOverride?: string, ticket?: string | null): EnvCoords {
  const name = envFileName(env);
  const merged = ownEnv(name, { root: REPO_ROOT, ticket });
  const rootFile = resolve(REPO_ROOT, `.env.${name}`);
  const own = existsSync(rootFile) ? { vars: readEnvFile(rootFile), passwords: readEnvFile(resolve(REPO_ROOT, `.env.playwright.${name}`)) } : merged;
  const overridden = own === merged ? [] : DEPLOY_KEYS.filter((k) => merged.vars[k] !== undefined && merged.vars[k] !== own.vars[k]);
  if (overridden.length) console.warn(`[deploy] a QA_ENV_PATH file sets ${overridden.join(', ')} for ${name}, a project env: ignored — a deploy changes the stand the project's .env.${name} names. A ticket's own stand needs its own env name.`);
  const e = own.vars;
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
  // A master stand (PASSWORDS=master in its own files) signs every test account in with the master password
  // (.env.playwright.master) — the loader's decision, so a global PASSWORDS never counts.
  const master = usesMaster(layeredEnv(name, { root: REPO_ROOT, ticket })) ? readMaster({ root: REPO_ROOT }).value : null;
  const password = passwordOverride
    || master
    || local[`ADMIN_PASSWORD_${envKey}`]
    || own.passwords.ADMIN_PASSWORD
    || local[`ADMIN_PASSWORD_VCPTCORE_${suffix}`] || local[`ADMIN_PASSWORD_${suffix}`]
    || local.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || 'Password1';
  return {
    env, deployOwner, deployRepo, branch,
    packagesPath: e.DEPLOY_PACKAGES_PATH || PACKAGES_PATH_DEFAULT,
    themePath: e.DEPLOY_THEME_PATH || THEME_PATH_DEFAULT,
    storybookPath: e.DEPLOY_STORYBOOK_PATH || STORYBOOK_PATH_DEFAULT,
    backUrl: (e.BACK_URL || process.env.BACK_URL || '').replace(/\/$/, ''),
    admin: e.ADMIN || process.env.ADMIN || 'admin', password,
  };
}
