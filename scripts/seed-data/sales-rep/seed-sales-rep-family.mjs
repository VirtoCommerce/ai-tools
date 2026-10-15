#!/usr/bin/env node
/**
 * scripts/seed-data/sales-rep/seed-sales-rep-family.mjs — the sales-rep data family, `fixtures | demo`,
 * forward and reverse. Before it, seeding a usable sales-rep environment meant remembering seven npm
 * scripts in the right order, and tearing one down meant the opposite order, which nothing wrote down.
 *
 *   fixtures (default) — the AGENT-TEST regression family. Deterministic, prefix-marked, consumed by
 *                        the sales-rep suites. Correct for QA; unusable in front of a customer.
 *   demo               — seed-sales-rep-demo: real names, addresses, products and document titles, and
 *                        no AGENT-TEST string on any rendered surface.
 *
 * They share one surface — one rep list, one global document library, one served-org graph — so the
 * engine (scripts/lib/seed-family.mjs, which also explains spawnSync and `--step` vs `--only`) refuses
 * to seed one over the other. Stamp: `_meta.dataset_profiles['sales-rep']`.
 *
 * Usage:
 *   TEST_ENV=vcst       npm run seed:sales-rep-family
 *   TEST_ENV=virtostart npm run seed:sales-rep-family -- --profile demo
 *   TEST_ENV=vcst       npm run seed:sales-rep-family -- --teardown
 *   TEST_ENV=vcst       npm run seed:sales-rep-family -- --step docs --only SR_DOC_PDF
 *   TEST_ENV=vcst       npm run seed:sales-rep-family -- --skip-optional   # reps only
 */

import "../../lib/sync-stdio.mjs"; // before any output: a piped stdout must not lose its tail to process.exit()
import { api } from '../../lib/seed-common.mjs';
import { runFamily } from '../../lib/seed-family.mjs';
import { SALES_REP_FAMILY, SALES_REP_PROFILE } from './sales-rep-demo-specs.mjs';

runFamily({
  family: SALES_REP_FAMILY,
  npmScript: 'seed:sales-rep-family',
  profiles: {
    // Dependency order. `reps` is required and first: every other step attaches to a rep that must
    // already exist. `rowcap` is the same script as `stats` under a different `--only` scope — they
    // write disjoint order-number spaces on purpose, so one sweep can never catch the other's rows.
    fixtures: {
      id: SALES_REP_PROFILE.fixtures,
      steps: [
        { name: 'reps', script: 'sales-rep/seed-sales-rep.mjs', required: true },
        { name: 'rep-only-org', script: 'sales-rep/seed-rep-only-org.mjs', required: false },
        { name: 'docs', script: 'sales-rep/seed-sales-rep-docs.mjs', required: false },
        { name: 'stats', script: 'sales-rep/seed-sales-rep-stats.mjs', required: false },
        { name: 'rowcap', script: 'sales-rep/seed-sales-rep-stats.mjs', args: ['--only', 'ROWCAP'], required: false },
        { name: 'i18n', script: 'sales-rep/seed-sales-rep-i18n-plural.mjs', required: false },
        { name: 'tasks', script: 'sales-rep/seed-sales-rep-tasks.mjs', required: false },
      ],
    },
    // One narrative, one ledger, one teardown.
    demo: { id: SALES_REP_PROFILE.demo, steps: [{ name: 'demo', script: 'sales-rep/seed-sales-rep-demo.mjs', required: true }] },
  },
  // An environment without vc-module-sales-rep is a legitimate deployment shape: one skip line and a
  // zero exit, not seven child seeders each failing with an unrelated-looking message.
  modulePresent: async () => {
    try { await api('GET', '/api/sales-rep/roles', null, { expectStatus: [200, 201] }); return true; } catch { return false; }
  },
  teardownNote: [
    'Note: this reverses the per-seeder chain only. To sweep entities the CSVs no longer',
    'declare — hand-made reps, orphaned documents — use `npm run sr:inventory`.',
  ],
}).catch((e) => { console.error('sales-rep family crashed:', e.message); process.exit(2); });
