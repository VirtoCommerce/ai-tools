/**
 * Contract Seed — VirtoStart — Org-AcmeCorp
 *
 * VC's Contract module is NOT installed on virtostart, so we model "contract pricing"
 * via the canonical native pattern (already in use on this env — see existing
 * "Contract-New contract-BeerUSD" pricelist):
 *
 *    Pricelist  →  Prices (one per SKU)  →  PricelistAssignment  →  UserGroupsContainsCondition
 *                                                                       │
 *                                                  AcmeCorp.groups += "contract-acmecorp-2026"
 *
 * What this seeder does, idempotently:
 *   1. POST /api/pricing/pricelists           → Pricelist "Contract-AcmeCorp-2026" (USD)
 *   2. PUT  /api/pricing/products/prices      → 5 Prices at 10% off list, sale=0.9*list
 *   3. POST /api/pricing/assignments          → Assignment targeting B2B-store with
 *                                              UserGroupsContainsCondition group="contract-acmecorp-2026"
 *   4. GET  /api/members/{orgId}              → fetch current org
 *      PUT  /api/members                      → add "contract-acmecorp-2026" to org.groups
 *
 * After seeding, John Mitchell (member of Org-AcmeCorp) inherits the org's user group
 * and the storefront xAPI pricing evaluator will return contract prices for the 5 SKUs.
 *
 * Products covered: top 5 highest-value SKUs from John's 20-order history.
 *
 *   AYB-04369900  TOUGHBOOK 40 mk2          $2,259.00 → $2,033.10
 *   SYU-76371555  MacBook Pro 2023 Touchbar $1,200.00 → $1,080.00
 *   JPJ-30487565  iPhone 16 Pro             $  999.00 → $  899.10
 *   553390824     LG EG9600 65" 4K TV       $  600.00 → $  540.00
 *   566903892     Canon Imageclass MF232W   $  189.00 → $  170.10
 *
 * Usage:
 *   node scripts/seed-contract-acmecorp-virtostart.js --dry-run [--verbose]
 *   node scripts/seed-contract-acmecorp-virtostart.js
 *   node scripts/seed-contract-acmecorp-virtostart.js --force   # overwrite existing pricelist
 */

import { config } from 'dotenv';
import { writeFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

config({ path: join(ROOT, '.env.virtostart'), override: false });
config({ path: join(ROOT, '.env.local'), override: false });
for (const [k, v] of Object.entries(process.env)) {
  if (k.endsWith('_VIRTOSTART') && v) process.env[k.slice(0, -'_VIRTOSTART'.length)] = v;
}

const BACK_URL = process.env.BACK_URL;
const ADMIN = process.env.ADMIN_VIRTO || process.env.ADMIN;
const ADMIN_PASSWORD = process.env.ADMIN_VIRTO_PASSWORD
  || process.env.ADMIN_PASSWORD_VIRTOSTART
  || process.env.ADMIN_PASSWORD;
const STORE_ID = process.env.STORE_ID || 'B2B-store';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const VERBOSE = args.includes('--verbose');
const FORCE = args.includes('--force');

const RESULTS_FILE = join(ROOT, 'test-data', 'b2b', '_seed-results-contract-acmecorp-virtostart.json');
const REPORT_FILE = join(ROOT, 'test-data', 'b2b', 'seed-report-contract-acmecorp-virtostart-20260511.md');

// ---------- CONFIG ----------

const CONTRACT = {
  name: 'Contract-AcmeCorp-2026',
  userGroup: 'contract-acmecorp-2026',
  currency: 'USD',
  discount: 0.10, // 10% off list
  orgId: '8a64d782-d3f5-4f3f-835a-525b8b41b496', // Org-AcmeCorp on virtostart
};

const SKUS = [
  { sku: 'AYB-04369900', productId: '202d4ea3-f167-4523-9f50-289f3b6d6af6', name: 'TOUGHBOOK 40 mk2',          listPrice: 2259 },
  { sku: 'SYU-76371555', productId: '2d3d3f11-6429-434b-a895-f1143dd2a67d', name: 'MacBook Pro 2023 Touchbar', listPrice: 1200 },
  { sku: 'JPJ-30487565', productId: '18ce2545-b35e-4e69-920e-2090a64797c5', name: 'iPhone 16 Pro',             listPrice:  999 },
  { sku: '553390824',    productId: '8db64bd60a354c4c96e25e61d7361565',    name: 'LG EG9600 65" 4K TV',        listPrice:  600 },
  { sku: '566903892',    productId: '08c33cfc9f664426a52fac8882da2df0',    name: 'Canon Imageclass MF232W',    listPrice:  189 },
];

// ---------- STATE ----------

const state = {
  adminToken: null,
  pricelistId: null,
  assignmentId: null,
  pricesCreated: [],
  orgBefore: null,
  orgAfter: null,
};

const log = msg => console.log(`  ${msg}`);
const verbose = msg => { if (VERBOSE) console.log(`    [v] ${msg}`); };

async function api(method, path, body, { expectStatus = [200, 201, 204], formUrlEncoded = false, mutating = true } = {}) {
  const url = `${BACK_URL}${path}`;
  verbose(`${method} ${url}`);
  if (DRY_RUN && mutating && method !== 'GET') {
    verbose('  [DRY RUN] skipped');
    if (VERBOSE && body) console.log('    [v] body:', JSON.stringify(body).slice(0, 600));
    return { _dryRun: true, id: `dry-${Math.random().toString(36).slice(2, 10)}` };
  }
  const headers = {};
  if (state.adminToken) headers['Authorization'] = `Bearer ${state.adminToken}`;
  let fetchBody;
  if (body && formUrlEncoded) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    fetchBody = Object.entries(body).map(([k, v]) => `${k}=${v}`).join('&');
  } else if (body !== undefined && body !== null) {
    headers['Content-Type'] = 'application/json';
    fetchBody = JSON.stringify(body);
  }
  const res = await fetch(url, { method, headers, body: fetchBody });
  if (!expectStatus.includes(res.status)) {
    const text = await res.text().catch(() => '');
    throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 600)}`);
  }
  const ct = res.headers.get('content-type') || '';
  return ct.includes('application/json') ? res.json() : null;
}

async function authenticate() {
  log('Authenticating as admin...');
  const data = await api('POST', '/connect/token', {
    grant_type: 'password',
    username: ADMIN,
    password: ADMIN_PASSWORD,
    scope: 'offline_access',
  }, { formUrlEncoded: true, expectStatus: [200], mutating: false });
  state.adminToken = data.access_token;
  log(`Auth: OK (expires in ${data.expires_in}s)`);
}

async function findExistingPricelist() {
  const existing = await api('GET', '/api/pricing/pricelists', null, { expectStatus: [200], mutating: false });
  const match = (existing.results || []).find(p => p.name === CONTRACT.name);
  return match || null;
}

async function createOrReusePricelist() {
  const existing = await findExistingPricelist();
  if (existing && !FORCE) {
    log(`Pricelist "${CONTRACT.name}" already exists → reusing (id ${existing.id}). Use --force to overwrite.`);
    state.pricelistId = existing.id;
    return;
  }
  if (existing && FORCE) {
    log(`Pricelist "${CONTRACT.name}" exists → deleting (--force)`);
    if (!DRY_RUN) await api('DELETE', `/api/pricing/pricelists?ids=${existing.id}`, null, { expectStatus: [200, 204] });
  }
  log(`Creating pricelist "${CONTRACT.name}" (${CONTRACT.currency})...`);
  const body = {
    name: CONTRACT.name,
    description: `AcmeCorp negotiated contract — ${(CONTRACT.discount * 100).toFixed(0)}% off list, top 5 SKUs by spend`,
    currency: CONTRACT.currency,
    priority: 10,
  };
  const created = await api('POST', '/api/pricing/pricelists', body, { expectStatus: [200, 201] });
  state.pricelistId = created.id;
  log(`  ✓ pricelist id: ${state.pricelistId}`);
}

async function createPrices() {
  log(`Posting ${SKUS.length} prices via PUT /api/products/{productId}/prices (one per product)...`);
  const created = [];
  for (const p of SKUS) {
    const sale = +(p.listPrice * (1 - CONTRACT.discount)).toFixed(2);
    const price = {
      pricelistId: state.pricelistId,
      productId: p.productId,
      currency: CONTRACT.currency,
      list: p.listPrice,
      sale,
      minQuantity: 1,
    };
    const productPrice = { productId: p.productId, prices: [price] };
    log(`  ${p.sku.padEnd(14)} list $${String(price.list).padStart(7)} → sale $${String(price.sale).padStart(8)} (${((1 - price.sale / price.list) * 100).toFixed(0)}% off)`);
    await api('PUT', `/api/products/${p.productId}/prices`, productPrice, { expectStatus: [200, 204] });
    created.push(price);
  }
  state.pricesCreated = created;
  log('  ✓ prices applied');
}

async function findExistingAssignment() {
  const existing = await api('GET', '/api/pricing/assignments?take=200', null, { expectStatus: [200], mutating: false });
  const expectedName = `${CONTRACT.name}-Assignment`;
  return (existing.results || []).find(a => a.name === expectedName || a.pricelistId === state.pricelistId) || null;
}

async function createOrReuseAssignment() {
  const existing = await findExistingAssignment();
  if (existing && !FORCE) {
    log(`Assignment for "${CONTRACT.name}" already exists → reusing (id ${existing.id})`);
    state.assignmentId = existing.id;
    return;
  }
  if (existing && FORCE) {
    log(`Assignment exists → deleting (--force)`);
    if (!DRY_RUN) await api('DELETE', `/api/pricing/assignments?ids=${existing.id}`, null, { expectStatus: [200, 204] });
  }
  log(`Creating pricelist assignment (UserGroup="${CONTRACT.userGroup}", store="${STORE_ID}")...`);
  const body = {
    catalogId: null,
    storeId: STORE_ID,
    pricelistId: state.pricelistId,
    name: `${CONTRACT.name}-Assignment`,
    description: `Targets buyers in user group "${CONTRACT.userGroup}" (Org-AcmeCorp members)`,
    priority: 10,
    startDate: null,
    endDate: null,
    dynamicExpression: {
      all: true,
      not: false,
      id: 'PriceConditionTree',
      availableChildren: [],
      children: [
        {
          all: false,
          not: false,
          id: 'BlockPricingCondition',
          availableChildren: [],
          children: [
            {
              group: CONTRACT.userGroup,
              id: 'UserGroupsContainsCondition',
              availableChildren: [],
              children: [],
            },
          ],
        },
      ],
    },
  };
  const created = await api('POST', '/api/pricing/assignments', body, { expectStatus: [200, 201] });
  state.assignmentId = created.id;
  log(`  ✓ assignment id: ${state.assignmentId}`);
}

async function addUserGroupToOrg() {
  log(`Fetching Org-AcmeCorp (${CONTRACT.orgId})...`);
  const org = await api('GET', `/api/members/${CONTRACT.orgId}`, null, { expectStatus: [200], mutating: false });
  state.orgBefore = { groups: org.groups || [] };
  const currentGroups = org.groups || [];
  log(`  current groups: [${currentGroups.join(', ')}]`);
  if (currentGroups.includes(CONTRACT.userGroup)) {
    log(`  user group "${CONTRACT.userGroup}" already on org → no change needed`);
    state.orgAfter = state.orgBefore;
    return;
  }
  const updatedGroups = [...currentGroups, CONTRACT.userGroup];
  log(`  adding "${CONTRACT.userGroup}" → new groups: [${updatedGroups.join(', ')}]`);
  if (DRY_RUN) {
    state.orgAfter = { groups: updatedGroups };
    return;
  }
  const updatedOrg = { ...org, groups: updatedGroups };
  await api('PUT', '/api/members', updatedOrg, { expectStatus: [200, 204] });
  state.orgAfter = { groups: updatedGroups };
  log('  ✓ org updated');
}

async function propagateGroupToOrgContacts() {
  // VC's storefront pricing evaluator checks the user's own `groups` field — not the org's.
  // So we must also push the contract user-group onto every Contact under Org-AcmeCorp.
  log(`Finding contacts under Org-AcmeCorp (deepSearch)...`);
  const search = await api('POST', '/api/members/search', {
    memberId: CONTRACT.orgId,
    deepSearch: true,
    take: 200,
    skip: 0,
  }, { expectStatus: [200], mutating: false });
  const contacts = (search.results || []).filter(m => m.memberType === 'Contact');
  log(`  ${contacts.length} contact(s) found`);
  const summary = [];
  for (const c of contacts) {
    const cur = c.groups || [];
    if (cur.includes(CONTRACT.userGroup)) {
      summary.push({ id: c.id, name: c.fullName || c.name, action: 'already-tagged' });
      log(`  ${(c.fullName || c.name).padEnd(28)} already has "${CONTRACT.userGroup}" → skip`);
      continue;
    }
    const next = [...cur, CONTRACT.userGroup];
    log(`  ${(c.fullName || c.name).padEnd(28)} groups [${cur.join(', ')}] → [${next.join(', ')}]`);
    if (DRY_RUN) {
      summary.push({ id: c.id, name: c.fullName || c.name, action: 'dry-run' });
      continue;
    }
    // Fetch the full contact (search results may be partial), then PUT
    const full = await api('GET', `/api/members/${c.id}`, null, { expectStatus: [200], mutating: false });
    const updated = { ...full, groups: next };
    await api('PUT', '/api/members', updated, { expectStatus: [200, 204] });
    summary.push({ id: c.id, name: c.fullName || c.name, action: 'tagged' });
  }
  state.contactsTagged = summary;
  log(`  ✓ contact tagging complete (${summary.length} processed)`);
}

function buildResultsJson() {
  return {
    profile: 'contract-acmecorp',
    target: BACK_URL,
    storeId: STORE_ID,
    seededAt: new Date().toISOString(),
    dryRun: DRY_RUN,
    contract: { ...CONTRACT },
    pricelistId: state.pricelistId,
    assignmentId: state.assignmentId,
    org: {
      id: CONTRACT.orgId,
      groupsBefore: state.orgBefore?.groups || [],
      groupsAfter: state.orgAfter?.groups || [],
    },
    contactsTagged: state.contactsTagged || [],
    skus: state.pricesCreated.map(p => {
      const meta = SKUS.find(s => s.productId === p.productId);
      return { sku: meta.sku, name: meta.name, productId: p.productId, list: p.list, sale: p.sale, discountPct: CONTRACT.discount };
    }),
  };
}

function buildMarkdownReport(results) {
  const L = [];
  L.push(`# Contract Seed — Org-AcmeCorp on VirtoStart${DRY_RUN ? ' (DRY RUN)' : ''}`);
  L.push('');
  L.push(`**Platform:** ${BACK_URL}`);
  L.push(`**Store:** ${STORE_ID}`);
  L.push(`**Contract:** ${CONTRACT.name}`);
  L.push(`**Pricelist ID:** \`${results.pricelistId}\``);
  L.push(`**Assignment ID:** \`${results.assignmentId}\``);
  L.push(`**Currency:** ${CONTRACT.currency}`);
  L.push(`**Flat discount:** ${(CONTRACT.discount * 100).toFixed(0)}% off list`);
  L.push(`**User group:** \`${CONTRACT.userGroup}\``);
  L.push(`**Org:** Org-AcmeCorp (\`${CONTRACT.orgId}\`)`);
  L.push(`**Date:** ${results.seededAt}`);
  L.push('');
  L.push('## Note — Contract module status');
  L.push('');
  L.push('`VirtoCommerce.Contract` module is **not installed** on virtostart (`/docs/VirtoCommerce.Contract/swagger.json` returns 404). Contract pricing is therefore modeled via the canonical native pattern:');
  L.push('');
  L.push('1. **Pricelist** holds the negotiated prices');
  L.push('2. **PricelistAssignment** targets buyers via `UserGroupsContainsCondition`');
  L.push('3. **Member.groups** on Org-AcmeCorp carries the user-group tag so org members inherit it');
  L.push('');
  L.push('This matches the existing "Contract-New contract-BeerUSD" precedent on virtostart.');
  L.push('');
  L.push('## Pricing');
  L.push('');
  L.push('| SKU | Product | List | Contract sale | Saving |');
  L.push('|-----|---------|-----:|--------------:|-------:|');
  for (const s of results.skus) {
    const saving = (s.list - s.sale).toFixed(2);
    L.push(`| \`${s.sku}\` | ${s.name} | $${s.list.toFixed(2)} | $${s.sale.toFixed(2)} | $${saving} |`);
  }
  L.push('');
  L.push('## Org groups change');
  L.push('');
  L.push(`Before: \`${JSON.stringify(results.org.groupsBefore)}\``);
  L.push(`After:  \`${JSON.stringify(results.org.groupsAfter)}\``);
  L.push('');
  L.push('## Demo angle');
  L.push('');
  L.push('Backs **Demo 4b** ("Global Margin & Pricing Optimization"): when John signs in and views any of the 5 contract SKUs, the storefront xAPI pricing evaluator returns the contract sale price instead of list — visible via strike-through pricing on PDP / cart and reflected in fresh quote line items.');
  L.push('');
  L.push('## Verify');
  L.push('');
  L.push('```bash');
  L.push('# Storefront xAPI as John (storefront-side):');
  L.push('# Sign in to https://virtostart-demo-store.govirto.com as test-john.mitchell-20260508@test-agent.com / TestPass123!');
  L.push('# Open the LG TV PDP — should now show $540 (was $600).');
  L.push('# Or run a probe query (admin) — should return list+sale for the 5 SKUs:');
  L.push('curl -X POST "$BACK_URL/api/pricing/evaluate" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \\');
  L.push(`  -d '{"storeId":"${STORE_ID}","userGroups":["${CONTRACT.userGroup}"],"productIds":["${results.skus[0].productId}"]}'`);
  L.push('```');
  return L.join('\n');
}

async function main() {
  console.log(`\n💼 Contract Seed — Org-AcmeCorp on VirtoStart${DRY_RUN ? ' [DRY RUN]' : ''}`);
  console.log(`   Target:   ${BACK_URL}`);
  console.log(`   Contract: ${CONTRACT.name}`);
  console.log(`   Store:    ${STORE_ID}\n`);

  if (!BACK_URL || !ADMIN || !ADMIN_PASSWORD) {
    console.error('Missing BACK_URL, ADMIN_VIRTO, or ADMIN_VIRTO_PASSWORD');
    process.exit(1);
  }

  await authenticate();
  await createOrReusePricelist();
  await createPrices();
  await createOrReuseAssignment();
  await addUserGroupToOrg();
  await propagateGroupToOrgContacts();

  const results = buildResultsJson();
  if (!DRY_RUN) {
    writeFileSync(RESULTS_FILE, JSON.stringify(results, null, 2));
    log(`\nResults JSON: ${RESULTS_FILE}`);
    writeFileSync(REPORT_FILE, buildMarkdownReport(results));
    log(`Report MD:    ${REPORT_FILE}`);
  } else {
    console.log('\n  [DRY RUN] — nothing was written.');
    if (VERBOSE) console.log(JSON.stringify(results, null, 2));
  }
  console.log('\n✅ Contract seed complete!\n');
}

main().catch(err => {
  console.error(`\n❌ Seed failed: ${err.message}`);
  if (VERBOSE) console.error(err.stack);
  process.exit(1);
});
