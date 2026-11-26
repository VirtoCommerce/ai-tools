#!/usr/bin/env node
// scripts/seed-data/b2b/seed-wave-personas.mjs — create (or remove) the per-wave clones of the shared accounts.
//
//   npm run seed:wave-personas [-- --set S3] [--fixtures] [--dry-run]
//   npm run seed:wave-personas -- --teardown [--set S3] [--dry-run]
//
// For every account test-data/personas/sets.json lists and every set, read the ORIGINAL on the stand and create its
// clone (persona-sets.mjs `cloneLogin`) with the original's password and org roles. An original's ORGANIZATIONS are
// cloned too, once per set (`<name>-<set>`, same groups — so the same price lists and contracts — and the same
// addresses): a set's orders, addresses and members then live in its own copy, and the originals' — which a wave on
// the original accounts reads, e.g. the Sales Rep hub's served organizations — never move. The org aliases that name
// a cloned organization (ORG_ACME…) point at the copy inside the set (aliases.<env>.<set>.json). The clone is
// recorded in test-accounts.local.json under the original's password name, so a browser lane types the same NAME.
// Nothing here writes to an original or to an existing account.
//
// --fixtures: then each set's orders and returns (the set-aware seeders, persona-sets.mjs SET_AWARE_SEEDERS).
// --teardown: removes a set's clones, their organizations, their fixture orders (AGENT-TEST-ORD-…-<set>) and the
// set's alias file — the originals and every other set stay.
import "../../lib/sync-stdio.mjs"; // before any output: a piped stdout must not lose its tail to process.exit()
process.env.QA_PERSONA_SET = 'none'; // the originals, whatever this session is bound to
const { loadPersonaSets, cloneLogin, SET_AWARE_SEEDERS } = await import('../../lib/persona-sets.mjs');
const up = await import('../../lib/user-provision.mjs');
const { TestDataResolver } = await import('../../lib/test-data-resolver.ts');
const { readStore, envView, accountVars } = await import('../../lib/test-accounts.mjs');
const { join } = await import('node:path');
const { existsSync, readFileSync, rmSync, writeFileSync } = await import('node:fs');

const args = process.argv.slice(2);
const only = args.includes('--set') ? args[args.indexOf('--set') + 1] : null;
const dry = args.includes('--dry-run');
up.setFlags({ dryRun: dry, verbose: args.includes('--verbose') });
const api = (...a) => up.getApi()(...a);
const defs = loadPersonaSets(up.ROOT);
const sets = only ? [only] : defs.sets;
if (only && !defs.sets.includes(only)) { console.error(`unknown set ${only} — ${defs.sets.join(', ')}`); process.exit(1); }
const quietResolver = () => { const l = console.log; console.log = () => {}; try { return new TestDataResolver(join(up.ROOT, 'test-data'), up.TEST_ENV); } finally { console.log = l; } };
const resolver = quietResolver();
const cloneOrgName = (name, set) => `${name}-${set}`;
const setAliasFile = (set) => join(up.ROOT, 'test-data', `aliases.${up.TEST_ENV}.${set}.json`);

/** The original's login and password NAME, for a store name or an alias. */
/** Every account behind a listed name: a store account, or an alias's login — two for a lane slot row (its personal
 *  account and its B2B one, AGENT_POOL_SLOT_<n>.b2b_email). */
function originals(name) {
  const a = envView(readStore(up.ROOT), up.TEST_ENV).accounts[name];
  if (a?.login) {
    const { passwordVar } = accountVars(name, a);
    return [{ name, login: a.login, passwordName: typeof a.password === 'string' ? passwordVar : a.password?.use }];
  }
  const out = [];
  for (const [loginField, passwordField] of [['email', 'password'], ['b2b_email', 'b2b_password']]) {
    const login = resolver.resolve(`@td(${name}.${loginField})`);
    if (!login || login.startsWith('@td(')) continue;
    out.push({ name: loginField === 'email' ? name : `${name}.${loginField}`, login, passwordName: up.passwordVarOfCell(resolver.resolve(`@td(${name}.${passwordField})`)) });
  }
  if (!out.length) throw new Error(`${name}: neither a store account nor an alias with a login`);
  return out;
}

/** Org aliases (aliases.json, any alias with a platform_id field) by the platform id they resolve to. */
function orgAliasesById() {
  const base = JSON.parse(readFileSync(join(up.ROOT, 'test-data', 'aliases.json'), 'utf8'));
  const out = new Map();
  for (const [k, v] of Object.entries(base)) {
    if (!v?.fields?.platform_id || !/organizations/.test(String(v.file ?? ''))) continue;
    const id = resolver.resolve(`@td(${k}.platform_id)`);
    if (id && !id.startsWith('@td(')) out.set(id, [...(out.get(id) ?? []), k]);
  }
  return out;
}

/** The organizations a set copies for an account: its contact's organizations and its memberships'. Seeding and
 *  teardown both derive them here, so teardown finds every copy seeding made — aliased or not. */
const orgIdsOf = (contact, memberships) => [...new Set([...(contact?.organizations ?? []), ...(memberships ?? []).map((m) => m.organizationId)])];

function mergeSetAliases(set, updates) {
  if (dry || !Object.keys(updates).length) return;
  const p = setAliasFile(set);
  const cur = existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : {};
  for (const [k, v] of Object.entries(updates)) cur[k] = { ...(cur[k] ?? {}), ...v };
  cur._meta = { ...(cur._meta ?? {}), env: up.TEST_ENV, set, note: `Auto-generated: persona set ${set}'s organizations and fixtures on ${up.TEST_ENV} (npm run seed:wave-personas).` };
  writeFileSync(p, `${JSON.stringify(cur, null, 2)}\n`);
}

/** The set's copy of an organization: found by name, else created with the original's groups and addresses. */
async function cloneOrg(orgId, set) {
  const o = await api('GET', `/api/members/${orgId}`, null, { expectStatus: [200, 404] });
  if (!o?.id) throw new Error(`organization ${orgId} not found`);
  const name = cloneOrgName(o.name, set);
  const found = await up.findOrgByName(name);
  if (found?.id) return { id: found.id, name, created: false };
  const strip = (a) => { const { id, key, ...rest } = a ?? {}; return rest; };
  const body = {
    memberType: 'Organization', name, description: o.description, businessCategory: o.businessCategory,
    groups: o.groups ?? [], phones: o.phones ?? [], emails: o.emails ?? [], addresses: (o.addresses ?? []).map(strip),
  };
  if (dry) return { id: `dry-org-${name}`, name, created: true };
  const res = await api('POST', '/api/members', body, { expectStatus: [200, 201, 204] });
  let id = res?.id;
  for (let i = 0; !id && i < 10; i++) { await new Promise((r) => setTimeout(r, 3000)); id = (await up.findOrgByName(name))?.id; }
  if (!id) throw new Error(`${name}: created but not found after 30 s`);
  return { id, name, created: true };
}

await up.authenticate();

if (args.includes('--teardown')) {
  const accounts = defs.accounts.flatMap(originals);
  // The names of the originals' organizations, read once: a set's copy of each is `<name>-<set>` (cloneOrg).
  const origOrgNames = new Set();
  for (const o of accounts) {
    const orig = await up.findUserByEmail(o.login);
    if (!orig?.id) continue;
    const full = { ...orig, ...((await up.getUserById(orig.id)) ?? {}) };
    const contact = full.memberId ? await up.findContactById(full.memberId) : null;
    for (const id of orgIdsOf(contact, await up.searchMemberships(orig.id))) {
      const org = await api('GET', `/api/members/${id}`, null, { expectStatus: [200, 404] });
      if (org?.name) origOrgNames.add(org.name);
    }
  }
  for (const set of sets) {
    let users = 0, orders = 0;
    const isCopy = (name) => String(name ?? '').endsWith(`-${set}`);
    const copies = new Map(); // id → name; only organizations named `<…>-<set>` are ever deleted
    for (const name of origOrgNames) {
      const copy = await up.findOrgByName(cloneOrgName(name, set));
      if (copy?.id) copies.set(copy.id, cloneOrgName(name, set));
    }
    for (const o of accounts) {
      const login = cloneLogin(o.login, set);
      const u = await up.findUserByEmail(login);
      const c = u?.memberId ?? (await up.findContactByEmail(login))?.id;
      // The clone's own organizations too, before it goes — a copy of an org its original has left since seeding.
      const cc = c ? await up.findContactById(c) : null;
      for (const id of orgIdsOf(cc, u?.id ? await up.searchMemberships(u.id) : [])) {
        if (copies.has(id)) continue;
        const org = await api('GET', `/api/members/${id}`, null, { expectStatus: [200, 404] });
        if (isCopy(org?.name)) copies.set(id, org.name);
      }
      up.accountUnset(login); // dry: says what it would remove
      if (dry) { if (u?.id || c) users++; continue; }
      if (u?.id) await api('DELETE', `/api/platform/security/users?names=${encodeURIComponent(u.userName)}`, null, { expectStatus: [200, 204] });
      if (c) await api('DELETE', `/api/members?ids=${encodeURIComponent(c)}`, null, { expectStatus: [200, 204] });
      if (u?.id || c) users++;
    }
    // Every page first, then delete: deleting while paging shifts the pages under the cursor.
    const suffix = new RegExp(`-${set}$`);
    const mine = [];
    for (let skip = 0; ; skip += 100) {
      const r = await api('POST', '/api/order/customerOrders/search', { keyword: 'AGENT-TEST-ORD', take: 100, skip });
      const page = r?.results ?? [];
      mine.push(...page.filter((o) => suffix.test(o.number)));
      if (page.length < 100) break;
    }
    for (const o of mine) {
      orders++;
      if (dry) continue;
      const rets = await api('POST', '/api/return/search', { orderId: o.id, take: 100 }).catch(() => null);
      const ids = (rets?.results ?? []).filter((x) => x.orderId === o.id).map((x) => `ids=${encodeURIComponent(x.id)}`);
      if (ids.length) await api('DELETE', `/api/return?${ids.join('&')}`, null, { expectStatus: [200, 204] });
      await api('DELETE', `/api/order/customerOrders?ids=${o.id}`, null, { expectStatus: [200, 204] });
    }
    for (const [id, name] of copies) {
      if (!isCopy(name)) continue;
      if (!dry) await api('DELETE', `/api/members?ids=${encodeURIComponent(id)}`, null, { expectStatus: [200, 204] });
    }
    if (!dry && existsSync(setAliasFile(set))) rmSync(setAliasFile(set));
    console.log(`teardown ${set}: ${users} clone(s), ${orders} fixture order(s), ${copies.size} organization(s)${dry ? ' (dry run)' : ''}`);
  }
  process.exit(0);
}

let created = 0, reused = 0;
const seen = new Set();
const orgAliases = orgAliasesById();
for (const o of defs.accounts.flatMap(originals)) {
  const { name } = o;
  if (!o.passwordName) throw new Error(`${name}: no password name — a clone would need a password nobody declared`);
  const password = process.env[o.passwordName];
  if (!password) throw new Error(`${name}: ${o.passwordName} has no value for ${up.TEST_ENV} (npm run creds:check)`);
  const orig = await up.findUserByEmail(o.login);
  if (!orig?.id) throw new Error(`${name}: ${o.login} does not exist on ${up.TEST_ENV} — seed the original first`);
  // The search hit carries memberId; the GET-by-id is cache-flaky (user-provision.mjs findUserByEmail), so it only adds.
  const full = { ...orig, ...((await up.getUserById(orig.id)) ?? {}) };
  if ((full.roles ?? []).length) console.warn(`  ⚠ ${name}: ${o.login} has ${full.roles.length} global role(s) — a clone gets its org roles only`);
  const contact = await up.findContactById(full.memberId);
  if (!contact) throw new Error(`${name}: ${o.login} has no contact (memberId ${full.memberId ?? 'none'})`);
  const memberships = await up.searchMemberships(orig.id);
  for (const set of sets) {
    const login = cloneLogin(o.login, set);
    if (seen.has(login)) continue; // two names for one account share one clone
    seen.add(login);
    const orgMap = new Map();
    for (const id of orgIdsOf(contact, memberships)) {
      const c = await cloneOrg(id, set);
      orgMap.set(id, c);
      if (c.created) console.log(`  ✓ organization ${c.name}`);
      const names = orgAliases.get(id) ?? [];
      mergeSetAliases(set, Object.fromEntries(names.map((a) => [a, { platform_id: c.id, name: c.name }])));
    }
    const user = await up.findUserByEmail(login);
    if (user?.id) {
      reused++;
      // Clones seeded before 2026-11-26 carry the set in the last name ("Doe S1"); a digit fails the storefront name
      // pattern (KB-7339F16F), so profile edits on the clone are refused. Strip it; the set stays in fullName.
      // The full contact (not a search hit) goes back, so the PUT cannot drop its addresses or phones.
      const old = user.memberId ? await up.findContactById(user.memberId) : null;
      const fixed = old?.lastName?.replace(new RegExp(`\\s*${set}$`), '');
      if (old?.id && fixed && fixed !== old.lastName) {
        if (!dry) await api('PUT', '/api/members', { ...old, lastName: fixed }, { expectStatus: [200, 204] });
        console.log(`  ✎ ${name} ${set}: ${login} last name "${old.lastName}" → "${fixed}"${dry ? ' [DRY]' : ''}`);
      } else console.log(`  ↻ ${name} ${set}: ${login} exists — left as it is`);
      continue;
    }
    const body = {
      // The set goes into fullName only: a digit in lastName fails the storefront name pattern (KB-7339F16F).
      memberType: 'Contact', firstName: contact.firstName, lastName: contact.lastName ?? '',
      fullName: `${contact.fullName ?? `${contact.firstName} ${contact.lastName}`} ${set}`, emails: [login],
      organizations: (contact.organizations ?? []).map((id) => orgMap.get(id)?.id ?? id),
      defaultLanguage: contact.defaultLanguage, currencyCode: contact.currencyCode,
    };
    body.name = body.fullName;
    // A contact from an earlier, interrupted run is reused; a new one is taken from the create response, because the
    // member search reads the index and lags the write.
    let cloneContact = dry ? { id: `dry-contact-${login}` } : await up.findContactByEmail(login);
    if (!cloneContact?.id) {
      const res = await api('POST', '/api/members', body, { expectStatus: [200, 201, 204] });
      cloneContact = res?.id ? res : null;
      for (let i = 0; !cloneContact?.id && i < 10; i++) { await new Promise((r) => setTimeout(r, 3000)); cloneContact = await up.findContactByEmail(login); }
    }
    if (!cloneContact?.id) throw new Error(`${login}: contact created but not found after 30 s`);
    const userId = await up.ensureSecurityAccount(login, password, cloneContact.id, 'Approved');
    const existing = await up.searchMemberships(userId);
    for (const m of memberships) {
      const roleId = (m.roles ?? [])[0]?.roleId ?? (m.roles ?? [])[0]?.id;
      const c = orgMap.get(m.organizationId);
      if (!roleId || !c) continue;
      await up.ensureOrgMembership(userId, c.id, c.name, roleId, existing, false, login, m.status ?? null);
    }
    up.accountSet(login, password, o.passwordName);
    created++;
    console.log(`  ✓ ${name} ${set}: ${login} — ${orgMap.size} own organization(s), ${memberships.length} membership(s)`);
  }
}
console.log(`seed:wave-personas on ${up.TEST_ENV}: ${created} created, ${reused} already there${dry ? ' (dry run)' : ''}`);

if (args.includes('--fixtures')) {
  const { spawnSync } = await import('node:child_process');
  const scripts = { 'seed-order-states.mjs': 'seed:orders', 'seed-return-orders.mjs': 'seed:returns' };
  let failed = 0;
  for (const set of sets) for (const file of SET_AWARE_SEEDERS) {
    console.log(`\n── ${scripts[file]} for ${set}`);
    const r = spawnSync('npm', ['run', '-s', scripts[file], '--', ...(dry ? ['--dry-run'] : [])], {
      stdio: 'inherit', shell: true, env: { ...process.env, QA_PERSONA_SET: set, TEST_ENV: up.TEST_ENV },
    });
    if (r.status !== 0) { failed++; console.error(`   ${scripts[file]} for ${set} exited ${r.status}`); }
  }
  if (failed) process.exit(1);
}
