/**
 * scripts/seed-data/b2b/addresses-specs.mjs
 *
 * Side-effect-free spec module for the B2B ORG-ADDRESS fixture. Imported by
 *   - the seeder    (seed-b2b-addresses.mjs)   — region mapping + the content key
 *   - the guard     (validate-b2b-data.mjs)    — the pagination invariant + GUID-leak scan
 *   - unit tests    (scripts/unit/b2b-addresses-specs.test.mjs)
 *
 * NO env load, NO network, NO top-level work (per knowledge/execution/test-data-authoring.md §3) —
 * deliberately does NOT import seed-common.mjs, which loads dotenv at import time.
 *
 * SOURCE OF TRUTH: `test-data/b2b/addresses.csv` is the ONE source for which addresses exist
 * (rule 2 in .claude/rules/test-data.md — CSV-as-input). This module transcribes no address; it
 * holds only what a flat CSV cannot express: the address-book PAGINATION contract, the region
 * code→name mapping, the content key that makes the seeder idempotent, and the seed MARKER that
 * makes teardown work even after a row is deleted from the CSV.
 *
 * The committed CSV carries NO runtime platform GUID: an org address lives inside
 * `Member.addresses[]` and is matched by CONTENT (addressType|line1|city|countryCode), never by a
 * pinned id, so there is no runtime GUID to write back (test-data.md — business-key-backed, no
 * writeback). `findGuidLeaks` below is the guard that keeps it that way.
 */

/* ── Address-book pagination contract ──────────────────────────────────────────
 * Storefront page size. SOURCE OF TRUTH (external repo, cannot be imported here):
 *   vc-frontend  client-app/shared/checkout/composables/useCheckout.ts:32
 *     const ADDRESSES_PER_PAGE = 6;
 *   used at :84 and :101; the address-modal default is also `pageSize: 6` at :309.
 * Pagination is OFFSET-based, not cursor-based — useCustomerAddresses.ts:30 sends
 * `after: String((page - 1) * itemsPerPage)` and the backend maps it to Skip/Take, so pages
 * REPLACE rather than accumulate. Re-derive from that file if the storefront changes it; a stale
 * number here silently changes what the fixture size means (see the GOLDEN RULE in
 * .claude/rules/test-data.md).
 */
export const ADDRESSES_PER_PAGE = 6;
export const ADDRESSES_PER_PAGE_SOURCE =
  'vc-frontend client-app/shared/checkout/composables/useCheckout.ts:32 (ADDRESSES_PER_PAGE = 6)';

/** Which org carries the many-address fixture. Business key from test-data/b2b/organizations.csv. */
export const PAGINATION_ORG_ID = 'ORG-002'; // AGENT-TEST-Org-TechFlow-20260310

/**
 * Pages the fixture must produce. 4 = first + two MIDDLE pages + last, the smallest set that
 * exercises every position a pager can get wrong (only a middle page has both a previous and a
 * next neighbour, and two of them prove the offset advances rather than toggling).
 */
export const MIN_PAGES = 4;

/**
 * The fixture total must NOT be an exact multiple of the page size: a partial final page is the
 * edge case most likely to break (off-by-one Take, or a "next" control that stays enabled), and
 * an exact multiple hides it.
 */
export const REQUIRE_PARTIAL_LAST_PAGE = true;

/** Total live addresses the pagination org must carry. Coherence-checked by assertContractCoherent(). */
export const TARGET_TOTAL = 22;

/** Pages the storefront renders for `n` addresses at ADDRESSES_PER_PAGE. */
export const pageCount = (n) => Math.ceil(Number(n) / ADDRESSES_PER_PAGE);

/** Rows on the final page (equals ADDRESSES_PER_PAGE when the total divides exactly). */
export const lastPageSize = (n) => (Number(n) % ADDRESSES_PER_PAGE) || ADDRESSES_PER_PAGE;

/**
 * TARGET_TOTAL is a number with a stated rationale, so verify the rationale instead of trusting
 * the number: it must yield >= MIN_PAGES pages and a partial last page. Returns [] when coherent.
 */
export function assertContractCoherent() {
  const errs = [];
  const pages = pageCount(TARGET_TOTAL);
  if (pages < MIN_PAGES) {
    errs.push(`TARGET_TOTAL ${TARGET_TOTAL} yields ${pages} page(s) at ${ADDRESSES_PER_PAGE}/page — needs >= ${MIN_PAGES}`);
  }
  if (REQUIRE_PARTIAL_LAST_PAGE && TARGET_TOTAL % ADDRESSES_PER_PAGE === 0) {
    errs.push(`TARGET_TOTAL ${TARGET_TOTAL} is an exact multiple of ${ADDRESSES_PER_PAGE} — a partial last page is required`);
  }
  return errs;
}

/* ── Content key — "the same address" without a platform id ───────────────────
 * An org address has no stable id we control (it is an element of Member.addresses[]), so the
 * seeder is idempotent by CONTENT. Callers must pass a country code already normalized to the
 * form they are comparing in (the seeder iso3()s the CSV row so it matches the live ISO-3 value).
 */
export const addressContentKey = (a) => [a?.addressType, a?.line1, a?.city, a?.countryCode]
  .map((x) => String(x || '').trim().toLowerCase()).join('|');

/* ── Seed marker — the teardown fallback when a CSV row is DELETED ────────────
 * The content key above is enough for idempotency, but NOT for teardown. Teardown derives the
 * set of addresses to remove from the CURRENT CSV, so deleting a row from addresses.csv silently
 * ORPHANS its live address: no CSV row content-matches it any more, teardown steps over it, and
 * it stays on the org forever — inflating the pagination count the very cases this fixture serves
 * assert on. Editing a row's line1/city has the same effect (the old content key is unreachable).
 *
 * So every address this seeder creates also carries a marker in `outerId`, and teardown removes an
 * address when it content-matches a CSV row **OR** carries the marker. The marker is what makes
 * teardown independent of the CSV's current contents.
 *
 * WHY `outerId`, verified against the platform rather than assumed:
 *   - `Address : ValueObject, IHasOuterId` — vc-module-core Common/Address.cs (OuterId is part of
 *     the shared address model, not a customer-module extension).
 *   - It PERSISTS and ROUND-TRIPS: vc-module-customer Data/Model/AddressEntity.cs declares
 *     `[StringLength(128)] OuterId` and copies it in all three directions — FromModel, ToModel,
 *     and Patch. A field that were dropped by any one of those would make the marker vanish on
 *     the next write and the sweep would silently do nothing.
 *   - It is metadata for "this row came from an external system", not customer-facing copy. The
 *     repo convention is exactly this: the AGENT-TEST family prefix rides an internal identifier,
 *     never a display name (seed-common.mjs — "the AGENT-TEST-SEED family prefix lives on the
 *     CODE only"). Putting it in `name`/`description` would surface it in the corporate address
 *     table's Description column that suite 011 reads.
 *   - It is NOT part of addressContentKey, so adding it cannot affect idempotency or the
 *     pagination audit.
 */
export const SEED_MARKER_PREFIX = 'AGENT-TEST-ADDR';

/** vc-module-customer AddressEntity.OuterId is [StringLength(128)] — a longer marker is truncated. */
export const SEED_MARKER_MAX_LENGTH = 128;

/** Marker for a CSV row: `AGENT-TEST-ADDR:ADDR-017`. Carries the business key, so an orphan found
 *  live can be traced back to the row that created it (or reported as a deleted row). */
export const seedOuterId = (row) => `${SEED_MARKER_PREFIX}:${String(row?.address_id ?? '').trim()}`;

/** Does this live address carry OUR marker? The teardown fallback predicate. */
export const isSeededOuterId = (v) => String(v ?? '').trim().startsWith(`${SEED_MARKER_PREFIX}:`);

/** Business key back out of a marker (`AGENT-TEST-ADDR:ADDR-017` → `ADDR-017`); null if not ours. */
export const seedMarkerRowId = (v) => {
  const s = String(v ?? '').trim();
  return isSeededOuterId(s) ? s.slice(SEED_MARKER_PREFIX.length + 1) || null : null;
};

/**
 * Is a live address in scope for the MARKER sweep?
 *
 * Content-key removal is inherently scoped — the keys come from whichever CSV rows `--only`
 * resolved. A marker match is NOT, so `--only` has to be honoured explicitly here, or
 * `--only ADDR-017` would sweep every marked address on that org. Lives in this side-effect-free
 * module (not the seeder) precisely so the three scoping cases are unit-testable without env,
 * network, or an org graph:
 *   --only <ORG-ID>   → every marked address on that org (the org IS the scope)
 *   --only <ADDR-ID>  → only the marker minted from that one row
 *   no --only         → every marked address on every org the seeder manages
 */
export function markerSweepInScope(addr, { only = null, orgIds = null } = {}) {
  if (!isSeededOuterId(addr?.outerId)) return false;
  if (!only) return true;
  if (orgIds && typeof orgIds.has === 'function' && orgIds.has(only)) return true;
  return seedMarkerRowId(addr.outerId) === only;
}

/**
 * Static guard for the marker's two failure modes, both of which break the sweep silently:
 *   - a DUPLICATE marker (two rows sharing an address_id) makes the marker ambiguous, so a
 *     `--only <ADDR-ID>` teardown would reach an address it was not scoped to;
 *   - an OVER-LENGTH marker is truncated by the column, so `isSeededOuterId` may still match but
 *     `seedMarkerRowId` returns the wrong key.
 * Returns [] when every row's marker is sound.
 */
export function findMarkerProblems(addressRows) {
  const errs = [];
  const seen = new Map();
  for (const r of addressRows || []) {
    if (!r.org_id || r.contact_id) continue; // org-level rows only — matches the seeder's scope
    const id = String(r.address_id ?? '').trim();
    if (!id) { errs.push('a row has an empty address_id — its marker would be the bare prefix'); continue; }
    const marker = seedOuterId(r);
    if (marker.length > SEED_MARKER_MAX_LENGTH) {
      errs.push(`${id}: marker is ${marker.length} chars — exceeds OuterId's ${SEED_MARKER_MAX_LENGTH}`);
    }
    if (seen.has(id)) errs.push(`duplicate address_id ${id} — marker ${marker} would be ambiguous`);
    else seen.set(id, r);
  }
  return errs;
}

/* ── Region code → display name ───────────────────────────────────────────────
 * The platform address model wants regionId = the subdivision CODE and regionName = the human
 * NAME; the `state` column in addresses.csv carries the CODE. Fixes the VCST-5304 D2 systematic
 * drift where regionName held "NY" instead of "New York".
 */
export const REGION_NAMES = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado',
  CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho',
  IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana',
  ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota',
  MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada',
  NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina',
  ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania',
  RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas',
  UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia',
  WI: 'Wisconsin', WY: 'Wyoming', DC: 'District of Columbia',
  AB: 'Alberta', BC: 'British Columbia', MB: 'Manitoba', NB: 'New Brunswick',
  NL: 'Newfoundland and Labrador', NS: 'Nova Scotia', ON: 'Ontario', PE: 'Prince Edward Island',
  QC: 'Quebec', SK: 'Saskatchewan',
};
/** A known 2-letter subdivision code → true (so an already-full name passes through untouched). */
export const isRegionCode = (v) => { const s = String(v || '').trim().toUpperCase(); return s.length <= 3 && !!REGION_NAMES[s]; };
/** Resolve a code to its display name; a value that's already a name (or unknown) passes through. */
export const regionNameFor = (v) => { const s = String(v || '').trim(); return s ? (REGION_NAMES[s.toUpperCase()] || s) : undefined; };

/* ── GUID-leak guard ──────────────────────────────────────────────────────────
 * A runtime platform GUID in a committed CSV resolves to the wrong (or a nonexistent) entity on
 * every other env — see "Authoring rule for ANY new seeder" in .claude/rules/test-data.md.
 */
export const GUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;
export function findGuidLeaks(text) {
  return String(text ?? '').match(new RegExp(GUID_RE, 'gi')) || [];
}

/* ── Pagination audit (pure) ──────────────────────────────────────────────────
 * The static guard cannot call the platform, so it audits what the COMMITTED data guarantees.
 *
 * Live total = (distinct org rows in addresses.csv) + (the org's own inline address, when no CSV
 * row content-matches it). That inline address is created by user-provision.mjs orgBody():266+
 * as `addressType: 'BillingAndShipping'` at the org's organizations.csv address, and it is NOT
 * managed by this seeder — the seeder never adds it and teardown never removes it (no CSV content
 * key matches), so it is a permanent +1 on top of the CSV rows.
 *
 * The inline comparison deliberately omits the country code: organizations.csv stores ISO-3
 * ("USA") while addresses.csv stores ISO-2 ("US"), and normalizing would mean duplicating
 * seed-common's ISO map into this side-effect-free module. Omitting it can only make the audit
 * treat the inline address as ALREADY covered, which lowers the expected total and therefore
 * tightens the >= TARGET_TOTAL assertion. Failing safe in the strict direction is the point.
 */
export function paginationAudit(addressRows, orgRows, orgId = PAGINATION_ORG_ID) {
  const norm = (v) => String(v || '').trim().toLowerCase();
  const org = (orgRows || []).find((o) => o.org_id === orgId) || null;

  // Org-level rows only (contact-level rows land on a contact, not the org — the seeder skips them).
  const rows = (addressRows || []).filter((r) => r.org_id === orgId && !r.contact_id);

  // The seeder de-duplicates by content key, so two identical CSV rows create ONE address.
  const byKey = new Map();
  for (const r of rows) {
    const key = addressContentKey({ addressType: r.address_type || 'Shipping', line1: r.line1, city: r.city, countryCode: r.country_code });
    if (!byKey.has(key)) byKey.set(key, r);
  }
  const csvDistinct = byKey.size;
  const duplicateRowIds = rows.filter((r) => {
    const key = addressContentKey({ addressType: r.address_type || 'Shipping', line1: r.line1, city: r.city, countryCode: r.country_code });
    return byKey.get(key) !== r;
  }).map((r) => r.address_id);

  // Does a CSV row already cover the org's inline BillingAndShipping address? (country omitted — see above)
  const inlineCovered = !!org && rows.some((r) =>
    norm(r.address_type) === 'billingandshipping'
    && norm(r.line1) === norm(org.address_line1)
    && norm(r.city) === norm(org.city));
  const unmanagedInline = org && !inlineCovered ? 1 : 0;

  const expectedTotal = csvDistinct + unmanagedInline;
  const pages = pageCount(expectedTotal);

  // Distribution — the address modal has Country / State / City facets, so a fixture with one
  // value per facet cannot exercise them.
  const countries = new Set(rows.map((r) => norm(r.country_code)).filter(Boolean));
  const cities = new Set(rows.map((r) => norm(r.city)).filter(Boolean));
  const states = new Set(rows.map((r) => norm(r.state)).filter(Boolean));

  return {
    orgId,
    orgName: org?.org_name || null,
    csvRowCount: rows.length,
    csvDistinct,
    duplicateRowIds,
    unmanagedInline,
    expectedTotal,
    pages,
    lastPage: lastPageSize(expectedTotal),
    partialLastPage: expectedTotal % ADDRESSES_PER_PAGE !== 0,
    countryCount: countries.size,
    cityCount: cities.size,
    stateCount: states.size,
    countries: [...countries].sort(),
  };
}
