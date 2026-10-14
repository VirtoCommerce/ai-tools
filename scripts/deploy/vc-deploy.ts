/**
 * vc-deploy.ts — the deterministic core for changing what a vc-deploy-dev env branch deploys.
 *
 *   vc-deploy.ts pr <ticket-key> [...]   deploy a change's PR prerelease artifacts   (/qa-deploy-pr)
 *   vc-deploy.ts upgrade --env=<env> ... bring an env up to the latest releases     (/qa-env-upgrade)
 *
 * Each subcommand documents its own flags in its module header (pr/pr.ts, upgrade/cli.ts).
 * Neither ever merges: a human merges the deploy PR, and the merge deploys.
 */
import '../lib/sync-stdio.mjs'; // before any output: a piped stdout must not lose its tail to process.exit()
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { Exit } from './lib/exit.ts';
import { runPr } from './pr/pr.ts';

const USAGE = 'Usage: vc-deploy.ts <pr|upgrade> [...]  (see pr/pr.ts and upgrade/cli.ts)';

export async function dispatch(argv: string[]): Promise<void> {
  const [sub, ...rest] = argv;
  if (sub === 'pr') return runPr(rest);
  if (sub === 'upgrade') return (await import('./upgrade/cli.ts')).runUpgrade(rest);
  console.error(`[vc-deploy] unknown subcommand "${sub ?? ''}". ${USAGE}`);
  throw new Exit(2);
}

// Guarded so the module can be imported (e.g. by unit tests) without running the CLI.
const isMain = (() => {
  try { return !!process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]); } catch { return false; }
})();
if (isMain) {
  dispatch(process.argv.slice(2)).catch((e) => {
    if (e instanceof Exit) { process.exitCode = e.code; return; }
    console.error(`[vc-deploy] fatal: ${e.message}`);
    process.exitCode = 2;
  });
}
