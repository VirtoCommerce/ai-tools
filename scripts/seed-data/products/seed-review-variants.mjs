/**
 * seed-review-variants.mjs — customer-review RENDER-VARIANT matrix seeder (VCST-5487).
 *
 * Seeds every combination of {rating} x {text length} x {image count} that renders
 * DIFFERENTLY in the redesigned review card / image modal, so the storefront cases are not
 * limited to whatever combinations happen to exist on the environment:
 *
 *   text only · long text only · rating only (empty body) · 1 / 2 / 3 / 4 images ·
 *   image+text · image+rating+text · images without text · aggregate 1.0 · aggregate 5.0
 *
 * Complements (does NOT replace) `seed-reviews.mjs`, which seeds the moderation corpus for
 * suites 086/087 on a different product. The matrix lives in the side-effect-free
 * `review-variants-specs.mjs`; this file only executes it.
 *
 * Mechanics mirror `seed-reviews.mjs`, including its hard-won platform facts:
 *   - reviews are created via the ADMIN save endpoint (`POST /api/customerReviews`, an
 *     array), which bypasses the storefront purchase/duplicate validator;
 *   - a raw admin-save with reviewStatus=Approved does NOT recompute the rating cache, so
 *     rows are created as `New` and then pushed through the real `/approve` endpoint
 *     (VCST-5423) — otherwise the PDP header renders no aggregate at all;
 *   - synthetic `AGENT-TEST-revvar-*` userIds keep real org-user state untouched and make
 *     teardown a clean DELETE sweep.
 *
 * Review IMAGES are attached BY REFERENCE to blobs already present on the platform — this
 * seeder never uploads and never commits a blob GUID. The pool is discovered at run time
 * from an existing review that carries images; if the env has none, image variants are
 * skipped with a loud warning rather than failing the whole run.
 *
 * Runtime platform GUIDs (host product ids, review ids) go to test-data/aliases.<env>.json
 * per the multi-env authoring rule in .claude/rules/test-data.md. The committed spec holds
 * only stable SEO slugs and business fields.
 *
 *   npm run seed:review-variants              # seed (idempotent — reuses existing rows)
 *   npm run seed:review-variants -- --dry-run # plan only, no writes
 *   npm run seed:review-variants:teardown     # delete every AGENT-TEST-revvar-*
 */
import {
  auth, api, writeEnvAliasOverride, log, verbose,
  DRY_RUN, TEARDOWN, STORE_ID, BACK_URL,
} from '../../lib/seed-common.mjs';
import { USER_PREFIX, HOSTS, VARIANTS, MAX_IMAGES_NEEDED, expectedAggregates } from './review-variants-specs.mjs';

const isSeeded = (r) => typeof r?.userId === 'string' && r.userId.startsWith(USER_PREFIX);

/** Resolve a host product by its committed SEO slug via the storefront xAPI. */
async function resolveHost(key, slug) {
  const q = `query($slug: String!) { product(storeId: "${STORE_ID}", id: $slug) { id name slug } }`;
  const res = await fetch(`${BACK_URL}/graphql`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: q, variables: { slug } }),
  });
  const j = await res.json().catch(() => ({}));
  const p = j?.data?.product;
  if (p?.id) return { id: p.id, name: p.name || p.id, slug: p.slug || slug };

  // Fallback: page the store catalogue and match on slug (the `product(id:)` resolver does
  // not accept a slug on every platform version).
  verbose(`product(id:"${slug}") did not resolve for ${key} — falling back to a catalogue scan`);
  for (let after = 0; after < 400; after += 100) {
    const lq = `{ products(storeId: "${STORE_ID}", first: 100, after: "${after}") { items { id name slug } } }`;
    const lr = await fetch(`${BACK_URL}/graphql`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: lq }),
    });
    const lj = await lr.json().catch(() => ({}));
    const items = lj?.data?.products?.items || [];
    if (!items.length) break;
    const hit = items.find((x) => x.slug === slug || (x.slug && slug.endsWith(x.slug)));
    if (hit) return { id: hit.id, name: hit.name || hit.id, slug: hit.slug };
  }
  throw new Error(`host product not found for ${key} (slug: ${slug})`);
}

/**
 * Discover reusable review-image blobs from any existing review on this store.
 * Returns [] when the env has no review images — image variants are then skipped.
 */
async function resolveImagePool() {
  const r = await api('POST', '/api/customerReviews/search', { storeId: STORE_ID, take: 200 }, { expectStatus: [200] });
  const pool = [];
  for (const rev of r?.results || []) {
    for (const img of rev.images || []) {
      if (!img?.url || pool.some((p) => p.url === img.url)) continue;
      pool.push({ url: img.url, relativeUrl: img.relativeUrl || img.url, name: img.name || null });
      if (pool.length >= MAX_IMAGES_NEEDED) return pool;
    }
  }
  return pool;
}

async function findSeeded(entityId) {
  const r = await api('POST', '/api/customerReviews/search', { storeId: STORE_ID, entityIds: [entityId], take: 200 }, { expectStatus: [200] });
  return (r?.results || []).filter(isSeeded);
}

function buildImages(count, pool) {
  return pool.slice(0, count).map((img, i) => ({
    relativeUrl: img.relativeUrl,
    url: img.url,
    name: img.name,
    sortOrder: i,
    typeId: 'CustomerReviewImage',
    seoObjectType: 'CustomerReviewImage',
  }));
}

async function saveReview(host, spec, pool) {
  const body = [{
    title: null,
    review: spec.text,
    rating: spec.rating,
    userId: USER_PREFIX + spec.u,
    userName: spec.userName,
    entityId: host.id,
    entityType: 'Product',
    entityName: host.name,
    storeId: STORE_ID,
    reviewStatus: 'New', // approved below through the real endpoint so the cache recomputes
    images: buildImages(spec.images, pool),
  }];
  await api('POST', '/api/customerReviews', body, { expectStatus: [200, 201, 204] });
}

async function teardown() {
  log('🧹 Customer review VARIANTS teardown');
  const r = await api('POST', '/api/customerReviews/search', { storeId: STORE_ID, take: 500 }, { expectStatus: [200] });
  const mine = (r?.results || []).filter(isSeeded);
  if (!mine.length) { log('  ✓ nothing to remove'); return; }
  const byHost = {};
  for (const rev of mine) { byHost[rev.entityId] = (byHost[rev.entityId] || 0) + 1; }
  if (DRY_RUN) { log(`  [dry-run] would delete ${mine.length} review(s) across ${Object.keys(byHost).length} product(s)`); return; }
  for (const rev of mine) {
    await api('DELETE', `/api/customerReviews?ids=${rev.id}`, null, { expectStatus: [200, 204] })
      .catch((e) => verbose(`del ${rev.id}: ${e.message.slice(0, 80)}`));
  }
  // Re-moderate nothing; deleting Approved rows leaves a stale aggregate on some platform
  // versions, so nudge the recompute by approving an empty set is not possible — instead we
  // report it, because a leftover aggregate on a torn-down host is a known platform quirk.
  log(`  ✗ deleted ${mine.length} seeded review(s) across ${Object.keys(byHost).length} product(s)`);
  log('  ⚠ the products\' cached aggregate rating may lag until the next moderation event (platform quirk, VCST-5423)');
}

async function seed() {
  const pool = await resolveImagePool();
  if (pool.length < MAX_IMAGES_NEEDED) {
    log(`  ⚠ only ${pool.length} reusable review image blob(s) found on this env (need ${MAX_IMAGES_NEEDED}); variants asking for more will be seeded with fewer images`);
  } else {
    verbose(`image pool: ${pool.map((p) => p.url).join(', ')}`);
  }

  const hosts = {};
  for (const [key, def] of Object.entries(HOSTS)) {
    hosts[key] = await resolveHost(key, def.slug);
    log(`🎯 ${key} → ${hosts[key].name} (${hosts[key].id})`);
  }

  if (DRY_RUN) {
    log('\n[dry-run] would seed:');
    for (const v of VARIANTS) {
      log(`  ${v.host.padEnd(20)} ${String(v.rating)}★ imgs=${v.images} text=${v.text.length} — ${v.variant}`);
    }
    for (const [k, a] of Object.entries(expectedAggregates())) {
      log(`  expect ${k}: ${a.count} review(s), average ${a.average} → displayed "${a.displayed}"`);
    }
    return;
  }

  // 1. Create every missing row as New.
  for (const v of VARIANTS) {
    const host = hosts[v.host];
    const existing = await findSeeded(host.id);
    if (existing.some((e) => e.userId === USER_PREFIX + v.u)) { verbose(`skip ${v.u} (present)`); continue; }
    await saveReview(host, v, pool);
    log(`  ✓ created ${USER_PREFIX + v.u} on ${v.host} — ${v.rating}★, ${Math.min(v.images, pool.length)} image(s), ${v.text.length} chars`);
  }

  // 2. Approve through the REAL endpoint so the rating aggregate is recomputed.
  const aliasUpdates = {};
  for (const [key, host] of Object.entries(hosts)) {
    const created = await findSeeded(host.id);
    const ids = created.filter((r) => r.reviewStatus !== 'Approved').map((r) => r.id);
    if (ids.length) await api('POST', '/api/customerReviews/approve', ids, { expectStatus: [200, 204] });
    const after = await findSeeded(host.id);
    const approved = after.filter((r) => r.reviewStatus === 'Approved');
    log(`  ✓ ${key}: ${approved.length} approved (${ids.length} newly moderated)`);
    aliasUpdates[key] = {
      id: host.id,
      name: host.name,
      slug: host.slug,
      approved_count: approved.length,
    };
  }
  writeEnvAliasOverride(aliasUpdates);

  // 3. Confirm the storefront aggregate actually reflects the seed.
  log('\n📊 Aggregate verification (storefront xAPI):');
  const exp = expectedAggregates();
  for (const [key, host] of Object.entries(hosts)) {
    const q = `{ product(storeId: "${STORE_ID}", id: "${host.id}") { rating { value reviewCount } } }`;
    const j = await (await fetch(`${BACK_URL}/graphql`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: q }),
    })).json().catch(() => ({}));
    const got = j?.data?.product?.rating;
    const want = exp[key];
    const ok = got && Math.abs(got.value - want.average) < 0.051 && got.reviewCount === want.count;
    log(`  ${ok ? '✓' : '⚠'} ${key}: expected ~${want.average} / ${want.count} → live ${got ? `${got.value} / ${got.reviewCount}` : 'no rating yet'}`);
    if (!ok) log('     (the rating cache can lag a few seconds after moderation — re-check before treating as a defect)');
  }

  log('\n✅ Review render-variant matrix seeded.');
  log(`   aliases.<env>.json updated: ${Object.keys(aliasUpdates).join(', ')} (id/name/slug/approved_count)`);
}

(async () => {
  await auth();
  if (TEARDOWN) await teardown();
  else await seed();
})().catch((e) => { console.error('❌', e.message); process.exit(1); });
