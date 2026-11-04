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
 *
 * A store that does not allow anonymous users (pageContext store.settings.anonymousUsersAllowed=false —
 * vcptcore-qa B2B-store, 2026-11-03) refuses the guest `products` query with `Unauthorized`. The read then
 * retries ONCE as the run account (USER_EMAIL, bare password grant + storeId) — the same no-org account
 * whose view the suite asserts, so the partition is the one the run sees. No account ⇒ the error stands.
 */
import { POOL_QUERY, POOL_SIZE, CURRENCY, CULTURE, selectPoolCandidates, partitionPool } from './ga4-lists-specs.mjs';

const cache = new Map();

export async function discoverGa4Pool({ backUrl, storeId, pageSize = 100, maxPages = 20 } = {}) {
  const key = `${backUrl}|${storeId}`;
  if (cache.has(key)) return cache.get(key);
  const raw = [];
  let candidates = [];
  let reached = null;
  let token = null;
  for (let page = 0; page < maxPages; page++) {
    let res = await poolPage(backUrl, storeId, pageSize, page, token);
    if (!token && isUnauthorized(res.body) && (token = await runAccountToken(backUrl, storeId))) {
      res = await poolPage(backUrl, storeId, pageSize, page, token);
    }
    const j = res.body;
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

export const isUnauthorized = (j) => (j?.errors || []).some((e) => (e?.extensions?.codes || [e?.extensions?.code]).includes('Unauthorized'));

export async function runAccountToken(backUrl, storeId) {
  const username = process.env.USER_EMAIL, password = process.env.USER_PASSWORD;
  if (!username || !password) return null;
  const res = await fetch(`${backUrl}/connect/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'password', username, password, storeId }),
  });
  const j = await res.json().catch(() => null);
  return j?.access_token || null;
}

async function poolPage(backUrl, storeId, pageSize, page, token) {
  const res = await fetch(`${backUrl}/graphql`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ query: POOL_QUERY, variables: { s: storeId, c: CURRENCY, cu: CULTURE, first: pageSize, after: String(page * pageSize) } }),
  });
  return { ok: res.ok, status: res.status, body: await res.json().catch(() => null) };
}
