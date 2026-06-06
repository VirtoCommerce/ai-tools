#!/usr/bin/env node
/**
 * scripts/seed-promotions.mjs
 *
 * Idempotent seeder for marketing promotions + coupons from
 * test-data/promotions/promotions.csv + coupons.csv. Fills the gap where these
 * fixtures previously depended on a one-off agent run (test-data/promotions/seed-report.md)
 * with no reusable script.
 *
 * Seeds a COMPLETE promotion (verified against vc-module-marketing live tree, 2026-06):
 *   - Create:   POST /api/marketing/promotions  { type:"DynamicPromotion", name, isActive,
 *       isPublic, priority, isExclusive, description, storeIds, startDate?, endDate? } → 200.
 *       NO `exclusivity` enum (use `isExclusive` bool); inline `coupons[]` is IGNORED.
 *   - Complete: GET the server-merged `dynamicExpression`, then set each block's `children`
 *       ARRAY (children/availableChildren are ARRAYS, not object-maps — an object-map 500s):
 *         · BlockCustomerCondition → ConditionIsEveryone | ConditionIsRegisteredUser | ConditionIsFirstTimeBuyer
 *         · BlockCatalogCondition  → ConditionCategoryIs (category resolved by name; left unscoped if absent)
 *         · BlockCartCondition     → ConditionCartSubtotalLeast { subTotal, compareCondition:"AtLeast" }
 *         · BlockReward            → RewardCartGetOf{Rel,Abs}Subtotal | RewardShippingGetOf{Rel,Abs}ShippingMethod
 *                                     | RewardItemGetOfRel (% off items/category) | RewardItemGiftNumItem (gift)
 *       and set the three LocalizedString fields (localizedDisplayName / localizedDescription /
 *       localizedLabel — shape { values: { "en-US": "…", "de-DE": "…" } }). PUT the full object back.
 *       Runs on BOTH create and re-seed (reconciles drifted promos to the CSV).
 *   - Coupons:  reconciled to EXACTLY the CSV set per promotion — POST /coupons/add (ARRAY body
 *       [{ promotionId, code, maxUsesNumber, maxUsesPerUser, expirationDate? }] → 204) for missing,
 *       DELETE /coupons/delete?ids= for ones a prior run misattached here (heals code↔promo drift).
 *       Usage limits + expiry derive from the coupon's edge_case_type (max_total_uses /
 *       max_per_customer / coupon_expiry_future|past). Coupon label/description columns are
 *       author metadata — the VC Coupon entity has no such fields; localization lives on the promotion.
 *   - Idempotency: POST /api/marketing/promotions/search {keyword}, /coupons/search {promotionId}.
 *   - Teardown:    DELETE /api/marketing/promotions?ids=<id>
 *
 * Catalog-dependent rewards/conditions (gift product, category scope) are resolved live via
 * /api/catalog/search/{products,categories}; when the env's catalog has no match they degrade
 * with a clear "configure in Admin" warning (promo + coupons still seed). Everything env-
 * independent (cart %/$ , shipping, cart-threshold, customer, localization, label) is fully automated.
 *
 * Promotions keep their CSV names (tests + the /account/coupons page assert on coupon code +
 * promotion name) — persistent fixtures, NOT AGENT-TEST-* ephemerals — so the /qa-seed-data
 * teardown sweep leaves them alone. Use `--teardown` here for deliberate cleanup of these rows.
 *
 * USAGE:
 *   node scripts/seed-promotions.mjs [--dry-run] [--verbose] [--only P01] [--teardown] [--skip-rewards]
 * Safety: ENV_RISK gate (blocks ENV_RISK=production unless --allow-admin-writes-on-prod); idempotent by promotion name + coupon code.
 * Writes test-data/_seed-results-promotions-{DATE}.json
 */
import {
  assertSafeTarget, auth, api, loadCsv, writeResults, log, verbose,
  csvBool, STORE_ID, DATE_STAMP, DRY_RUN, TEARDOWN, ONLY, BACK_URL,
} from './lib/seed-common.mjs';

// Reward auto-config is ON by default (verified working — array-shaped tree). --skip-rewards opts out.
const SKIP_REWARDS = process.argv.includes('--skip-rewards');

// The 10 cultures every live promotion's localizedLabel carries (the Admin UI replicates one value
// across all of them). We mirror that so per-culture label assertions pass.
const CULTURES = ['en-US', 'de-DE', 'fr-FR', 'es-ES', 'it-IT', 'pt-PT', 'ru-RU', 'ja-JP', 'zh-CN', 'pl-PL'];

// Dates in the CSV may be ISO, plain YYYY-MM-DD, or relative tokens (yesterday/today/
// tomorrow — used for expired/near-expiry negative tests). Anything unparseable returns
// null (we omit the field) rather than sending garbage like "yesterdayT23:59:59Z", which
// 500s the API ("Object reference not set").
const toIso = (s, endOfDay = false) => {
  const v = (s || '').trim();
  if (!v) return null;
  const day = 86400000;
  switch (v.toLowerCase()) {
    case 'yesterday': return new Date(Date.now() - day).toISOString();
    case 'today': return new Date().toISOString();
    case 'tomorrow': return new Date(Date.now() + day).toISOString();
  }
  if (v.includes('T')) return v;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return `${v}T${endOfDay ? '23:59:59' : '00:00:00'}Z`;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

// Build a LocalizedString { values: { culture: text } } from a culture→text map (empties dropped).
const localized = (map) => {
  const values = {};
  for (const [c, t] of Object.entries(map)) if (t && String(t).trim()) values[c] = String(t).trim();
  return Object.keys(values).length ? { values } : null;
};

// A short reward-descriptive label, mirroring how the Admin UI auto-labels a promotion
// ("10% off cart", "$5 off", "Gift", "10% off shipping"). A non-empty CSV `label` overrides.
function autoLabel(rewardType, rewardValue) {
  const t = (rewardType || '').toLowerCase();
  const v = rewardValue;
  if (t.includes('gift')) return 'Gift';
  if (t.includes('shipping')) return /[$]|fixed|dollar|abs/.test(t) ? `$${v} off shipping` : `${v}% off shipping`;
  if (t.includes('category')) return `${v}% off category`;
  if (/[$]|fixed|dollar|abs/.test(t)) return `$${v} off`;
  if (/%|percent|cart|subtotal/.test(t)) return `${v}% off cart`;
  return (rewardType || '').trim();
}
function labelLocalized(row) {
  const base = (row.label && row.label.trim()) ? row.label.trim() : autoLabel(row.reward_type, row.reward_value);
  if (!base) return null;
  const values = {};
  for (const c of CULTURES) values[c] = base;
  return { values };
}

const isExclusiveFromCsv = (v) => /exclus|global|only/i.test(v || '') && !/with other/i.test(v || '');

// Map a CSV reward_type + value to a DynamicExpression reward node. Gift returns a sentinel
// (__needsProduct) resolved against the live catalog later. Returns null if unbuildable.
function buildRewardNode(rewardType, rewardValue) {
  const t = (rewardType || '').toLowerCase();
  const amount = Number(rewardValue);
  if (t.includes('gift')) return { id: 'RewardItemGiftNumItem', __needsProduct: true, quantity: amount || 1 };
  if (Number.isNaN(amount)) return null;
  if (t.includes('shipping')) {
    return /[$]|fixed|dollar|abs/.test(t)
      ? { id: 'RewardShippingGetOfAbsShippingMethod', amount, shippingMethod: 'FixedRate', availableChildren: [], children: [] }
      : { id: 'RewardShippingGetOfRelShippingMethod', amount, shippingMethod: 'FixedRate', maxLimit: 0, availableChildren: [], children: [] };
  }
  // "% off category" and item-scoped percentage → RewardItemGetOfRel (scoped by the catalog condition)
  if (t.includes('category') || t.includes('item')) {
    return { id: 'RewardItemGetOfRel', amount, roundAmountPerItem: false, productId: null, productName: null, maxLimit: 0, availableChildren: [], children: [] };
  }
  if (/[$]|fixed|dollar|abs/.test(t)) return { id: 'RewardCartGetOfAbsSubtotal', amount, availableChildren: [], children: [] };
  if (/%|percent|rel|cart|subtotal/.test(t)) return { id: 'RewardCartGetOfRelSubtotal', amount, maxLimit: 0, availableChildren: [], children: [] };
  return null;
}

// Coupon usage limits + expiry from edge_case_type (used by the usage-limit negative tests).
function couponLimits(c) {
  const t = (c.edge_case_type || '').toLowerCase();
  return {
    maxUsesNumber: /max_total|maxed/.test(t) ? 1 : 0,
    maxUsesPerUser: /per_customer/.test(t) ? 1 : 0,
  };
}
function couponExpiry(c) {
  const t = (c.edge_case_type || '').toLowerCase();
  if (t.includes('expiry_future')) return toIso('tomorrow', true);
  if (t.includes('expiry_past')) return toIso('yesterday', true);
  return toIso(c.end_date, true);
}

async function resolveCategory(name) {
  if (!name) return null;
  const r = await api('POST', '/api/catalog/search/categories', { keyword: name, take: 200 });
  const cats = r?.results || r?.items || [];
  const lc = name.toLowerCase();
  return cats.find((c) => (c.name || '').toLowerCase() === lc) || cats.find((c) => (c.name || '').toLowerCase().includes(lc)) || null;
}
async function resolveProduct(hint) {
  // reward_config is free text like "Gift product: wine" or "Gift product: any". Strip the
  // "gift product" label and "any" to leave a real search keyword ("wine"); blank → first product.
  const kw = (hint || '').replace(/gift\s*product\s*:?/ig, '').replace(/\bany\b/ig, '').replace(/[^a-z0-9 ]/ig, ' ').trim();
  let r = await api('POST', '/api/catalog/search/products', { keyword: kw, take: 5 });
  let ps = r?.results || r?.items || [];
  if (!ps.length && kw) { // keyword too specific for this env's catalog — fall back to any product
    r = await api('POST', '/api/catalog/search/products', { keyword: '', take: 5 });
    ps = r?.results || r?.items || [];
  }
  return ps[0] || null;
}

async function findPromotion(name) {
  const r = await api('POST', '/api/marketing/promotions/search', { keyword: name, take: 50 });
  return (r?.results || []).find((p) => p.name === name) || null;
}
async function listCoupons(promotionId) {
  const r = await api('POST', '/api/marketing/promotions/coupons/search', { promotionId, take: 500 });
  return r?.results || [];
}

/**
 * GET the server-merged tree, set every block's active children + the localized fields + base
 * flags from the CSV row, PUT back. Runs on create AND re-seed so drifted promos reconcile.
 * Returns flags describing what was applied / what needs manual Admin config.
 */
async function completePromotion(promo, row) {
  const full = await api('GET', `/api/marketing/promotions/${promo.id}`);
  const tree = full?.dynamicExpression;
  const flags = { rewardApplied: false, conditions: [], warnings: [] };
  if (!tree?.children?.length) { flags.warnings.push('no dynamicExpression to configure (set manually)'); return flags; }
  const block = (id) => tree.children.find((b) => b.id === id);

  // --- Customer condition (always present; defaults to Everyone) ---
  const cc = (row.customer_condition || 'everyone').toLowerCase();
  const custId = cc.includes('regist') ? 'ConditionIsRegisteredUser'
    : cc.includes('first') ? 'ConditionIsFirstTimeBuyer'
      : 'ConditionIsEveryone';
  const blkCustomer = block('BlockCustomerCondition');
  if (blkCustomer) { blkCustomer.children = [{ id: custId, availableChildren: [], children: [] }]; flags.conditions.push(custId); }

  const ctype = (row.condition_type || '').toLowerCase();
  const cval = (row.condition_value || '').trim();

  // --- Catalog condition (category) ---
  const blkCatalog = block('BlockCatalogCondition');
  if (blkCatalog) {
    if (ctype.includes('category')) {
      let cat = null;
      try { cat = await resolveCategory(cval); } catch (e) { verbose(`category lookup failed: ${e.message.slice(0, 80)}`); }
      blkCatalog.children = [{
        id: 'ConditionCategoryIs', excludingCategoryIds: [], excludingProductIds: [],
        categoryId: cat?.id || null, categoryName: cat?.name || null, availableChildren: [], children: [],
      }];
      flags.conditions.push('ConditionCategoryIs');
      if (!cat) flags.warnings.push(`category "${cval}" not found in this env — ConditionCategoryIs left unscoped (set in Admin)`);
    } else { blkCatalog.children = []; }
  }

  // --- Cart condition (subtotal threshold) ---
  const blkCart = block('BlockCartCondition');
  if (blkCart) {
    const m = cval.match(/(\d+(?:\.\d+)?)/);
    if ((ctype.includes('cart') || ctype.includes('subtotal') || ctype.includes('threshold')) && m) {
      blkCart.children = [{
        id: 'ConditionCartSubtotalLeast', subTotal: Number(m[1]), subTotalSecond: 0,
        excludingCategoryIds: [], excludingProductIds: [], compareCondition: 'AtLeast', availableChildren: [], children: [],
      }];
      flags.conditions.push(`ConditionCartSubtotalLeast(>=${m[1]})`);
    } else { blkCart.children = []; }
  }

  // --- Reward ---
  const blkReward = block('BlockReward');
  if (blkReward && !SKIP_REWARDS) {
    let node = buildRewardNode(row.reward_type, row.reward_value);
    if (node?.__needsProduct) {
      let prod = null;
      try { prod = await resolveProduct(row.reward_config); } catch (e) { verbose(`product lookup failed: ${e.message.slice(0, 80)}`); }
      if (prod) {
        node = {
          id: 'RewardItemGiftNumItem', name: prod.name, categoryId: null, categoryName: null,
          productId: prod.id, productName: prod.name, quantity: node.quantity, measureUnit: '1',
          imageUrl: null, description: 'Gift', availableChildren: [], children: [],
        };
      } else { node = null; flags.warnings.push('gift product not resolvable in this env — reward left unset (set in Admin)'); }
    } else if (row.reward_type && !node) {
      flags.warnings.push(`reward_type "${row.reward_type}" not auto-buildable — configure in Admin`);
    }
    if (node) { blkReward.children = [node]; flags.rewardApplied = true; }
  }

  // --- Localization (display name / description / label) ---
  const dn = localized({ 'en-US': row.localized_name_en || row.promo_name, 'de-DE': row.localized_name_de });
  const dd = localized({ 'en-US': row.localized_desc_en || row.description, 'de-DE': row.localized_desc_de });
  const lbl = labelLocalized(row);
  if (dn) full.localizedDisplayName = dn;
  if (dd) full.localizedDescription = dd;
  if (lbl) full.localizedLabel = lbl;

  // --- Base flags reconciled to CSV (so a re-seed fixes a drifted public/active/exclusive/priority) ---
  full.isActive = csvBool(row.is_active, full.isActive);
  full.isPublic = csvBool(row.is_public, full.isPublic);
  full.isExclusive = isExclusiveFromCsv(row.exclusivity);
  full.priority = Number(row.priority) || full.priority;

  await api('PUT', '/api/marketing/promotions', full, { expectStatus: [200, 204] });
  return flags;
}

async function teardown(promoRows) {
  log(`Teardown — deleting ${promoRows.length} promotion(s) by name (coupons included)...`);
  let deleted = 0, couponsDeleted = 0;
  for (const row of promoRows) {
    // Delete ALL exact-name matches (stray duplicates from prior runs get swept too).
    const r = await api('POST', '/api/marketing/promotions/search', { keyword: row.promo_name, take: 50 });
    const matches = (r?.results || []).filter((p) => p.name === row.promo_name);
    if (!matches.length) { verbose(`not present: ${row.promo_name}`); continue; }
    for (const found of matches) {
      // Deleting a promotion does NOT cascade its coupons — remove them first, else they orphan.
      const promoCoupons = await listCoupons(found.id);
      for (const c of promoCoupons) {
        await api('DELETE', `/api/marketing/promotions/coupons/delete?ids=${encodeURIComponent(c.id)}`, null, { expectStatus: [200, 204, 404] });
        couponsDeleted++;
      }
      await api('DELETE', `/api/marketing/promotions?ids=${encodeURIComponent(found.id)}`, null, { expectStatus: [200, 204, 404] });
      log(`  ✓ Deleted: ${row.promo_name} (${found.id})${promoCoupons.length ? ` + ${promoCoupons.length} coupon(s)` : ''}`);
      deleted++;
    }
  }
  log(`Teardown complete — ${deleted} promotion(s), ${couponsDeleted} coupon(s) deleted.`);
}

async function main() {
  assertSafeTarget();
  console.log(`\n🌱 Promotions seed${DRY_RUN ? ' [DRY RUN]' : ''}${TEARDOWN ? ' [TEARDOWN]' : ''}`);
  console.log(`   Target: ${BACK_URL} | Store: ${STORE_ID}\n`);
  await auth();

  const promos = loadCsv('test-data/promotions/promotions.csv');
  const coupons = loadCsv('test-data/promotions/coupons.csv');
  const rows = ONLY ? promos.filter((p) => p.promo_id === ONLY) : promos;
  if (!rows.length) { console.error(`ABORT: --only ${ONLY} matched no promotions`); process.exit(2); }

  if (TEARDOWN) { await teardown(rows); return; }

  const results = [];
  for (const row of rows) {
    const name = row.promo_name;
    try {
      let promo = await findPromotion(name);
      if (promo) {
        log(`↻ promotion: ${name} (${promo.id})`);
      } else {
        const body = {
          type: 'DynamicPromotion',
          name,
          isActive: csvBool(row.is_active, true),
          isPublic: csvBool(row.is_public, true),
          priority: Number(row.priority) || 1,
          isExclusive: isExclusiveFromCsv(row.exclusivity),
          description: row.localized_desc_en || row.description || name,
          storeIds: (row.store_ids || STORE_ID).split(',').map((s) => s.trim()).filter(Boolean),
        };
        const start = toIso(row.start_date);
        const end = toIso(row.end_date, true);
        if (start) body.startDate = start;
        if (end) body.endDate = end;
        promo = await api('POST', '/api/marketing/promotions', body, { expectStatus: [200, 201] });
        log(`✓ promotion: ${name} (${promo?.id})`);
      }

      // Complete the promotion (localization + conditions + reward) — on create AND re-seed.
      let flags = { rewardApplied: false, conditions: [], warnings: [] };
      const live = promo?.id && !String(promo.id).startsWith('dry-') && !DRY_RUN;
      if (live) {
        flags = await completePromotion(promo, row);
        if (flags.rewardApplied) log(`    ✓ reward: ${row.reward_type} ${row.reward_value}`);
        if (flags.conditions.length) verbose(`conditions: ${flags.conditions.join(', ')}`);
        for (const w of flags.warnings) log(`    ⚠ ${w}`);
      }

      // Coupons (separate entity) — reconcile to EXACTLY the CSV set for this promotion:
      // delete coupons a prior run misattached here (drift), add missing ones with the right
      // usage limits + expiry (from edge_case_type). This heals coupon↔promotion drift.
      const promoCoupons = coupons.filter((c) => c.promo_id === row.promo_id && (c.code || '').trim());
      const desiredCodes = new Set(promoCoupons.map((c) => c.code.trim()));
      const couponCodes = [];
      let removedStale = 0;
      if (live) {
        const existing = await listCoupons(promo.id);
        for (const c of existing.filter((c) => !desiredCodes.has(c.code))) {
          await api('DELETE', `/api/marketing/promotions/coupons/delete?ids=${encodeURIComponent(c.id)}`, null, { expectStatus: [200, 204] });
          log(`    ✗ removed stale coupon: ${c.code}`);
          removedStale++;
        }
        const present = new Set(existing.map((c) => c.code));
        for (const c of promoCoupons) {
          const code = c.code.trim();
          if (present.has(code)) { verbose(`↻ coupon: ${code}`); }
          else {
            await api('POST', '/api/marketing/promotions/coupons/add', [{
              promotionId: promo.id, code, ...couponLimits(c), expirationDate: couponExpiry(c),
            }], { expectStatus: [200, 204] });
            log(`    ✓ coupon: ${code}`);
          }
          couponCodes.push(code);
        }
      } else {
        promoCoupons.forEach((c) => couponCodes.push(c.code.trim()));
      }

      results.push({ promoId: row.promo_id, name, id: promo?.id, rewardType: row.reward_type, rewardApplied: flags.rewardApplied, conditions: flags.conditions, warnings: flags.warnings, couponCodes, removedStale });
    } catch (err) {
      log(`⚠ promotion "${name}" failed: ${err.message.slice(0, 160)} — skipping`);
      results.push({ promoId: row.promo_id, name, error: err.message.slice(0, 160) });
    }
  }

  writeResults(`test-data/_seed-results-promotions-${DATE_STAMP}.json`, {
    seededAt: new Date().toISOString(), target: BACK_URL, storeId: STORE_ID, promotions: results,
  });
  const failed = results.filter((r) => r.error);
  const ok = results.filter((r) => !r.error);
  const couponCount = ok.reduce((n, r) => n + (r.couponCodes?.length || 0), 0);
  const staleRemoved = ok.reduce((n, r) => n + (r.removedStale || 0), 0);
  const manual = ok.filter((r) => r.warnings?.length).map((r) => r.promoId);
  console.log(`\n✅ Promotions seed complete — ${ok.length}/${results.length} promotions, ${couponCount} coupons.`);
  if (staleRemoved) console.log(`   ✗ removed ${staleRemoved} stale/misattached coupon(s) (reconciled to CSV).`);
  if (!SKIP_REWARDS) console.log(`   ✓ rewards applied to ${ok.filter((r) => r.rewardApplied).length} promotion(s).`);
  else console.log(`   ℹ rewards skipped (--skip-rewards) — discount amounts not set.`);
  if (manual.length) console.log(`   ⚠ needs manual Admin config (catalog-dependent): ${manual.join(', ')}`);
  if (failed.length) console.log(`   ⚠ ${failed.length} promotion(s) failed (reported, run is resilient): ${failed.map((r) => r.promoId).join(', ')}`);
}

main().catch((err) => { console.error(`\n❌ Promotions seed failed: ${err.message}`); process.exit(1); });
