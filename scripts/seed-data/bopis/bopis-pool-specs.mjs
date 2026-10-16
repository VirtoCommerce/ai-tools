/**
 * scripts/seed-data/bopis/bopis-pool-specs.mjs
 *
 * SINGLE SOURCE OF TRUTH for the BOPIS PAGINATION POOL — pure data + pure builders, NO side effects,
 * so the seeder (seed-bopis.mjs --pool) and any drift guard import the same declaration.
 *
 * Why a pool exists. The BOPIS pagination cases (036 BOPIS-092/093/098/099, 050k PCK-GQL-132/133/139)
 * need MORE THAN ONE PAGE of pickup locations that are eligible for the cart's product: the
 * storefront pages 50 at a time (@td(BOPIS.pageSize)) and the cases confirm a location at position 51
 * (@td(BOPIS.location51Id)). vcst has 102 native locations; other envs had a handful. A pickup
 * location is CART-eligible only when its fulfillment center (or a transfer FFC) stocks the cart's
 * product (vc-module-x-pickup ProductPickupLocationService: Today / Transfer / GlobalTransfer) — so
 * the pool is bound at seed time to the FFC that stocks the BOPIS test product, resolved live, never
 * hardcoded.
 *
 * Discrimination (SECOND RULE):
 *   - size > 2 x pageSize: a first page, a deep position 51 AND a second Load More all exist, so
 *     "page 2 duplicates the confirmed location" and "totalCount double-counts it" are decidable.
 *   - every name carries the shared keyword POOL_KEYWORD, so a keyword search ALSO exceeds one page
 *     (BOPIS-098 "filtered total exceeds one page" is reachable), while each city keyword matches a
 *     strict subset (the filtered list must be SHORTER than the unfiltered one).
 *   - several countries / regions / cities with unequal counts, so a facet on
 *     address.countryCode / regionName / city returns distinct buckets with distinct counts.
 *
 * Limits: the pool says nothing about Transfer / GlobalTransfer availability (every pool location is
 * a "Today" location for the bound FFC), and nothing about inactive-location filtering.
 */

/** Shared name prefix — teardown sweeps exactly this (live-name check), nothing else. */
export const POOL_PREFIX = 'AGENT-TEST-BOPIS-Pool-';
/** Keyword every pool name contains (a search on it returns the whole pool). */
export const POOL_KEYWORD = 'BOPIS-Pool';
/** Pool size. With the env's own eligible location(s) the eligible total exceeds 2 pages of 50. */
export const POOL_SIZE = 101;
/** Storefront page size the cases assume (mirrors aliases.json BOPIS.pageSize). */
export const PAGE_SIZE = 50;

// Unequal weights on purpose: facet buckets must differ in count to be told apart.
export const POOL_CITIES = [
  { city: 'Austin', region: 'TX', country: 'USA', countryName: 'United States', postal: '73301', lat: 30.2672, lng: -97.7431, weight: 14 },
  { city: 'Dallas', region: 'TX', country: 'USA', countryName: 'United States', postal: '75201', lat: 32.7767, lng: -96.797, weight: 12 },
  { city: 'Seattle', region: 'WA', country: 'USA', countryName: 'United States', postal: '98101', lat: 47.6062, lng: -122.3321, weight: 11 },
  { city: 'Denver', region: 'CO', country: 'USA', countryName: 'United States', postal: '80202', lat: 39.7392, lng: -104.9903, weight: 9 },
  { city: 'Toronto', region: 'ON', country: 'CAN', countryName: 'Canada', postal: 'M5H 2N2', lat: 43.6532, lng: -79.3832, weight: 10 },
  { city: 'Vancouver', region: 'BC', country: 'CAN', countryName: 'Canada', postal: 'V6B 1A1', lat: 49.2827, lng: -123.1207, weight: 7 },
  { city: 'London', region: 'England', country: 'GBR', countryName: 'United Kingdom', postal: 'EC1A 1BB', lat: 51.5074, lng: -0.1278, weight: 9 },
  { city: 'Manchester', region: 'England', country: 'GBR', countryName: 'United Kingdom', postal: 'M1 1AE', lat: 53.4808, lng: -2.2426, weight: 6 },
  { city: 'Berlin', region: 'Berlin', country: 'DEU', countryName: 'Germany', postal: '10115', lat: 52.52, lng: 13.405, weight: 8 },
  { city: 'Munich', region: 'Bavaria', country: 'DEU', countryName: 'Germany', postal: '80331', lat: 48.1351, lng: 11.582, weight: 5 },
  { city: 'Sydney', region: 'NSW', country: 'AUS', countryName: 'Australia', postal: '2000', lat: -33.8688, lng: 151.2093, weight: 6 },
  { city: 'Melbourne', region: 'VIC', country: 'AUS', countryName: 'Australia', postal: '3000', lat: -37.8136, lng: 144.9631, weight: 4 },
];

/**
 * PURE: the pool's location rows, deterministic (same input → same names/addresses on every env,
 * so idempotency is by name). Cities are assigned by weight; `seq` is 1-based and zero-padded.
 */
export function poolLocations(size = POOL_SIZE, cities = POOL_CITIES) {
  const totalWeight = cities.reduce((s, c) => s + c.weight, 0);
  const slots = [];
  cities.forEach((c) => { const n = Math.round((c.weight / totalWeight) * size); for (let i = 0; i < n; i++) slots.push(c); });
  while (slots.length < size) slots.push(cities[slots.length % cities.length]);
  slots.length = size;
  return slots.map((c, i) => {
    const seq = String(i + 1).padStart(3, '0');
    return {
      seq,
      name: `${POOL_PREFIX}${seq} ${c.city}`,
      city: c.city, region: c.region, country: c.country, countryName: c.countryName, postal: c.postal,
      line1: `${100 + i} ${POOL_KEYWORD} Street`,
      // Spread the pins slightly so a map view does not stack all of one city's pins on one point.
      geoLocation: `${(c.lat + ((i % 7) - 3) * 0.01).toFixed(6)},${(c.lng + ((i % 5) - 2) * 0.01).toFixed(6)}`,
    };
  });
}

/** PURE: problems with a pool declaration (empty = discriminating). Used by the seeder pre-flight. */
export function poolContractProblems(rows = poolLocations(), pageSize = PAGE_SIZE) {
  const out = [];
  if (rows.length <= 2 * pageSize) out.push(`pool size ${rows.length} must exceed 2 x pageSize (${2 * pageSize})`);
  if (new Set(rows.map((r) => r.name)).size !== rows.length) out.push('pool names are not unique');
  if (rows.some((r) => !r.name.startsWith(POOL_PREFIX) || !r.name.includes(POOL_KEYWORD))) out.push(`every name must start with ${POOL_PREFIX}`);
  const byCity = {}; for (const r of rows) byCity[r.city] = (byCity[r.city] || 0) + 1;
  const counts = Object.values(byCity);
  if (Math.max(...counts) >= rows.length) out.push('a city keyword must match a strict subset');
  if (new Set(rows.map((r) => r.country)).size < 3) out.push('need >= 3 countries for the country facet');
  if (new Set(counts).size < 2) out.push('city bucket counts are all equal — facets would not discriminate');
  return out;
}
