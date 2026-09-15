#!/usr/bin/env node
/**
 * seed-org-loyalty.mjs — provision the ORGANIZATION-MODE loyalty fixtures (VCST-5024,
 * vc-module-loyalty PR #17).
 *
 * Rationale, the fixture inventory, the divergence rules and the one thing this set CANNOT express
 * all live in `org-loyalty-specs.mjs` (imported, never restated).
 *
 * WHAT IT CREATES
 *   1. ONE dedicated AGENT-TEST organization with a shipping address (the "outlet").
 *   2. THREE org members — ORG_LOY_A, ORG_LOY_B (different roles + DIVERGENT earn quantities) and
 *      ORG_LOY_LOCKED (OrganizationMembership.isLocked = true) — all in the customer group that
 *      proxies org membership for mission targeting.
 *   3. ONE account with NO organization at all (LOY_PERSONAL_NOORG), FUNDED above the cheapest live
 *      PTS line by placing a real earn order.
 *   4. THREE fresh, per-run, group-targeted missions, each in its OWN sweep name-space so minting
 *      one never deletes another: ORG_LOY_MISSION (count 1, generation 1 — consumed, kept as evidence),
 *      ORG_LOY_MISSION_2 (count 1, the live shared-COMPLETION probe) and ORG_LOY_MISSION_PARTIAL
 *      (count 2, the PARTIAL-ACCUMULATION probe). Their rewards are mutually distinct so a balance
 *      delta names exactly one of them.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 *   • It never reads or writes `Loyalty.LoyaltyBalanceCalculationMode` (or any other store setting).
 *     Seeding happens in whatever mode the store is in; the RUN flips the mode and restores it.
 *   • It does not pre-earn for ORG_LOY_A / ORG_LOY_B. Points earned in `Customer` mode are keyed to
 *     the USER, so a balance carried across the mode flip makes the post-flip pooled arithmetic
 *     ambiguous. What is provisioned instead is each account's DIVERGENT earn PLAN (`earn_qty` +
 *     the live points-per-unit measured at seed time), which the run consumes after flipping.
 *
 * A BALANCE CANNOT BE RESET ON THIS PLATFORM. `vc-module-loyalty` exposes the operation log
 * READ-ONLY — there is no balance set/debit API, so a balance moves ONLY when the handler earns or
 * redeems on a REAL order (`loyalty-earn.mjs`). Consequences every consumer inherits:
 *   • funding LOY_PERSONAL_NOORG places a real, non-reversible order;
 *   • `--teardown` CANNOT un-earn points — it deletes the accounts, and the stranded operation-log
 *     rows are not purgeable;
 *   • EVERY balance assertion a suite makes must be RELATIVE to a value read immediately before the
 *     action, never absolute. The `balance_at_seed` fields in the overlay are a seed-time READING,
 *     not a contract.
 *
 * TWO ADMIN TOKENS, ON PURPOSE. `seed-common.mjs` owns the loyalty/mission/storefront surface and the
 * alias writeback; `user-provision.mjs` owns the member graph (orgs, contacts, security accounts,
 * org-scoped roles, membership lock/status) and has its own authenticated client. Re-implementing
 * either here would be a second copy of a sequence that was found by failing probes, so both are
 * authenticated and each is used for what it owns.
 *
 * Usage:
 *   node scripts/seed-data/loyalty/seed-org-loyalty.mjs                     # full seed (mints a NEW generation of every mission)
 *   node scripts/seed-data/loyalty/seed-org-loyalty.mjs --dry-run --verbose
 *   node scripts/seed-data/loyalty/seed-org-loyalty.mjs --teardown [--max-age-hours 6]
 *   node scripts/seed-data/loyalty/seed-org-loyalty.mjs --skip-funding      # accounts + missions, no funding order
 *
 *   # Re-mint missions ONLY — no org, no accounts, no balance read, no order. This is the path to take
 *   # when a mission has been CONSUMED (OrderCountGoal progress is terminal with no reset path, so a
 *   # new mission is the only way back to a decidable question) and the accounts must not be disturbed:
 *   node scripts/seed-data/loyalty/seed-org-loyalty.mjs --missions-only --only ORG_LOY_MISSION_2,ORG_LOY_MISSION_PARTIAL
 */

import {
  assertSafeTarget, auth, api, log, verbose, loadCsv,
  writeEnvAliasOverride, verifyRemoved,
  DRY_RUN, VERBOSE, TEARDOWN, STORE_ID, BACK_URL,
} from '../../lib/seed-common.mjs';
import {
  setFlags, authenticate, seedOrgs, ensureRoles, seedInlineOrgUsers,
  deleteUserByEmail, findContactByEmail, findUserByEmail, searchMemberships,
} from '../../lib/user-provision.mjs';
import {
  resolveWinningEarning, placeEarnOrder, pollBalanceChange, pointsPerUnit, readLoyaltyBalance,
} from './loyalty-earn.mjs';
import { newHandle, handleAgeHours, storefrontToken } from '../../lib/loyalty-ephemeral-account.mjs';
import {
  OUTLET_ORG, SIBLING_ORG, resolveSiblingOrg, orgSeedRow,
  CSV_SOURCE, loadAccounts, accountByAlias, RUNTIME_ALIAS_FIELDS,
  MISSIONS, MISSION_ALIASES, MISSION_NAME_PREFIX, isOrgLoyMissionName, isMissionOfSpec,
  buildMissionBody, validateFixtureShape, validateSeededState,
} from './org-loyalty-specs.mjs';

const argv = process.argv.slice(2);
const argVal = (flag, dflt = null) => (argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : dflt);
const SKIP_FUNDING = argv.includes('--skip-funding');
/**
 * `--max-age-hours` is an explicit OPT-OUT, not the default.
 *
 * The ephemeral-ACCOUNT sweeps spare recent handles because two parallel runs each own their own
 * accounts and must not delete each other's. That reasoning does NOT transfer here. A sweep is scoped
 * to ONE mission spec's name-space, and within that name-space every generation carries the SAME
 * reward and the SAME targeting — so a spared predecessor is a second live mission granting an
 * identical amount to the same three accounts, and a balance delta can no longer name which
 * GENERATION produced it. Measured on the first two live seeds: ...-141323-7834 and ...-141706-2356,
 * both Published, both group-targeted, both reward 617.
 *
 * So a seed sweeps every predecessor OF THE SPEC IT IS SEEDING by default, and never touches a
 * sibling spec. Pass `--max-age-hours N` only when you deliberately want a predecessor to survive,
 * and accept that attribution within that spec is then ambiguous.
 */
const MAX_AGE_HOURS = argVal('--max-age-hours') != null ? Number(argVal('--max-age-hours')) : null;
const SWEEP_ALL_ON_SEED = MAX_AGE_HOURS == null;

/**
 * `--missions-only` + `--only <ALIAS[,ALIAS]>` — mint or re-mint SOME missions and touch nothing else.
 *
 * This exists because a consumed mission is not a repairable mission. `OrderCountGoal` progress is
 * terminal per owner with no reset path, so the only way back to a decidable question is a NEW
 * mission — and minting it must not re-run the member graph, because by then the accounts carry live
 * balances and mission history that are themselves the evidence a run is reasoning about. A full
 * re-seed would rewrite `balance_at_seed` out from under that reasoning and, if an account had drifted
 * below its funding floor, would place a real order as well.
 */
const MISSIONS_ONLY = argv.includes('--missions-only');
const ONLY = argVal('--only');
const ONLY_SET = ONLY ? new Set(ONLY.split(',').map((s) => s.trim()).filter(Boolean)) : null;
const missionSpecsInScope = () => MISSIONS.filter((m) => !ONLY_SET || ONLY_SET.has(m.aliasName));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isDry = (v) => String(v || '').startsWith('dry-');

/* ── storefront helpers (customer token, not the admin one) ──────────────────── */

async function gqlAs(token, query, label) {
  const res = await fetch(`${BACK_URL}/graphql`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const j = await res.json().catch(() => ({}));
  if (j.errors?.length) throw new Error(`${label}: ${JSON.stringify(j.errors).slice(0, 240)}`);
  verbose(`gql ${label} ok`);
  return j.data;
}

/**
 * The store's own default currency + language, read live.
 *
 * Not literals: `reference_xapi_ambient_context_args` — an xAPI query that omits the ambient context
 * (cultureName / currencyCode / storeId / userId) answers 200 with data resolved against SOME other
 * context, so a price read without a currency is a number whose units are unknown. And per the GOLDEN
 * RULE the currency belongs to the store, not to this file.
 */
let AMBIENT = { currency: 'USD', culture: 'en-US' };
async function loadAmbientContext() {
  const store = await api('GET', `/api/stores/${encodeURIComponent(STORE_ID)}`, null, { expectStatus: [200] });
  const currency = store?.defaultCurrency;
  const culture = store?.defaultLanguage;
  if (!currency || !culture) {
    throw new Error(`store ${STORE_ID} has no defaultCurrency/defaultLanguage — that is a BROKEN STOREFRONT, not a fixture problem `
      + '(see npm run td:reconcile:store). Repair the store before seeding.');
  }
  AMBIENT = { currency, culture };
  log(`Ambient context from the store: currency ${currency}, culture ${culture}`);
}

/**
 * xAPI buyability/price/stock for a product as the user — also proves catalog linkage.
 *
 * A GraphQL ERROR is NOT the same as "not buyable" and must never be reported as one. The first
 * version of this swallowed both into `null`, and a transient INVALID_OPERATION on a just-created
 * account surfaced as "no winning ProductPoints program resolved to a buyable factor SKU" — an abort
 * message pointing at the wrong half of the system. Errors are now counted and surfaced.
 */
let earnProbeErrors = 0;
async function earnInfoAs(token, productId) {
  let d;
  try {
    d = await gqlAs(token, `query { product(id: "${productId}" storeId: "${STORE_ID}" cultureName: "${AMBIENT.culture}" currencyCode: "${AMBIENT.currency}") { code availabilityData { isBuyable isAvailable availableQuantity } price { actual { amount } } } }`, 'earn_product');
  } catch (e) {
    earnProbeErrors += 1;
    log(`  ⚠ product ${productId} probe ERRORED (not the same as "not buyable"): ${String(e.message).slice(0, 160)}`);
    return null;
  }
  const p = d?.product;
  const unitPrice = Number(p?.price?.actual?.amount || 0);
  if (!p?.availabilityData?.isBuyable || !p?.availabilityData?.isAvailable || !(unitPrice > 0)) {
    verbose(`product ${productId} is not a usable earn target (buyable=${p?.availabilityData?.isBuyable}, price=${unitPrice})`);
    return null;
  }
  return { sku: p.code, productId, unitPrice, availableQuantity: Number(p.availabilityData.availableQuantity ?? 0) };
}

/**
 * Admin read of the live balance (the points key is the SECURITY-ACCOUNT userId, not the contact).
 *
 * Delegates to the shared `readLoyaltyBalance`, which RESOLVES the route against the live build: PR
 * #17 moved `/balance/{userId}` to `/balance/user/{userId}` (and added `/balance/organization/{id}`),
 * and every caller still on the legacy path swallows the 404 and reads 0 for every account.
 */
let balanceSource = null;
async function readBalance(userId) {
  const { balance, source } = await readLoyaltyBalance(api, { userId });
  if (source !== balanceSource) { balanceSource = source; log(`  balance source: ${source}`); }
  return balance ?? 0;
}

/** The contact's stored customer groups, read back from the platform (never echoed from input). */
async function contactGroups(contactId) {
  const m = await api('GET', `/api/members/${encodeURIComponent(contactId)}`, null, { expectStatus: [200, 404] }).catch(() => null);
  return m?.groups || [];
}

/**
 * Resolve a fixture's Contact id — via the SECURITY ACCOUNT first, and only then by search.
 *
 * `findContactByEmail` goes through the member SEARCH INDEX, which lags a write by seconds. Right
 * after this seeder creates the contacts it returns nothing, and the first version of this file then
 * silently skipped the group patch and recorded the CSV's *intended* groups as if they were observed —
 * a fixture that looked provisioned and targeted NOBODY. `GET /api/platform/security/users/{email}`
 * is a direct read and carries `memberId`, so it cannot lag.
 */
async function resolveContactId(email) {
  const user = await findUserByEmail(email);
  if (user?.memberId) return user.memberId;
  const contact = await findContactByEmail(email);
  return contact?.id || null;
}

/**
 * Put a contact into the outlet group, idempotently.
 *
 * The group is the ONLY input `UserGroupIsCondition` reads (`LoyaltyLogicService.GetUserGroups` →
 * `member.Groups`), and the server's match is ordinal case-insensitive and NOT trimmed — so the
 * stored value is read BACK rather than assumed. A silently dropped or padded group targets NOBODY,
 * and the mission would then simply be absent from the storefront, which reads as a product bug.
 */
async function ensureContactGroups(contactId, wanted) {
  const cur = await contactGroups(contactId);
  const missing = wanted.filter((g) => !cur.some((c) => String(c).toLowerCase() === g.toLowerCase()));
  if (!missing.length) { verbose(`contact ${contactId} already in [${cur.join(', ')}]`); return cur; }
  const member = await api('GET', `/api/members/${encodeURIComponent(contactId)}`, null, { expectStatus: [200] });
  member.groups = [...(member.groups || []), ...missing];
  await api('PUT', '/api/members', member, { expectStatus: [200, 201, 204] });
  const after = await contactGroups(contactId);
  log(`  ✓ groups for ${contactId}: [${after.join(', ')}]`);
  return after;
}

/* ── mission ─────────────────────────────────────────────────────────────────── */

async function findOrgLoyMissions(spec = null) {
  const r = await api('POST', '/api/loyalty-missions/search', { keyword: MISSION_NAME_PREFIX, take: 200 }, { expectStatus: [200, 201] });
  const all = (r?.results || []).filter((m) => isOrgLoyMissionName(m.name));
  return spec ? all.filter((m) => isMissionOfSpec(spec, m.name)) : all;
}

/**
 * Mint a NEW mission every run, and sweep older ones past `--max-age-hours`.
 *
 * Deliberately NOT find-or-create. Mission completion is TERMINAL per owner and there is no progress
 * reset path on this build (`/api/loyalty-mission-progress` is search+get and nothing else), so a
 * reused mission passes its case once and is a permanent false red afterwards — exactly the
 * `MSN-026` failure recorded in `test-data-authoring.md` §DISPOSABLE FIXTURES. The age floor is what
 * stops a concurrent run being torn down underneath itself.
 */
async function seedMission(spec, template) {
  const runId = newHandle('');
  const body = buildMissionBody({ template, storeId: STORE_ID, runId, spec });
  const created = await api('POST', '/api/loyalty-missions', body, { expectStatus: [200, 201] });
  const id = created?.id || `dry-mission-${runId}`;
  log(`  ✓ ${spec.aliasName}: ${body.name} (${id}) — ${spec.goal.type} ${spec.goal.count}, reward ${spec.reward}, group [${spec.condition.groups.join(', ')}]`);
  log(`      decides: ${spec.decides}`);
  // Scoped to THIS spec's own name-space, so minting one mission can never delete a sibling.
  const swept = await sweepMissions({ spec, keepId: id, all: SWEEP_ALL_ON_SEED });
  if (!SWEEP_ALL_ON_SEED) {
    log(`  ⚠ --max-age-hours was passed: a spared predecessor of ${spec.aliasName} also grants `
      + `${spec.reward} to the same group, so a balance delta can no longer name which generation produced it.`);
  }
  verbose(`sweep removed ${swept} predecessor(s) of ${spec.aliasName}`);
  return { id, name: body.name, runId, startDate: body.startDate, endDate: body.endDate };
}

/**
 * Sweep predecessors. `spec` SCOPES the sweep to one mission's own name-space; omitting it sweeps
 * every org-loyalty mission (keyed or legacy) and is teardown's mode only.
 */
async function sweepMissions({ spec = null, keepId = null, all = false } = {}) {
  const live = await findOrgLoyMissions(spec);
  const doomed = [];
  for (const m of live) {
    if (keepId && m.id === keepId) continue;
    const age = handleAgeHours(m.name);
    if (!all && MAX_AGE_HOURS != null && age != null && age < MAX_AGE_HOURS) {
      verbose(`spared mission ${m.name} (${age.toFixed(1)}h old)`);
      continue;
    }
    doomed.push(m);
  }
  if (!doomed.length) { verbose(`no stale ${spec ? spec.aliasName : 'ORGLOY'} mission(s) to sweep`); return 0; }
  const qs = doomed.map((m) => `ids=${encodeURIComponent(m.id)}`).join('&');
  await api('DELETE', `/api/loyalty-missions?${qs}`, null, { expectStatus: [200, 204, 404] });
  log(`  swept ${doomed.length} stale ${spec ? spec.aliasName : 'ORGLOY'} mission(s)`);
  return doomed.length;
}

/** Mint every mission spec in scope, each from the SAME live template. Returns {alias: {...}}. */
async function seedMissions() {
  const specs = missionSpecsInScope();
  if (!specs.length) throw new Error(`--only "${ONLY}" matched no mission alias (${MISSION_ALIASES.join(', ')})`);
  const template = await api('GET', '/api/loyalty-missions/new', null, { expectStatus: [200] });
  const out = {};
  for (const spec of specs) out[spec.aliasName] = await seedMission(spec, template);
  return out;
}

function reportMissions(missionByAlias) {
  for (const [alias, m] of Object.entries(missionByAlias)) {
    const spec = MISSIONS.find((s) => s.aliasName === alias);
    console.log(`   ${alias.padEnd(23)} ${m.id}  ${spec.goal.type} ${spec.goal.count}, reward ${spec.reward}`);
    console.log(`   ${' '.repeat(23)} ${m.name}`);
  }
}

/* ── earning ─────────────────────────────────────────────────────────────────── */

/**
 * What ONE account would earn per unit right now. Read-only: it resolves the account's winning
 * ProductPoints program and its buyable factor SKU without placing anything.
 *
 * Measured rather than declared, per the GOLDEN RULE: points = factor x unit price x qty, and the
 * factor belongs to whichever program wins for THAT user's groups. A literal here would be correct
 * once and then silently wrong.
 */
async function measureEarn(token, groups) {
  const earn = await resolveWinningEarning({
    api,
    earnInfo: (productId) => earnInfoAs(token, productId),
    userGroups: groups,
    onFallback: (top, used) => log(`  ⚠ top winner "${top.name}" has no buyable factor SKU — using "${used.name}"`),
  });
  if (!earn) return null;
  return { ...earn, perUnit: pointsPerUnit(earn.factor, earn.unitPrice) };
}

/**
 * The cheapest PTS-priced, buyable line on the store, as this user sees it.
 *
 * This is the FUNDING FLOOR for LOY_PERSONAL_NOORG, measured rather than declared: it is what makes
 * "blocked from spending" attributable to the org-scope bug instead of to a shortfall.
 */
async function cheapestPtsLine(token, userId) {
  const ptsCode = process.env.LOYALTY_CURRENCY || 'PTS';
  const d = await gqlAs(token, `query { products(storeId: "${STORE_ID}" userId: "${userId}" cultureName: "${AMBIENT.culture}" currencyCode: "${ptsCode}" first: 50 filter: "price.${ptsCode}:(0 TO)") { totalCount items { code price { actual { amount } } availabilityData { isBuyable } } } }`, 'pts_products').catch(() => null);
  const items = (d?.products?.items || [])
    .filter((i) => i.availabilityData?.isBuyable && Number(i.price?.actual?.amount) > 0)
    .map((i) => ({ sku: i.code, price: Number(i.price.actual.amount) }))
    .sort((x, y) => x.price - y.price);
  if (!items.length) return null;
  // Both ends, because they answer different questions: the CHEAPEST is the funding FLOOR (below it a
  // refusal is a shortfall, not the scope bug), the DEAREST is the HEADROOM (above it the account can
  // be asked to buy ANY PTS line, so a case need not pick its product carefully).
  return { ...items[0], dearestSku: items[items.length - 1].sku, dearestPrice: items[items.length - 1].price, seen: items.length };
}

/* ── teardown ────────────────────────────────────────────────────────────────── */

async function findOutletOrg() {
  const r = await api('POST', '/api/members/search', { memberType: 'Organization', keyword: OUTLET_ORG.name, take: 20, deep: true }, { expectStatus: [200, 201] });
  return (r?.results || []).find((m) => m.name === OUTLET_ORG.name) || null;
}

async function teardown(accounts) {
  log('Teardown — bottom-up: missions → accounts → org.');
  const swept = await sweepMissions({ all: true });

  let removed = 0;
  for (const a of accounts) {
    const r = await deleteUserByEmail(a.email);
    if (r.account || r.contact) removed += 1;
  }
  log(`  removed ${removed}/${accounts.length} account(s)`);

  const org = await findOutletOrg();
  if (org?.id) {
    await api('DELETE', `/api/members?ids=${encodeURIComponent(org.id)}`, null, { expectStatus: [200, 204, 404] });
    log(`  deleted outlet org ${OUTLET_ORG.name} (${org.id})`);
  }

  // Zero-residue asserts, one per entity family.
  const orgResidue = await verifyRemoved(async () => {
    const r = await api('POST', '/api/members/search', { memberType: 'Organization', keyword: OUTLET_ORG.name, take: 5, deep: true }, { expectStatus: [200, 201] });
    return (r?.results || []).filter((m) => m.name === OUTLET_ORG.name);
  });
  const acctResidue = await verifyRemoved(async () => {
    const hits = [];
    for (const a of accounts) {
      if (await findUserByEmail(a.email)) hits.push(a.email);
      else if (await findContactByEmail(a.email)) hits.push(a.email);
    }
    return hits;
  });
  const missionResidue = await verifyRemoved(async () => findOrgLoyMissions());

  // The overlay is COMMITTED. Leaving torn-down runtime ids in it would leave a dead identity that
  // still RESOLVES — the exact silent failure td:reconcile [11] exists to catch.
  writeEnvAliasOverride({
    ORG_LOY_A: { userId: '', contactId: '', org_id: '', sibling_org_id: '', earn_points_expected: '', balance_at_seed: '' },
    ORG_LOY_B: { userId: '', contactId: '', org_id: '', earn_points_expected: '', balance_at_seed: '' },
    ORG_LOY_LOCKED: { userId: '', contactId: '', org_id: '', membershipId: '', balance_at_seed: '' },
    LOY_PERSONAL_NOORG: { userId: '', contactId: '', balance_at_seed: '', cheapest_pts_sku: '', cheapest_pts_price: '', dearest_pts_sku: '', dearest_pts_price: '' },
    ...Object.fromEntries(MISSION_ALIASES.map((a) => [a, { id: '', name: '', run_id: '', seeded_at: '' }])),
  });

  const clean = orgResidue === 0 && acctResidue === 0 && missionResidue === 0;
  log(clean
    ? `Teardown complete — zero residue (${swept} mission(s), ${removed} account(s), org removed).`
    : `WARN residue: ${missionResidue} mission(s), ${acctResidue} account(s), ${orgResidue} org(s)`);
  log('NOTE: loyalty operation-log rows for deleted accounts are NOT purgeable (read-only API) and remain stranded. '
    + 'They are harmless for balances — a re-seeded account is a new id and starts at 0 — but they accumulate.');
  return clean;
}

/* ── main ────────────────────────────────────────────────────────────────────── */

async function main() {
  console.log(`\n🏬 Org-mode loyalty fixtures (VCST-5024)${DRY_RUN ? ' [DRY RUN]' : ''}${TEARDOWN ? ' [TEARDOWN]' : ''}`);
  assertSafeTarget();

  const rows = loadCsv(`test-data/${CSV_SOURCE.file}`);
  const shapeProblems = validateFixtureShape(rows);
  if (shapeProblems.length) {
    console.error('\n❌ The committed fixture set is not discriminating — refusing to seed:');
    for (const p of shapeProblems) console.error(`   • ${p}`);
    process.exit(3);
  }
  const accounts = loadAccounts(rows).filter((a) => a.seeded);
  log(`Store ${STORE_ID} | ${accounts.length} account(s) | outlet "${OUTLET_ORG.name}"`);

  await auth();                                   // seed-common (loyalty + missions + aliases)
  setFlags({ dryRun: DRY_RUN, verbose: VERBOSE });
  await authenticate();                           // user-provision (member graph)

  if (TEARDOWN) { const ok = await teardown(accounts); process.exit(ok ? 0 : 1); }

  // --missions-only: mint missions and touch NOTHING else. No org, no accounts, no group patch, no
  // balance read and — critically — no funding order. The accounts by then carry live balances and
  // mission history that a run is reasoning ABOUT; re-running the member graph would rewrite
  // `balance_at_seed` under that reasoning, and an account that had drifted below its funding floor
  // would be handed a real, non-reversible order.
  if (MISSIONS_ONLY) {
    const missionByAlias = await seedMissions();
    const seededAtOnly = new Date().toISOString();
    writeEnvAliasOverride(Object.fromEntries(Object.entries(missionByAlias).map(([alias, m]) => [
      alias, { id: String(m.id), name: m.name, run_id: m.runId, seeded_at: seededAtOnly },
    ])));
    console.log(`\n✅ Missions seeded${DRY_RUN ? ' [DRY RUN — no writes]' : ''} — accounts, org and balances untouched.`);
    if (!DRY_RUN) reportMissions(missionByAlias);
    return;
  }

  // 0. The store's own currency + culture — every xAPI read below carries them (ambient-context rule).
  if (!DRY_RUN) await loadAmbientContext();

  // 1. The outlet org (idempotent find-or-create by name; supplies the shipping address checkout needs).
  const orgMap = await seedOrgs([orgSeedRow()]);
  const outlet = orgMap[OUTLET_ORG.key];
  log(`Outlet org: ${outlet.name} (${outlet.platform_id})${outlet.reused ? ' [reused]' : ' [created]'}`);

  // 2. Accounts: contact + sign-in-capable security account + org-scoped role + membership lock/status.
  await ensureRoles();
  const { idByEmail } = await seedInlineOrgUsers(rows.filter((r) => !/^false$/i.test(r.seeded || '')), orgMap);

  // 3. Customer groups — the mission's only targeting input. Read back, never assumed.
  const groupsByAlias = {};
  const contactIdByAlias = {};
  for (const a of accounts) {
    const contactId = DRY_RUN ? `dry-contact-${a.userId}` : await resolveContactId(a.email);
    contactIdByAlias[a.aliasName] = contactId;
    if (DRY_RUN) { groupsByAlias[a.aliasName] = a.groups; continue; }
    if (!contactId) {
      // Never fall back to "the CSV says so": an unverified group is exactly the state that makes a
      // targeted mission silently reach nobody.
      throw new Error(`${a.aliasName}: could not resolve a Contact id for ${a.email} — refusing to record unverified group membership`);
    }
    groupsByAlias[a.aliasName] = a.groups.length ? await ensureContactGroups(contactId, a.groups) : await contactGroups(contactId);
  }

  // 3b. The locked member's OrganizationMembership id — the handle a case needs to flip the lock
  // through /api/customer/organization-memberships/{id}. It is server-assigned, so nothing but a
  // read-back can supply it, and a fixture that declares it without providing it is a dead @td().
  let lockedMembershipId = '';
  if (!DRY_RUN) {
    const locked = accountByAlias(accounts, 'ORG_LOY_LOCKED');
    const lockedUserId = idByEmail[locked.email];
    const membership = (await searchMemberships(lockedUserId)).find((m) => m.organizationId === outlet.platform_id);
    if (!membership?.id) throw new Error('ORG_LOY_LOCKED has no OrganizationMembership in the outlet org — the locked actor has nothing to be locked in');
    if (membership.isLocked !== true) {
      throw new Error(`ORG_LOY_LOCKED membership ${membership.id} reports isLocked=${membership.isLocked}. `
        + 'The lock is the entire fixture: without it the authorization handler has nothing to refuse.');
    }
    lockedMembershipId = membership.id;
    log(`  ✓ ORG_LOY_LOCKED membership ${lockedMembershipId} verified isLocked=true, status=${membership.status ?? 'null'}`);
  }

  // 4. The sibling org a cross-org read could wrongly return — reused, resolved by CSV row key.
  const sibling = resolveSiblingOrg(loadCsv('test-data/b2b/organizations.csv'));
  log(`Sibling org (cross-org control): ${sibling.name} (${SIBLING_ORG.csvOrgId})`);

  // 5. Measure the DIVERGENT earn plan for A and B, and fund the outsider.
  const earnByAlias = {};
  const balanceByAlias = {};
  let cheapestPts = null;

  for (const a of accounts) {
    const userId = idByEmail[a.email];
    if (!userId || isDry(userId)) { verbose(`skip live measurement for ${a.aliasName} (dry)`); continue; }
    const token = await storefrontToken(BACK_URL, STORE_ID, a.email);
    if (!token) {
      console.error(`\n❌ ${a.aliasName} (${a.email}) could not authenticate against ${STORE_ID}. `
        + 'A fixture that cannot sign in is not a fixture; fix the account before relying on this seed.');
      process.exit(4);
    }
    const me = await gqlAs(token, 'query { me { id } }', 'me');
    const meId = me?.me?.id || userId;
    balanceByAlias[a.aliasName] = await readBalance(meId).catch(() => 0);

    const errorsBefore = earnProbeErrors;
    const earn = await measureEarn(token, groupsByAlias[a.aliasName] || []);
    if (!earn) {
      const errored = earnProbeErrors - errorsBefore;
      console.error(`\n❌ ${a.aliasName}: no winning ProductPoints program resolved to a buyable factor SKU.`);
      console.error(errored
        ? `   ${errored} factor product(s) ERRORED rather than answering "not buyable" — that is an xAPI/context problem, `
          + 'not a missing fixture. Re-run (a freshly created account can transiently 500 on its first product read) before seeding programs.'
        : '   Seed the loyalty programs + standard products first (npm run seed:loyalty && npm run seed:products).');
      process.exit(5);
    }
    earnByAlias[a.aliasName] = { ...earn, qty: a.earnQty, expected: earn.perUnit * a.earnQty, userId: meId };
    log(`  ${a.aliasName}: winner "${earn.programName}" → ${earn.sku} (factor ${earn.factor} x $${earn.unitPrice} = ${earn.perUnit} PTS/unit) `
      + `x qty ${a.earnQty} = ${earn.perUnit * a.earnQty} PTS | balance now ${balanceByAlias[a.aliasName]}`);

    // 5b. LOY_PERSONAL_NOORG is the ONLY account this seeder funds — and only when it has to.
    if (a.aliasName === 'LOY_PERSONAL_NOORG') {
      cheapestPts = await cheapestPtsLine(token, meId);
      if (!cheapestPts) {
        log('  ⚠ no buyable PTS-priced line resolved — the funding floor cannot be derived; skipping funding.');
      } else if (SKIP_FUNDING) {
        log(`  --skip-funding: leaving balance ${balanceByAlias[a.aliasName]} (cheapest PTS line ${cheapestPts.sku} @ ${cheapestPts.price}).`);
      } else if (balanceByAlias[a.aliasName] > cheapestPts.price) {
        log(`  balance ${balanceByAlias[a.aliasName]} already exceeds the cheapest PTS line (${cheapestPts.sku} @ ${cheapestPts.price}) — no order placed.`);
      } else {
        log(`  ⚠ placing ONE REAL, NON-REVERSIBLE order (${earn.sku} x${a.earnQty}) to fund ${a.aliasName} — a balance cannot be set on this platform.`);
        const number = await placeEarnOrder({
          gql: (q, l) => gqlAs(token, q, l), storeId: STORE_ID, userId: meId, productId: earn.productId, qty: a.earnQty,
          currency: AMBIENT.currency, culture: AMBIENT.culture,
        });
        // Earn settles on a Hangfire job, so the balance does not move synchronously. 24 x 5 s = 2 min:
        // generous, because the alternative is recording a 0 that every later delta assertion inherits.
        const after = await pollBalanceChange({ readBalance, userId: meId, from: balanceByAlias[a.aliasName], sleep, attempts: 24 });
        if (after === balanceByAlias[a.aliasName]) {
          throw new Error(`order ${number} was placed but the balance never moved off ${after} within 2 minutes. `
            + 'Do NOT re-run blindly — the order is real and non-reversible, so a retry earns twice. Check the '
            + 'loyalty Hangfire job and the operation log for this user first.');
        }
        log(`  ✓ order ${number} → balance ${balanceByAlias[a.aliasName]} → ${after} PTS`);
        balanceByAlias[a.aliasName] = after;
      }
    }
  }

  // 6. The per-run missions (each in its OWN sweep name-space, so one never deletes another).
  const missionByAlias = await seedMissions();

  // 7. Writeback — runtime GUIDs and live readings to aliases.<env>.json, never to a committed file.
  const seededAt = new Date().toISOString();
  const num = (v) => (v == null ? '' : String(v));
  const writeback = {
    ORG_LOY_A: {
      userId: num(idByEmail[accountByAlias(accounts, 'ORG_LOY_A').email]),
      contactId: num(contactIdByAlias.ORG_LOY_A),
      org_id: num(outlet.platform_id),
      sibling_org_id: num(sibling.id),
      earn_points_expected: num(earnByAlias.ORG_LOY_A?.expected),
      balance_at_seed: num(balanceByAlias.ORG_LOY_A),
    },
    ORG_LOY_B: {
      userId: num(idByEmail[accountByAlias(accounts, 'ORG_LOY_B').email]),
      contactId: num(contactIdByAlias.ORG_LOY_B),
      org_id: num(outlet.platform_id),
      earn_points_expected: num(earnByAlias.ORG_LOY_B?.expected),
      balance_at_seed: num(balanceByAlias.ORG_LOY_B),
    },
    ORG_LOY_LOCKED: {
      userId: num(idByEmail[accountByAlias(accounts, 'ORG_LOY_LOCKED').email]),
      contactId: num(contactIdByAlias.ORG_LOY_LOCKED),
      org_id: num(outlet.platform_id),
      membershipId: num(lockedMembershipId),
      balance_at_seed: num(balanceByAlias.ORG_LOY_LOCKED),
    },
    LOY_PERSONAL_NOORG: {
      userId: num(idByEmail[accountByAlias(accounts, 'LOY_PERSONAL_NOORG').email]),
      contactId: num(contactIdByAlias.LOY_PERSONAL_NOORG),
      balance_at_seed: num(balanceByAlias.LOY_PERSONAL_NOORG),
      cheapest_pts_sku: num(cheapestPts?.sku),
      cheapest_pts_price: num(cheapestPts?.price),
      dearest_pts_sku: num(cheapestPts?.dearestSku),
      dearest_pts_price: num(cheapestPts?.dearestPrice),
    },
    ...Object.fromEntries(Object.entries(missionByAlias).map(([alias, m]) => [
      alias, { id: num(m.id), name: m.name, run_id: m.runId, seeded_at: seededAt },
    ])),
  };

  // Every field the spec DECLARES runtime must actually have landed. A declared-but-unwritten field
  // resolves to "" through @td() and the case reads as a product bug — the silent class the per-env
  // overlay exists to prevent. Caught exactly this way: ORG_LOY_LOCKED.membershipId was declared,
  // exposed in fields{}, and written by nothing.
  // Scoped to the aliases THIS run actually seeded: under --only / --missions-only the others are
  // deliberately untouched, and demanding values for them would fail a run that did exactly its job.
  if (!DRY_RUN) {
    const holes = [];
    for (const alias of Object.keys(writeback)) {
      for (const f of RUNTIME_ALIAS_FIELDS[alias] || []) {
        if (String(writeback[alias]?.[f] ?? '').trim() === '') holes.push(`${alias}.${f}`);
      }
    }
    if (holes.length) {
      console.error(`\n❌ declared runtime field(s) not provisioned: ${holes.join(', ')} — @td() would resolve them to "".`);
      process.exit(7);
    }
  }
  writeEnvAliasOverride(writeback);

  // 8. Is the SEEDED state still discriminating? Shape validation cannot see any of this.
  const stateProblems = validateSeededState({
    groupsByAlias,
    pointsByAlias: { ORG_LOY_A: earnByAlias.ORG_LOY_A?.expected, ORG_LOY_B: earnByAlias.ORG_LOY_B?.expected },
    noOrgBalance: balanceByAlias.LOY_PERSONAL_NOORG ?? null,
    cheapestPtsPrice: cheapestPts?.price ?? null,
  });
  if (stateProblems.length && !DRY_RUN) {
    console.error('\n❌ Seeded, but the live state is NOT discriminating:');
    for (const p of stateProblems) console.error(`   • ${p}`);
    process.exit(6);
  }

  console.log(`\n✅ Org-mode loyalty seed complete${DRY_RUN ? ' [DRY RUN — no writes]' : ''}`);
  if (!DRY_RUN) {
    console.log(`   outlet org       ${outlet.platform_id}`);
    console.log(`   pooled plan      A ${earnByAlias.ORG_LOY_A?.expected} PTS + B ${earnByAlias.ORG_LOY_B?.expected} PTS = ${(earnByAlias.ORG_LOY_A?.expected || 0) + (earnByAlias.ORG_LOY_B?.expected || 0)} PTS`);
    console.log(`   outsider balance ${balanceByAlias.LOY_PERSONAL_NOORG} PTS (cheapest PTS line ${cheapestPts?.sku} @ ${cheapestPts?.price})`);
    reportMissions(missionByAlias);
  }
}

main().catch((e) => { console.error(`\n❌ SEED FAILED: ${e.message}`); if (VERBOSE) console.error(e.stack); process.exit(1); });
