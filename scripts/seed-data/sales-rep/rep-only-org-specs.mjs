/**
 * rep-only-org-specs.mjs — side-effect-free source of truth for the rep-only served org fixture.
 *
 * Backs the boundary test for VCST sendCustomerCommunication initiator-exclusion (commit 6d918d82):
 * a served org whose ONLY member is the sending rep → 0 effective recipients → the mutation returns
 * false. The org therefore has exactly ONE member — SR_REP_PRIMARY's own Contact (the serve
 * relationship) — and NO buyer contacts.
 *
 * Importing this module has no side effects (no env read, no network), so the seeder AND the unit
 * test can both import it. The seeder (seed-rep-only-org.mjs) resolves the rep + org at runtime and
 * creates them; this module owns only the static shape + pure list transforms.
 */

/** The one fixture. Stable, date-independent AGENT-TEST- name so the seeder is idempotent by name. */
export const REP_ONLY_ORG = {
  aliasName: 'ORG_REP_ONLY',
  repKey: 'SR_REP_PRIMARY',            // served by the primary rep (resolved from sales-rep/sales-reps.csv)
  name: 'AGENT-TEST-Org-RepOnly-Primary',
  businessCategory: 'Test Rep-Only',
  address: {
    addressType: 'Shipping', line1: '1 Rep-Only Plaza', city: 'Seattle',
    regionName: 'Washington', countryName: 'United States', countryCode: 'USA',
    postalCode: '98101', isDefault: true,
  },
};

/** Build the POST /api/members body for the org (pure). */
export function buildOrgBody(spec = REP_ONLY_ORG) {
  return {
    memberType: 'Organization', name: spec.name,
    businessCategory: spec.businessCategory, status: 'Active',
    addresses: [{ ...spec.address }],
  };
}

/** True when the rep already serves the given org id. */
export function orgAlreadyServed(repOrganizations, orgId) {
  return (repOrganizations || []).some((o) => o.organizationId === orgId);
}

/** Return the rep's organizations list with {org} appended (pure, deduped, no mutation). */
export function appendServedOrg(repOrganizations, org) {
  const list = repOrganizations || [];
  if (orgAlreadyServed(list, org.id)) return [...list];
  return [...list, { organizationId: org.id, organizationName: org.name }];
}

/** Return the rep's organizations list with orgId removed (pure, for teardown). */
export function removeServedOrg(repOrganizations, orgId) {
  return (repOrganizations || []).filter((o) => o.organizationId !== orgId);
}
