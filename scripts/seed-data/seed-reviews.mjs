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
 *
 * Runtime platform GUIDs are written to test-data/aliases.<env>.json (per the multi-env
 * authoring rule in .claude/rules/test-data.md) — REVIEW_PRODUCT.id / .approved_count,
 * REVIEW_NEW.id, REVIEW_REJECTED.id. Business constants (prefix/statuses) live in the
 * committed REVIEW_SEED inline alias.
 *
 *   npm run seed:reviews            # seed (idempotent — reuses existing AGENT-TEST-rev-*)
 *   npm run seed:reviews:teardown   # delete every AGENT-TEST-rev-* review
 */
import { auth, api, writeEnvAliasOverride, log, verbose, DRY_RUN, TEARDOWN, STORE_ID, BACK_URL } from '../lib/seed-common.mjs';

const USER_PREFIX = 'AGENT-TEST-rev-';
// Approved ratings deliberately span the full 1..5 range so the rating-range filter
// (REV-ADM-015) and average calculation have complete coverage.
const APPROVED = [
  { u: 'a01', rating: 1, title: 'AGENT-TEST poor', review: 'AGENT-TEST did not meet expectations.' },
  { u: 'a02', rating: 2, title: 'AGENT-TEST below par', review: 'AGENT-TEST some issues, would hesitate.' },
  { u: 'a03', rating: 3, title: 'AGENT-TEST okay', review: 'AGENT-TEST does the job, nothing special.' },
  { u: 'a04', rating: 4, title: 'AGENT-TEST good', review: 'AGENT-TEST solid quality, minor packaging nitpick.' },
  { u: 'a05', rating: 5, title: 'AGENT-TEST excellent', review: 'AGENT-TEST works exactly as described, very satisfied.' },
  { u: 'a06', rating: 5, title: 'AGENT-TEST perfect', review: 'AGENT-TEST exceeded expectations, fast delivery.' },
];
const NEW_REVIEW = { u: 'new01', rating: 4, title: 'AGENT-TEST pending', review: 'AGENT-TEST awaiting moderation.' };
const REJECTED_REVIEW = { u: 'rej01', rating: 2, title: 'AGENT-TEST rejected', review: 'AGENT-TEST spammy content sample.' };

const isSeeded = (r) => typeof r?.userId === 'string' && r.userId.startsWith(USER_PREFIX);

async function pickProduct() {
  // The seeded reviews must be VIEWABLE on the storefront (for the pagination / widget UI
  // cases), so pick a product the STORE actually surfaces AND that has a SEO slug (=> a
  // reachable PDP URL). A plain admin catalog search can return catalog products with no
  // slug / not in the store's shoppable catalog (e.g. "0 price product"), whose reviews
  // render nowhere. So discover via the storefront xAPI and require slug != null.
  const q = `{ products(storeId: "${STORE_ID}" first: 30) { items { id name slug } } }`;
  const res = await fetch(`${BACK_URL}/graphql`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: q }) });
  const j = await res.json().catch(() => ({}));
  const items = j?.data?.products?.items || [];
  const p = items.find((x) => x.slug); // first store-visible product WITH a slug
  if (p?.id) return { id: p.id, name: p.name || p.id, slug: p.slug };
  // Fallback: admin search (slug may be missing — logged as a warning by the caller).
  verbose('xAPI product discovery found no slugged product — falling back to admin search');
  const r = await api('POST', '/api/catalog/search/products', { take: 1, sort: 'name', searchPhrase: '' }, { expectStatus: [200] });
  const a = r?.items?.[0] || r?.results?.[0];
  if (!a?.id) throw new Error('no product found to attach reviews to');
  return { id: a.id, name: a.name || a.id, slug: null };
}

async function findSeeded(entityId) {
  const r = await api('POST', '/api/customerReviews/search', { storeId: STORE_ID, entityIds: [entityId], take: 200 }, { expectStatus: [200] });
  return (r?.results || []).filter(isSeeded);
}

async function saveReview(entityId, entityName, spec, status) {
  const body = [{
    title: spec.title, review: spec.review, rating: spec.rating,
    userId: USER_PREFIX + spec.u, userName: 'AGENT-TEST reviewer',
    entityId, entityType: 'Product', entityName, storeId: STORE_ID,
    reviewStatus: status, images: [],
  }];
  await api('POST', '/api/customerReviews', body, { expectStatus: [200, 201, 204] });
}

async function teardown() {
  log('🧹 Customer reviews teardown');
  // Sweep across the whole store (review volume is tiny), delete every AGENT-TEST-rev-*.
  const r = await api('POST', '/api/customerReviews/search', { storeId: STORE_ID, take: 500 }, { expectStatus: [200] });
  const mine = (r?.results || []).filter(isSeeded);
  if (!mine.length) { log('  ✓ nothing to remove'); return; }
  for (const rev of mine) {
    await api('DELETE', `/api/customerReviews?ids=${rev.id}`, null, { expectStatus: [200, 204] }).catch((e) => verbose(`del ${rev.id}: ${e.message.slice(0, 80)}`));
  }
  log(`  ✗ deleted ${mine.length} seeded review(s)`);
}

async function seed() {
  const product = await pickProduct();
  log(`🌱 Seed Customer Reviews → product ${product.name} (${product.id})`);

  let existing = await findSeeded(product.id);
  if (existing.length) log(`  ↻ ${existing.length} AGENT-TEST review(s) already present — reusing/topping up`);

  // 1. Create ALL reviews as New via the admin save (bypasses the purchase gate).
  const allSpecs = [...APPROVED, NEW_REVIEW, REJECTED_REVIEW];
  for (const s of allSpecs) {
    if (existing.some((e) => e.userId === USER_PREFIX + s.u)) { verbose(`skip ${s.u} (present)`); continue; }
    await saveReview(product.id, product.name, s, 'New');
    log(`  ✓ created (New) ${USER_PREFIX + s.u} (rating ${s.rating})`);
  }

  // 2. Moderate through the REAL approve/reject endpoints so the rating cache (RatingEntity)
  //    is recomputed via CalculateAsync(ReviewStatusChangeData[]) — the working recompute path.
  //    (A raw admin-save with status=Approved does NOT recompute; the full-store calculateStore
  //    recompute is broken — VCST-5423. So entityRating stays [] unless we moderate for real.)
  const created = await findSeeded(product.id);
  const idByUser = Object.fromEntries(created.map((r) => [r.userId, r.id]));
  const approveIds = APPROVED.map((s) => idByUser[USER_PREFIX + s.u]).filter(Boolean);
  const rejectIds = [idByUser[USER_PREFIX + REJECTED_REVIEW.u]].filter(Boolean);
  if (approveIds.length) await api('POST', '/api/customerReviews/approve', approveIds, { expectStatus: [200, 204] });
  if (rejectIds.length) await api('POST', '/api/customerReviews/reject', rejectIds, { expectStatus: [200, 204] });
  log(`  ✓ moderated: approved ${approveIds.length}, rejected ${rejectIds.length} (${USER_PREFIX}${NEW_REVIEW.u} left New) — rating cache recomputed`);

  // Re-read to count what's on the product. Only REVIEW_PRODUCT is aliased — cases read it by
  // @td(REVIEW_PRODUCT.id/.approved_count/.slug); the New + Rejected reviews are consumed by
  // EFFECT (approved-only projection, status/rating filters), not by id, so no id-aliases needed.
  const all = await findSeeded(product.id);
  const approvedCount = all.filter((r) => r.reviewStatus === 'Approved').length;
  const newCount = all.filter((r) => r.reviewStatus === 'New').length;
  const rejCount = all.filter((r) => r.reviewStatus === 'Rejected').length;

  writeEnvAliasOverride({
    REVIEW_PRODUCT: { id: product.id, name: product.name, slug: product.slug || '', approved_count: approvedCount },
  });

  if (!product.slug) log('  ⚠ picked product has NO slug — its reviews may not be reachable on the storefront (UI pagination/widget cases need a slugged product)');
  log(`\n✅ Seeded "${product.name}" (slug=${product.slug || 'NONE'}): ${approvedCount} Approved + ${newCount} New + ${rejCount} Rejected`);
  log(`   aliases.<env>.json updated: REVIEW_PRODUCT (id/name/slug/approved_count)`);
}

(async () => {
  await auth();
  if (TEARDOWN) await teardown();
  else await seed();
})().catch((e) => { console.error('❌', e.message); process.exit(1); });
