#!/usr/bin/env node
// scripts/seed-data/b2b/seed-wave-personas.mjs — create the per-wave clones of the shared accounts on a stand.
//
//   npm run seed:wave-personas [-- --set S3] [--dry-run]
//
// For every account test-data/personas/sets.json lists (store names and aliases) and every set: read the ORIGINAL on
// the stand — its contact, organizations and org roles — and create the clone (scripts/lib/persona-sets.mjs
// `cloneLogin`) with the same organizations and roles and the original's password, then record it in
// test-accounts.local.json under the original's password name, so a browser lane types the same NAME. A clone that
// exists is left as it is: this never writes to an original or to an existing account.
//
// Fixtures seeded FOR an original (orders, dashboards keyed on USER_EMAIL) are not copied: run that seeder with the
// set bound (`npm run persona:use -- <set>`), or list the account only once its seeder supports clones.
process.env.QA_PERSONA_SET = 'none'; // the originals, whatever this session is bound to
const { loadPersonaSets, cloneLogin } = await import('../../lib/persona-sets.mjs');
const up = await import('../../lib/user-provision.mjs');
const { TestDataResolver } = await import('../../lib/test-data-resolver.ts');
const { readStore, envView, accountVars } = await import('../../lib/test-accounts.mjs');
const { join } = await import('node:path');

const args = process.argv.slice(2);
const only = args.includes('--set') ? args[args.indexOf('--set') + 1] : null;
const dry = args.includes('--dry-run');
up.setFlags({ dryRun: dry, verbose: args.includes('--verbose') });
const defs = loadPersonaSets(up.ROOT);
const sets = only ? [only] : defs.sets;
if (only && !defs.sets.includes(only)) { console.error(`unknown set ${only} — ${defs.sets.join(', ')}`); process.exit(1); }

/** The original's login and password NAME, for a store name or an alias. */
function original(name) {
  const view = envView(readStore(up.ROOT), up.TEST_ENV);
  const a = view.accounts[name];
  if (a?.login) {
    const { passwordVar } = accountVars(name, a);
    return { login: a.login, passwordName: typeof a.password === 'string' ? passwordVar : a.password?.use };
  }
  const r = new TestDataResolver(join(up.ROOT, 'test-data'), up.TEST_ENV);
  const login = r.resolve(`@td(${name}.email)`);
  const cell = r.resolve(`@td(${name}.password)`);
  if (!login || login.startsWith('@td(')) throw new Error(`${name}: neither a store account nor an alias with an email`);
  return { login, passwordName: up.passwordVarOfCell(cell) };
}

await up.authenticate();
let created = 0, reused = 0;
const seen = new Set();
for (const name of defs.accounts) {
  const o = original(name);
  if (!o.passwordName) throw new Error(`${name}: no password name — a clone would need a password nobody declared`);
  const password = process.env[o.passwordName];
  if (!password) throw new Error(`${name}: ${o.passwordName} has no value for ${up.TEST_ENV} (npm run creds:check)`);
  const orig = await up.findUserByEmail(o.login);
  if (!orig?.id) throw new Error(`${name}: ${o.login} does not exist on ${up.TEST_ENV} — seed the original first`);
  // The search hit carries memberId; the GET-by-id is cache-flaky (user-provision.mjs findUserByEmail), so it only adds.
  const full = { ...orig, ...((await up.getUserById(orig.id)) ?? {}) };
  const contact = await up.findContactById(full.memberId);
  if (!contact) throw new Error(`${name}: ${o.login} has no contact (memberId ${full.memberId ?? 'none'})`);
  const memberships = await up.searchMemberships(orig.id);
  for (const set of sets) {
    const login = cloneLogin(o.login, set);
    if (seen.has(login)) continue; // two names for one account share one clone
    seen.add(login);
    if ((await up.findUserByEmail(login))?.id) { reused++; console.log(`  ↻ ${name} ${set}: ${login} exists — left as it is`); continue; }
    const body = {
      memberType: 'Contact', firstName: contact.firstName, lastName: `${contact.lastName ?? ''} ${set}`.trim(),
      fullName: `${contact.fullName ?? `${contact.firstName} ${contact.lastName}`} ${set}`, emails: [login],
      organizations: contact.organizations ?? [], defaultLanguage: contact.defaultLanguage, currencyCode: contact.currencyCode,
    };
    body.name = body.fullName;
    // A contact from an earlier, interrupted run is reused; a new one is taken from the create response, because the
    // member search reads the index and lags the write.
    let cloneContact = dry ? { id: `dry-contact-${login}` } : await up.findContactByEmail(login);
    if (!cloneContact?.id) {
      const res = await up.getApi()('POST', '/api/members', body, { expectStatus: [200, 201, 204] });
      cloneContact = res?.id ? res : null;
      for (let i = 0; !cloneContact?.id && i < 10; i++) { await new Promise((r) => setTimeout(r, 3000)); cloneContact = await up.findContactByEmail(login); }
    }
    if (!cloneContact?.id) throw new Error(`${login}: contact created but not found after 30 s`);
    const userId = await up.ensureSecurityAccount(login, password, cloneContact.id, 'Approved');
    const existing = await up.searchMemberships(userId);
    for (const m of memberships) {
      const roleId = (m.roles ?? [])[0]?.roleId ?? (m.roles ?? [])[0]?.id;
      if (!roleId) continue;
      await up.ensureOrgMembership(userId, m.organizationId, m.organizationName, roleId, existing, false, login, m.status ?? null);
    }
    up.accountSet(login, password, o.passwordName);
    created++;
    console.log(`  ✓ ${name} ${set}: ${login} — ${(contact.organizations ?? []).length} org(s), ${memberships.length} membership(s)`);
  }
}
console.log(`seed:wave-personas on ${up.TEST_ENV}: ${created} created, ${reused} already there${dry ? ' (dry run)' : ''}`);
