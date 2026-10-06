#!/usr/bin/env node
/**
 * seed-personal-fixtures.mjs — per-account state shared personas need (REG-2026-10-02-2022 triage).
 * Spec + rationale: personal-fixtures-specs.mjs. ADDITIVE ONLY on shared accounts:
 *   - USER_DEFAULT: adds 3 AGENT-TEST-marked addresses (never edits / removes its own);
 *   - USER_DEFAULT + ORG_USER_DEFAULT: one AGENT-TEST saved list each (found by name, else created);
 *   - USER_NO_ADDRESSES: READ-ONLY check that it still holds 0 addresses.
 * Idempotent: an address is matched by its marker (or, if someone else already added the same
 * address, by content — then it is left alone), a list by name, a list line by product id.
 *
 * Accounts resolve through their @td persona aliases (CSV row + {{VAR}} password) — never through
 * USER_EMAIL / ORG_USER_EMAIL, which on vcst point at DIFFERENT accounts than the aliases the suites
 * sign in with. Product ids come from the BUYABLE_* aliases' aliases.<env>.json overlay.
 *
 * Flags: --dry-run (reads only), --verify (read-back only, no writes), --teardown, --verbose.
 * Usage: TEST_ENV=vcst npm run seed:personal-fixtures [-- --dry-run|--verify]
 */
import '../../lib/sync-stdio.mjs'; // before any output: a piped stdout must not lose its tail to process.exit()
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  assertSafeTarget, auth, api, log, verbose, loadCsv, loadAliases, ROOT, BACK_URL, STORE_ID,
  DRY_RUN, TEARDOWN, writeEnvAliasOverride, verifyRemoved,
} from '../../lib/seed-common.mjs';
import { resolvePassword } from '../../lib/user-provision.mjs';
import {
  ADDRESS_BOOK, ADDRESS_SOURCE_CSV, LISTS, LIST_PRODUCT_ALIASES, ZERO_ADDRESS_PERSONA,
  buildAddress, addressContentKey, RECONCILE_FIELDS, isOurAddressMarker, addressMarker, resolvePersona, validateSpec,
  sortProblems,
} from './personal-fixtures-specs.mjs';

const VERIFY = process.argv.includes('--verify');
const TEST_ENV = process.env.TEST_ENV || 'vcst';
const CULTURE = 'en-US';

const aliases = loadAliases();
const loadRows = (file) => loadCsv(`test-data/${file}.csv`);
const overlay = (() => {
  const p = join(ROOT, `test-data/aliases.${TEST_ENV}.json`);
  try { return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : {}; } catch { return {}; }
})();

/* ── accounts ──────────────────────────────────────────────────────────────── */

async function account(aliasName) {
  const p = resolvePersona(aliases, aliasName, loadRows);
  const email = p.email;
  const s = await api('POST', '/api/platform/security/users/search', { keyword: email, take: 10 });
  const user = (s?.results || []).find((u) => [u.email, u.userName].some((v) => String(v || '').toLowerCase() === email.toLowerCase()));
  if (!user?.memberId) throw new Error(`${aliasName} (${email}): no security account / contact on ${BACK_URL}`);
  return { alias: aliasName, email, password: resolvePassword(p.password), userId: user.id, memberId: user.memberId };
}

async function getMember(memberId) {
  const m = await api('GET', `/api/members/${memberId}`, null, { expectStatus: [200, 404] });
  if (!m?.id) throw new Error(`member ${memberId} not found (empty body)`);
  return m;
}

async function userToken(acc) {
  const res = await fetch(`${BACK_URL}/connect/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'password', username: acc.email, password: acc.password, scope: 'offline_access', storeId: STORE_ID }),
  });
  if (res.status !== 200) throw new Error(`${acc.alias}: password grant ${res.status} ${(await res.text().catch(() => '')).slice(0, 160)}`);
  return (await res.json()).access_token;
}

async function gql(token, query, variables = {}) {
  const res = await fetch(`${BACK_URL}/graphql`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ query, variables }),
  });
  const j = await res.json().catch(() => ({}));
  if (j.errors?.length) throw new Error(`GraphQL: ${JSON.stringify(j.errors).slice(0, 240)}`);
  return j.data;
}

/* ── 1. address book ───────────────────────────────────────────────────────── */

function addressRows() {
  const byId = new Map(loadCsv(ADDRESS_SOURCE_CSV).map((r) => [r.address_id, r]));
  return ADDRESS_BOOK.rowIds.map((id) => byId.get(id));
}

async function seedAddresses(acc) {
  const member = await getMember(acc.memberId);
  const existing = member.addresses || [];
  const toAdd = [];
  const patched = [];
  let addresses = existing;
  for (const row of addressRows()) {
    const want = buildAddress(row);
    const marked = existing.find((a) => a.outerId === want.outerId);
    const sameContent = existing.find((a) => addressContentKey(a) === addressContentKey(want));
    if (marked) {
      // OUR address only (marker match): repair drifted fields in place — never a foreign address.
      const drift = RECONCILE_FIELDS.filter((k) => want[k] !== undefined && marked[k] !== want[k]);
      if (drift.length) {
        patched.push(`${row.address_id}(${drift.join(',')})`);
        addresses = addresses.map((a) => (a === marked ? { ...a, ...Object.fromEntries(drift.map((k) => [k, want[k]])) } : a));
      } else verbose(`↻ ${row.address_id} already present (marker), no drift`);
      continue;
    }
    if (sameContent) { log(`  ↻ ${row.address_id} already present WITHOUT our marker (outerId=${sameContent.outerId ?? 'null'}) — left untouched`); continue; }
    toAdd.push(want);
  }
  if (!toAdd.length && !patched.length) { log(`  ✓ ${acc.alias}: all ${ADDRESS_BOOK.rowIds.length} fixture addresses present (${existing.length} total)`); return; }
  if (DRY_RUN || VERIFY) { log(`  [${VERIFY ? 'VERIFY' : 'DRY'}] would add ${toAdd.length} / update ${patched.join(' ') || 0} on ${acc.alias}`); return; }
  // Append AFTER the persona's own addresses; existing entries are sent back exactly as read.
  await api('PUT', '/api/members', { ...member, addresses: [...addresses, ...toAdd] }, { expectStatus: [200, 204] });
  log(`  ✓ ${acc.alias}: added ${toAdd.length} address(es)${patched.length ? `, updated in place ${patched.join(' ')}` : ''}`);
}

/* ── 2/3. saved lists ──────────────────────────────────────────────────────── */

function productIds() {
  return LIST_PRODUCT_ALIASES.map((a) => {
    const id = overlay[a]?.id;
    if (!id) throw new Error(`@td(${a}.id) has no value in aliases.${TEST_ENV}.json — seed the product fixtures first (npm run seed:products)`);
    return { alias: a, id };
  });
}

async function findList(token, name) {
  const d = await gql(token, 'query($s:String!){ wishlists(storeId:$s,first:100){ items{ id name } } }', { s: STORE_ID });
  return (d?.wishlists?.items || []).filter((w) => w.name === name);
}

async function readList(token, id) {
  const d = await gql(token, `query($id:String!){ wishlist(listId:$id){ id name modifiedDate items{ id product{ id name
    availabilityData{ isBuyable } price{ actual{ amount } } } } } }`, { id });
  return d?.wishlist;
}

async function seedList(spec, acc, products) {
  const token = await userToken(acc);
  const me = (await gql(token, 'query{ me { id } }'))?.me?.id;
  const found = await findList(token, spec.listName);
  if (found.length > 1) log(`  ⚠ ${spec.alias}: ${found.length} lists named "${spec.listName}" — using the first; teardown removes all`);
  let id = found[0]?.id;
  if (!id) {
    if (DRY_RUN || VERIFY) { log(`  [${VERIFY ? 'VERIFY' : 'DRY'}] would create "${spec.listName}" for ${acc.alias} with ${products.length} product(s)`); return null; }
    const d = await gql(token, 'mutation($c:InputCreateWishlistType!){ createWishlist(command:$c){ id } }',
      { c: { storeId: STORE_ID, userId: me, listName: spec.listName, cultureName: CULTURE } });
    id = d?.createWishlist?.id;
    if (!id) throw new Error(`${spec.alias}: createWishlist returned no id`);
    log(`  ✓ created "${spec.listName}" for ${acc.alias}`);
  }
  let list = await readList(token, id);
  const have = new Set((list?.items || []).map((i) => i.product?.id).filter(Boolean));
  const missing = products.filter((p) => !have.has(p.id));
  if (missing.length && !(DRY_RUN || VERIFY)) {
    for (const p of missing) {
      await gql(token, 'mutation($c:InputAddWishlistItemType!){ addWishlistItem(command:$c){ id } }', { c: { listId: id, productId: p.id, quantity: 1 } });
    }
    log(`  ✓ ${spec.alias}: added ${missing.map((p) => p.alias).join(', ')}`);
    list = await readList(token, id);
  } else if (missing.length) log(`  [${VERIFY ? 'VERIFY' : 'DRY'}] would add ${missing.map((p) => p.alias).join(', ')} to ${spec.alias}`);
  const items = list?.items || [];
  const resolved = items.filter((i) => i.product?.id);
  const buyable = resolved.filter((i) => i.product.availabilityData?.isBuyable && Number(i.product.price?.actual?.amount) > 0);
  const problems = [];
  if (resolved.length < spec.minItems) problems.push(`${resolved.length}/${spec.minItems} items resolve to a product for the owner`);
  if (spec.requireBuyable && buyable.length < spec.minItems) problems.push(`only ${buyable.length}/${spec.minItems} items are buyable with a price for the owner`);
  log(`  ${problems.length ? '✗' : '✓'} ${spec.alias}: "${list?.name}" — ${items.length} item(s), ${buyable.length} buyable+priced${problems.length ? ` — ${problems.join('; ')}` : ''}`);
  return { id, name: list?.name, items: items.length, problems };
}

/* ── 4. zero-address persona ───────────────────────────────────────────────── */

async function checkZeroAddress() {
  const acc = await account(ZERO_ADDRESS_PERSONA.alias);
  const n = ((await getMember(acc.memberId)).addresses || []).length;
  log(`  ${n === 0 ? '✓' : '✗'} ${ZERO_ADDRESS_PERSONA.alias} (${acc.email}): ${n} address(es)${n ? ' — CHK-095 needs 0; NOT deleting (shared account), investigate who added them' : ''}`);
  return n;
}

/* ── live read-back as the owner (what the storefront actually sees) ───────── */

async function readBackAddresses(acc) {
  const token = await userToken(acc);
  const q = (sort) => `addresses(first:50${sort ? `, sort:"${sort}"` : ''}){ totalCount items{ name firstName lastName city postalCode outerId } }`;
  const d = await gql(token, `query{ me{ contact{ def: ${q(null)} } } }`.replace('def: ', ''));
  const s = await gql(token, `query{ me{ contact{ asc: ${q('name:asc')} desc: ${q('name:desc')} } } }`);
  const a = d?.me?.contact?.addresses;
  const items = a?.items || [];
  const ours = items.filter((x) => isOurAddressMarker(x.outerId));
  const missing = ADDRESS_BOOK.rowIds.filter((id) => !items.some((x) => x.outerId === addressMarker(id)));
  log(`  ${missing.length ? '✗' : '✓'} xAPI me.contact.addresses (${acc.alias}): total ${a?.totalCount}, ours ${ours.length}${missing.length ? `, MISSING ${missing.join(',')}` : ''}`);
  const fmt = (xs) => xs.map((x) => `${x.name ?? '∅'}`).join(' | ');
  const asc = s?.me?.contact?.asc?.items || [], desc = s?.me?.contact?.desc?.items || [];
  log(`    default   : ${fmt(items)}`);
  log(`    name:asc  : ${fmt(asc)}`);
  log(`    name:desc : ${fmt(desc)}`);
  const key = (xs) => xs.map((x) => x.name).join(' ');
  const liveSort = [];
  // Observed on vcst 2026-10-05: xAPI default order IS name ascending (null names first), so no data can make
  // the first click differ from the default — that half of CHK-114 is a case-design question, reported, not failed.
  if (key(asc) === key(items)) log('    · default order == name:asc (platform default sort) — CHK-114 "first click differs from default" is not decidable by data');
  if (asc.length < 2) liveSort.push('fewer than 2 addresses');
  if (key(desc) !== key([...asc].reverse())) liveSort.push('name:desc is not the exact reverse of name:asc');
  if (liveSort.length) log(`    ✗ live name sort not decidable: ${liveSort.join('; ')}`);
  // What data CAN guarantee: every name present and distinct, and desc is the exact reverse of asc.
  const sp = [...sortProblems(items).filter((e) => /^name: (empty|duplicate)/.test(e)), ...liveSort];
  // The default order is the PLATFORM's (observed: not insertion order, and it changes when the same
  // addresses are re-created), so the seed order cannot guarantee it — check what the storefront gets.
  if (sp.length) log(`    ✗ live name sort is not decidable (CHK-114 / A11Y-SORT would be vacuous): ${sp.join('; ')} — re-run teardown + seed to re-create the addresses`);
  return { total: a?.totalCount ?? items.length, missing, sortProblems: sp };
}

/* ── teardown ──────────────────────────────────────────────────────────────── */

async function teardown() {
  log('TEARDOWN — removing only what this seeder marks / names');
  const acc = await account(ADDRESS_BOOK.ownerAlias);
  const member = await getMember(acc.memberId);
  const keep = (member.addresses || []).filter((a) => !isOurAddressMarker(a.outerId));
  const drop = (member.addresses || []).length - keep.length;
  if (drop && !DRY_RUN) await api('PUT', '/api/members', { ...member, addresses: keep }, { expectStatus: [200, 204] });
  log(`  ${DRY_RUN ? '[DRY] would remove' : 'removed'} ${drop} marked address(es) from ${acc.alias} (kept ${keep.length})`);
  const writeback = { [ADDRESS_BOOK.alias]: { live_count: keep.length, live_order_sort_discriminating: false } };
  for (const spec of LISTS) {
    const o = await account(spec.ownerAlias);
    const token = await userToken(o);
    for (const l of await findList(token, spec.listName)) {
      if (!DRY_RUN) await gql(token, 'mutation($c:InputRemoveWishlistType!){ removeWishlist(command:$c) }', { c: { listId: l.id } });
      log(`  ${DRY_RUN ? '[DRY] would remove' : 'removed'} "${spec.listName}" (${spec.ownerAlias})`);
    }
    writeback[spec.alias] = { id: '', items_count: 0 };
  }
  const residue = await verifyRemoved(async () => {
    let n = ((await getMember(acc.memberId)).addresses || []).filter((a) => isOurAddressMarker(a.outerId)).length;
    for (const spec of LISTS) n += (await findList(await userToken(await account(spec.ownerAlias)), spec.listName)).length;
    return n;
  });
  writeEnvAliasOverride(writeback);
  if (residue) { console.error(`  ✗ ${residue} item(s) still present after teardown`); process.exit(1); }
  log(DRY_RUN ? 'DRY RUN teardown complete (no writes).' : 'Teardown complete — zero residue.');
}

/* ── main ──────────────────────────────────────────────────────────────────── */

async function main() {
  assertSafeTarget();
  const specErrs = validateSpec({ addressRows: loadCsv(ADDRESS_SOURCE_CSV), aliases, loadRows });
  if (specErrs.length) { specErrs.forEach((e) => console.error(`  ✗ ${e}`)); throw new Error('spec invalid — run npm run td:validate:personal-fixtures'); }
  await auth();
  if (TEARDOWN) { await teardown(); return; }

  console.log(`\n[1] ${ADDRESS_BOOK.alias} → ${ADDRESS_BOOK.ownerAlias}`);
  const owner = await account(ADDRESS_BOOK.ownerAlias);
  await seedAddresses(owner);
  const rb = (DRY_RUN) ? null : await readBackAddresses(owner);

  console.log('\n[2] saved lists');
  const products = productIds();
  const lists = [];
  for (const spec of LISTS) lists.push([spec, await seedList(spec, await account(spec.ownerAlias), products)]);

  console.log(`\n[3] ${ZERO_ADDRESS_PERSONA.alias} (read-only)`);
  const zero = await checkZeroAddress();

  const writeback = { [ZERO_ADDRESS_PERSONA.alias]: { live_address_count: zero } };
  if (rb) writeback[ADDRESS_BOOK.alias] = { live_count: rb.total, live_order_sort_discriminating: rb.sortProblems.length === 0 };
  for (const [spec, r] of lists) if (r) writeback[spec.alias] = { id: r.id, items_count: r.items };
  if (!VERIFY) writeEnvAliasOverride(writeback);

  const failed = (rb?.missing.length || 0) + (rb?.sortProblems.length ? 1 : 0) + lists.filter(([, r]) => r?.problems.length).length + (zero ? 1 : 0);
  if (failed && !DRY_RUN) { console.error(`\n✗ ${failed} fixture(s) not data-ready — see ✗ above.`); process.exit(1); }
  log(DRY_RUN ? '\nDRY RUN complete (no writes).' : `\n${VERIFY ? 'Verify' : 'Seed'} complete — runtime ids in aliases.${TEST_ENV}.json.`);
}

main().catch((e) => { console.error('SEED FAILED:', e.message); process.exit(1); });
