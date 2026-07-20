#!/usr/bin/env node
/**
 * seed-store.mjs — Store fixture seeder (thin wrapper over the shared seed-common store logic).
 *
 * Ensures the store exists and is FULLY configured from test-data/stores/stores.csv — currencies,
 * languages, settings, storefront url, virtual-catalog binding, and fulfillment-center roles — via the
 * SINGLE shared ensureStore() in seed-common.mjs (the same path the relational seeder uses). This is
 * the Store(80) phase of the seed priority chain: run it AFTER inventory(70) so the FFCs its role
 * assignment needs already exist. Idempotent — safe to re-run.
 *
 * Usage:
 *   node scripts/seed-data/seed-store.mjs [--dry-run] [--verbose]
 *   TEST_ENV=localhost npm run seed:store
 */
import {
  DRY_RUN, log, assertSafeTarget, auth, api, ensureVirtualCatalog, ensureStore,
} from '../../lib/seed-common.mjs';

(async () => {
  console.log(`🏬 Seed Store${DRY_RUN ? ' [DRY RUN]' : ''}`);
  assertSafeTarget();
  await auth();
  // Resolve (create if missing) the store's virtual catalog, then finalize the store from stores.csv.
  // ensureVirtualCatalog short-circuits when the store already has a virtual catalog, so the explicit
  // ensureStore below is what guarantees the rich config + FFC role assignment run on every seed.
  const catalogId = await ensureVirtualCatalog(api);
  const id = await ensureStore(api, { catalogId });
  log(`Done: store ${id || '(unresolved)'} configured from stores.csv → catalog ${catalogId || '(none)'}.`);
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
