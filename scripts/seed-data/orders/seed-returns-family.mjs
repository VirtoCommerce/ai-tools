#!/usr/bin/env node
/**
 * scripts/seed-data/orders/seed-returns-family.mjs — the returns data family, `fixtures | demo`.
 *
 *   fixtures (default) — the AGENT-TEST regression family: seed-return-orders (VCST-5628),
 *                        seed-return-decisions (VCST-5883), seed-org-returns (VCST-5884).
 *   demo               — seed-returns-demo: presentation-grade returns on the sales-rep demo's customers.
 *
 * They share one surface — the Admin Return list and the store-wide return numbering — so the engine
 * (scripts/lib/seed-family.mjs) refuses to seed one over the other. Stamp: `_meta.dataset_profiles.returns`.
 *
 * Usage:
 *   TEST_ENV=vcst       npm run seed:returns-family
 *   TEST_ENV=virtostart npm run seed:returns-family -- --profile demo
 *   TEST_ENV=virtostart npm run seed:returns-family -- --teardown
 */

import "../../lib/sync-stdio.mjs";
import { api, log } from '../../lib/seed-common.mjs';
import { runFamily } from '../../lib/seed-family.mjs';
import { RETURNS_FAMILY, RETURNS_PROFILE } from './returns-demo-specs.mjs';

runFamily({
  family: RETURNS_FAMILY,
  npmScript: 'seed:returns-family',
  profiles: {
    // Each fixture seeder owns its own orders, buyers and returns; none reads another's.
    fixtures: {
      id: RETURNS_PROFILE.fixtures,
      steps: [
        { name: 'return-orders', script: 'orders/seed-return-orders.mjs', required: false },
        { name: 'decisions', script: 'orders/seed-return-decisions.mjs', required: false },
        { name: 'org-returns', script: 'orders/seed-org-returns.mjs', required: false },
      ],
    },
    demo: { id: RETURNS_PROFILE.demo, steps: [{ name: 'demo', script: 'orders/seed-returns-demo.mjs', required: true }] },
  },
  modulePresent: async () => {
    try { await api('POST', '/api/return/search', { take: 0 }, { expectStatus: [200, 201] }); return true; } catch { return false; }
  },
  // Live AGENT-TEST returns were never stamped, so the engine cannot see them: warn rather than abort.
  beforeDemo: async () => {
    const r = await api('POST', '/api/order/customerOrders/search', { keyword: 'AGENT-TEST-ORD-RET', take: 0 }, { expectStatus: [200, 201] }).catch(() => null);
    if (r?.totalCount) log(`WARN: ${r.totalCount} AGENT-TEST-ORD-RET* order(s) are live and will sit beside the demo in the Admin Return list. Sweep them with \`npm run seed:returns-family -- --teardown\` first.`);
  },
}).catch((e) => { console.error('returns family crashed:', e.message); process.exit(2); });
