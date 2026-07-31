#!/usr/bin/env node
/**
 * scripts/seed-data/seed-b2b-addresses.mjs
 *
 * Idempotent seeder for B2B ORGANIZATION addresses from test-data/b2b/addresses.csv.
 * Fills the gap where org addresses beyond the single inline default baked into
 * `orgBody()` (user-provision.mjs) were never provisioned — which left multi-address
 * cases (e.g. CHK-035 "select address" ≥2 rows) blocked.
 *
 * MODEL: an Organization is a Member; its addresses live on `Member.addresses[]`.
 *   - Read:   GET  /api/members/{orgPlatformId}         → org incl. addresses[]
 *   - Update: POST /api/members  {...member, addresses} → upsert by id (same call seedOrgs uses)
 *   Runs AFTER the org graph exists (bootstrap priority 105, after company-users=100);
 *   resolves each org by the pinned platform_id in organizations.csv.
 *
 * ALSO provisions the ADDRESS-BOOK PAGINATION fixture: the pagination org (ORG-002 / TechFlow,
 * `PAGINATION_ORG_ID` in addresses-specs.mjs) carries enough addresses that the checkout
 * address-selection modal renders >1 page at the storefront's 6-per-page size — which is what
 * unblocks suite 011 CHK-060 / CHK-098. The row count and its page arithmetic are asserted
 * statically by `npm run td:validate:b2b` (check [6]), so the fixture cannot silently shrink
 * back below the pagination threshold.
 *
 * IDEMPOTENT by CONTENT KEY (addressType|line1|city|countryCode):
 *   - seed adds only CSV addresses not already present on the member (never duplicates,
 *     never touches the org's inline default unless it content-matches a CSV row).
 *   No alias writeback: b2b org addresses are matched by content, NOT referenced by a
 *   pinned @td() id (the ADDR_NY/ADDR_LA/US-ADDR-* aliases are a separate personal fixture),
 *   so there is no runtime GUID to persist (test-data.md — business-key-backed, no writeback).
 *
 * TEARDOWN-SAFE by CONTENT KEY **or** SEED MARKER. The content key alone is not enough: it is
 * derived from the CURRENT CSV, so deleting a row (or editing its line1/city) orphaned that row's
 * live address permanently — teardown could no longer see it, and it kept inflating the address
 * count the pagination cases assert on. Every seeded address therefore also carries
 * `outerId = AGENT-TEST-ADDR:<address_id>` (see addresses-specs.mjs for why `outerId` is the right
 * field and the platform evidence that it round-trips), and teardown removes an address that
 * content-matches a CSV row OR carries that marker. Seed backfills the marker onto addresses that
 * predate it, so the existing fixture is covered too, and `--only` scoping is honoured by the
 * sweep (markerSweepInScope in addresses-specs.mjs, where it is unit-tested).
 *
 * USAGE:
 *   node scripts/seed-data/seed-b2b-addresses.mjs [--dry-run] [--verbose] [--only <ORG-ID|ADDR-ID>] [--teardown]
 * Safety: ENV_RISK gate; contact-level rows (contact_id set) are out of scope (org addresses only).
 */
import {
  assertSafeTarget, auth, api, loadCsv, log, verbose, iso3, csvBool, verifyRemoved,
  DRY_RUN, TEARDOWN, ONLY, BACK_URL, STORE_ID,
} from '../../lib/seed-common.mjs';
// Pagination contract, region code→name mapping, and the idempotency content key live in the
// side-effect-free spec module so the seeder, the drift guard (validate-b2b-data.mjs) and the
// unit tests all share ONE definition (test-data-authoring.md §3).
import {
  addressContentKey as akey, isRegionCode, regionNameFor, PAGINATION_ORG_ID,
  ADDRESSES_PER_PAGE, MIN_PAGES, pageCount, lastPageSize,
  seedOuterId, isSeededOuterId, markerSweepInScope,
} from './addresses-specs.mjs';

function buildAddress(row) {
  return {
    addressType: (row.address_type || 'Shipping').trim(), // Shipping | Billing | BillingAndShipping
    firstName: row.first_name || undefined,
    lastName: row.last_name || undefined,
    organization: row.company || undefined,
    line1: row.line1,
    line2: row.line2 || undefined,
    city: row.city,
    regionId: row.state || undefined,          // ISO/subdivision code (e.g. "NY")
    regionName: regionNameFor(row.state),       // display name (e.g. "New York") — NOT the code
    postalCode: row.postal_code,
    countryCode: iso3(row.country_code),
    countryName: row.country_name,
    phone: row.phone || undefined,
    email: row.email || undefined,
    isDefault: csvBool(row.is_default, false),
    name: row.description || undefined,
    // Teardown marker (addresses-specs.mjs). Not part of the content key, so it cannot affect
    // idempotency — it exists so teardown can reclaim this address even after its CSV row is gone.
    outerId: seedOuterId(row),
  };
}

// org_id -> { platform_id, name } from the pinned organizations.csv
function loadOrgMap() {
  const map = new Map();
  for (const o of loadCsv('test-data/b2b/organizations.csv')) {
    if (o.org_id) map.set(o.org_id, { platformId: (o.platform_id || '').trim(), name: o.org_name });
  }
  return map;
}

// addresses.csv rows grouped by org (org-level only: org_id set, contact_id blank), honoring --only.
function loadOrgAddressRows() {
  const rows = loadCsv('test-data/b2b/addresses.csv')
    .filter((r) => r.org_id && !r.contact_id);
  const skippedContact = loadCsv('test-data/b2b/addresses.csv').filter((r) => r.contact_id).length;
  if (skippedContact) log(`Note: ${skippedContact} contact-level address row(s) skipped (org addresses only).`);
  const filtered = ONLY ? rows.filter((r) => r.org_id === ONLY || r.address_id === ONLY) : rows;
  const byOrg = new Map();
  for (const r of filtered) { if (!byOrg.has(r.org_id)) byOrg.set(r.org_id, []); byOrg.get(r.org_id).push(r); }
  return byOrg;
}

async function getOrg(platformId) {
  if (!platformId) return null;
  return api('GET', `/api/members/${platformId}`, null, { expectStatus: [200, 404] }).catch(() => null);
}

async function seed(byOrg, orgMap) {
  let added = 0, backfilled = 0, orgsTouched = 0;
  for (const [orgId, rows] of byOrg) {
    const org = orgMap.get(orgId);
    if (!org?.platformId) { log(`⚠ ${orgId}: no pinned platform_id in organizations.csv — skipped (seed orgs first)`); continue; }
    const member = await getOrg(org.platformId);
    if (!member?.id) { log(`⚠ ${orgId} (${org.name}): org member ${org.platformId} not found live — skipped (run seed:b2b first)`); continue; }

    const existing = Array.isArray(member.addresses) ? member.addresses : [];
    const have = new Set(existing.map(akey));
    const wantMarker = new Map(); // content key -> the marker that row should carry
    const toAdd = [];
    for (const row of rows) {
      const addr = buildAddress(row);
      wantMarker.set(akey(addr), addr.outerId);
      if (have.has(akey(addr))) { verbose(`  = ${orgId} already has ${row.address_id} (${addr.city}/${addr.addressType})`); continue; }
      toAdd.push(addr); have.add(akey(addr));
    }

    // BACKFILL the teardown marker onto addresses that already exist live (seeded before the
    // marker did, or by an older revision of a row). Without this pass the sweep would only ever
    // protect addresses created from here on, and today's 22-address fixture would stay orphanable.
    // A FOREIGN outerId is left alone and reported: clobbering another system's identifier is worse
    // than a teardown gap, and the content key still covers that address while its CSV row lives.
    let marked = 0;
    const foreign = [];
    const patched = existing.map((a) => {
      const want = wantMarker.get(akey(a));
      if (!want || a.outerId === want) return a;
      if (a.outerId && !isSeededOuterId(a.outerId)) { foreign.push(`${a.city}/${a.addressType} (outerId=${a.outerId})`); return a; }
      marked++;
      return { ...a, outerId: want };
    });
    for (const f of foreign) log(`⚠ ${orgId}: leaving foreign outerId untouched — ${f}; teardown falls back to the content key for it`);

    if (!toAdd.length && !marked) { verbose(`${orgId} (${org.name}): all ${rows.length} address(es) already present and marked`); continue; }
    const what = [toAdd.length ? `adding ${toAdd.length} (${toAdd.map((a) => `${a.city}/${a.addressType}`).join(', ')})` : null,
      marked ? `marking ${marked} existing for teardown` : null].filter(Boolean).join('; ');
    log(`${org.name}: ${existing.length} existing → ${what}`);
    if (!DRY_RUN) {
      await api('POST', '/api/members', { ...member, addresses: [...patched, ...toAdd] }, { expectStatus: [200, 201, 204] });
    }
    added += toAdd.length; backfilled += marked; orgsTouched++;
  }
  console.log(`\n✅ B2B addresses seed — ${added} address(es) added, ${backfilled} existing marked for teardown, across ${orgsTouched} org(s)${DRY_RUN ? ' [DRY RUN]' : ''}.`);
}

/**
 * Report the pagination org's LIVE address count and what it means for the checkout
 * address-selection modal. This is the seeder's own evidence that the CHK-060 / CHK-098
 * precondition actually holds on the target env — the static guard can only check the CSV.
 * `shippingSelectable` is reported separately because a Billing-only address is not a valid
 * ship-to, so the modal's row count can legitimately be lower than the member's total.
 */
async function reportPagination(orgMap) {
  const org = orgMap.get(PAGINATION_ORG_ID);
  const member = org?.platformId ? await getOrg(org.platformId) : null;
  if (!member?.id) { verbose(`pagination org ${PAGINATION_ORG_ID} not resolvable — skipping readout`); return; }
  const addrs = Array.isArray(member.addresses) ? member.addresses : [];
  const shipping = addrs.filter((a) => /shipping/i.test(a.addressType || '')).length;
  const countries = new Set(addrs.map((a) => a.countryCode).filter(Boolean));
  console.log(`\n📄 Address-book pagination (${org.name}):`);
  console.log(`   total addresses:      ${addrs.length}  → ${pageCount(addrs.length)} page(s) at ${ADDRESSES_PER_PAGE}/page (last page ${lastPageSize(addrs.length)})`);
  console.log(`   shipping-selectable:  ${shipping}  → ${pageCount(shipping)} page(s) (last page ${lastPageSize(shipping)})`);
  console.log(`   countries:            ${[...countries].sort().join(', ')}`);
  if (pageCount(shipping) < MIN_PAGES) {
    console.log(`   ⚠ fewer than ${MIN_PAGES} pages — CHK-060 / CHK-098 need a multi-page address book.`);
  }
}

/**
 * Normalize regionName code→name across seeded orgs' member addresses (idempotent).
 * Fixes the systematic VCST-5304 D2 drift where the org default + any code-sourced address
 * stored the region CODE ("NY") in regionName instead of the display NAME ("New York").
 * regionId (the code) is left untouched. With no `--only`, runs over EVERY org in
 * organizations.csv (not just those with addresses.csv rows, so an org whose only address is
 * its inline default is covered); with `--only`, narrows to the org(s) `byOrg` resolved
 * (mirrors seed()/teardown()'s scoping — a scoped run must not touch other orgs live).
 */
async function normalizeRegionNames(orgMap, byOrg) {
  let fixedOrgs = 0, fixedAddrs = 0;
  const entries = ONLY ? [...orgMap].filter(([orgId]) => byOrg.has(orgId)) : orgMap;
  for (const [orgId, org] of entries) {
    if (!org.platformId) continue;
    const member = await getOrg(org.platformId);
    if (!member?.id || !Array.isArray(member.addresses) || !member.addresses.length) continue;
    let changed = 0;
    const addresses = member.addresses.map((a) => {
      if (a.regionName && isRegionCode(a.regionName)) {
        const name = regionNameFor(a.regionName);
        if (name && name !== a.regionName) { changed++; return { ...a, regionName: name }; }
      }
      return a;
    });
    if (!changed) { verbose(`${orgId} (${org.name}): regionName already clean`); continue; }
    log(`${org.name}: normalizing regionName code→name on ${changed} address(es)`);
    if (!DRY_RUN) await api('POST', '/api/members', { ...member, addresses }, { expectStatus: [200, 201, 204] });
    fixedAddrs += changed; fixedOrgs++;
  }
  console.log(`\n✅ regionName normalization — ${fixedAddrs} address(es) across ${fixedOrgs} org(s) set to the state NAME${DRY_RUN ? ' [DRY RUN]' : ''}.`);
}

async function teardown(byOrg, orgMap) {
  // Scoping predicate for the marker sweep — the judgment lives in addresses-specs.mjs so the
  // three --only cases are unit-tested; this only binds it to the run's actual flags.
  const markerInScope = (a) => markerSweepInScope(a, { only: ONLY, orgIds: orgMap });

  // Sweep every org we MANAGE, not just orgs that still have CSV rows. The marker exists precisely
  // to reclaim an address whose row was deleted — and a fully-deleted org drops out of `byOrg`
  // altogether, so iterating `byOrg` would step straight over the case this fix is for.
  // `--only` narrows back to the org(s) it resolved (mirrors seed()/normalizeRegionNames()).
  const scope = ONLY ? [...orgMap].filter(([orgId]) => byOrg.has(orgId)) : [...orgMap];

  // ONE definition of "teardown owns this address", derived once per org and reused by both the
  // removal below and the residual probe at the end. Two hand-written copies of this predicate is
  // how a probe ends up reporting a clean teardown while reclaimed orphans are still live.
  const csvKeysFor = new Map(scope.map(([orgId]) =>
    [orgId, new Set((byOrg.get(orgId) || []).map((r) => akey(buildAddress(r))))]));
  const doomed = (orgId, a) => csvKeysFor.get(orgId).has(akey(a)) || markerInScope(a);

  let removed = 0, orphaned = 0;
  for (const [orgId, org] of scope) {
    const member = org?.platformId ? await getOrg(org.platformId) : null;
    if (!member?.id) { verbose(`${orgId}: org not present — nothing to tear down`); continue; }
    const csvKeys = csvKeysFor.get(orgId);
    const existing = Array.isArray(member.addresses) ? member.addresses : [];
    const keep = existing.filter((a) => !doomed(orgId, a));
    if (keep.length === existing.length) { verbose(`${orgId}: no seeded addresses to remove`); continue; }

    // An orphan is why the marker exists: marked live, but no CSV row content-matches it any more
    // (its row was deleted or its line1/city edited). Reported by name so the operator can see the
    // fixture actually shrank back, rather than a silent count change.
    const orphans = existing.filter((a) => !csvKeys.has(akey(a)) && markerInScope(a));
    for (const o of orphans) {
      log(`  ↳ orphan reclaimed: ${o.city}/${o.addressType} — marker ${o.outerId}, no matching addresses.csv row`);
    }
    log(`${org.name}: removing ${existing.length - keep.length} seeded address(es)${orphans.length ? ` (${orphans.length} orphaned)` : ''}`);
    if (!DRY_RUN) await api('POST', '/api/members', { ...member, addresses: keep }, { expectStatus: [200, 201, 204] });
    removed += existing.length - keep.length; orphaned += orphans.length;
  }

  // The probe must use the SAME predicate as the removal. Checking only content keys here would
  // report a clean teardown while every reclaimed orphan was still sitting on the org.
  const residual = await verifyRemoved(async () => {
    const still = [];
    for (const [orgId, org] of scope) {
      const member = org?.platformId ? await getOrg(org.platformId) : null;
      if (!member?.id) continue;
      if ((member.addresses || []).some((a) => doomed(orgId, a))) still.push(orgId);
    }
    return still;
  });
  log(residual === 0
    ? `Teardown verified — ${removed} removed (${orphaned} orphaned), 0 remain.`
    : `⚠ Teardown incomplete — ${residual} org(s) still carry a seeded address.`);
  if (residual > 0 && !DRY_RUN) process.exit(1);
}

async function main() {
  assertSafeTarget();
  console.log(`\n🌱 B2B org-addresses seed${DRY_RUN ? ' [DRY RUN]' : ''}${TEARDOWN ? ' [TEARDOWN]' : ''}`);
  console.log(`   Target: ${BACK_URL} | Store: ${STORE_ID}\n`);
  await auth();

  const orgMap = loadOrgMap();
  const byOrg = loadOrgAddressRows();
  if (!byOrg.size) {
    if (ONLY) { console.error(`ABORT: --only ${ONLY} matched no org address rows`); process.exit(2); }
    // No --only and no rows is NOT an abort in teardown mode: an emptied addresses.csv is exactly
    // the state where every live seeded address is an orphan, and the marker sweep is the only
    // thing that can still reclaim it. Aborting here would strand the whole fixture.
    if (!TEARDOWN) { console.error('ABORT: addresses.csv has no org-level rows to seed'); process.exit(2); }
    log('addresses.csv has no org-level rows — teardown continues as a marker-only sweep.');
  }

  if (TEARDOWN) await teardown(byOrg, orgMap);
  else { await seed(byOrg, orgMap); await normalizeRegionNames(orgMap, byOrg); await reportPagination(orgMap); }
}

main().catch((err) => { console.error(`\n❌ B2B addresses seed failed: ${err.message}`); process.exit(1); });
