/**
 * reviews-specs.mjs — SINGLE SOURCE OF TRUTH for the customer-review MODERATION corpus that
 * seed-reviews.mjs provisions for suites 086 / 087 / 088 (REVIEW_PRODUCT). Side-effect-free: no env,
 * no network, no fs — the seeder and the drift guard (validate-reviews-data.mjs) import the same rules.
 *
 * WHAT MAKES THE CORPUS DISCRIMINATING
 * ------------------------------------
 * REV-GQL-013 asserts the storefront query returns EXACTLY `approved_count` items. That only proves
 * "New and Rejected are hidden" when (a) the product really carries a New AND a Rejected review next
 * to the Approved ones, and (b) NOTHING ELSE reviews that product. A product that already hosts
 * another fixture's reviews (the VCST-5487 render-variant matrix sits on the first slugged product
 * the store lists) makes the served total larger than `approved_count`, and the case fails for a
 * reason that has nothing to do with moderation. So the host is chosen as a product with ZERO reviews
 * of any kind, never one a committed review alias names, and the seeder re-checks it after seeding.
 */

/** Every review this seeder creates has a userId with this prefix — teardown sweeps exactly these. */
export const USER_PREFIX = 'AGENT-TEST-rev-';

/** Approved ratings span the full 1..5 range so the rating-range filter and the average have full coverage. */
export const APPROVED = [
  { u: 'a01', rating: 1, title: 'AGENT-TEST poor', review: 'AGENT-TEST did not meet expectations.' },
  { u: 'a02', rating: 2, title: 'AGENT-TEST below par', review: 'AGENT-TEST some issues, would hesitate.' },
  { u: 'a03', rating: 3, title: 'AGENT-TEST okay', review: 'AGENT-TEST does the job, nothing special.' },
  { u: 'a04', rating: 4, title: 'AGENT-TEST good', review: 'AGENT-TEST solid quality, minor packaging nitpick.' },
  { u: 'a05', rating: 5, title: 'AGENT-TEST excellent', review: 'AGENT-TEST works exactly as described, very satisfied.' },
  { u: 'a06', rating: 5, title: 'AGENT-TEST perfect', review: 'AGENT-TEST exceeded expectations, fast delivery.' },
];
export const NEW_REVIEW = { u: 'new01', rating: 4, title: 'AGENT-TEST pending', review: 'AGENT-TEST awaiting moderation.' };
export const REJECTED_REVIEW = { u: 'rej01', rating: 2, title: 'AGENT-TEST rejected', review: 'AGENT-TEST spammy content sample.' };

/** Suite 086 paginates the Approved list, so it needs more than one page's worth at the smallest page size it uses. */
export const MIN_APPROVED = 6;

/** Field names the REVIEW_PRODUCT alias exposes; the cases read id / approved_count / slug. */
export const ALIAS_FIELDS = ['id', 'name', 'slug', 'approved_count', 'new_count', 'rejected_count'];

export const isSeededReview = (r) => typeof r?.userId === 'string' && r.userId.startsWith(USER_PREFIX);

/** Admin save body for one review (POST /api/customerReviews takes an array). `images: []` — null 500s (KB-BCA1C475). */
export function buildReviewBody(spec, { entityId, entityName, storeId, status = 'New' }) {
  return {
    title: spec.title, review: spec.review, rating: spec.rating,
    userId: USER_PREFIX + spec.u, userName: 'AGENT-TEST reviewer',
    entityId, entityType: 'Product', entityName, storeId,
    reviewStatus: status, images: [],
  };
}

/** Slugs of products other committed review fixtures own (REV_* aliases) — never a host for this corpus. */
export function reservedReviewSlugs(aliases) {
  return new Set(Object.entries(aliases || {})
    .filter(([k, v]) => k.startsWith('REV_') && v && typeof v.slug === 'string' && v.slug)
    .map(([, v]) => v.slug));
}

/**
 * Pick the host: the first store-visible, slugged product that carries no review at all and is not
 * reserved by another review fixture. Pure. Returns null when none qualifies.
 */
export function pickCleanHost(products, { reviewedIds = new Set(), reservedSlugs = new Set() } = {}) {
  return (products || []).find((p) => p?.id && p.slug && !reviewedIds.has(p.id) && !reservedSlugs.has(p.slug)) || null;
}

/**
 * The served-count contract after seeding, from every review on the host. Pure. Returns problem strings.
 * `foreign` = reviews on the host that this seeder did not create — any of them breaks approved_count.
 */
export function checkHostCorpus(reviews) {
  const mine = (reviews || []).filter(isSeededReview);
  const foreign = (reviews || []).filter((r) => !isSeededReview(r));
  const count = (s) => mine.filter((r) => r.reviewStatus === s).length;
  const counts = { approved: count('Approved'), new: count('New'), rejected: count('Rejected') };
  const problems = [];
  if (foreign.length) problems.push(`host carries ${foreign.length} review(s) this seeder did not create (userIds ${[...new Set(foreign.map((r) => r.userId))].slice(0, 3).join(', ')}) — the storefront total would exceed approved_count`);
  if (counts.approved < MIN_APPROVED) problems.push(`only ${counts.approved} Approved review(s), need >= ${MIN_APPROVED}`);
  if (counts.new < 1) problems.push('no New review — "unmoderated is hidden" would pass with nothing to hide');
  if (counts.rejected < 1) problems.push('no Rejected review — "rejected is hidden" would pass with nothing to hide');
  return { counts, problems };
}

/** Static shape of the declared corpus. Pure. Returns problem strings. */
export function validateReviewSpecs() {
  const problems = [];
  const all = [...APPROVED, NEW_REVIEW, REJECTED_REVIEW];
  const users = all.map((s) => s.u);
  if (new Set(users).size !== users.length) problems.push('two specs share a user suffix — the second save 500s on the (store, entity, type, userId) unique index (KB-BCA1C475)');
  if (APPROVED.length < MIN_APPROVED) problems.push(`APPROVED declares ${APPROVED.length} review(s), need >= ${MIN_APPROVED}`);
  const ratings = new Set(APPROVED.map((s) => s.rating));
  for (const r of [1, 2, 3, 4, 5]) if (!ratings.has(r)) problems.push(`no Approved review rated ${r} — the rating-range filter loses a bucket`);
  for (const s of all) {
    if (!Number.isInteger(s.rating) || s.rating < 1 || s.rating > 5) problems.push(`${s.u}: rating ${s.rating} is outside 1..5`);
    if (!String(s.title).startsWith('AGENT-TEST') || !String(s.review).startsWith('AGENT-TEST')) problems.push(`${s.u}: title/review must start with AGENT-TEST`);
  }
  if (!USER_PREFIX.startsWith('AGENT-TEST-')) problems.push(`USER_PREFIX "${USER_PREFIX}" must start with AGENT-TEST-`);
  return problems;
}
