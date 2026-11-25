// scripts/lib/persona-sets.mjs — per-wave persona sets: each wave of a parallel regression signs in as its own
// clones of the accounts several waves share (Sprint 26-22: USER_DEFAULT was in five of six waves, W6 waited for W3,
// a W2 sign-in failed after another operator reset a shared password).
//
// A set never rewrites a case. It is applied where an account becomes a login, so everything that reads one follows:
//   - the env loader (env-layers.mjs `layered`): a listed store account's login variables (USER_EMAIL, ORG_USER_EMAIL…)
//     carry its clone's login — `{{USER_EMAIL}}` in a case, a seeder keyed on USER_EMAIL, an alias with `email_env`;
//   - the test-data resolver: a listed alias's login fields (`@td(USER_DEFAULT.email)`), hence graphql-auth too.
// A clone belongs to the ACCOUNT, not to the name: its login derives from the original's, so two names for one
// account (TECHFLOW_ADMIN and ORG_USER) get one clone. It has the original's password, organization, roles and store
// (`npm run seed:wave-personas` copies them from the stand), so a browser lane types the same password NAME.
//
// The set comes from QA_PERSONA_SET, else from this Claude Code session's binding (`npm run persona:use -- <set>`),
// which subagents share. Nothing here holds or prints a password.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { accountVars, envView } from './test-accounts.mjs';

export const SETS_FILE = 'test-data/personas/sets.json';
/** Seeders that keep a clone's fixtures apart from the original's (fixtureTag + aliases.<env>.<set>.json). Every other
 *  seeder refuses to run while a set is bound (seed-common.mjs); a helper that is not a seeder runs as usual. */
export const SET_AWARE_SEEDERS = ['seed-order-states.mjs', 'seed-return-orders.mjs'];
const SESSION_DIR = ['.vc-fix', 'session-persona'];

/** `{ accounts, sets }` from test-data/personas/sets.json; empty when the project has none. */
export function loadPersonaSets(root = process.cwd()) {
  const p = join(root, SETS_FILE);
  if (!existsSync(p)) return { accounts: [], sets: [] };
  const j = JSON.parse(readFileSync(p, 'utf8'));
  return { accounts: j.accounts ?? [], sets: j.sets ?? [] };
}

/** This session's binding file, or null outside a Claude Code session. */
export function sessionSetFile(root = process.cwd(), sessionId = process.env.CLAUDE_CODE_SESSION_ID) {
  return sessionId && /^[A-Za-z0-9-]+$/.test(sessionId) ? join(root, ...SESSION_DIR, sessionId) : null;
}

/** `{ set, release?, wave? }` for this process, or null. Throws on a set sets.json does not declare. */
export function activePersonaSet({ root = process.cwd(), ambient = process.env } = {}) {
  if (ambient.QA_PERSONA_SET === 'none') return null; // the originals, whatever the session is bound to (the seeder)
  let bound = ambient.QA_PERSONA_SET ? { set: ambient.QA_PERSONA_SET } : null;
  const file = bound ? null : sessionSetFile(root, ambient.CLAUDE_CODE_SESSION_ID);
  if (file && existsSync(file)) { try { bound = JSON.parse(readFileSync(file, 'utf8')); } catch { bound = null; } }
  if (!bound?.set) return null;
  const defs = loadPersonaSets(root);
  if (!defs.sets.includes(bound.set)) throw new Error(`unknown persona set "${bound.set}" — ${SETS_FILE} declares ${defs.sets.join(', ') || 'none'}`);
  return { ...bound, defs };
}

export function bindPersonaSet(root, set, meta = {}) {
  const file = sessionSetFile(root);
  if (!file) throw new Error('not in a Claude Code session (no CLAUDE_CODE_SESSION_ID): set QA_PERSONA_SET for this process instead');
  mkdirSync(join(root, ...SESSION_DIR), { recursive: true });
  writeFileSync(file, JSON.stringify({ set, ...meta, at: new Date().toISOString() }) + '\n');
  return file;
}
export function clearPersonaSet(root) {
  const file = sessionSetFile(root);
  if (file && existsSync(file)) rmSync(file);
}

/**
 * The suffix a seeder adds to the numbers and names of the fixtures it builds for the active set's clones
 * (AGENT-TEST-ORD-COMPLETED-S3), so a clone's order never takes over its original's; '' without a set.
 */
export function fixtureTag(opts = {}) {
  const a = activePersonaSet(opts);
  return a ? `-${a.set}` : '';
}

/** The clone of `login` in `set`: one per account, the same in every env. */
export function cloneLogin(login, set) {
  const local = String(login).split('@')[0].toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `agent-test-wave-${String(set).toLowerCase()}-${local}@test-agent.com`;
}

/** The login variables the set replaces in `env`: `{ USER_EMAIL: <clone>, … }` for every listed store account. */
export function setLogins(store, env, active) {
  if (!active) return {};
  const view = envView(store, env), out = {};
  for (const name of active.defs.accounts) {
    const a = view.accounts[name];
    if (!a?.login) continue;
    for (const v of accountVars(name, a).loginVars) out[v] = cloneLogin(a.login, active.set);
  }
  return out;
}
