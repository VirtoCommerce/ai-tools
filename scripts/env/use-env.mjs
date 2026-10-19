#!/usr/bin/env node
// scripts/env/use-env.mjs — `npm run env:use [-- <env> | --default | --clear]`
//
// Binds THIS Claude Code session to an env. Every script the session runs afterwards — its subagents' too,
// they share CLAUDE_CODE_SESSION_ID — resolves TEST_ENV from `.vc-fix/session-env/<session id>`
// (scripts/lib/resolve-test-env.js), so two sessions in one checkout run two envs and no shared file
// (.env.test-env) is edited. A command that takes an env argument runs it at Step 0
// (.claude/knowledge/execution/run-env.md); a ticket run binds its run folder too (`npm run run:use`).
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
import { sessionEnvFile } from '../lib/resolve-test-env.js';
import { BindError, bindSessionEnv, clearSessionEnv, describeSessionEnv } from '../lib/session-env.mjs';

const args = process.argv.slice(2);
const requested = args.find((a) => !a.startsWith('--'));

try {
  if (args.includes('--clear')) {
    console.log(clearSessionEnv() ? `removed ${sessionEnvFile().replace(/\\/g, '/')}` : 'this session has no binding');
  } else if (requested || args.includes('--default')) {
    if (bindSessionEnv(requested) === null) console.log('not in a Claude Code session (no CLAUDE_CODE_SESSION_ID): TEST_ENV resolves per process');
  }
  for (const line of describeSessionEnv().lines) console.log(line);
} catch (e) {
  if (!(e instanceof BindError)) throw e;
  console.error(`✗ ${e.message}`);
  process.exit(2);
}
