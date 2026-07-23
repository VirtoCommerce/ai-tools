#!/usr/bin/env node
/**
 * seed-rep-only-org.mjs — provision the ORG_REP_ONLY fixture: a served org whose ONLY member is
 * SR_REP_PRIMARY itself (no buyer contacts). Backs the sendCustomerCommunication initiator-exclusion
 * boundary (commit 6d918d82) — a rep-only served org yields 0 effective recipients.
 *
 * Mechanism (the module's own serve path, same as seed-sales-rep.mjs uses on create): the served-org
 * relationship is an entry in the rep's `organizations[]`. This seeder resolves the EXISTING primary
 * rep, creates the org if missing, appends it to the rep's served list, and PUTs /api/sales-rep — the
 * module then creates the OrganizationMembership (Sales Representative role) linking the rep's Contact
 * to the org. That single membership IS the org's only member; no buyer contact is ever added.
 *
 * Business key: the stable org name (rep-only-org-specs.mjs). Runtime platform GUID → aliases.<env>.json
 * (ORG_REP_ONLY.id / .platform_id); NEVER a GUID in a committed CSV.
 *
 * Flags: --dry-run (reads only), --verbose, --teardown (remove only what this seeder created).
 */
import {
  assertSafeTarget, auth, api, log, verbose, loadCsv,
  writeEnvAliasOverride, DRY_RUN, TEARDOWN, verifyRemoved,
} from '../../lib/seed-common.mjs';
import {
  REP_ONLY_ORG, buildOrgBody, orgAlreadyServed, appendServedOrg, removeServedOrg,
} from './rep-only-org-specs.mjs';

const SPEC = REP_ONLY_ORG;

/** Resolve the primary rep's full name from the committed sales-reps CSV (no hardcoded name). */
function repFullName() {
  const row = loadCsv('test-data/sales-rep/sales-reps.csv').find((r) => r.rep_key === SPEC.repKey);
  if (!row) throw new Error(`rep_key ${SPEC.repKey} not found in sales-rep/sales-reps.csv`);
  return row.full_name;
}

async function findRep(fullName) {
  const res = await api('POST', '/api/sales-rep/search', { keyword: fullName, take: 50, skip: 0 });
  const rows = res?.results || res?.salesReps || res?.items || [];
  const hit = rows.find((r) => r.fullName === fullName || r.name === fullName);
  return hit ? api('GET', `/api/sales-rep/${hit.id}`) : null;
}

async function findOrgByName(name) {
  const res = await api('POST', '/api/members/search', { keyword: name, take: 20, deep: true });
  const results = res?.results || res?.members || [];
  return results.find((m) => (m.name === name || m.fullName === name) && m.memberType === 'Organization') || null;
}

async function main() {
  assertSafeTarget();
  await auth();

  const fullName = repFullName();
  const rep = await findRep(fullName);
  if (!rep && !DRY_RUN) throw new Error(`primary rep "${fullName}" (${SPEC.repKey}) not found — seed sales-rep first (npm run seed:sales-rep)`);
  if (rep) log(`Rep ${SPEC.repKey} (${fullName}): ${rep.id}, serving ${(rep.organizations || []).length} org(s)`);

  if (TEARDOWN) {
    const org = await findOrgByName(SPEC.name);
    if (org?.id && rep) {
      // 1) Detach the serve relationship (drops the OrganizationMembership) before deleting the org.
      if (orgAlreadyServed(rep.organizations, org.id)) {
        const updated = { ...rep, organizations: removeServedOrg(rep.organizations, org.id) };
        await api('PUT', '/api/sales-rep', updated, { expectStatus: [200, 201, 204] });
        log(`  removed ${SPEC.name} from ${SPEC.repKey} served orgs`);
      }
    }
    if (org?.id) {
      await api('DELETE', `/api/members?ids=${org.id}`, null, { expectStatus: [200, 204] });
      log(`  deleted org ${SPEC.name} (${org.id})`);
    }
    const residue = await verifyRemoved(async () => {
      const r = await api('POST', '/api/members/search', { keyword: SPEC.name, take: 5, deep: true });
      return (r?.results || []).filter((m) => m.name === SPEC.name);
    });
    log(residue === 0 ? 'Teardown complete — zero residue.' : `WARN: ${residue} residual member(s) named ${SPEC.name}`);
    return;
  }

  // 1) Ensure the org exists (idempotent by name).
  let org = await findOrgByName(SPEC.name);
  if (org?.id) { log(`Org exists: ${SPEC.name} (${org.id})`); }
  else {
    org = await api('POST', '/api/members', buildOrgBody(SPEC));
    log(`Org created: ${SPEC.name} (${org?.id})`);
  }
  const orgId = org?.id || (DRY_RUN ? `dry-org-${SPEC.aliasName}` : null);

  // 2) Ensure the rep serves the org (append + PUT the full rep; idempotent).
  if (rep && orgId && !String(orgId).startsWith('dry-')) {
    if (orgAlreadyServed(rep.organizations, orgId)) {
      verbose(`${SPEC.repKey} already serves ${SPEC.name}`);
    } else {
      const updated = { ...rep, organizations: appendServedOrg(rep.organizations, { id: orgId, name: SPEC.name }) };
      await api('PUT', '/api/sales-rep', updated, { expectStatus: [200, 201, 204] });
      log(`  ${SPEC.repKey} now serves ${SPEC.name} (${updated.organizations.length} org(s) total)`);
    }
  }

  // 3) Write-back the runtime platform GUID to aliases.<env>.json (never into a committed CSV).
  if (orgId && !String(orgId).startsWith('dry-')) {
    writeEnvAliasOverride({ [SPEC.aliasName]: { id: orgId, platform_id: orgId } });
  }
  log(DRY_RUN ? 'DRY RUN complete (no writes).' : `Seed complete. ${SPEC.aliasName} → aliases.<env>.json.`);
}

main().catch((e) => { console.error('SEED FAILED:', e.message); process.exit(1); });
