/**
 * seed-reviews.mjs — Customer Reviews test data seeder.
 *
 * There is NO xAPI path to seed reviews deterministically (createReview is purchase-gated
 * per user). So — like push-messages (068/050l) — we self-seed via the ADMIN save endpoint
 * (`POST /api/customerReviews`, array<CustomerReview>, which bypasses the storefront
 * purchase/duplicate validator), using synthetic `AGENT-TEST-rev-*` userIds so nothing
 * touches real org-user state and teardown is a clean DELETE sweep.
 *
 * Seeds ONE product with >=6 Approved reviews (so suite 086 can test pagination/sort/
 * approved-only deterministically) + 1 New + 1 Rejected (moderation/search-by-status).
 * The corpus, the host-selection rule and the served-count contract live in the
 * side-effect-free ./reviews-specs.mjs (shared with `npm run td:validate:reviews`).
 *
 * The host product carries NO other review: the approved-only cases assert the served total
 * EQUALS approved_count, so a host shared with another fixture (the VCST-5487 render-variant
 * matrix sits on the first slugged product the store lists) fails them for a reason unrelated
 * to moderation. The seeder re-checks that after seeding and fails loud.
 *
 * Runtime platform GUIDs are written to test-data/aliases.<env>.json (per the multi-env
 * authoring rule in .claude/rules/test-data.md) — REVIEW_PRODUCT.id / .name / .slug /
 * .approved_count / .new_count / .rejected_count.
 *
 *   npm run seed:reviews            # seed (idempotent — reuses existing AGENT-TEST-rev-*)
 *   npm run seed:reviews:teardown   # delete every AGENT-TEST-rev-* review
 */
import "../../lib/sync-stdio.mjs"; // before any output: a piped stdout must not lose its tail to process.exit()
import {
  assertSafeTarget, auth, api, writeEnvAliasOverride, loadAliases, log, verbose, verifyRemoved,
  DRY_RUN, TEARDOWN, STORE_ID, BACK_URL,
} from '../../lib/seed-common.mjs';
import {
  USER_PREFIX, APPROVED, NEW_REVIEW, REJECTED_REVIEW,
  isSeededReview, buildReviewBody, reservedReviewSlugs, pickCleanHost, checkHostCorpus, validateReviewSpecs,
} from './reviews-specs.mjs';

const specProblems = validateReviewSpecs();
if (specProblems.length) {
  console.error('ABORT: reviews-specs.mjs does not describe a usable corpus:');
  for (const p of specProblems) console.error(`  ✗ ${p}`);
  process.exit(2);
}

async function storeReviews() {
  const r = await api('POST', '/api/customerReviews/search', { storeId: STORE_ID, take: 2000 }, { expectStatus: [200] });
  return r?.results || [];
}

async function gql(query, variables = {}) {
  const res = await fetch(`${BACK_URL}/graphql`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query, variables }) });
  return (await res.json().catch(() => ({})))?.data;
}

// Idempotency: if a previous run already attached AGENT-TEST-rev-* reviews to a product the store
// still surfaces (with a slug) AND nothing else reviews it, reuse THAT product. `products(first: N)`
// has no stable order, so without this a re-run picks a different product and seeds a second set.
async function findPreviouslySeededProduct(all) {
  const counts = {};
  for (const rev of all.filter(isSeededReview)) counts[rev.entityId] = (counts[rev.entityId] || 0) + 1;
  const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([id]) => id);
  for (const id of ranked) {
    if (all.some((r) => r.entityId === id && !isSeededReview(r))) { log(`  ⚠ product ${id} carries AGENT-TEST-rev-* reviews AND foreign ones — not reusable as REVIEW_PRODUCT`); continue; }
    const p = (await gql(`query($id:String!){ product(id:$id, storeId:"${STORE_ID}") { id name slug } }`, { id }))?.product;
    if (p?.id && p.slug) return { id: p.id, name: p.name || p.id, slug: p.slug };
    verbose(`previously seeded entity ${id} is not store-visible with a slug — skipping`);
  }
  return null;
}

async function pickProduct(all) {
  const reuse = await findPreviouslySeededProduct(all);
  if (reuse) { log('  ↻ reusing product that already carries AGENT-TEST reviews'); return reuse; }
  // The reviews must be VIEWABLE on the storefront (pagination / widget UI cases), so the host is a
  // product the STORE surfaces with a SEO slug — and one no review of any kind touches yet.
  const reviewedIds = new Set(all.map((r) => r.entityId));
  const reservedSlugs = reservedReviewSlugs(loadAliases());
  for (let after = 0; after < 5000; after += 100) {
    const items = (await gql(`{ products(storeId: "${STORE_ID}" first: 100 after: "${after}") { items { id name slug } } }`))?.products?.items || [];
    if (!items.length) break;
    const p = pickCleanHost(items, { reviewedIds, reservedSlugs });
    if (p) return { id: p.id, name: p.name || p.id, slug: p.slug };
  }
  throw new Error('no store-visible slugged product without reviews found in the first 5000 — cannot host a corpus whose served total must equal approved_count');
}

async function findSeeded(entityId) {
  const r = await api('POST', '/api/customerReviews/search', { storeId: STORE_ID, entityIds: [entityId], take: 200 }, { expectStatus: [200] });
  return r?.results || [];
}

async function teardown() {
  log('🧹 Customer reviews teardown');
  // Sweep across the whole store (review volume is tiny), delete every AGENT-TEST-rev-*.
  const mine = (await storeReviews()).filter(isSeededReview);
  if (!mine.length) { log('  ✓ nothing to remove'); return; }
  for (const rev of mine) {
    await api('DELETE', `/api/customerReviews?ids=${rev.id}`, null, { expectStatus: [200, 204] }).catch((e) => verbose(`del ${rev.id}: ${e.message.slice(0, 80)}`));
  }
  log(`  ✗ deleted ${mine.length} seeded review(s)`);
  const residual = await verifyRemoved(async () => (await storeReviews()).filter(isSeededReview).map((r) => r.id));
  if (residual > 0 && !DRY_RUN) { console.error(`❌ ${residual} AGENT-TEST-rev-* review(s) survived teardown`); process.exit(1); }
  log('  ✓ 0 residue');
}

async function seed() {
  const product = await pickProduct(await storeReviews());
  log(`🌱 Seed Customer Reviews → product ${product.name} (${product.id})`);

  const existing = (await findSeeded(product.id)).filter(isSeededReview);
  if (existing.length) log(`  ↻ ${existing.length} AGENT-TEST review(s) already present — reusing/topping up`);

  // 1. Create ALL reviews as New via the admin save (bypasses the purchase gate). A user that
  //    already reviewed the product is skipped: a second save 500s on the unique index (KB-BCA1C475).
  for (const s of [...APPROVED, NEW_REVIEW, REJECTED_REVIEW]) {
    if (existing.some((e) => e.userId === USER_PREFIX + s.u)) { verbose(`skip ${s.u} (present)`); continue; }
    await api('POST', '/api/customerReviews', [buildReviewBody(s, { entityId: product.id, entityName: product.name, storeId: STORE_ID })], { expectStatus: [200, 201, 204] });
    log(`  ✓ created (New) ${USER_PREFIX + s.u} (rating ${s.rating})`);
  }

  // 2. Moderate through the REAL approve/reject endpoints so the rating cache (RatingEntity)
  //    is recomputed via CalculateAsync(ReviewStatusChangeData[]) — the working recompute path.
  //    (A raw admin-save with status=Approved does NOT recompute; the full-store calculateStore
  //    recompute is broken — VCST-5423. So entityRating stays [] unless we moderate for real.)
  const idByUser = Object.fromEntries((await findSeeded(product.id)).filter(isSeededReview).map((r) => [r.userId, r.id]));
  const approveIds = APPROVED.map((s) => idByUser[USER_PREFIX + s.u]).filter(Boolean);
  const rejectIds = [idByUser[USER_PREFIX + REJECTED_REVIEW.u]].filter(Boolean);
  if (approveIds.length) await api('POST', '/api/customerReviews/approve', approveIds, { expectStatus: [200, 204] });
  if (rejectIds.length) await api('POST', '/api/customerReviews/reject', rejectIds, { expectStatus: [200, 204] });
  log(`  ✓ moderated: approved ${approveIds.length}, rejected ${rejectIds.length} (${USER_PREFIX}${NEW_REVIEW.u} left New) — rating cache recomputed`);

  if (DRY_RUN) { log('\n✅ dry run complete (no writes, no alias write-back)'); return; }

  // 3. The served-count contract, re-read from EVERY review on the host (not only ours).
  const { counts, problems } = checkHostCorpus(await findSeeded(product.id));
  if (problems.length) {
    for (const p of problems) console.error(`  ✗ ${p}`);
    throw new Error(`REVIEW_PRODUCT ${product.id} does not satisfy the corpus contract — not writing the alias`);
  }

  writeEnvAliasOverride({
    REVIEW_PRODUCT: {
      id: product.id, name: product.name, slug: product.slug || '',
      approved_count: counts.approved, new_count: counts.new, rejected_count: counts.rejected,
    },
  });
  log(`\n✅ Seeded "${product.name}" (slug=${product.slug}): ${counts.approved} Approved + ${counts.new} New + ${counts.rejected} Rejected, no foreign reviews`);
  log(`   aliases.${process.env.TEST_ENV || 'vcst'}.json updated: REVIEW_PRODUCT (id/name/slug/approved_count/new_count/rejected_count)`);
}

(async () => {
  assertSafeTarget();
  await auth();
  if (TEARDOWN) await teardown();
  else await seed();
})().catch((e) => { console.error('❌', e.message); process.exit(1); });
