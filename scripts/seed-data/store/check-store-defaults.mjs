#!/usr/bin/env node
/**
 * check-store-defaults.mjs — LIVE pre-flight: every storefront-serving store on this env still
 * carries its required defaults (`defaultCurrency`, `defaultLanguage`, `url`).
 *
 *   TEST_ENV=vcst npm run td:reconcile:store
 *   TEST_ENV=vcst npm run td:reconcile:store -- --warn-only   # report, never exit non-zero
 *   TEST_ENV=vcst npm run td:reconcile:store -- --verbose     # show the info-level findings too
 *
 * ── WHY A SEPARATE ENTRY POINT, AND WHY IT IS *ALSO* IN td:reconcile ────────────
 * The logic lives in ONE place (./store-defaults-specs.mjs) and is called from two:
 *
 *   - `td:reconcile` check [13] — the gate. This belongs there and not in a `td:validate:*`:
 *     the whole `td:validate:*` family is STATIC (it reads committed CSV/JSON fixtures with no
 *     network), and a null on a live store is not a fixture defect at all — it is ENV STATE,
 *     which is exactly what `td:reconcile` was built to probe. Putting it in `td:validate:store`
 *     would have needed auth inside a family that has none and would have made "static guard"
 *     stop meaning anything.
 *
 *   - this CLI — the pre-flight. `td:reconcile` cannot be a pre-flight: its SEO check [8] reads
 *     every seeded category and product one entity at a time, so a full run is minutes. This
 *     entry runs the store slice alone — auth + one store search + at most one small order
 *     search per store that needs repair evidence. Typically ~3 calls, a couple of seconds. Run
 *     it before a suite, before a seed, and after anything that writes a store.
 *
 * Detection is unconditional; REPAIR VALUES ARE DERIVED FROM LIVE EVIDENCE OR NOT OFFERED AT ALL
 * (see the header of store-defaults-specs.mjs). This script never writes to the platform.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'csv-parse/sync';
import {
  ROOT, BACK_URL, FRONT_URL, STORE_ID, api, auth, assertSafeTarget,
} from '../../lib/seed-common.mjs';
import {
  REQUIRED_FIELD_NAMES, auditStore, gatedStoreIds, deriveExpectations,
  formatFinding, formatExpectation, summarize, isBlank,
} from './store-defaults-specs.mjs';

const WARN_ONLY = process.argv.includes('--warn-only');
const VERBOSE = process.argv.includes('--verbose');
const TEST_ENV = process.env.TEST_ENV || 'vcst';
const ORDER_SAMPLE = 20;

/** store_id column of the committed stores.csv — the stores this repo declares it owns. */
function fixtureStoreIds() {
  const p = join(ROOT, 'test-data/stores/stores.csv');
  if (!existsSync(p)) return [];
  try {
    return parse(readFileSync(p, 'utf8'), { columns: true, skip_empty_lines: true, trim: true, relax_quotes: true, relax_column_count: true })
      .map((r) => r.store_id).filter(Boolean);
  } catch { return []; }
}

/** Recent orders placed IN one store — the primary evidence for currency + language. */
async function recentOrders(storeId, take = ORDER_SAMPLE) {
  try {
    const r = await api('POST', '/api/order/customerOrders/search',
      { storeIds: [storeId], take, skip: 0, sort: 'createdDate:desc' }, { expectStatus: [200, 201] });
    return { orders: r?.results || [], total: r?.totalCount ?? 0 };
  } catch (e) {
    console.log(`     (order probe for "${storeId}" failed: ${String(e.message).slice(0, 90)})`);
    return { orders: [], total: 0 };
  }
}

export async function runStoreDefaultsCheck({ log = console.log } = {}) {
  const search = await api('POST', '/api/stores/search', { take: 200, skip: 0 }, { expectStatus: [200, 201] });
  const stores = search?.results || search?.stores || [];
  if (!stores.length) {
    return { audits: [], summary: summarize([]), hardFail: [`no stores returned by POST /api/stores/search on ${new URL(BACK_URL).host} — cannot verify store defaults`] };
  }

  const liveIds = stores.map((s) => String(s.id));
  const gated = gatedStoreIds({ envStoreId: STORE_ID, fixtureStoreIds: fixtureStoreIds(), liveStoreIds: liveIds });
  const hardFail = [];

  // The env's own store MUST exist — an absent STORE_ID is a worse version of a null default.
  if (STORE_ID && !liveIds.includes(String(STORE_ID))) {
    hardFail.push(`STORE_ID="${STORE_ID}" (.env.${TEST_ENV}) does not exist on ${new URL(BACK_URL).host} — every suite on this env runs against a store that is not there`);
  }

  log(`  scope: ${stores.length} live store(s); GATED = {${[...gated].join(', ') || '(none)'}} (STORE_ID + stores.csv rows present live); others audited but not gated`);

  const peerStores = stores.map((s) => ({ id: s.id, defaultCurrency: s.defaultCurrency, defaultLanguage: s.defaultLanguage }));
  const audits = [];

  for (const s of stores) {
    const isGated = gated.has(String(s.id));
    // Order count is needed for two things: the ungated "is this store actually serving?" test,
    // and the currency/language evidence. Probe it for gated stores and for any store whose
    // required fields are already incomplete — never for a healthy ungated store (cost control).
    const needsProbe = isGated || REQUIRED_FIELD_NAMES.some((f) => s?.[f] === null || s?.[f] === undefined || String(s?.[f] ?? '').trim() === '');
    const { orders, total } = needsProbe ? await recentOrders(s.id) : { orders: [], total: 0 };

    const audit = auditStore(s, { gated: isGated, orderCount: total });
    audits.push(audit);

    const shown = audit.findings.filter((f) => VERBOSE || f.severity !== 'info');
    if (!audit.findings.some((f) => f.severity === 'fail' || f.severity === 'warn')) {
      // A store can be finding-free two ways, and conflating them would print a ✓ next to a null.
      // `missingRequired` non-empty + no finding means the store is DORMANT (no url, no orders) —
      // deliberately not gated, but the line must say so rather than read as healthy.
      const dormant = audit.missingRequired.length > 0;
      const glyph = dormant ? '·' : '✓';
      const state = dormant
        ? `dormant — ${audit.missingRequired.join(' + ')} null, and no url + 0 orders, so nothing is served from it (not gated)`
        : `defaultCurrency=${s.defaultCurrency} · defaultLanguage=${s.defaultLanguage} · url=${s.url}`;
      log(`  ${glyph} ${s.id}${isGated ? ' [gated]' : ''}: ${state}`);
      for (const f of shown.filter((f) => f.severity === 'info')) log(`    ${formatFinding(f)}`);
      continue;
    }
    for (const f of shown) log(`  ${formatFinding(f)}`);
    if (!isGated) log(`    (ungated, but serving: ${isBlank(s.url) ? `${total} order(s) placed in it` : `url=${s.url}`} — reported, not gated)`);

    if (audit.missingRequired.length) {
      log(`    → derived expectation(s) for "${s.id}" (evidence-backed; a null here is the correct answer, not a gap):`);
      const expectations = deriveExpectations(audit.missingRequired, {
        storeId: s.id,
        envStoreId: STORE_ID,
        frontUrl: FRONT_URL,
        orders,
        storeCurrencies: s.currencies || [],
        storeLanguages: s.languages || [],
        peerStores: peerStores.filter((p) => String(p.id) !== String(s.id)),
      });
      for (const e of expectations) log(formatExpectation(e));
      log(`      (NOTHING is written by this check. Repair with a full GET-merge-PUT — never a partial PUT /api/stores, which nulls every omitted field.)`);
    }
  }

  return { audits, summary: summarize(audits), hardFail };
}

/* ── CLI ────────────────────────────────────────────────────────────────────────
 * Guarded so `import`ing this module (reconcile check [13], the unit tests) has NO side effects
 * — the same rule the `*-specs.mjs` modules follow. */
if (process.argv[1] && /check-store-defaults\.mjs$/.test(process.argv[1])) {
  (async () => {
    console.log(`=== store required-defaults pre-flight — TEST_ENV=${TEST_ENV} ===`);
    assertSafeTarget();
    await auth();
    const { summary, hardFail } = await runStoreDefaultsCheck();
    for (const m of hardFail) console.log(`  ✗ ${m}`);

    console.log('\n=== Summary ===');
    console.log(`  stores audited : ${summary.storesAudited}`);
    console.log(`  failures       : ${summary.failures.length + hardFail.length}`);
    console.log(`  warnings       : ${summary.warnings.length}`);
    const failed = summary.failures.length + hardFail.length;
    if (failed && !WARN_ONLY) {
      console.log('\nStore defaults FAILED. A store missing defaultCurrency / defaultLanguage / url is a BROKEN STOREFRONT.');
      console.log('Repair with a full GET-merge-PUT of the store body; write ONLY values the evidence above supports.');
      process.exit(1);
    }
    console.log(failed ? '\n(--warn-only: not failing despite hard problems.)' : '\nStore defaults OK.');
    process.exit(0);
  })().catch((e) => { console.error('store-defaults check crashed:', e); process.exit(2); });
}
