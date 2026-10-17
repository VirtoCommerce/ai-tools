// scripts/lib/run-dir.mjs — where a ticket run writes: ONE folder per ticket and env, the run folder.
//
// `QA_OUTPUT_DIR` (put it in .env.local) is a path template with optional `<ticket>`, `<env>` and `<sprint>`:
//
//   QA_OUTPUT_DIR=P:\VC\_VIRTO\tickets\<ticket>\.work\self-testing     → …\tickets\VCST-6314\.work\self-testing\vcptcore_dev
//   QA_OUTPUT_DIR=C:\temp\test-reports                                 → C:\temp\test-reports\VCST-6314\vcptcore_dev
//   QA_OUTPUT_DIR=C:\temp\test-reports\<env>\<ticket>                  → C:\temp\test-reports\vcptcore_dev\VCST-6314
//
// The run folder always names both the ticket and the env: a template without `<ticket>` gets `<ticket>`
// appended, then one without `<env>` gets `<env>` appended — so two tickets, or one ticket on two envs (a local
// stand, then a cloud one), never share a file. Unset ⇒ `reports/tickets/<sprint>/<ticket>` (+ `<env>`) under
// the project root. A relative template resolves against the project root — outputRoot(): VC_FIX_HOME, else the
// cwd, as plugins/CLAUDE.md defines it, so this file is the same in the vc-fix plugin
// (plugins/vc-fix/scripts/lib/run-dir.mjs — keep the two byte-identical). Write the template unquoted or
// single-quoted in .env.local: inside double quotes dotenv reads `\n` in `C:\temp\new` as a line break.
//
// Everything a run writes lands inside its folder — the layout is `runLayout()` and
// .claude/knowledge/execution/run-output.md; nothing a run writes is shared with another run.
//
// A session BINDS its run folder (`npm run run:use`, scripts/env/run-folder.mjs) the way it binds its env:
// `.vc-fix/session-run/<CLAUDE_CODE_SESSION_ID>`. Scripts that write run output read `sessionRun()` and follow it.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { parse } from 'dotenv';
import { TEST_ENV_PATTERN } from './resolve-test-env.js';

/** Where a project's state goes: VC_FIX_HOME, else the cwd (plugins/CLAUDE.md `outputRoot()`). */
export function outputRoot() {
  return process.env.VC_FIX_HOME ? resolve(process.env.VC_FIX_HOME) : process.cwd();
}
/** The template when `QA_OUTPUT_DIR` is unset; `<env>` is appended like any template's. */
export const DEFAULT_TEMPLATE = 'reports/tickets/<sprint>/<ticket>';
/** A tracker key: Jira's `VCST-1234`, or an Azure Boards work-item id, which is a bare number. */
export const TICKET_KEY = /^(?:[A-Z][A-Z0-9]*-\d+|\d+)$/;
const JIRA_KEY = /^[A-Z][A-Z0-9]*-\d+$/;
const PLACEHOLDER = /<(ticket|env|sprint)>/gi;

/** The current sprint folder name under `reports/tickets/`: `Sprint-current` when present, else the newest
 *  `SprintXX-XX`; null when none exists. (Moved here from scripts/preflight/policy.ts.) */
export function resolveSprint(root = outputRoot()) {
  const dir = join(root, 'reports', 'tickets');
  if (!existsSync(dir)) return null;
  const names = readdirSync(dir);
  if (names.includes('Sprint-current')) return 'Sprint-current';
  return names.filter((n) => /^Sprint\d{2}-\d{2}$/.test(n)).sort().at(-1) ?? null;
}

/** `QA_OUTPUT_DIR` as the loaded env holds it (trimmed), else the default template. */
export function runDirTemplate(env = process.env) {
  return env.QA_OUTPUT_DIR?.trim() || DEFAULT_TEMPLATE;
}

/** The template with the endings it lacks: `/<ticket>` if it has no `<ticket>`, then `/<env>` if it has no `<env>`. */
export function completeTemplate(template) {
  const has = (name) => new RegExp(`<${name}>`, 'i').test(template);
  let out = template.replace(/[\\/]+$/, '');
  if (!has('ticket')) out += '/<ticket>';
  if (!has('env')) out += '/<env>';
  return out;
}

/**
 * The run folder for one ticket on one env, absolute.
 * @param {{ ticket: string, env: string, sprint?: string | null, template?: string, root?: string }} opts
 */
export function resolveRunDir({ ticket, env, sprint, template = runDirTemplate(), root = outputRoot() }) {
  if (!TICKET_KEY.test(ticket ?? '')) throw new Error(`run folder: "${ticket}" is not a ticket key like VCST-1234 (or an Azure Boards id)`);
  if (!TEST_ENV_PATTERN.test(env ?? '')) throw new Error(`run folder: "${env}" is not a TEST_ENV name ([a-z0-9_]+)`);
  const full = completeTemplate(template);
  const needSprint = /<sprint>/i.test(full);
  const sprintName = needSprint ? (sprint ?? resolveSprint(root)) : null;
  if (needSprint && !sprintName) throw new Error('run folder: the template names <sprint>, and there is no reports/tickets/SprintXX-XX (or Sprint-current) folder to take it from — create the current sprint folder, or set QA_OUTPUT_DIR in .env.local without <sprint>');
  const values = { ticket, env, sprint: sprintName };
  const path = full.replace(PLACEHOLDER, (_, name) => values[name.toLowerCase()]);
  return isAbsolute(path) ? resolve(path) : resolve(root, path);
}

/**
 * The run's screenshot folder in the form a Playwright lane can write: relative to the project root, which is the
 * lane's cwd and one of its allowed roots — so the path passes the lane's check whatever the drive letter's case.
 * Null when the run folder is outside the project: a lane refuses that path (`outside allowed roots`), so a
 * capture is saved with a bare filename and moved in.
 */
export function laneScreenshots(dir, root = outputRoot()) {
  const rel = relative(resolve(root), join(dir, 'screenshots'));
  return rel && !rel.startsWith('..') && !isAbsolute(rel) ? `${rel.split(sep).join('/')}/` : null;
}

/** The subfolders `runLayout` puts inside a run folder (never an env name). */
const LAYOUT_DIRS = new Set(['screenshots', 'exploratory', 'bugs', 'knowledge']);

/** Where each artifact of a run lives inside its folder — the one statement of the layout. */
export function runLayout(dir) {
  const knowledge = join(dir, 'knowledge');
  return {
    dir,
    summary: join(dir, 'summary.json'),
    verdict: join(dir, 'verdict.md'),
    strategy: join(dir, 'test-strategy.md'),
    checklist: join(dir, 'testing-checklist.md'),
    model: join(dir, 'test-model.md'),
    screenshots: join(dir, 'screenshots'),
    exploratory: join(dir, 'exploratory'),
    bugs: join(dir, 'bugs'),
    knowledge,
    domain: join(knowledge, 'domain'),
    schema: join(knowledge, 'api', 'graphql-schema.md'),
    schemaCache: join(dir, '.graphql-schema.cache.json'),
    fixturesReport: join(dir, 'graphql-fixtures-validation.md'),
  };
}

/** The directories matching a path whose segments may hold `*` (one segment each, never a separator). */
function globDirs(pattern) {
  const parts = resolve(pattern).split(/[\\/]+/);
  let found = [parts[0] + sep]; // the root: `C:\` or `/`
  for (const part of parts.slice(1)) {
    if (!part) continue;
    const next = [];
    for (const base of found) {
      if (!part.includes('*')) { const p = join(base, part); if (existsSync(p)) next.push(p); continue; }
      const re = new RegExp(`^${part.split('*').map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[^\\\\/]*')}$`);
      let names = [];
      try { names = readdirSync(base); } catch { /* unreadable */ }
      for (const n of names) {
        const p = join(base, n);
        try { if (re.test(n) && statSync(p).isDirectory()) next.push(p); } catch { /* vanished */ }
      }
    }
    found = next;
  }
  return found;
}

/**
 * Every existing run folder of a ticket — its env folders under the configured template and under the default
 * one, and the folders written before the env level existed (`reports/tickets/<Sprint>/<TICKET>/` itself, and
 * the ad-hoc `reports/tickets/<TICKET>/`). Prior artifacts are READ from all of them; a run WRITES only into its
 * own. Each entry: `{ dir, env }`, env null for a pre-env folder.
 */
export function priorRunDirs({ ticket, template = runDirTemplate(), root = outputRoot() }) {
  const out = new Map();
  for (const t of new Set([template, DEFAULT_TEMPLATE])) {
    const full = completeTemplate(t);
    const pattern = full.replace(/<ticket>/gi, ticket).replace(/<sprint>/gi, '*').replace(/<env>/gi, '*');
    const abs = isAbsolute(pattern) ? pattern : join(root, pattern);
    const envAt = full.split(/[\\/]+/).findIndex((seg) => /<env>/i.test(seg));
    for (const dir of globDirs(abs)) {
      const env = resolve(dir).split(/[\\/]+/).at(envAt - full.split(/[\\/]+/).length);
      // `*` in the env place also matches a pre-env folder's own subfolders (screenshots/ …): not an env.
      if (env && TEST_ENV_PATTERN.test(env) && !LAYOUT_DIRS.has(env)) out.set(dir, { dir, env });
    }
  }
  // A pre-env folder counts only when it holds files itself — under the default layout it is also the parent
  // of the env folders.
  const holdsFiles = (dir) => { try { return readdirSync(dir).some((n) => statSync(join(dir, n)).isFile()); } catch { return false; } };
  for (const legacy of [join(root, 'reports', 'tickets', '*', ticket), join(root, 'reports', 'tickets', ticket)]) {
    for (const dir of globDirs(legacy)) if (!out.has(dir) && holdsFiles(dir)) out.set(dir, { dir, env: null });
  }
  return [...out.values()];
}

/** The ticket key a run folder belongs to: its last path segment shaped like a Jira key (`…/VCST-6314/…/vcst`),
 *  else its last all-digit one (an Azure Boards id), or null. */
export function ticketOfRunDir(dir) {
  const segments = dir.split(/[\\/]/).filter(Boolean).reverse();
  return segments.find((s) => JIRA_KEY.test(s)) ?? segments.find((s) => TICKET_KEY.test(s)) ?? null;
}

/** Every existing run folder of every ticket, as `priorRunDirs` finds them: `{ dir, env, ticket }`. */
export function allRunDirs({ template = runDirTemplate(), root = outputRoot() } = {}) {
  return priorRunDirs({ ticket: '*', template, root })
    .map((r) => ({ ...r, ticket: ticketOfRunDir(r.dir) }))
    .filter((r) => r.ticket);
}

/** This Claude Code session's bound run, `{ dir, ticket, env }`, or null (no session, or no run bound). */
export function sessionRun(sessionId = process.env.CLAUDE_CODE_SESSION_ID, root = process.cwd()) {
  if (!sessionId || !/^[A-Za-z0-9-]+$/.test(sessionId)) return null;
  const file = join(root, '.vc-fix', 'session-run', sessionId);
  if (!existsSync(file)) return null;
  const v = parse(readFileSync(file));
  return v.RUN_DIR && v.TICKET && v.TEST_ENV ? { dir: v.RUN_DIR, ticket: v.TICKET, env: v.TEST_ENV } : null;
}

/** The bound run's file for a layout key when its ticket and env match (or are not given); else null. */
export function sessionRunPath(key, { ticket, env } = {}) {
  const run = sessionRun();
  if (!run || (ticket && run.ticket !== ticket) || (env && run.env !== env)) return null;
  return runLayout(run.dir)[key] ?? null;
}
