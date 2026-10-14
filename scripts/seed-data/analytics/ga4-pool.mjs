/**
 * scripts/seed-data/analytics/ga4-pool.mjs
 *
 * Live discovery of the VCST-6017 product pool — the ONE network step shared by seed-ga4-lists.mjs and
 * the Page Builder seeder (cms/seed-pagebuilder-pages.mjs, for the two GA4 pages). Both call it with the
 * same arguments and get the same partition: the query is code-sorted and the rules are the pure ones in
 * ga4-lists-specs.mjs, so the cart groups, the related set and the page blocks never overlap.
 *
 * Guest view (no token): the Page Builder blocks render for guests, and the run account on vcst is a
 * personal account with no organization, so its prices are the guest prices. Read-only — safe in --dry-run.
 */
import { POOL_QUERY, POOL_SIZE, CURRENCY, CULTURE, selectPoolCandidates, partitionPool } from './ga4-lists-specs.mjs';

const cache = new Map();

export async function discoverGa4Pool({ backUrl, storeId, pageSize = 100, maxPages = 20 } = {}) {
  const key = `${backUrl}|${storeId}`;
  if (cache.has(key)) return cache.get(key);
  const raw = [];
  let candidates = [];
  let reached = null;
  for (let page = 0; page < maxPages; page++) {
    const res = await fetch(`${backUrl}/graphql`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: POOL_QUERY, variables: { s: storeId, c: CURRENCY, cu: CULTURE, first: pageSize, after: String(page * pageSize) } }),
    });
    const j = await res.json().catch(() => null);
    if (!res.ok || j?.errors?.length) throw new Error(`GA4 pool discovery failed: ${res.status} ${JSON.stringify(j?.errors || '').slice(0, 200)}`);
    const items = j?.data?.products?.items || [];
    raw.push(...items);
    candidates = selectPoolCandidates(raw);
    if (items.length === 0) break;
    // One page past the threshold: a code-sorted twin of the last candidate may sit on the next page.
    if (candidates.length >= POOL_SIZE && (reached = (reached ?? page)) < page) break;
  }
  const groups = partitionPool(candidates); // throws when the catalog cannot supply POOL_SIZE products
  cache.set(key, groups);
  return groups;
}
