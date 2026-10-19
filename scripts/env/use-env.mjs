#!/usr/bin/env node
// scripts/env/use-env.mjs — `npm run env:use [-- <env> | --default | --clear]`
//
// Binds THIS Claude Code session to an env. Every script the session runs afterwards — its subagents' too,
// they share CLAUDE_CODE_SESSION_ID — resolves TEST_ENV from `.vc-fix/session-env/<session id>`
// (scripts/lib/resolve-test-env.js), so two sessions in one checkout run two envs and no shared file
// (.env.test-env) is edited. A command that takes an env argument runs it at Step 0
// (.claude/knowledge/execution/run-env.md).
//
//   npm run env:use -- vcptcore_dev   bind this session to vcptcore_dev
//   npm run env:use -- --default      bind it to what it resolves without a binding (TEST_ENV, .env.test-env, vcst)
//   npm run env:use -- --clear        remove this session's binding
//   npm run env:use                   print what this session resolves, and from where
//
// Prints the env, what chose it, its URLs with their source and how a browser lane types its passwords —
// the facts a dispatch brief carries. Never a secret. Exit 2: an unknown env, no Claude Code session, or a
// TEST_ENV in the session's environment that would beat the binding.
import '../lib/sync-stdio.mjs'; // before any output: a piped stdout must not lose its tail to process.exit()
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { parse } from 'dotenv';
import { TEST_ENV_PATTERN, envSuffix, sessionEnvFile, testEnvChoice } from '../lib/resolve-test-env.js';
import { loadEnv } from '../lib/load-env.mjs';
import { declaredSecretsFile, readSecretsFile } from '../lib/browser-secrets.mjs';

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
    else fail('not in a Claude Code session (no CLAUDE_CODE_SESSION_ID). Outside one: TEST_ENV=<env> for a command, or TEST_ENV=<env> in .env.test-env for the checkout.');
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
    writeFileSync(file, `# This Claude Code session's env: npm run env:use (${requested ? 'argument' : 'default'}), ${new Date().toISOString()}\nTEST_ENV=${env}\n`);
    prune(dirname(file));
  }
}
report();

/** Print what this session resolves now, with the facts a brief carries. */
function report() {
  const { source } = testEnvChoice('vcst');
  const { testEnv, sourceOf } = loadEnv({ fallback: 'vcst' });
  const why = { TEST_ENV: 'TEST_ENV in the environment', session: `this session's binding (${shown})`, '.env.test-env': '.env.test-env', default: 'the default' }[source];
  console.log(`TEST_ENV=${testEnv} — ${why}`);
  for (const key of ['BACK_URL', 'FRONT_URL', 'ENV_RISK']) console.log(`  ${key.padEnd(9)} ${process.env[key] ?? '(unset)'}  (${sourceOf(key)})`);

  const declared = declaredSecretsFile('.');
  const secrets = declared ? readSecretsFile('.', declared) : readSecretsFile('.');
  const lanes = basename(secrets.path);
  if (!secrets.exists) console.log(`  passwords: the lanes' --secrets file ${lanes} does not exist — npm run secrets:sync (one env) or secrets:sync:all (every env)`);
  else if (secrets.envs) {
    console.log(secrets.envs.includes(testEnv)
      ? `  passwords: type NAME${envSuffix(testEnv)} — the lanes read ${lanes}`
      : `  ⚠ passwords: the lanes' ${lanes} has no ${testEnv} (it covers ${secrets.envs.join(', ') || 'none'}) — npm run secrets:sync:all, then reconnect playwright-* in /mcp`);
  } else {
    console.log(secrets.env === testEnv
      ? `  passwords: type the bare NAME — the lanes read ${lanes}, generated for ${testEnv}`
      : `  ⚠ passwords: the lanes read ${lanes}, generated for ${secrets.env ?? 'an unstamped env'} — a sign-in on ${testEnv} would type that env's passwords. ` +
        'For sessions on several envs: npm run secrets:sync:all, and point --secrets at .env.playwright.all');
  }
}

/** Delete bindings no session has written for STALE_DAYS (sessions end; their files would pile up). */
function prune(dir) {
  const cutoff = Date.now() - STALE_DAYS * 86_400_000;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    try { if (statSync(p).mtimeMs < cutoff) rmSync(p); } catch { /* another session removed it */ }
  }
}
