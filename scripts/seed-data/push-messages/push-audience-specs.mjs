/**
 * push-audience-specs.mjs — SIDE-EFFECT-FREE source of truth for the Push Messages
 * AUDIENCE-BUILDER fixture (VCST-5944). Imported by the seeder, the drift guard and the
 * unit tests; importing it must never load env, open a socket or seed anything
 * (`.claude/knowledge/execution/test-data-authoring.md` §3).
 *
 * WHY THIS FIXTURE EXISTS — two of the feature's claims are UNDECIDABLE on a stock env
 * (`.claude/rules/test-data.md` §SECOND RULE: a fixture is designed from the chain's question):
 *
 *   [A] RECURSIVE COMPANY EXPANSION. The audience builder states "Adding a company includes
 *       everyone in it, and in the companies under it." The send job expands a selected member
 *       that holds no security account into its children, recursively. A stock env has orgs but
 *       NO org with a parent, so a NON-recursive implementation and a correct recursive one
 *       return the identical number — the claim cannot fail. This fixture seeds a real two-level
 *       tree so the two implementations DIVERGE.
 *
 *   [B] EMPLOYEE EXCLUSION. "Everyone" emits the fixed phrase `membertype:Contact`, so an
 *       Employee holding a login is excluded although the label reads "All registered customers".
 *       A stock env's only Employee holds ZERO security accounts, so a correct and an incorrect
 *       implementation both report zero. This fixture seeds an Employee WITH a working login, so
 *       "absent from membertype:Contact" becomes an observation rather than a tautology.
 *
 * THE DIVERGENCE IS THE POINT. The three outcomes below are deliberately UNEQUAL, and
 * `findDecidabilityProblems()` FAILS if they ever collapse:
 *
 *   selecting the PARENT company ->  3  correct (recursive, login-gated)
 *                                    1  a NON-recursive implementation (parent's own logins only)
 *                                    4  an implementation blind to the login gate (counts the
 *                                       login-less child contact too)
 *
 * NO RUNTIME GUID LIVES HERE. Business keys (names, emails, the alias names) are committed;
 * every platform GUID is written to `test-data/aliases.<env>.json` by the seeder.
 */

/** Entity-name prefix — teardown sweeps exactly what this seeder made, and nothing else. */
export const SEED_PREFIX = 'AGENT-TEST-PUSH';

/** Email prefix, the business key teardown matches people on. */
export const EMAIL_PREFIX = 'agent-test-push-';

/** Marker written to `outerId` so teardown can reclaim an entity even after a spec rename. */
export const seedOuterId = (key) => `${SEED_PREFIX}:${key}`;
export const isSeededOuterId = (v) => typeof v === 'string' && v.startsWith(`${SEED_PREFIX}:`);

/**
 * Password token. NEVER a literal — resolved at seed time by `resolvePassword()`
 * (`scripts/lib/user-provision.mjs`) from `.env.local`. Re-uses the existing B2B fixture
 * variable rather than minting a new secret name.
 */
export const PASSWORD_VAR = '{{B2B_USER_PASSWORD}}';

/** The two-level company tree. `parentKey: null` = the root of the seeded tree. */
export const ORGS = Object.freeze([
  Object.freeze({
    key: 'PARENT',
    name: `${SEED_PREFIX}-PARENT`,
    parentKey: null,
    alias: 'PUSH_AUDIENCE_PARENT_ORG',
    decides: 'Selected alone, it must resolve to the WHOLE subtree (3). A non-recursive expansion returns 1.',
  }),
  Object.freeze({
    key: 'CHILD',
    name: `${SEED_PREFIX}-CHILD`,
    parentKey: 'PARENT',
    alias: 'PUSH_AUDIENCE_CHILD_ORG',
    decides: 'Selected alone it must resolve to 2 — the control that proves the parent 3 came from expansion, not from a miscount.',
  }),
]);

/**
 * The people. `hasLogin` is the discriminating axis inside the tree: a member with no security
 * account is NOT a recipient, so the login-less child contact is what separates a correct
 * expansion (3) from one blind to the login gate (4).
 */
export const PEOPLE = Object.freeze([
  Object.freeze({
    key: 'PARENT_1', memberType: 'Contact', orgKey: 'PARENT', hasLogin: true,
    firstName: 'Parent', lastName: 'One', email: `${EMAIL_PREFIX}parent-1@yopmail.com`,
    alias: 'PUSH_AUDIENCE_PARENT_CONTACT',
    decides: 'Directly in the parent — the ONLY recipient a non-recursive implementation finds.',
  }),
  Object.freeze({
    key: 'CHILD_1', memberType: 'Contact', orgKey: 'CHILD', hasLogin: true,
    firstName: 'Child', lastName: 'One', email: `${EMAIL_PREFIX}child-1@yopmail.com`,
    alias: 'PUSH_AUDIENCE_CHILD_CONTACT_1',
    decides: 'Reachable from the parent ONLY by descending into the child company.',
  }),
  Object.freeze({
    key: 'CHILD_2', memberType: 'Contact', orgKey: 'CHILD', hasLogin: true,
    firstName: 'Child', lastName: 'Two', email: `${EMAIL_PREFIX}child-2@yopmail.com`,
    alias: 'PUSH_AUDIENCE_CHILD_CONTACT_2',
    decides: 'Second child recipient — makes parent(3) / child(2) / non-recursive(1) three DISTINCT numbers.',
  }),
  Object.freeze({
    key: 'CHILD_NOLOGIN', memberType: 'Contact', orgKey: 'CHILD', hasLogin: false,
    firstName: 'Child', lastName: 'Nologin', email: `${EMAIL_PREFIX}child-nologin@yopmail.com`,
    alias: 'PUSH_AUDIENCE_CHILD_CONTACT_NOLOGIN',
    decides: 'Has NO security account, so it must NOT be a recipient. Its presence is what makes the login gate falsifiable (4 vs 3).',
  }),
  Object.freeze({
    key: 'EMPLOYEE', memberType: 'Employee', orgKey: null, hasLogin: true,
    firstName: 'Push', lastName: 'Employee', email: `${EMAIL_PREFIX}employee@yopmail.com`,
    alias: 'PUSH_AUDIENCE_EMPLOYEE',
    decides: 'An Employee WITH a login: findable by membertype:Employee, and it must be ABSENT from membertype:Contact. Deliberately OUTSIDE the company tree so it cannot perturb the parent/child counts.',
  }),
]);

/** Every alias this fixture owns, in seed order. */
export const ALIAS_NAMES = Object.freeze([
  ...ORGS.map((o) => o.alias),
  ...PEOPLE.map((p) => p.alias),
]);

export const orgByKey = (key) => ORGS.find((o) => o.key === key) || null;
export const personByKey = (key) => PEOPLE.find((p) => p.key === key) || null;

/** Direct children of `orgKey` in the seeded tree. */
export const childOrgKeys = (orgKey) => ORGS.filter((o) => o.parentKey === orgKey).map((o) => o.key);

/** `orgKey` plus every descendant, depth-first. Pure; the recursion under test, mirrored offline. */
export function subtreeOrgKeys(orgKey) {
  const out = [orgKey];
  for (const child of childOrgKeys(orgKey)) out.push(...subtreeOrgKeys(child));
  return out;
}

/** People whose org is exactly `orgKey` (no descent). */
export const peopleDirectlyIn = (orgKey) => PEOPLE.filter((p) => p.orgKey === orgKey);

/** People anywhere in `orgKey`'s subtree. */
export function peopleInSubtree(orgKey) {
  const keys = new Set(subtreeOrgKeys(orgKey));
  return PEOPLE.filter((p) => p.orgKey && keys.has(p.orgKey));
}

/* --- The three outcomes. DERIVED from the data above, never transcribed. ------------- */

/** What a CORRECT implementation returns for `orgKey`: whole subtree, login-gated. */
export const expectedRecipients = (orgKey) => peopleInSubtree(orgKey).filter((p) => p.hasLogin).length;
/** What a NON-RECURSIVE implementation returns: direct members only, login-gated. */
export const nonRecursiveRecipients = (orgKey) => peopleDirectlyIn(orgKey).filter((p) => p.hasLogin).length;
/** What an implementation BLIND TO THE LOGIN GATE returns: whole subtree, ungated. */
export const loginBlindRecipients = (orgKey) => peopleInSubtree(orgKey).length;
/** Companies the expansion descends into when `orgKey` is selected (the selected one included). */
export const expectedCompaniesExpanded = (orgKey) => subtreeOrgKeys(orgKey).length;

/** The feature's own audience phrases. Fixed strings the UI emits — quoted, not invented. */
export const MEMBER_QUERY = Object.freeze({
  EVERYONE: 'membertype:Contact',
  EMPLOYEE: 'membertype:Employee',
});

/* --- API bodies (pure) --------------------------------------------------------------- */

export function orgBody(spec, parentPlatformId = null) {
  const body = {
    memberType: 'Organization',
    name: spec.name,
    outerId: seedOuterId(spec.key),
    description: `${SEED_PREFIX} audience-builder fixture (VCST-5944) — ${spec.decides}`,
    status: 'Approved',
    emails: [], phones: [], addresses: [], groups: [],
  };
  if (parentPlatformId) body.parentId = parentPlatformId;
  return body;
}

export function contactBody(spec, orgPlatformIds = []) {
  return {
    memberType: 'Contact',
    firstName: spec.firstName,
    lastName: spec.lastName,
    fullName: `${spec.firstName} ${spec.lastName}`,
    name: `${spec.firstName} ${spec.lastName}`,
    outerId: seedOuterId(spec.key),
    emails: [spec.email],
    organizations: orgPlatformIds,
    status: 'Approved',
    addresses: [], phones: [], groups: [],
  };
}

export function employeeBody(spec) {
  return {
    memberType: 'Employee',
    employeeType: 'Employee',
    isActive: true,
    firstName: spec.firstName,
    lastName: spec.lastName,
    fullName: `${spec.firstName} ${spec.lastName}`,
    name: `${spec.firstName} ${spec.lastName}`,
    outerId: seedOuterId(spec.key),
    emails: [spec.email],
    organizations: [],
    status: 'Approved',
    addresses: [], phones: [], groups: [],
  };
}

/** Dispatch on memberType so the seeder stays a thin resolve -> POST. */
export function memberBody(spec, orgPlatformIds = []) {
  return spec.memberType === 'Employee' ? employeeBody(spec) : contactBody(spec, orgPlatformIds);
}

/* --- Decidability guard (the check that fails when the fixture stops discriminating) --- */

/**
 * Returns a list of human-readable problems. EMPTY = the fixture still makes the two claims
 * falsifiable. Anything here is a DATA defect, not a product finding.
 */
export function findDecidabilityProblems() {
  const problems = [];

  // [A] the company tree must actually be two-level
  const roots = ORGS.filter((o) => !o.parentKey);
  const nested = ORGS.filter((o) => o.parentKey);
  if (roots.length !== 1) problems.push(`expected exactly ONE root org, found ${roots.length} — the tree shape is what makes recursion observable`);
  if (nested.length < 1) problems.push('no org declares a parentKey — with a flat org set a non-recursive expansion is indistinguishable from a correct one');
  for (const o of nested) {
    if (!orgByKey(o.parentKey)) problems.push(`org ${o.key} names parent ${o.parentKey}, which is not in ORGS`);
  }

  // [A] the three outcomes for the ROOT must be pairwise DISTINCT
  const root = roots[0];
  if (root) {
    const correct = expectedRecipients(root.key);
    const nonRec = nonRecursiveRecipients(root.key);
    const blind = loginBlindRecipients(root.key);
    if (correct === nonRec) problems.push(`${root.key}: correct(${correct}) === non-recursive(${nonRec}) — a non-recursive implementation would PASS`);
    if (correct === blind) problems.push(`${root.key}: correct(${correct}) === login-blind(${blind}) — an implementation that ignores the login gate would PASS`);
    if (nonRec === blind) problems.push(`${root.key}: non-recursive(${nonRec}) === login-blind(${blind}) — the two wrong answers are indistinguishable from each other`);
    if (correct < 2) problems.push(`${root.key}: only ${correct} recipient(s) — expansion needs at least one recipient beyond the parent's own`);
  }

  // [A] the child is the control: it must be a leaf with its own, smaller, non-zero count
  for (const o of nested) {
    const n = expectedRecipients(o.key);
    if (n < 1) problems.push(`${o.key}: 0 recipients — the control leg proves nothing`);
    if (root && n >= expectedRecipients(root.key)) problems.push(`${o.key}(${n}) >= ${root.key}(${expectedRecipients(root.key)}) — the parent must strictly exceed the child or expansion adds nothing observable`);
    if (loginBlindRecipients(o.key) === n) problems.push(`${o.key}: every member holds a login — the login gate is unfalsifiable in the child`);
  }

  // [B] the Employee leg
  const employees = PEOPLE.filter((p) => p.memberType === 'Employee');
  if (employees.length < 1) problems.push('no Employee in PEOPLE — the membertype:Contact exclusion claim stays vacuous');
  for (const e of employees) {
    if (!e.hasLogin) problems.push(`employee ${e.key} has no login — a correct and an incorrect implementation both report zero`);
    if (e.orgKey) problems.push(`employee ${e.key} sits inside the company tree (${e.orgKey}) — it would perturb the parent/child recipient counts`);
  }

  // hygiene: unique business keys, sweepable names, stated rationale
  const dupEmail = PEOPLE.map((p) => p.email.toLowerCase()).filter((e, i, a) => a.indexOf(e) !== i);
  if (dupEmail.length) problems.push(`duplicate email(s): ${[...new Set(dupEmail)].join(', ')}`);
  const dupAlias = ALIAS_NAMES.filter((a, i, arr) => arr.indexOf(a) !== i);
  if (dupAlias.length) problems.push(`duplicate alias name(s): ${[...new Set(dupAlias)].join(', ')}`);
  for (const spec of [...ORGS, ...PEOPLE]) {
    if (!spec.decides) problems.push(`${spec.key}: no \`decides\` rationale — every row must state which wrong implementation it catches`);
  }
  for (const o of ORGS) {
    if (!o.name.startsWith(SEED_PREFIX)) problems.push(`org ${o.key} name "${o.name}" does not carry the ${SEED_PREFIX} prefix — teardown would not sweep it`);
  }
  for (const p of PEOPLE) {
    if (!p.email.startsWith(EMAIL_PREFIX)) problems.push(`person ${p.key} email "${p.email}" does not carry the ${EMAIL_PREFIX} prefix — teardown would not sweep it`);
  }

  return problems;
}

/** Any literal that looks like a platform GUID, or a bare password, in the committed spec. */
const GUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;
export function findGuidLeaks() {
  const leaks = [];
  for (const spec of [...ORGS, ...PEOPLE]) {
    for (const [k, v] of Object.entries(spec)) {
      if (typeof v === 'string' && GUID_RE.test(v)) leaks.push(`${spec.key}.${k} carries a runtime GUID — it belongs in aliases.<env>.json`);
    }
  }
  if (!/^\{\{[A-Z0-9_]+\}\}$/.test(PASSWORD_VAR)) leaks.push(`PASSWORD_VAR "${PASSWORD_VAR}" is not a {{VAR}} token — a committed password literal is forbidden (VCST-5406)`);
  return leaks;
}

/* --- Teardown ordering (pure, so it is unit-testable) -------------------------------- */

/**
 * Order a SNAPSHOT of resolved entities for deletion: people first, then organizations
 * deepest-first (child before parent). Input items are `{ kind: 'org'|'person', spec, id }`.
 *
 * Why a snapshot rather than a lazy per-entity lookup: measured 2026-09-24 on vcptcore_qa1, the
 * by-email member lookup is keyword search (index-backed), and deleting a member's security
 * account re-writes its index document — so a teardown that resolved each member AFTER deleting
 * its login silently missed every login-holding member, and the residue assert (using the same
 * stale search) then reported "zero residue" over four survivors. Resolve everything first.
 */
export function teardownOrder(snapshot) {
  const depth = (spec) => {
    let d = 0;
    let cur = spec;
    while (cur?.parentKey) { d += 1; cur = orgByKey(cur.parentKey); }
    return d;
  };
  const people = snapshot.filter((s) => s.kind === 'person');
  const orgs = snapshot.filter((s) => s.kind === 'org').sort((a, b) => depth(b.spec) - depth(a.spec));
  return [...people, ...orgs];
}
