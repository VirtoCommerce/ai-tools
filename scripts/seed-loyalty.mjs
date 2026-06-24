/**
 * seed-loyalty.mjs — loyalty program seeder (Product Points + others).
 *
 * Builds the loyalty programs in test-data/loyalty/programs.csv from the platform's
 * own `GET /api/loyalty-programs/new/{programType}` skeleton (a guaranteed-valid empty
 * program of the right type), then applies per-row overrides: name, localized name,
 * isActive, priority, store, start/end window, and the eligibility USER GROUP
 * (all / VIP / Wholesaler) by populating the dynamicExpression condition tree.
 *
 * AND — the part the old clone-only seeder never did — it populates each program's
 * PRODUCT FACTORS from test-data/loyalty/program-factors.csv. A ProductPoints program
 * earns NOTHING without factors (a factor = {productId, factor-points}); the old clones
 * had 0 factors and were functionally hollow. Factors are resolved SKU→productId at
 * runtime (no hardcoded GUIDs) and written via PUT /api/loyalty-program-product-factors/factors.
 *
 * Conventions: scripts/lib/seed-common.mjs (ENV_RISK prod-guard, auth, api, loadCsv).
 * No hardcoded GUIDs/store ids. Names carry AGENT-TEST- for safe teardown.
 * Idempotent: a program whose name already exists is reused (factors are re-applied —
 * PUT replaces the factor set, so a re-run repairs factors without duplicating programs).
 * API (Swagger VirtoCommerce.Loyalty):
 *   GET  /api/loyalty-programs/new/{programType}
 *   POST /api/loyalty-programs/search | POST/PUT/DELETE /api/loyalty-programs
 *   PUT  /api/loyalty-program-product-factors/factors   (array of {loyaltyProgramId,productId,factor})
 *   POST /api/catalog/search/products  (searchPhrase: 'code:"<SKU>"' → exact productId)
 *
 * Usage:
 *   node scripts/seed-loyalty.mjs                 # create every program + factors in the CSVs
 *   node scripts/seed-loyalty.mjs --only LOY-010  # just one row
 *   node scripts/seed-loyalty.mjs --dry-run -v
 *   node scripts/seed-loyalty.mjs --teardown      # delete AGENT-TEST-* loyalty programs
 */
import {
  STORE_ID, DATE_STAMP, DRY_RUN, TEARDOWN, VERBOSE, ONLY,
  log, verbose, assertSafeTarget, auth, api, loadCsv, writeResults, csvBool,
} from './lib/seed-common.mjs';

const NAME_PREFIX = 'AGENT-TEST';

// Map the CSV customer_group to the platform user-group name used by UserGroupIsCondition.
// null = no group restriction (all customers → AnyUserGroupCondition). Verified live on vcst-qa.
const GROUP_NAME = { all: null, vip: 'VIP', wholesaler: 'Wholesaler' };

async function searchPrograms() {
  const r = await api('POST', '/api/loyalty-programs/search', { take: 100 }, { expectStatus: [200, 201] });
  return r?.results || r?.items || [];
}

/** ISO datetime `days` from now (UTC), or null when the offset cell is blank. */
function isoFromOffset(days) {
  if (days == null || String(days).trim() === '') return null;
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + Number(days));
  return d.toISOString();
}

/** The single eligibility condition node for a given group (null = any user group). */
function conditionNode(group) {
  return group === null
    ? { id: 'AnyUserGroupCondition', availableChildren: [], children: [] }
    : { groups: [group], id: 'UserGroupIsCondition', availableChildren: [], children: [] };
}

/**
 * Populate the skeleton's dynamicExpression with the chosen eligibility.
 * The `new/{type}` skeleton ships one empty BlockLoyaltyCondition under children[];
 * we set that block's children to the right condition node.
 */
function setEligibility(expr, group) {
  const blocks = (expr?.children || []).filter((c) => c?.id === 'BlockLoyaltyCondition');
  if (!blocks.length) { log(`  ⚠ dynamicExpression has no BlockLoyaltyCondition — eligibility not set`); return; }
  for (const block of blocks) block.children = [conditionNode(group)];
}

/** Resolve a catalog SKU (product code) to its productId via exact indexed search. Cached. */
const skuCache = new Map();
async function resolveSku(sku) {
  if (skuCache.has(sku)) return skuCache.get(sku);
  let id = null;
  try {
    const r = await api('POST', '/api/catalog/search/products',
      { searchPhrase: `code:"${sku}"`, take: 5, responseGroup: 'ItemInfo' }, { expectStatus: [200, 201] });
    const items = r?.items || [];
    id = (items.find((i) => i.code === sku) || items[0])?.id || null;
  } catch (e) { verbose(`SKU ${sku} resolve failed: ${e.message}`); }
  skuCache.set(sku, id);
  return id;
}

/** Apply the program's product factors (PUT replaces the whole set → idempotent). */
async function applyFactors(programId, factorRows, label) {
  if (!factorRows.length) return 0;
  const factors = [];
  for (const fr of factorRows) {
    const productId = await resolveSku(fr.sku);
    if (!productId) { log(`  ⚠ ${label}: SKU "${fr.sku}" not found — skipping factor`); continue; }
    factors.push({ loyaltyProgramId: programId, productId, factor: Number(fr.factor) || 0 });
  }
  if (!factors.length) return 0;
  if (DRY_RUN) { log(`    [DRY] would set ${factors.length} factor(s)`); return factors.length; }
  await api('PUT', '/api/loyalty-program-product-factors/factors', factors, { expectStatus: [200, 201, 204] });
  return factors.length;
}

async function seed() {
  const rows = loadCsv('test-data/loyalty/programs.csv');
  const allFactors = loadCsv('test-data/loyalty/program-factors.csv');
  const live = DRY_RUN ? [] : await searchPrograms();
  const created = [];

  for (const row of rows) {
    if (ONLY && row.program_id !== ONLY) continue;
    const targetName = row.name;
    if (!new RegExp(NAME_PREFIX, 'i').test(targetName)) {
      log(`skip ${row.program_id}: name "${targetName}" lacks ${NAME_PREFIX} prefix (teardown safety)`);
      continue;
    }

    const programType = row.program_type || 'ProductPoints';
    const group = GROUP_NAME[(row.customer_group || 'all').toLowerCase()];
    const groupLabel = group === null ? 'all customers' : `group=${group}`;
    const factorRows = allFactors.filter((f) => f.program_id === row.program_id);
    const startDate = isoFromOffset(row.start_offset_days);
    const endDate = isoFromOffset(row.end_offset_days);

    // Idempotent: reuse if a program with this name already exists, but still (re)apply factors.
    const existing = live.find((p) => p.name === targetName);
    if (existing) {
      const n = await applyFactors(existing.id, factorRows, row.program_id);
      log(`Reusing ${targetName} (${existing.id})${n ? ` — re-applied ${n} factor(s)` : ''}`);
      continue;
    }

    if (DRY_RUN) {
      log(`[DRY] ${row.program_id}: new ${programType} → ${targetName} (active=${row.is_active}, pri=${row.priority}, ${groupLabel}` +
        `${startDate ? `, start=${startDate.slice(0, 10)}` : ''}${endDate ? `, end=${endDate.slice(0, 10)}` : ''}, ${factorRows.length} factor(s))`);
      await applyFactors('dry', factorRows, row.program_id);
      continue;
    }

    // Build from the platform's own empty-program skeleton (valid dynamicExpression shape per type).
    const prog = await api('GET', `/api/loyalty-programs/new/${programType}`, null, { expectStatus: [200] });
    prog.name = targetName;
    prog.storeId = row.store_id || STORE_ID;
    prog.isActive = csvBool(row.is_active, true);
    prog.priority = Number(row.priority) || 0;
    prog.startDate = startDate;
    prog.endDate = endDate;
    if (row.localized_name_es) prog.localizedName = { values: { 'es-ES': row.localized_name_es } };
    setEligibility(prog.dynamicExpression, group);
    delete prog.id; delete prog.createdDate; delete prog.modifiedDate; delete prog.createdBy; delete prog.modifiedBy;

    const r = await api('POST', '/api/loyalty-programs', prog, { expectStatus: [200, 201] });
    const nFactors = await applyFactors(r.id, factorRows, row.program_id);
    log(`Created ${targetName} (${r.id}) [type=${programType}, active=${prog.isActive}, pri=${prog.priority}, ${groupLabel}` +
      `${startDate ? `, start=${startDate.slice(0, 10)}` : ''}${endDate ? `, end=${endDate.slice(0, 10)}` : ''}, ${nFactors} factor(s)]`);
    created.push({
      program_id: row.program_id, id: r.id, name: targetName, type: programType,
      active: prog.isActive, priority: prog.priority, group: group || 'all',
      startDate, endDate, factors: nFactors,
    });
  }

  if (created.length) {
    writeResults(`test-data/loyalty/_seed-results-loyalty-${DATE_STAMP}.json`, {
      seededAt: new Date().toISOString(), storeId: STORE_ID, created,
    });
  }
  log(`Done: ${created.length} created, rest reused/skipped.`);
}

async function teardown() {
  log(`Teardown: deleting ${NAME_PREFIX}-* loyalty programs`);
  const programs = await searchPrograms();
  const ids = programs.filter((p) => (p.name || '').startsWith(NAME_PREFIX)).map((p) => p.id);
  if (!ids.length) { log('  none to delete'); return; }
  if (DRY_RUN) { log(`  [DRY] would delete ${ids.length}`); return; }
  await api('DELETE', `/api/loyalty-programs?ids=${ids.join(',')}`, null, { expectStatus: [200, 204, 404] });
  log(`  ✓ deleted ${ids.length} loyalty program(s)`);
}

(async () => {
  console.log(`🎁 Seed Loyalty${DRY_RUN ? ' [DRY RUN]' : ''}${TEARDOWN ? ' [TEARDOWN]' : ''}`);
  assertSafeTarget();
  await auth();
  if (TEARDOWN) await teardown(); else await seed();
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
