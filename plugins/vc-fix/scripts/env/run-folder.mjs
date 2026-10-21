#!/usr/bin/env node
// plugins/vc-fix/scripts/env/run-folder.mjs — a ticket run's folder: where everything the run writes lands.
// The plugin's own copy of the ai-tools repo's `npm run run:use` / `run:dir` (the plugin is self-contained).
//
//   node "$pluginRoot/scripts/env/run-folder.mjs" use <TICKET> [<env>]   Step 0 of a ticket run: bind this
//        session's env (the argument, else the default) and its run folder; create the folder; print both
//   node "$pluginRoot/scripts/env/run-folder.mjs" use --clear            unbind the run folder (the env stays)
//   node "$pluginRoot/scripts/env/run-folder.mjs" dir                    this session's run folder (exit 1: none)
//   node "$pluginRoot/scripts/env/run-folder.mjs" dir --ticket <KEY> [--env <env>] [--prior]
//
// The folder comes from QA_OUTPUT_DIR (.env.local): scripts/lib/run-dir.mjs holds the template rules and the
// layout; knowledge/execution/run-env.md is the procedure. Exit 2: a refusal (unknown env, bad key, a template
// that cannot resolve).
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { BindError, bindSessionEnv, describeSessionEnv, pruneStale } from '../lib/session-env.mjs';
import { sessionEnvFile } from '../lib/resolve-test-env.js';
import { dedicatedEnvs } from '../lib/env-layers.mjs';
import { TICKET_KEY, completeTemplate, priorRunDirs, resolveRunDir, runDirTemplate, laneScreenshots, runLayout, sessionRun } from '../lib/run-dir.mjs';
import { loadLayeredEnv } from '../lib/load-layered-env.mjs';

const [mode, ...args] = process.argv.slice(2);
const value = (name) => {
  const i = args.indexOf(name);
  return i !== -1 ? args[i + 1] : args.find((a) => a.startsWith(`${name}=`))?.slice(name.length + 1);
};
const sid = process.env.CLAUDE_CODE_SESSION_ID;
const runFile = sid && /^[A-Za-z0-9-]+$/.test(sid) ? join('.vc-fix', 'session-run', sid) : null;
/** dotenv-safe: single quotes keep backslashes literal (double quotes would turn `C:\new`'s `\n` into a newline). */
const quote = (v) => {
  if (!v.includes("'")) return `'${v}'`;
  if (!v.includes('`')) return `\`${v}\``;
  throw new BindError(`the run folder path ${v} holds both ' and \` — no dotenv quoting carries it`);
};

/** The env a ticket's own QA_ENV_PATH folder defines, when it defines exactly one (`.env.vcst_6314` for VCST-6314);
 *  else null. A ticket run with no env argument binds it instead of the project's default. */
function ticketStand(ticket) {
  const envs = new Set(dedicatedEnvs().filter((e) => e.ticket === ticket && !e.secrets).map((e) => e.env));
  return envs.size === 1 ? [...envs][0] : null;
}

function use() {
  if (args.includes('--clear')) {
    const had = runFile && existsSync(runFile);
    if (had) rmSync(runFile);
    console.log(had ? 'run folder unbound (the env binding stays)' : 'this session has no run folder bound');
    return;
  }
  const envAt = args.indexOf('--env');
  const positionals = args.filter((a, i) => !a.startsWith('--') && !(envAt !== -1 && i === envAt + 1));
  const ticket = positionals[0]?.toUpperCase();
  if (!ticket || !TICKET_KEY.test(ticket)) throw new BindError(`use needs a ticket key (VCST-1234, or an Azure Boards id) first, got "${positionals[0] ?? ''}"`);
  // A run folder that cannot resolve or be created (an unmounted drive in QA_OUTPUT_DIR) must change nothing: keep
  // the env binding to put it back, and write the run binding only once the folder exists — else the new env would
  // sit beside the previous run's folder.
  const envFile = sessionEnvFile();
  const envBefore = envFile && existsSync(envFile) ? readFileSync(envFile, 'utf8') : null;
  const named = value('--env') ?? positionals[1];
  // No env named: the ticket's own stand when its QA_ENV_PATH folder defines exactly one env, else the default.
  const ownStand = named ? null : ticketStand(ticket);
  if (ownStand) console.log(`env: ${ownStand} — ${ticket}'s own stand (the only env its QA_ENV_PATH folder defines)`);
  if (bindSessionEnv(named ?? ownStand ?? undefined, { reason: `run-folder use ${ticket}`, ticket }) === null) {
    console.log('not in a Claude Code session (no CLAUDE_CODE_SESSION_ID): nothing is bound; TEST_ENV resolves per process');
  }
  const { testEnv, lines } = describeSessionEnv({ ticket });
  let dir;
  try {
    dir = resolveRunDir({ ticket, env: testEnv });
    mkdirSync(join(dir, 'screenshots'), { recursive: true }); // a Playwright lane never creates a folder
    if (runFile) {
      mkdirSync(dirname(runFile), { recursive: true });
      writeFileSync(runFile, `# This Claude Code session's run: vc-fix run-folder use, ${new Date().toISOString()}\nRUN_DIR=${quote(dir)}\nTICKET=${ticket}\nTEST_ENV=${testEnv}\n`);
    }
  } catch (e) {
    if (envFile) { if (envBefore === null) rmSync(envFile, { force: true }); else writeFileSync(envFile, envBefore); }
    throw new BindError(dir ? `cannot create the run folder ${dir}: ${e.message}` : e.message);
  }
  if (runFile) pruneStale(dirname(runFile));
  for (const line of lines) console.log(line);
  console.log(`RUN_DIR=${dir}${runFile ? '' : '  (not bound: no Claude Code session)'}`);
  const shots = laneScreenshots(dir);
  console.log(shots
    ? `SCREENSHOTS=${shots}  (project-relative: the form a Playwright lane can write)`
    : `SCREENSHOTS=${join(dir, 'screenshots')}  (outside the project: a Playwright lane started without --allow-unrestricted-file-access refuses this path — then capture with a bare filename and mv the file here)`);
  console.log(`  template ${completeTemplate(runDirTemplate())}${process.env.QA_OUTPUT_DIR ? ' (QA_OUTPUT_DIR)' : ' (the default: QA_OUTPUT_DIR is unset)'}`);
  const prior = priorRunDirs({ ticket }).filter((p) => p.dir !== dir);
  if (prior.length) {
    console.log(`  prior run folders of ${ticket} (read them; write only into RUN_DIR):`);
    for (const p of prior) console.log(`    ${p.dir}  (${p.env ?? 'before the env level'})`);
  } else console.log(`  prior run folders of ${ticket}: none`);
}

function dir() {
  const ticket = value('--ticket')?.toUpperCase();
  if (!ticket) {
    const run = sessionRun();
    if (!run) { console.error('✗ no run folder is bound in this session — run-folder.mjs use <TICKET> [<env>]'); process.exit(1); }
    console.log(args.includes('--json') ? JSON.stringify({ ...run, layout: runLayout(run.dir), laneScreenshots: laneScreenshots(run.dir) }, null, 2) : run.dir);
    return;
  }
  if (!TICKET_KEY.test(ticket)) throw new BindError(`--ticket expects a key (VCST-1234, or an Azure Boards id), got "${ticket}"`);
  const testEnv = loadLayeredEnv('vcst');
  if (args.includes('--prior')) {
    const prior = priorRunDirs({ ticket });
    console.log(args.includes('--json') ? JSON.stringify(prior, null, 2) : prior.map((p) => `${p.dir}\t${p.env ?? '-'}`).join('\n'));
    return;
  }
  let out;
  try { out = resolveRunDir({ ticket, env: value('--env') ?? testEnv }); } catch (e) { throw new BindError(e.message); }
  console.log(out);
}

try {
  if (mode === 'use') use();
  else if (mode === 'dir') dir();
  else { console.error('usage: run-folder.mjs use <TICKET> [<env>] | use --clear | dir [--ticket <KEY> [--env <env>] [--prior]] [--json]'); process.exit(1); }
} catch (e) {
  if (!(e instanceof BindError)) throw e;
  console.error(`✗ ${e.message}`);
  process.exit(2);
}
