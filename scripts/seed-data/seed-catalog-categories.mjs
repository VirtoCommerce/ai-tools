#!/usr/bin/env node
/**
 * seed-catalog-categories.mjs — Category tree seeder over the shared seedCategoryTree().
 *
 * ⚠️ NOT part of the seed chain / bootstrap anymore. The categories.csv tree is built IN-PROCESS by
 * the products phase (seed-standard-products calls seedCategoryTree) so the category cache spans
 * category creation + product placement. Running THIS as a separate process before the products phase
 * re-creates the tree the products process then can't see (cross-process index lag; codes aren't
 * unique-constrained) → duplicate same-coded categories — the exact regression td:reconcile [6] guards.
 * Kept only for deliberate, standalone category-only seeding; refuses to run without --force.
 *
 * Usage (standalone only, at your own risk):
 *   node scripts/seed-data/seed-catalog-categories.mjs --force [--dry-run] [--verbose]
 */
import { DRY_RUN, log, assertSafeTarget, auth, api, seedCategoryTree } from '../lib/seed-common.mjs';

(async () => {
  if (!process.argv.includes('--force')) {
    console.error('✖ seed-catalog-categories is no longer a seed phase — the products phase builds the');
    console.error('  categories.csv tree in-process. Running it separately can create DUPLICATE categories.');
    console.error('  Use `npm run seed:catalog` (or seed:bootstrap). To force standalone anyway, pass --force.');
    process.exit(2);
  }
  console.log(`🗂  Seed Categories [--force]${DRY_RUN ? ' [DRY RUN]' : ''}`);
  assertSafeTarget();
  await auth();
  const map = await seedCategoryTree(api);
  log(`Done: ${Object.keys(map).length} categor${Object.keys(map).length === 1 ? 'y' : 'ies'} ensured + roots linked.`);
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
