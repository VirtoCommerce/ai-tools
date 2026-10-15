#!/usr/bin/env node
/**
 * scripts/seed-data/loyalty/seed-missions-family.mjs — the loyalty-missions data family, `fixtures | demo`.
 *
 *   fixtures (default) — the standing AGENT-TEST-MSN set: seed-loyalty-missions (missions, banners,
 *                        progress orders, store settings) and seed-missions-deadline. NOT the 083d E2E
 *                        set: seed-missions-e2e mints per-RUN missions for its suite and stays its own
 *                        entry point (`npm run seed:missions-e2e`).
 *   demo               — seed-missions-demo: real-named missions with buyer progress on the sales-rep
 *                        demo's customers.
 *
 * Missions are STORE-WIDE — every account sees every Published mission — so the two profiles would share
 * every /account/missions page; the engine (scripts/lib/seed-family.mjs) refuses to mix them.
 * Stamp: `_meta.dataset_profiles.loyalty-missions`.
 */

import "../../lib/sync-stdio.mjs";
import { api, log } from '../../lib/seed-common.mjs';
import { runFamily } from '../../lib/seed-family.mjs';
import { MISSIONS_FAMILY, MISSIONS_PROFILE } from './missions-demo-specs.mjs';

runFamily({
  family: MISSIONS_FAMILY,
  npmScript: 'seed:missions-family',
  profiles: {
    fixtures: {
      id: MISSIONS_PROFILE.fixtures,
      steps: [
        { name: 'missions', script: 'loyalty/seed-loyalty-missions.mjs', required: false },
        { name: 'deadline', script: 'loyalty/seed-missions-deadline.mjs', required: false },
      ],
    },
    demo: { id: MISSIONS_PROFILE.demo, steps: [{ name: 'demo', script: 'loyalty/seed-missions-demo.mjs', required: true }] },
  },
  modulePresent: async () => {
    try { await api('POST', '/api/loyalty-missions/search', { take: 0 }, { expectStatus: [200, 201] }); return true; } catch { return false; }
  },
  beforeDemo: async () => {
    const r = await api('POST', '/api/loyalty-missions/search', { take: 500 }, { expectStatus: [200, 201] }).catch(() => null);
    const n = (r?.results || []).filter((m) => /AGENT-TEST/i.test(m.name)).length;
    if (n) log(`WARN: ${n} AGENT-TEST mission(s) are live; every buyer will see them beside the demo. Sweep with \`npm run seed:missions-family -- --teardown\` first.`);
  },
}).catch((e) => { console.error('loyalty-missions family crashed:', e.message); process.exit(2); });
