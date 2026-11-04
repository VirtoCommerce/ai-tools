/**
 * pb-legacy-org-members-specs.mjs — side-effect-free source of truth for the VCST-6442
 * "legacy duplicate-permalink page" READERS.
 *
 * WHY THIS EXISTS. Page Builder pages created before VCST-6442's uniqueness rule already hold
 * duplicate permalinks on B2B-store, and they are TARGETED: each one carries an organizationId
 * (and sometimes userGroups + a date window). xAPI `slugInfo` only returns a targeted page to a
 * user whose session organization (and contact groups) match. No test account belonged to those
 * organizations, so slugInfo returned null for EVERY account, and a case about how the platform
 * breaks a tie between equal legacy pages could not pass or fail. It was undecidable
 * (.claude/rules/test-data.md SECOND RULE).
 *
 * WHAT IT PROVISIONS. One AGENT-TEST storefront account per target organization: a NEW contact +
 * login + org-scoped OrganizationMembership. The legacy pages and the organizations themselves are
 * NEVER written: they are pre-existing, non-AGENT-TEST data owned by other people.
 *
 * The organization is resolved LIVE by exact name and must be unique. Its GUID is env-specific
 * (these orgs exist only where someone created them by hand), so it is written to
 * aliases.<env>.json by the seeder and never committed here.
 *
 * Divergence (what makes it discriminating): the two members belong to DIFFERENT organizations,
 * and only the first carries the page's user group. A reader that cannot tell targeting apart
 * would see the same page for both, and that would show.
 */

export const AGENT_PREFIX = 'agent-test-';

/** The store the legacy pages live on. A different store must not silently reuse this spec. */
export const PAGES_STORE_ID = 'B2B-store';

/** The b2b-family password var, resolved from .env.local by user-provision resolvePassword(). */
export const PASSWORD_TOKEN = '{{B2B_USER_PASSWORD}}';

/** Org-scoped role granted on the membership. Read-only buyer, enough to sign in. */
export const MEMBER_ROLE_ID = 'org-employee';

export const MEMBERS = Object.freeze([
  Object.freeze({
    alias: 'PB_LEGACY_ORG_MEMBER',
    email: 'agent-test-pb-legacy-atc-20261028@yopmail.com',
    firstName: 'AGENT-TEST-PbLegacy',
    lastName: 'ATC',
    orgName: 'Automation Testing Corp',
    // The /bkp-test01 en-US legacy pages declare userGroups "VIP". Without the group on the
    // contact the org match alone still filters the page out, which is the vacuity this exists to remove.
    groups: Object.freeze(['VIP']),
    targets: Object.freeze([{ permalink: '/bkp-test01', cultureName: 'en-US', userGroup: 'VIP', minPages: 2 }]),
  }),
  Object.freeze({
    alias: 'PB_LEGACY_ORG2_MEMBER',
    email: 'agent-test-pb-legacy-wm-20261028@yopmail.com',
    firstName: 'AGENT-TEST-PbLegacy',
    lastName: 'WM',
    orgName: 'Watermelon123',
    groups: Object.freeze([]),
    // Two EQUAL en-US pages "09.10 Sasha1" on /same_landing_page: the tie-break pair.
    targets: Object.freeze([{ permalink: '/same_landing_page', cultureName: 'en-US', userGroup: null, minPages: 2 }]),
  }),
]);

const GUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** Static coherence + non-vacuity over the declaration. [] = clean. */
export function validateSpecs(members = MEMBERS) {
  const problems = [];
  const dup = (label, vals) => {
    const d = vals.filter((v, i) => vals.indexOf(v) !== i);
    if (d.length) problems.push(`duplicate ${label}: ${[...new Set(d)].join(', ')}`);
  };
  dup('alias', members.map((m) => m.alias));
  dup('email', members.map((m) => m.email.toLowerCase()));
  dup('orgName', members.map((m) => m.orgName));
  for (const m of members) {
    if (!m.email.toLowerCase().startsWith(AGENT_PREFIX)) problems.push(`${m.alias}: email must start with ${AGENT_PREFIX} (teardown scope)`);
    if (!m.firstName.startsWith('AGENT-TEST-')) problems.push(`${m.alias}: firstName must carry AGENT-TEST-`);
    if (!m.orgName) problems.push(`${m.alias}: orgName missing`);
    if (m.orgName.startsWith('AGENT-TEST-')) problems.push(`${m.alias}: orgName is an AGENT-TEST org; this spec is for PRE-EXISTING legacy orgs only`);
    if (!m.targets?.length) problems.push(`${m.alias}: no target page declared, so nothing makes it non-vacuous`);
    for (const t of m.targets || []) {
      if (!t.permalink?.startsWith('/')) problems.push(`${m.alias}: permalink ${t.permalink} must start with '/'`);
      if ((t.minPages || 0) < 2) problems.push(`${m.alias}: ${t.permalink} minPages < 2, which is not a duplicate-permalink tie`);
      // Non-vacuity: a page targeted at a user group is only visible to a contact IN that group.
      if (t.userGroup && !m.groups.includes(t.userGroup)) problems.push(`${m.alias}: target ${t.permalink} needs userGroup "${t.userGroup}" but the contact does not declare it`);
    }
    if (GUID_RE.test(JSON.stringify(m))) problems.push(`${m.alias}: runtime GUID in the committed spec (belongs in aliases.<env>.json)`);
  }
  // Divergence: two members must not collapse onto one org (then the pair cannot discriminate).
  if (new Set(members.map((m) => m.orgName)).size < members.length) problems.push('members share an organization: targeting cannot be told apart');
  if (!/^\{\{[A-Z0-9_]+\}\}$/.test(PASSWORD_TOKEN)) problems.push('PASSWORD_TOKEN must be a {{VAR}} token, never a literal');
  return problems;
}

/**
 * Live non-vacuity over the page-search results, for one member. Pure.
 * Returns problems ([] = the member can actually see a tie on every declared target).
 */
export function checkTargetsLive(member, orgId, pages) {
  const problems = [];
  for (const t of member.targets) {
    const hits = pages.filter((p) => p.permalink === t.permalink
      && p.organizationId === orgId
      && p.status === 'Published'
      && (t.cultureName == null || p.cultureName === t.cultureName)
      && (!t.userGroup || String(p.userGroups || '').split(',').map((s) => s.trim()).includes(t.userGroup)));
    if (hits.length < t.minPages) problems.push(`${member.alias}: ${t.permalink} has ${hits.length} Published page(s) for org ${orgId}${t.userGroup ? ` + group ${t.userGroup}` : ''} (need >= ${t.minPages})`);
  }
  return problems;
}
