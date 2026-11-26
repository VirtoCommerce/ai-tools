#!/usr/bin/env node
/**
 * scripts/maintenance/creds-forget.mjs — `npm run creds:forget -- <env> <login|KEY>... [--dry-run]`
 *
 * Remove test-account entries from test-accounts.local.json for ONE env — the ones `creds:verify` reports GONE (the
 * login no longer exists on the stand). A seeder's teardown already does this for the accounts it deletes
 * (user-provision.mjs `accountUnset`); this is for the rest: an account deleted by hand, a retired persona.
 *   - a login (`agent-test-x@test-agent.com`): removes `envs.<env>.accounts.<login>`;
 *   - a KEY (`SR_REP_X`): removes the named account `envs.<env>.accounts.<KEY>` — its `<KEY>_EMAIL` / `_PASSWORD`
 *     variables go with it, so only for a persona nothing uses any more.
 * Never a `shared` password, the top level or another env. Prints logins and keys, never a value.
 */
import '../lib/sync-stdio.mjs';
import { STORE_FILE, StoreError, forgetAccount } from '../lib/test-accounts.mjs';

const root = process.cwd();
const dryRun = process.argv.includes('--dry-run');
const [env, ...who] = process.argv.slice(2).filter((a) => !a.startsWith('-'));
if (!env || !who.length) {
  console.log('usage: npm run creds:forget -- <env> <login|KEY>... [--dry-run]');
  process.exit(2);
}
let missing = 0;
for (const w of who) {
  try {
    const byName = /^[A-Z][A-Z0-9_]*$/.test(w);
    const { removed, named } = forgetAccount(root, env, w, { dryRun, byName });
    if (removed) console.log(`✗ ${w} ${dryRun ? 'would be removed' : 'removed'} from ${STORE_FILE} (${env})`);
    else if (named) { console.log(`– ${w} is the named account ${named} (${env}) — to retire it: npm run creds:forget -- ${env} ${named}`); missing++; }
    else { console.log(`– ${w}: no entry of ${env}'s own in ${STORE_FILE} (the top level and other envs are not touched)`); missing++; }
  } catch (e) { console.log(`✗ ${e instanceof StoreError ? e.message : String(e)}`); process.exit(1); }
}
process.exit(missing ? 1 : 0);
