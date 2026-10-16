#!/usr/bin/env node
// plugins/vc-fix/scripts/env/use-env.mjs — `node "$pluginRoot/scripts/env/use-env.mjs" [<env> | --default | --clear]`
//
// The plugin's own copy of the ai-tools repo's `npm run env:use` (the plugin is self-contained). Binds THIS
// Claude Code session to an env: every script the session runs afterwards — its subagents' too, they share
// CLAUDE_CODE_SESSION_ID — resolves TEST_ENV from `.vc-fix/session-env/<session id>`
// (scripts/lib/resolve-test-env.js), so two sessions in one project run two envs and no shared file
// (.env.test-env) is edited. Procedure: knowledge/execution/run-env.md.
//
//   <env>       bind this session to <env> (a `.env.<env>` must exist in the project)
//   --default   bind it to what it resolves without a binding (TEST_ENV, .env.test-env, vcst)
//   --clear     remove this session's binding
//   (nothing)   print what this session resolves, and from where
//
// Prints the env, what chose it and its URLs — never a secret. Exit 2: an unknown env, no Claude Code
// session, or a TEST_ENV in the session's environment that would beat the binding.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parse } from 'dotenv';
import { TEST_ENV_PATTERN, sessionEnvFile, testEnvChoice } from '../lib/resolve-test-env.js';
import { loadLayeredEnv } from '../lib/load-layered-env.mjs';

const args = process.argv.slice(2);
const requested = args.find((a) => !a.startsWith('--'));
const toDefault = args.includes('--default');
const clear = args.includes('--clear');
const file = sessionEnvFile();
const shown = file?.replace(/\\/g, '/');
/** A binding untouched this long belongs to a session that has ended. */
const STALE_DAYS = 30;

const fail = (msg) => { console.error(`✗ ${msg}`); process.exit(2); };
const knownEnvs = () => readdirSync('.').map((f) => /^\.env\.([a-z0-9_]+)$/.exec(f)?.[1])
  .filter((n) => n && !['local', 'defaults', 'backup'].includes(n)).sort();

if (clear) {
  if (file && existsSync(file)) { rmSync(file); console.log(`removed ${shown}`); }
  else console.log('this session has no binding');
} else if (requested || toDefault) {
  if (!file) {
    if (!requested) console.log('not in a Claude Code session (no CLAUDE_CODE_SESSION_ID): TEST_ENV resolves per process');
    else fail('not in a Claude Code session (no CLAUDE_CODE_SESSION_ID). Outside one: TEST_ENV=<env> for a command, or TEST_ENV=<env> in .env.test-env for the project.');
  } else {
    const shell = process.env.TEST_ENV?.trim();
    const checkout = existsSync('.env.test-env') ? parse(readFileSync('.env.test-env')).TEST_ENV?.trim() : undefined;
    const env = requested ?? (shell || checkout || 'vcst');
    if (!TEST_ENV_PATTERN.test(env) || !existsSync(`.env.${env}`)) fail(`unknown env "${env}" — there is no .env.${env}. Known: ${knownEnvs().join(', ')}`);
    if (shell && shell !== env) {
      fail(`this session's environment sets TEST_ENV=${shell}, which beats a session binding: the run would still use ${shell}. ` +
        'Start Claude Code from a shell without TEST_ENV, or run this on that env.');
    }
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, `# This Claude Code session's env: vc-fix use-env (${requested ? 'argument' : 'default'}), ${new Date().toISOString()}\nTEST_ENV=${env}\n`);
    const cutoff = Date.now() - STALE_DAYS * 86_400_000;
    for (const name of readdirSync(dirname(file))) {
      const p = join(dirname(file), name);
      try { if (statSync(p).mtimeMs < cutoff) rmSync(p); } catch { /* another session removed it */ }
    }
  }
}

const { source } = testEnvChoice('vcst');
const testEnv = loadLayeredEnv('vcst');
const why = { TEST_ENV: 'TEST_ENV in the environment', session: `this session's binding (${shown})`, '.env.test-env': '.env.test-env', default: 'the default' }[source];
console.log(`TEST_ENV=${testEnv} — ${why}`);
for (const key of ['BACK_URL', 'FRONT_URL', 'ENV_RISK']) console.log(`  ${key.padEnd(9)} ${process.env[key] ?? '(unset)'}`);
