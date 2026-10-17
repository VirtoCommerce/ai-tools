#!/usr/bin/env node
// scripts/env/run-folder.mjs — a ticket run's folder: where everything the run writes lands.
//
//   npm run run:use -- <TICKET> [<env>]        Step 0 of a ticket run: bind this session's env (as env:use — the
//                                              argument, else the default) and its run folder; create the folder;
//                                              print both, and the ticket's prior run folders
//   npm run run:use -- --clear                 unbind the run folder (the env binding stays)
//   npm run run:dir                            print this session's run folder (exit 1 when none is bound)
//   npm run run:dir -- --ticket <KEY> [--env <env>]   resolve a ticket's run folder without binding anything
//   npm run run:dir -- --ticket <KEY> --prior         every existing run folder of the ticket (all envs, older layouts)
//   npm run run:dir -- --all                          every existing run folder of every ticket (release notes read them)
//
// The folder comes from QA_OUTPUT_DIR (.env.local) — scripts/lib/run-dir.mjs holds the template rules and the
// layout; .claude/knowledge/execution/run-output.md is the procedure. The binding is
// `.vc-fix/session-run/<CLAUDE_CODE_SESSION_ID>`; subagents share the session id, so they see the same folder.
// Exit 2: a refusal (unknown env, bad ticket key, a template that cannot resolve).
import '../lib/sync-stdio.mjs'; // before any output: a piped stdout must not lose its tail to process.exit()
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { BindError, bindSessionEnv, describeSessionEnv, pruneStale } from '../lib/session-env.mjs';
import { TICKET_KEY, allRunDirs, completeTemplate, priorRunDirs, resolveRunDir, runDirTemplate, laneScreenshots, runLayout, sessionRun } from '../lib/run-dir.mjs';
import { loadEnv } from '../lib/load-env.mjs';

const [mode, ...args] = process.argv.slice(2);
const value = (name) => {
  const i = args.indexOf(name);
  return i !== -1 ? args[i + 1] : args.find((a) => a.startsWith(`${name}=`))?.slice(name.length + 1);
};
const sid = process.env.CLAUDE_CODE_SESSION_ID;
const runFile = sid && /^[A-Za-z0-9-]+$/.test(sid) ? join('.vc-fix', 'session-run', sid) : null;
const fwd = (p) => p.replace(/\\/g, '/');
/** dotenv-safe: single quotes keep backslashes literal (double quotes would turn `C:\new`'s `\n` into a newline). */
const quote = (v) => {
  if (!v.includes("'")) return `'${v}'`;
  if (!v.includes('`')) return `\`${v}\``;
  throw new BindError(`the run folder path ${v} holds both ' and \` — no dotenv quoting carries it`);
};

function templateSource(sourceOf) {
  const s = sourceOf('QA_OUTPUT_DIR');
  return /is unset$/.test(s)
    ? `template ${completeTemplate(runDirTemplate({}))} (the default: QA_OUTPUT_DIR is unset)`
    : `template ${completeTemplate(runDirTemplate())} (${s})`;
}

function listPrior(ticket, own) {
  const prior = priorRunDirs({ ticket }).filter((p) => p.dir !== own);
  if (!prior.length) { console.log(`  prior run folders of ${ticket}: none`); return; }
  console.log(`  prior run folders of ${ticket} (read them; write only into RUN_DIR):`);
  for (const p of prior) console.log(`    ${p.dir}  (${p.env ?? 'before the env level'})`);
}

function use() {
  if (args.includes('--clear')) {
    const had = runFile && existsSync(runFile);
    if (had) rmSync(runFile);
    console.log(had ? `removed ${fwd(runFile)} (the env binding stays)` : 'this session has no run folder bound');
    return;
  }
  const envAt = args.indexOf('--env');
  const positionals = args.filter((a, i) => !a.startsWith('--') && !(envAt !== -1 && i === envAt + 1));
  const ticket = positionals[0]?.toUpperCase();
  if (!ticket || !TICKET_KEY.test(ticket)) throw new BindError(`run:use needs a ticket key (VCST-1234, or an Azure Boards id) first, got "${positionals[0] ?? ''}"`);
  const envArg = value('--env') ?? positionals[1];
  if (bindSessionEnv(envArg, { reason: `run:use ${ticket}` }) === null) console.log('not in a Claude Code session (no CLAUDE_CODE_SESSION_ID): nothing is bound; TEST_ENV resolves per process');
  const { testEnv, sourceOf, lines } = describeSessionEnv();
  let dir;
  try { dir = resolveRunDir({ ticket, env: testEnv }); } catch (e) { throw new BindError(e.message); }
  mkdirSync(join(dir, 'screenshots'), { recursive: true }); // a Playwright lane never creates a folder
  if (runFile) {
    mkdirSync(dirname(runFile), { recursive: true });
    writeFileSync(runFile, `# This Claude Code session's run: npm run run:use, ${new Date().toISOString()}\nRUN_DIR=${quote(dir)}\nTICKET=${ticket}\nTEST_ENV=${testEnv}\n`);
    pruneStale(dirname(runFile));
  }
  for (const line of lines) console.log(line);
  console.log(`RUN_DIR=${dir}${runFile ? '' : '  (not bound: no Claude Code session)'}`);
  const shots = laneScreenshots(dir);
  console.log(shots
    ? `SCREENSHOTS=${shots}  (project-relative: the form a Playwright lane can write)`
    : `SCREENSHOTS=${join(dir, 'screenshots')}  (outside the project: a Playwright lane started without --allow-unrestricted-file-access refuses this path — then capture with a bare filename and mv the file here)`);
  console.log(`  ${templateSource(sourceOf)}`);
  listPrior(ticket, dir);
}

function dir() {
  if (args.includes('--all')) {
    const all = allRunDirs();
    if (args.includes('--json')) console.log(JSON.stringify(all, null, 2));
    else for (const r of all) console.log(`${r.dir}\t${r.ticket}\t${r.env ?? '-'}`);
    return;
  }
  const ticket = value('--ticket')?.toUpperCase();
  if (!ticket) {
    const run = sessionRun();
    if (!run) { console.error('✗ no run folder is bound in this session — npm run run:use -- <TICKET> [<env>]'); process.exit(1); }
    const { testEnv } = loadEnv({ fallback: 'vcst' });
    if (run.env !== testEnv) console.error(`⚠ this run folder was bound for ${run.env}, but the session now resolves ${testEnv} — re-run npm run run:use`);
    if (args.includes('--json')) console.log(JSON.stringify({ ...run, layout: runLayout(run.dir), laneScreenshots: laneScreenshots(run.dir) }, null, 2));
    else console.log(run.dir);
    return;
  }
  if (!TICKET_KEY.test(ticket)) throw new BindError(`--ticket expects a key (VCST-1234, or an Azure Boards id), got "${ticket}"`);
  const { testEnv } = loadEnv({ fallback: 'vcst' });
  if (args.includes('--prior')) {
    const prior = priorRunDirs({ ticket });
    if (args.includes('--json')) console.log(JSON.stringify(prior, null, 2));
    else for (const p of prior) console.log(`${p.dir}\t${p.env ?? '-'}`);
    return;
  }
  let out;
  try { out = resolveRunDir({ ticket, env: value('--env') ?? testEnv }); } catch (e) { throw new BindError(e.message); }
  console.log(args.includes('--json') ? JSON.stringify({ dir: out, ticket, env: value('--env') ?? testEnv, layout: runLayout(out) }, null, 2) : out);
}

try {
  if (mode === 'use') use();
  else if (mode === 'dir') dir();
  else { console.error('usage: run-folder.mjs use <TICKET> [<env>] | use --clear | dir [--ticket <KEY> [--env <env>] [--prior] | --all] [--json]'); process.exit(1); }
} catch (e) {
  if (!(e instanceof BindError)) throw e;
  console.error(`✗ ${e.message}`);
  process.exit(2);
}
