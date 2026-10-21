#!/usr/bin/env node
// plugins/vc-fix/scripts/env/use-env.mjs — `node "$pluginRoot/scripts/env/use-env.mjs" [<env> | --default | --clear]`
//
// The plugin's own copy of the ai-tools repo's `npm run env:use` (the plugin is self-contained). Binds THIS
// Claude Code session to an env: every script the session runs afterwards — its subagents' too, they share
// CLAUDE_CODE_SESSION_ID — resolves TEST_ENV from `.vc-fix/session-env/<session id>`
// (scripts/lib/resolve-test-env.js), so two sessions in one project run two envs and no shared file
// (.env.test-env) is edited. A ticket run binds its run folder too (scripts/env/run-folder.mjs).
// Procedure: knowledge/execution/run-env.md.
//
//   <env>       bind this session to <env> (a `.env.<env>` must exist in the project)
//   --default   bind it to what it resolves without a binding (TEST_ENV, .env.test-env, vcst)
//   --clear     remove this session's binding
//   (nothing)   print what this session resolves, and from where
//
// Prints the env, what chose it and its URLs — never a secret. Exit 2: an unknown env, no Claude Code
// session, or a TEST_ENV in the session's environment that would beat the binding.
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
