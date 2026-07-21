#!/usr/bin/env node
/**
 * seed-catalog.mjs — Catalog structure seeder (Catalog phase, priority 10 in seed-bootstrap).
 *
 * Thin wrapper over the shared ensureCatalogs() in seed-common.mjs: creates the physical + virtual
 * catalogs from test-data/catalogs/catalogs.csv with STABLE names (AGENT-TEST-SEED-<name>), links the
 * virtual catalogs to their physical sources, and binds the store to its virtual catalog. Idempotent —
 * reuses catalogs by name across runs (no date stamp → no orphan-catalog sprawl).
 *
 * Usage:
 *   node scripts/seed-data/seed-catalog.mjs [--dry-run] [--verbose]
 *   TEST_ENV=localhost npm run seed:catalog-structure
 */
import { DRY_RUN, log, assertSafeTarget, auth, api, ensureCatalogs } from '../../lib/seed-common.mjs';

(async () => {
  console.log(`🗂  Seed Catalog structure${DRY_RUN ? ' [DRY RUN]' : ''}`);
  assertSafeTarget();
  await auth();
  const map = await ensureCatalogs(api);
  const uniqueIds = new Set(Object.values(map).map((c) => c.id));
  log(`Done: ${uniqueIds.size} catalog(s) ensured (physical + virtual, store bound).`);
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
