/**
 * scripts/loyalty-toggle-program.mjs
 *
 * Activate / deactivate one or more loyalty programs by name (exact) or name prefix.
 * GET-full → flip `isActive` → PUT-full (the same safe round-trip seed-loyalty.mjs uses on
 * reuse), so the program's dynamicExpression / eligibility / window / factors are preserved —
 * only the active flag changes.
 *
 * WHY THIS EXISTS: the runner-native GraphQL cases (graphql-runner.ts) cannot perform this
 * toggle inline — a `[REST-CAPTURE]` stringifies an object to "[object Object]", so a program
 * cannot be GET-then-PUT round-tripped from within a CSV case. The "single-winner changes when
 * the current winner is deactivated" scenario (the LOY-035 deferred gap) therefore needs this
 * external driver to set up / tear down the serial fixture around a runner case (e.g. LOY-039).
 *
 * Usage:
 *   node scripts/loyalty-toggle-program.mjs --name "AGENT-TEST PP Single-SKU Laptop" --state off
 *   node scripts/loyalty-toggle-program.mjs --prefix "AGENT-TEST" --state on
 *   ...add --dry-run to preview, --verbose to log each call. TEST_ENV-aware (defaults vcst).
 *
 * Exit codes: 0 ok · 2 bad args / env · 1 no programs matched.
 */
import { assertSafeTarget, auth, api, log, DRY_RUN } from './lib/seed-common.mjs';

const argv = process.argv.slice(2);
const getArg = (flag) => (argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : null);
const NAME = getArg('--name');
const PREFIX = getArg('--prefix');
const STATE = (getArg('--state') || '').toLowerCase();

if ((!NAME && !PREFIX) || (NAME && PREFIX) || !['on', 'off'].includes(STATE)) {
  console.error('Usage: node scripts/loyalty-toggle-program.mjs (--name "<exact>" | --prefix "<pfx>") --state <on|off> [--dry-run] [--verbose]');
  process.exit(2);
}
const TARGET_ACTIVE = STATE === 'on';

async function main() {
  assertSafeTarget();
  await auth();

  const search = await api('POST', '/api/loyalty-programs/search', { take: 100 }, { expectStatus: [200, 201] });
  const all = search.results || [];
  const matches = all.filter((p) =>
    NAME ? p.name === NAME : (p.name || '').startsWith(PREFIX)
  );

  if (matches.length === 0) {
    console.error(`No loyalty programs matched ${NAME ? `name "${NAME}"` : `prefix "${PREFIX}"`}.`);
    process.exit(1);
  }

  log(`Setting isActive=${TARGET_ACTIVE} on ${matches.length} program(s):`);
  let changed = 0;
  for (const m of matches) {
    if (m.isActive === TARGET_ACTIVE) {
      log(`  [skip] already ${STATE.toUpperCase()}  pri=${String(m.priority).padStart(3)}  ${m.name}`);
      continue;
    }
    const full = await api('GET', `/api/loyalty-programs/${m.id}`, null, { expectStatus: [200] });
    full.isActive = TARGET_ACTIVE;
    await api('PUT', '/api/loyalty-programs', full, { expectStatus: [200, 201, 204] });
    changed++;
    log(`  [${STATE.toUpperCase()}]   pri=${String(m.priority).padStart(3)}  ${m.name}  (${m.id})`);
  }
  log(`Done. ${changed} changed, ${matches.length - changed} already ${STATE.toUpperCase()}.${DRY_RUN ? ' [DRY RUN]' : ''}`);
}

main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
