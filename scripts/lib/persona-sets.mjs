// scripts/lib/persona-sets.mjs — per-wave persona sets (test-data/personas/sets.json).
//
// Parallel waves on one stand collided on the personas they share (Sprint 26-22: USER_DEFAULT was used by five of
// six waves; W6 waited for W3, a W2 sign-in failed after another operator reset a shared password). A set maps each
// shared persona alias to its clone, <ALIAS>_<SET>: the same org, role and password token, its own login. One run
// uses one set, so every consumer of an alias asks this module which alias to use.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const SETS_FILE = 'test-data/personas/sets.json';
export const RUN_SET_FILE = 'persona-set.json';

/** { personas: string[], sets: string[] } — empty lists when the file is absent. */
export function loadPersonaSets(root = process.cwd()) {
  const p = join(root, SETS_FILE);
  if (!existsSync(p)) return { personas: [], sets: [] };
  const j = JSON.parse(readFileSync(p, 'utf8'));
  return { personas: j.personas ?? [], sets: j.sets ?? [] };
}

export const cloneAlias = (alias, set) => `${alias}_${set}`;

/** The run's set: QA_PERSONA_SET, else the run folder's persona-set.json. null = the shared personas themselves. */
export function activeSet({ env = process.env, runDir = null } = {}) {
  if (env.QA_PERSONA_SET) return env.QA_PERSONA_SET;
  if (runDir && existsSync(join(runDir, RUN_SET_FILE))) {
    try { return JSON.parse(readFileSync(join(runDir, RUN_SET_FILE), 'utf8')).set ?? null; } catch { return null; }
  }
  return null;
}

/** Refuses an unknown set loudly: a typo would otherwise run every wave on the shared accounts again. */
export function assertSet(set, defs) {
  if (set && !defs.sets.includes(set)) throw new Error(`unknown persona set "${set}" — ${SETS_FILE} declares ${defs.sets.join(', ') || 'none'}`);
}

export function mapAlias(alias, set, defs) {
  return set && defs.personas.includes(alias) ? cloneAlias(alias, set) : alias;
}

/** Rewrites every persona reference in a case's text: [PRE:SIGNIN_AS|SWITCH_ORG|VERIFY_AUTH:X], [AUTH role=X], @td(X.…). */
export function rewriteForSet(text, set, defs) {
  if (!set || !text) return text;
  const names = defs.personas.join('|');
  if (!names) return text;
  return String(text)
    .replace(new RegExp(`(\\[PRE:(?:SIGNIN_AS|SWITCH_ORG|VERIFY_AUTH):)(${names})(\\])`, 'g'), (_, a, n, b) => `${a}${cloneAlias(n, set)}${b}`)
    .replace(new RegExp(`(\\[AUTH role=)(${names})(\\])`, 'g'), (_, a, n, b) => `${a}${cloneAlias(n, set)}${b}`)
    .replace(new RegExp(`(@td\\()(${names})(\\.)`, 'g'), (_, a, n, b) => `${a}${cloneAlias(n, set)}${b}`);
}
