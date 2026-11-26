#!/usr/bin/env node
// scripts/env/persona-use.mjs — bind this Claude Code session to a wave's persona set, and look a login up under it.
//
//   npm run persona:use -- S3 [--release sprint-26-22 --wave W3]   bind the session (subagents share it)
//   npm run persona:use -- --clear                                  back to the shared accounts
//   npm run persona:use                                             what is bound
//   npm run persona:login -- <ALIAS|STORE NAME>                     the login to type for it in this session
//
// Prints logins and set names only — never a password (scripts/lib/persona-sets.mjs).
import "../lib/sync-stdio.mjs"; // before any output: a piped stdout must not lose its tail to process.exit()
const args = process.argv.slice(2);
const login = args[0] === '--login';
const { activePersonaSet, bindPersonaSet, clearPersonaSet, loadPersonaSets, SETS_FILE } = await import('../lib/persona-sets.mjs');
const { loadEnv } = await import('../lib/load-env.mjs');
const { testEnv } = loadEnv({ fallback: 'vcst' });
const root = process.cwd();
const val = (flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined);

if (login) {
  // <NAME> or <ALIAS>.<field> — a lane slot row holds two logins: AGENT_POOL_SLOT_1 (personal), AGENT_POOL_SLOT_1.b2b_email.
  const [name, field = 'email'] = String(args[1] ?? '').split('.');
  if (!name) { console.error('usage: npm run persona:login -- <ALIAS|STORE NAME>[.field]'); process.exit(1); }
  const { readStore, envView, accountVars } = await import('../lib/test-accounts.mjs');
  const { existsSync, readFileSync } = await import('node:fs');
  // An alias whose login lives in the env (`email_env`) is read from there first — as graphql-auth and the pre-flight
  // do. The loader has already put the set's clone into that variable, so this follows the set too.
  const aliasesPath = `${root}/test-data/aliases.json`;
  const def = field === 'email' && existsSync(aliasesPath) ? JSON.parse(readFileSync(aliasesPath, 'utf8'))[name] : null;
  if (def?.email_env) {
    const v = process.env[def.email_env];
    if (!v) { console.error(`${name}: its login variable ${def.email_env} has no value for ${testEnv} (npm run env:check)`); process.exit(1); }
    console.log(v);
    process.exit(0);
  }
  const a = field === 'email' ? envView(readStore(root), testEnv).accounts[name] : null;
  let out = a ? process.env[accountVars(name, a).loginVars[0]] : null;
  if (!out) {
    const { TestDataResolver } = await import('../lib/test-data-resolver.ts');
    const { join } = await import('node:path');
    const log = console.log; console.log = (...a) => console.error(...a); // the resolver's layering note must not reach stdout
    const r = new TestDataResolver(join(root, 'test-data'), testEnv);
    console.log = log;
    out = r.resolve(`@td(${name}.${field})`);
    if (!out || out.startsWith('@td(')) { console.error(`${name}.${field}: no login (not a store account, not an alias with that field)`); process.exit(1); }
  }
  console.log(out);
  process.exit(0);
}
if (args.includes('--clear')) { clearPersonaSet(root); console.log('persona set cleared — this session signs in as the shared accounts'); process.exit(0); }
const set = args.find((a) => !a.startsWith('--') && a !== val('--release') && a !== val('--wave'));
if (set) {
  const defs = loadPersonaSets(root);
  if (!defs.sets.includes(set)) { console.error(`unknown persona set ${set} — ${SETS_FILE} declares ${defs.sets.join(', ') || 'none'}`); process.exit(1); }
  bindPersonaSet(root, set, { release: val('--release'), wave: val('--wave') });
}
const active = activePersonaSet({ root });
console.log(active
  ? `persona set ${active.set}${active.wave ? ` (${active.release ?? ''} ${active.wave})` : ''} on ${testEnv}: ${active.defs.accounts.join(', ')} sign in as their ${active.set} clones — \`npm run persona:login -- <NAME>\` prints one`
  : `no persona set — this session signs in as the shared accounts`);
