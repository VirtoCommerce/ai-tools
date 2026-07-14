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
 * IDEMPOTENT + teardown-safe by CONTENT KEY (addressType|line1|city|countryCode):
 *   - seed adds only CSV addresses not already present on the member (never duplicates,
 *     never touches the org's inline default unless it content-matches a CSV row);
 *   - teardown removes only addresses that content-match a CSV row for that org.
 *   No alias writeback: b2b org addresses are matched by content, NOT referenced by a
 *   pinned @td() id (the ADDR_NY/ADDR_LA/US-ADDR-* aliases are a separate personal fixture),
 *   so there is no runtime GUID to persist (test-data.md — business-key-backed, no writeback).
 *
 * USAGE:
 *   node scripts/seed-data/seed-b2b-addresses.mjs [--dry-run] [--verbose] [--only <ORG-ID|ADDR-ID>] [--teardown]
 * Safety: ENV_RISK gate; contact-level rows (contact_id set) are out of scope (org addresses only).
 */
import {
  assertSafeTarget, auth, api, loadCsv, log, verbose, iso3, csvBool, verifyRemoved,
  DRY_RUN, TEARDOWN, ONLY, BACK_URL, STORE_ID,
} from '../lib/seed-common.mjs';

// Content key — stable across runs, identifies "the same address" without a platform id.
const akey = (a) => [a?.addressType, a?.line1, a?.city, a?.countryCode]
  .map((x) => String(x || '').trim().toLowerCase()).join('|');

function buildAddress(row) {
  return {
    addressType: (row.address_type || 'Shipping').trim(), // Shipping | Billing | BillingAndShipping
    firstName: row.first_name || undefined,
    lastName: row.last_name || undefined,
    organization: row.company || undefined,
    line1: row.line1,
    line2: row.line2 || undefined,
    city: row.city,
    regionId: row.state || undefined,
    regionName: row.state || undefined,
    postalCode: row.postal_code,
    countryCode: iso3(row.country_code),
    countryName: row.country_name,
    phone: row.phone || undefined,
    email: row.email || undefined,
    isDefault: csvBool(row.is_default, false),
    name: row.description || undefined,
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
  let added = 0, orgsTouched = 0;
  for (const [orgId, rows] of byOrg) {
    const org = orgMap.get(orgId);
    if (!org?.platformId) { log(`⚠ ${orgId}: no pinned platform_id in organizations.csv — skipped (seed orgs first)`); continue; }
    const member = await getOrg(org.platformId);
    if (!member?.id) { log(`⚠ ${orgId} (${org.name}): org member ${org.platformId} not found live — skipped (run seed:b2b first)`); continue; }

    const existing = Array.isArray(member.addresses) ? member.addresses : [];
    const have = new Set(existing.map(akey));
    const toAdd = [];
    for (const row of rows) {
      const addr = buildAddress(row);
      if (have.has(akey(addr))) { verbose(`  = ${orgId} already has ${row.address_id} (${addr.city}/${addr.addressType})`); continue; }
      toAdd.push(addr); have.add(akey(addr));
    }
    if (!toAdd.length) { verbose(`${orgId} (${org.name}): all ${rows.length} address(es) already present`); continue; }
    log(`${org.name}: ${existing.length} existing → adding ${toAdd.length} (${toAdd.map((a) => `${a.city}/${a.addressType}`).join(', ')})`);
    if (!DRY_RUN) {
      await api('POST', '/api/members', { ...member, addresses: [...existing, ...toAdd] }, { expectStatus: [200, 201, 204] });
    }
    added += toAdd.length; orgsTouched++;
  }
  console.log(`\n✅ B2B addresses seed — ${added} address(es) added across ${orgsTouched} org(s)${DRY_RUN ? ' [DRY RUN]' : ''}.`);
}

async function teardown(byOrg, orgMap) {
  let removed = 0;
  for (const [orgId, rows] of byOrg) {
    const org = orgMap.get(orgId);
    const member = org?.platformId ? await getOrg(org.platformId) : null;
    if (!member?.id) { verbose(`${orgId}: org not present — nothing to tear down`); continue; }
    const csvKeys = new Set(rows.map((r) => akey(buildAddress(r))));
    const existing = Array.isArray(member.addresses) ? member.addresses : [];
    const keep = existing.filter((a) => !csvKeys.has(akey(a)));
    if (keep.length === existing.length) { verbose(`${orgId}: no seeded addresses to remove`); continue; }
    log(`${org.name}: removing ${existing.length - keep.length} seeded address(es)`);
    if (!DRY_RUN) await api('POST', '/api/members', { ...member, addresses: keep }, { expectStatus: [200, 201, 204] });
    removed += existing.length - keep.length;
  }
  const residual = await verifyRemoved(async () => {
    const still = [];
    for (const [orgId, rows] of byOrg) {
      const org = orgMap.get(orgId);
      const member = org?.platformId ? await getOrg(org.platformId) : null;
      if (!member?.id) continue;
      const csvKeys = new Set(rows.map((r) => akey(buildAddress(r))));
      if ((member.addresses || []).some((a) => csvKeys.has(akey(a)))) still.push(orgId);
    }
    return still;
  });
  log(residual === 0 ? `Teardown verified — ${removed} removed, 0 remain.` : `⚠ Teardown incomplete — ${residual} org(s) still carry a seeded address.`);
  if (residual > 0 && !DRY_RUN) process.exit(1);
}

async function main() {
  assertSafeTarget();
  console.log(`\n🌱 B2B org-addresses seed${DRY_RUN ? ' [DRY RUN]' : ''}${TEARDOWN ? ' [TEARDOWN]' : ''}`);
  console.log(`   Target: ${BACK_URL} | Store: ${STORE_ID}\n`);
  await auth();

  const orgMap = loadOrgMap();
  const byOrg = loadOrgAddressRows();
  if (!byOrg.size) { console.error(`ABORT: --only ${ONLY} matched no org address rows`); process.exit(2); }

  if (TEARDOWN) await teardown(byOrg, orgMap);
  else await seed(byOrg, orgMap);
}

main().catch((err) => { console.error(`\n❌ B2B addresses seed failed: ${err.message}`); process.exit(1); });
