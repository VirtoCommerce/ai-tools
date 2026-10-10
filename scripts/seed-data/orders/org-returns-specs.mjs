/**
 * org-returns-specs.mjs — VCST-5884, RETURNS step 3: "My Organization Returns". A maintainer who was
 * granted `xapi:my_organization:return:view` reads a COLLEAGUE's return in their own organization —
 * read-only — and the organization's mailbox may receive a copy of the buyer's return emails.
 *
 * SINGLE SOURCE OF TRUTH, side-effect-free (no env load, no network, no main()): imported by the seeder
 * (seed-org-returns.mjs) and the drift guard (validate-org-returns-data.mjs → td:validate:returns-org).
 *
 * THE QUESTION THE DATA ANSWERS (SECOND RULE): "can a holder read a colleague's return in their own
 * organization, ONLY that, and be told apart from everyone who may not?" So the fixture set DIVERGES on
 * every link the feature reads:
 *   - viewer and buyer are different people in ONE organization (ORG_RET_VIEWER_ORG);
 *   - a second organization owns a submitted return (ORG_RET_OTHER_ORG) — a cross-org leak shows;
 *   - the three grant SOURCES (global / organization-level / membership) are isolated, one holder each;
 *   - each blocking holder differs from ORG_RET_HOLDER_MEMBERSHIP in membership status or lock ONLY;
 *   - organization email ≠ buyer email; one org has NO email; one org's email EQUALS its buyer's.
 * validateOrgReturnsFixtureSet() fails the build when any of those gaps collapses.
 *
 * WHY THE ORGANIZATION-LEVEL HOLDER LIVES IN ITS OWN ORGANIZATION. An organization-level role is
 * INHERITED by every member of the organization (VCST-5239; PlatformUserGuide "Assign organization-level
 * role"; ReturnAccessService.HasPermissionAsync reads GetRolesByUserAndOrgAsync = org-level ∪ membership
 * roles). Putting it on ORG_RET_VIEWER_ORG would make the buyer, the global holder and the membership
 * holder ALL holders by inheritance — the three sources would no longer be separable and the non-holder
 * buyer would vanish. So ORG_RET_ORGROLE_ORG carries the org-level role and its own buyer, and the
 * holder that pairs with ORG_RET_BUYER is ORG_RET_HOLDER_MEMBERSHIP.
 *
 * NEVER SEEDED (FIFTH RULE — the environment or the case takes these away): returns and drafts of the
 * viewer organization (a submitted/decided/cancelled return is TERMINAL — cases create them per run),
 * the store settings Return.NotifyOrganizationEmail / Return.SendNotifications (cases set + restore),
 * any grant removal. ONE return IS seeded because no case may mutate it: ORG_RET_OTHER_ORG_RETURN (a
 * return the viewer must NOT see). What vcst cannot provide is declared in FIXTURE_GAPS with the reason.
 */
import { LINE_ROLE_X, LINE_ROLE_Y, RETURN_ALLOWED_STATUS, returnOrderNumber } from './orders-specs.mjs';

export const SEED_SCRIPT = 'seed:returns:org';
export const ORDER_TEMPLATE_FIXTURE = 'orders/returns/return-decision-order.json'; // shared with VCST-5883, never mirrored
export const PASSWORD_TOKEN = '{{DEFAULT_TEST_PASSWORD}}';
export const PASSWORD_VAR = 'DEFAULT_TEST_PASSWORD';

export const VIEW_PERMISSION = 'xapi:my_organization:return:view';
export const SUBMIT_PERMISSION = 'xapi:my_organization:return:submit';

/** Pre-existing organization role given to NON-holder buyers. Assigned, never edited. Holds no return permission. */
export const BASE_ROLE = Object.freeze({ id: 'org-employee', name: 'Organization employee' });

/** Statuses Customer treats as blocking (vc-module-customer ModuleConstants.MembershipStatuses.BlockingStatuses). */
export const BLOCKING_STATUSES = Object.freeze(['Invited', 'Rejected', 'Deleted']);

const mail = (slug) => `agent-test-orgret-${slug}@yopmail.com`;

/**
 * Dedicated roles. The id is PINNED (an id we choose, PUT-upserted — identical on every env, the same
 * mechanism roles.csv uses), so it may be committed. The name carries the AGENT-TEST- prefix.
 */
export const ROLES = Object.freeze([
  { key: 'VIEW', alias: 'ORG_RET_VIEWER_ROLE', id: 'agent-test-org-ret-viewer', name: 'AGENT-TEST-Org-Returns-Viewer', permissions: [VIEW_PERMISSION] },
  { key: 'VIEW_SUBMIT', alias: 'ORG_RET_VIEW_SUBMIT_ROLE', id: 'agent-test-org-ret-view-submit', name: 'AGENT-TEST-Org-Returns-View-Submit', permissions: [VIEW_PERMISSION, SUBMIT_PERMISSION] },
]);
const roleByKey = Object.fromEntries(ROLES.map((r) => [r.key, r]));

/** 60 characters, words separated by spaces — the "long organization name truncated" boundary. */
export const LONG_ORG_NAME = 'AGENT-TEST-Org-RetLongName International Procurement Service';
/**
 * 32 characters, letters only. The AGENT-TEST prefix is written WITHOUT hyphens on purpose: a hyphen
 * is a CSS line-break opportunity, so "AGENT-TEST-…" would not be an unbroken value at all.
 */
export const LONG_BUYER_NAME = 'AGENTTESTRetUnbrokenBuyerNameXyz';

export const ORGS = Object.freeze([
  { key: 'VIEWER', alias: 'ORG_RET_VIEWER_ORG', name: 'AGENT-TEST-Org-RetViewer', email: mail('viewer-org'), orgRoles: [],
    purpose: 'The organization under test: the buyer, every non-org-level holder and every blocking holder are members. Its email differs from every member\'s.' },
  { key: 'ORGROLE', alias: 'ORG_RET_ORGROLE_ORG', name: 'AGENT-TEST-Org-RetOrgRole', email: mail('orgrole-org'), orgRoles: ['VIEW'],
    purpose: 'Carries the view role as an ORGANIZATION-LEVEL role — inherited by every member, so it holds only the org-level holder and its own buyer.' },
  { key: 'OTHER', alias: 'ORG_RET_OTHER_ORG', name: 'AGENT-TEST-Org-RetOther', email: mail('other-org'), orgRoles: [],
    purpose: 'A second ordinary organization owning ONE submitted return — the cross-organization leak probe.' },
  { key: 'SAME_ADDRESS', alias: 'ORG_RET_SAME_ADDRESS_ORG', name: 'AGENT-TEST-Org-RetSameAddress', email: mail('sameaddr-buyer'), orgRoles: [], emailOfPersona: 'SAME_ADDRESS_BUYER',
    purpose: 'Its email EQUALS its buyer\'s (the order address the buyer email is sent to) — the "no second email" boundary.' },
  { key: 'NOEMAIL', alias: 'ORG_RET_NOEMAIL_ORG', name: 'AGENT-TEST-Org-RetNoEmail', email: null, orgRoles: [],
    purpose: 'No email on the organization (Member.Emails empty) — the org copy has nowhere to go.' },
  { key: 'LONG_NAME', alias: 'ORG_RET_LONG_NAME_ORG', name: LONG_ORG_NAME, email: mail('longname-org'), orgRoles: [],
    purpose: '60-character name for the organization tab label; its only member is a holder with a 32-character unbroken name.' },
  { key: 'HOME', alias: 'ORG_RET_HOME_ORG', name: 'AGENT-TEST-Org-RetMultiHome', email: mail('home-org'), orgRoles: [],
    purpose: 'Organization X of the multi-org contact: the contact is an ordinary member here, WITHOUT the permission.' },
]);
const orgByKey = Object.fromEntries(ORGS.map((o) => [o.key, o]));

const m = (org, roles, extra = {}) => ({ org, roles, status: 'Approved', locked: false, ...extra });
const BUYER = 'BASE';

/**
 * Personas. `roles` / `globalRoles` hold ROLES keys, or 'BASE' for the pre-existing BASE_ROLE.
 * `order` = the organization a Completed, delivered, returnable order is seeded in for this persona.
 */
export const PERSONAS = Object.freeze([
  { key: 'BUYER', alias: 'ORG_RET_BUYER', login: mail('buyer'), firstName: 'AGENT-TEST-OrgRet', lastName: 'Ketterby',
    globalRoles: [], memberships: [m('VIEWER', [BUYER])], order: 'VIEWER',
    purpose: 'The returns OWNER in the viewer organization. A NON-holder (org-employee only), so its own token never opens the org tab.' },
  { key: 'LEAVER', alias: 'ORG_RET_LEAVER', login: mail('leaver'), firstName: 'AGENT-TEST-OrgRet', lastName: 'Leaver',
    globalRoles: [], memberships: [m('VIEWER', [BUYER])], order: 'VIEWER',
    purpose: 'The DEPARTING buyer (S21): a second non-holder buyer in the viewer organization whose membership the cases REMOVE and RESTORE per run, so ORG_RET_BUYER is never touched.' },
  { key: 'HOLDER_GLOBAL', alias: 'ORG_RET_HOLDER_GLOBAL', login: mail('holder-global'), firstName: 'AGENT-TEST-OrgRet', lastName: 'HolderGlobal',
    globalRoles: ['VIEW'], memberships: [m('VIEWER', [])], order: null,
    purpose: 'Holds the view role as a GLOBAL account role; its membership in the viewer org carries no role.' },
  { key: 'HOLDER_MEMBERSHIP', alias: 'ORG_RET_HOLDER_MEMBERSHIP', login: mail('holder-membership'), firstName: 'AGENT-TEST-OrgRet', lastName: 'HolderMembership',
    globalRoles: [], memberships: [m('VIEWER', ['VIEW'])], order: 'VIEWER',
    purpose: 'Holds EXACTLY the view permission and nothing else, as a MEMBERSHIP role in the viewer org. The primary holder that pairs with ORG_RET_BUYER; has its own order so "the viewer\'s own return stays actionable" is testable.' },
  { key: 'HOLDER_SUBMIT', alias: 'ORG_RET_HOLDER_SUBMIT', login: mail('holder-submit'), firstName: 'AGENT-TEST-OrgRet', lastName: 'HolderSubmit',
    globalRoles: [], memberships: [m('VIEWER', ['VIEW_SUBMIT'])], order: null,
    purpose: 'Holds view AND the (unchecked) submit permission as a membership role — must still change nothing on a colleague\'s return.' },
  { key: 'HOLDER_LOCKED', alias: 'ORG_RET_HOLDER_LOCKED', login: mail('holder-locked'), firstName: 'AGENT-TEST-OrgRet', lastName: 'HolderLocked',
    globalRoles: [], memberships: [m('VIEWER', ['VIEW'], { locked: true })], order: null,
    purpose: 'HOLDER_MEMBERSHIP with the membership LOCKED (permanent, status Approved) — the lock is the only variable.' },
  { key: 'HOLDER_INVITED', alias: 'ORG_RET_HOLDER_INVITED', login: mail('holder-invited'), firstName: 'AGENT-TEST-OrgRet', lastName: 'HolderInvited',
    globalRoles: [], memberships: [m('VIEWER', ['VIEW'], { status: 'Invited' })], order: null,
    purpose: 'HOLDER_MEMBERSHIP with membership status Invited — the status is the only variable.' },
  { key: 'HOLDER_REJECTED', alias: 'ORG_RET_HOLDER_REJECTED', login: mail('holder-rejected'), firstName: 'AGENT-TEST-OrgRet', lastName: 'HolderRejected',
    globalRoles: [], memberships: [m('VIEWER', ['VIEW'], { status: 'Rejected' })], order: null,
    purpose: 'HOLDER_MEMBERSHIP with membership status Rejected — the status is the only variable.' },
  { key: 'HOLDER_DELETED', alias: 'ORG_RET_HOLDER_DELETED', login: mail('holder-deleted'), firstName: 'AGENT-TEST-OrgRet', lastName: 'HolderDeleted',
    globalRoles: [], memberships: [m('VIEWER', ['VIEW'], { status: 'Deleted' })], order: null,
    purpose: 'HOLDER_MEMBERSHIP with membership status Deleted — the status is the only variable.' },
  { key: 'BUYER_NOEMAIL', alias: 'ORG_RET_BUYER_NOEMAIL', login: 'agent-test-orgret-buyer-noemail', noEmail: true, firstName: 'AGENT-TEST-OrgRet', lastName: 'NoEmailBuyer',
    globalRoles: [], memberships: [m('VIEWER', [BUYER])], order: 'VIEWER',
    purpose: 'A buyer whose CONTACT and ORDER ADDRESSES carry no email; the login is a plain user name. The platform refuses an account without one, so the ACCOUNT keeps <login>@yopmail.com — the last rung of the buyer-address fallback (order address → contact → account). NOT "no email anywhere" (FIXTURE-GAP for that shape).' },
  { key: 'MULTI', alias: 'ORG_RET_MULTI_ORG', login: mail('multi'), firstName: 'AGENT-TEST-OrgRet', lastName: 'MultiOrg',
    globalRoles: [], memberships: [m('HOME', [BUYER]), m('VIEWER', ['VIEW'])], order: 'HOME',
    purpose: 'A contact in TWO organizations holding the permission in ONE (Y = viewer org, membership role) and not in the other (X = home org). Its own order is raised for X.' },
  { key: 'HOLDER_ORGROLE', alias: 'ORG_RET_HOLDER_ORGROLE', login: mail('holder-orgrole'), firstName: 'AGENT-TEST-OrgRet', lastName: 'HolderOrgRole',
    globalRoles: [], memberships: [m('ORGROLE', [])], order: null,
    purpose: 'Holds the view role ONLY through the ORGANIZATION-LEVEL role of ORG_RET_ORGROLE_ORG (membership carries no role, no global role).' },
  { key: 'ORGROLE_BUYER', alias: 'ORG_RET_ORGROLE_BUYER', login: mail('orgrole-buyer'), firstName: 'AGENT-TEST-OrgRet', lastName: 'OrgRoleBuyer',
    globalRoles: [], memberships: [m('ORGROLE', [BUYER])], order: 'ORGROLE',
    purpose: 'The colleague whose return HOLDER_ORGROLE reads. It inherits the org-level role too (every member does) — irrelevant to what it is used for.' },
  { key: 'OTHER_BUYER', alias: 'ORG_RET_OTHER_BUYER', login: mail('other-buyer'), firstName: 'AGENT-TEST-OrgRet', lastName: 'Vasquell',
    globalRoles: [], memberships: [m('OTHER', [BUYER])], order: 'OTHER',
    purpose: 'Owner of ORG_RET_OTHER_ORG_RETURN in the other organization.' },
  { key: 'SAME_ADDRESS_BUYER', alias: 'ORG_RET_SAME_ADDRESS_BUYER', login: mail('sameaddr-buyer'), firstName: 'AGENT-TEST-OrgRet', lastName: 'SameAddress',
    globalRoles: [], memberships: [m('SAME_ADDRESS', [BUYER])], order: 'SAME_ADDRESS',
    purpose: 'The buyer whose address (account, contact, order addresses) equals its organization\'s email.' },
  { key: 'NOEMAIL_ORG_BUYER', alias: 'ORG_RET_NOEMAIL_ORG_BUYER', login: mail('noemailorg-buyer'), firstName: 'AGENT-TEST-OrgRet', lastName: 'NoEmailOrgBuyer',
    globalRoles: [], memberships: [m('NOEMAIL', [BUYER])], order: 'NOEMAIL',
    purpose: 'A normal buyer (with email) in the organization that has none.' },
  { key: 'LONG_NAME_BUYER', alias: 'ORG_RET_LONG_NAME_BUYER', login: mail('longname-buyer'), fullName: LONG_BUYER_NAME, firstName: LONG_BUYER_NAME, lastName: 'AgentTest',
    globalRoles: [], memberships: [m('LONG_NAME', ['VIEW'])], order: 'LONG_NAME',
    purpose: 'A holder (membership view role) in the 60-character organization whose order customerName is a 32-character unbroken string: its own returns fill the org tab\'s Buyer name column.' },
]);
const personaByKey = Object.fromEntries(PERSONAS.map((p) => [p.key, p]));

/**
 * Requested fixtures this environment CANNOT provide, with the measured reason (vcst 2026-10-08).
 * Reported by the seeder on every run; no alias is registered for them, so a case that cites one fails
 * td:validate instead of resolving to "".
 */
export const FIXTURE_GAPS = Object.freeze([
  { alias: 'RETURNS_LEGACY_STORELESS',
    reason: 'the legacy shape (storeId/customerId/customerName null, organization backfilled) cannot be created through the API: ReturnService.FillMissingSnapshots copies store/customer/name from the order on EVERY save, POST /api/order/customerOrders refuses an order without storeId/customerId/customerName (400), and PUT /api/return refuses an order-less return ("needs at least one line"; every line is measured against the order\'s available quantity). The 3 legacy rows that carry an organization belong to pre-existing, non-AGENT-TEST organizations, and adding a holder to one would change a shared organization.' },
  { alias: 'ORG_RET_OTHER_STORE_RETURN',
    reason: 'B2B-store is the only store on vcst with Return.ReturnEnabled=true (AGENT-TEST-BARCODE, Electronics, QA-STORE, test_del, TS-FULL-001, TestStore are all false); enabling one would change a store setting this run may not touch.' },
]);
/** The other organization's submitted return. */
export const OTHER_RETURN = Object.freeze({ key: 'OTHER', alias: 'ORG_RET_OTHER_ORG_RETURN', persona: 'OTHER_BUYER', returnStatus: 'Requested', requested: { [LINE_ROLE_X]: 1 } });
export const OTHER_RETURN_REF = 'AGENT-TEST-RET-ORG-OTHER-R1';

/** Per seeded order: two lines, different quantities, large enough for many per-run returns of 1. */
export const ORDER_LINES = Object.freeze({ [LINE_ROLE_X]: 40, [LINE_ROLE_Y]: 25 });

export const fullNameOf = (p) => p.fullName || `${p.firstName} ${p.lastName}`;
export const emailOf = (p) => (p.noEmail ? null : p.login);
/** Address the ACCOUNT keeps: users/create refuses one without an email, so an email-less persona gets <login>@yopmail.com. */
export const accountEmailOf = (p) => emailOf(p) || `${p.login}@yopmail.com`;
/**
 * The password-grant `username` — what the alias's `email` field must hold, because graphql-auth resolveRole
 * sends @td(<role>.email) as `username`. Always the LOGIN (user name): for an email-less persona that is a
 * plain user name, never an address, so the field adds no email to the persona.
 */
export const authUsernameOf = (p) => p.login;
export const orgEmailOf = (o) => (o.emailOfPersona ? emailOf(personaByKey[o.emailOfPersona]) : o.email);
/** Mixed-case variant of an address (local part upper-cased) — same mailbox, different letters. */
export const upperVariant = (address) => (address ? address.replace(/^[^@]+/, (s) => s.toUpperCase()) : null);

export const orgOrderKey = (key) => `ORG-${key.replace(/_/g, '-')}`;
/** Order number — through step 1's returnOrderNumber, so diagnoseSeededOrder recognises it. */
export const orgOrderNumber = (key) => returnOrderNumber(orgOrderKey(key));

/** Step-1-shaped spec for diagnoseSeededOrder / finalizeReturnOrderBody / buildReturnPhase2Body (PURE). */
export function toOrderSpec(key) {
  return {
    key: orgOrderKey(key),
    orderStatus: RETURN_ALLOWED_STATUS,
    lineX: { ordered: ORDER_LINES[LINE_ROLE_X] },
    lineY: { ordered: ORDER_LINES[LINE_ROLE_Y] },
    shipments: [{ key: 'S1', offsetDays: 0, hasDeliveryDate: true, status: 'Delivered', deliveredByRole: { ...ORDER_LINES } }],
    expect: { ineligibilityReason: null },
  };
}

/**
 * Shape the shared VCST-5883 template into one persona's order body (PURE). Number, customer name,
 * address emails (the address the buyer email is sent to — the order address wins over the contact and
 * the account), line quantities and totals. `owner` = { customerId, customerName, email|null }.
 */
export function shapeOrgOrder(template, key, owner) {
  const body = structuredClone(template);
  const number = orgOrderNumber(key);
  body.number = number;
  body.customerName = owner?.customerName ?? null;
  body.items = (body.items || []).map((it) => ({ ...it, quantity: ORDER_LINES[it._role] ?? it.quantity }));
  const total = body.items.reduce((n, it) => n + (it.price || 0) * it.quantity, 0);
  body.total = total; body.subTotal = total; body.subTotalWithTax = total;
  for (const a of body.addresses || []) {
    if (owner?.email) a.email = owner.email; else delete a.email;
    a.firstName = 'AGENT-TEST'; a.lastName = owner?.customerName || 'Legacy';
  }
  for (const s of body.shipments || []) {
    const k = s._shipmentKey || 'S1';
    s.number = `${number}-${k}`;
    s.trackingNumber = `AGENT-TEST-TRK-${number.replace(/^AGENT-TEST-/, '')}-${k}`;
  }
  (body.inPayments || []).forEach((p, i) => { p.number = `${number}-P${i + 1}`; p.sum = total; p.customerName = owner?.customerName ?? null; });
  return body;
}

/** Effective permissions a persona holds IN one organization: global ∪ membership roles ∪ org-level roles (PURE). */
export function effectivePermissions(persona, orgKey) {
  const mem = persona.memberships.find((x) => x.org === orgKey);
  if (!mem) return new Set();
  const keys = [...persona.globalRoles, ...mem.roles, ...(orgByKey[orgKey]?.orgRoles || [])];
  return new Set(keys.flatMap((k) => roleByKey[k]?.permissions || []));
}

/** Which grant sources give a persona the view permission in an organization (PURE). */
export function viewSources(persona, orgKey) {
  const mem = persona.memberships.find((x) => x.org === orgKey);
  if (!mem) return [];
  const has = (keys) => keys.some((k) => roleByKey[k]?.permissions.includes(VIEW_PERMISSION));
  return [
    has(persona.globalRoles) && 'global',
    has(mem.roles) && 'membership',
    has(orgByKey[orgKey]?.orgRoles || []) && 'organization',
  ].filter(Boolean);
}

/** Server-side gate, as ReturnAccessService.CanViewOrganizationAsync states it (PURE). */
export function expectedCanView(persona, orgKey) {
  const mem = persona.memberships.find((x) => x.org === orgKey);
  if (!mem || mem.locked || BLOCKING_STATUSES.includes(mem.status)) return false;
  return effectivePermissions(persona, orgKey).has(VIEW_PERMISSION);
}

export const OWNED_ALIASES = Object.freeze([
  ...ROLES.map((r) => r.alias), ...ORGS.map((o) => o.alias), ...PERSONAS.map((p) => p.alias), OTHER_RETURN.alias,
]);

/**
 * The fixture-set drift guard (PURE). Every check is a property whose silent collapse would make a
 * VCST-5884 case pass for the wrong reason.
 */
export function validateOrgReturnsFixtureSet({ roles = ROLES, orgs = ORGS, personas = PERSONAS, sharedRoleIds = [] } = {}) {
  const problems = [];
  const P = (s) => problems.push(s);
  const pk = Object.fromEntries(personas.map((p) => [p.key, p]));
  const ok = Object.fromEntries(orgs.map((o) => [o.key, o]));
  const seen = new Set();
  for (const x of [...roles, ...orgs, ...personas]) {
    if (seen.has(x.alias)) P(`duplicate alias ${x.alias}`); seen.add(x.alias);
  }
  for (const r of roles) {
    if (!r.name.startsWith('AGENT-TEST-') || !r.id.startsWith('agent-test-')) P(`role ${r.key}: id/name must carry the AGENT-TEST prefix (teardown sweeps only those)`);
    if (sharedRoleIds.includes(r.id)) P(`role ${r.key}: id ${r.id} is a SHARED role — a grant on it changes every other run`);
  }
  const view = roles.find((r) => r.key === 'VIEW');
  if (JSON.stringify(view?.permissions) !== JSON.stringify([VIEW_PERMISSION])) P(`ORG_RET_VIEWER_ROLE must hold ONLY ${VIEW_PERMISSION}, holds ${JSON.stringify(view?.permissions)}`);
  const vs = roles.find((r) => r.key === 'VIEW_SUBMIT');
  if (!vs || [VIEW_PERMISSION, SUBMIT_PERMISSION].some((p) => !vs.permissions.includes(p)) || vs.permissions.length !== 2) P('ORG_RET_VIEW_SUBMIT_ROLE must hold exactly view + submit');
  for (const o of orgs) if (!o.name.startsWith('AGENT-TEST-')) P(`org ${o.key}: name must start AGENT-TEST-`);
  const logins = new Set();
  for (const p of personas) {
    if (!/^agent-test-orgret-/i.test(p.login)) P(`${p.key}: login must start agent-test-orgret-`);
    if (logins.has(p.login.toLowerCase())) P(`${p.key}: duplicate login ${p.login}`); logins.add(p.login.toLowerCase());
    for (const mm of p.memberships) if (!ok[mm.org]) P(`${p.key}: membership in unknown org ${mm.org}`);
  }
  const buyer = pk.BUYER;
  // Viewer and buyer: different people, ONE organization, buyer is NOT a holder.
  if (!buyer || !buyer.memberships.some((x) => x.org === 'VIEWER')) P('BUYER must be a member of the viewer organization');
  else if (expectedCanView(buyer, 'VIEWER')) P('BUYER holds the view permission — the owner would read its own org list and "a colleague reads it" is undecidable');
  if (!buyer?.order) P('BUYER has no order — no colleague return can exist');
  // The leaver: a SEPARATE non-holder buyer in the viewer org, so removing it never disturbs ORG_RET_BUYER.
  const lv = pk.LEAVER;
  if (!lv) P('LEAVER missing');
  else {
    if (lv.login === buyer?.login) P('LEAVER is the same account as BUYER — removing it would break every other case');
    if (lv.memberships.length !== 1 || lv.memberships[0].org !== 'VIEWER' || lv.globalRoles.length) P('LEAVER must be a single-org member of the viewer org with no global role');
    if (expectedCanView(lv, 'VIEWER')) P('LEAVER holds the view permission — it must be a plain buyer');
    if (lv.order !== 'VIEWER') P('LEAVER needs its own order in the viewer org (it must be able to raise a return)');
  }
  // Grant sources, one holder each, isolated.
  const want = { HOLDER_GLOBAL: ['global'], HOLDER_MEMBERSHIP: ['membership'] };
  for (const [k, src] of Object.entries(want)) {
    if (!pk[k]) { P(`${k} missing`); continue; }
    const got = viewSources(pk[k], 'VIEWER');
    if (JSON.stringify(got) !== JSON.stringify(src)) P(`${k}: view reached through [${got}] in the viewer org, must be exactly [${src}]`);
  }
  if (pk.HOLDER_ORGROLE) {
    const got = viewSources(pk.HOLDER_ORGROLE, 'ORGROLE');
    if (JSON.stringify(got) !== JSON.stringify(['organization'])) P(`HOLDER_ORGROLE: view reached through [${got}], must be exactly [organization]`);
  } else P('HOLDER_ORGROLE missing');
  // An org-level role is inherited by EVERY member: no org carrying one may contain a persona meant for another source.
  for (const o of orgs.filter((x) => x.orgRoles.length)) {
    const members = personas.filter((p) => p.memberships.some((x) => x.org === o.key)).map((p) => p.key);
    const intruders = members.filter((k) => !['HOLDER_ORGROLE', 'ORGROLE_BUYER'].includes(k));
    if (intruders.length) P(`org ${o.key} carries an org-level role, so ${intruders.join(', ')} would hold view by inheritance`);
  }
  if (ok.VIEWER?.orgRoles.length) P('the viewer organization must carry NO org-level role (every member, the buyer included, would inherit it)');
  // Holder pairs with the buyer in one organization.
  for (const k of ['HOLDER_GLOBAL', 'HOLDER_MEMBERSHIP', 'HOLDER_SUBMIT', 'LONG_NAME_BUYER']) {
    const p = pk[k]; const org = k === 'LONG_NAME_BUYER' ? 'LONG_NAME' : 'VIEWER';
    if (p && !expectedCanView(p, org)) P(`${k} cannot view ${org} — a positive case would fail for a data reason`);
  }
  if (pk.HOLDER_ORGROLE && !expectedCanView(pk.HOLDER_ORGROLE, 'ORGROLE')) P('HOLDER_ORGROLE cannot view its org');
  if (pk.ORGROLE_BUYER && !pk.ORGROLE_BUYER.order) P('ORGROLE_BUYER has no order — the org-level holder has no colleague return to read');
  // Blocking holders differ from HOLDER_MEMBERSHIP in status/lock ONLY.
  const ref = pk.HOLDER_MEMBERSHIP?.memberships[0];
  const blocking = { HOLDER_LOCKED: { status: 'Approved', locked: true }, HOLDER_INVITED: { status: 'Invited', locked: false }, HOLDER_REJECTED: { status: 'Rejected', locked: false }, HOLDER_DELETED: { status: 'Deleted', locked: false } };
  for (const [k, st] of Object.entries(blocking)) {
    const p = pk[k];
    if (!p) { P(`${k} missing`); continue; }
    if (p.memberships.length !== 1 || p.globalRoles.length) P(`${k}: must be single-org with no global role (a second org or a global role masks the block)`);
    const mm = p.memberships[0];
    if (ref && (mm.org !== ref.org || JSON.stringify(mm.roles) !== JSON.stringify(ref.roles))) P(`${k}: org/roles differ from HOLDER_MEMBERSHIP — the block is no longer the only variable`);
    if (mm.status !== st.status || mm.locked !== st.locked) P(`${k}: status/lock ${mm.status}/${mm.locked} != ${st.status}/${st.locked}`);
    if (expectedCanView(p, mm.org)) P(`${k}: the gate would let it through — not a blocking fixture`);
    if (!effectivePermissions(p, mm.org).has(VIEW_PERMISSION)) P(`${k}: does not HOLD the permission — a refusal would be explained by the missing grant, not by the block`);
  }
  // Multi-org: permission in exactly one of two orgs, never global.
  const multi = pk.MULTI;
  if (multi) {
    const can = multi.memberships.map((x) => expectedCanView(multi, x.org));
    if (multi.memberships.length !== 2 || can.filter(Boolean).length !== 1) P('MULTI: must be in exactly two orgs and able to view exactly one');
    if (multi.globalRoles.length) P('MULTI: a global role would hold in BOTH orgs');
    if (multi.order && expectedCanView(multi, multi.order)) P('MULTI: its own order must be raised for the org WITHOUT the permission');
  }
  // Cross-org probe.
  if (!pk[OTHER_RETURN.persona]?.memberships.every((x) => x.org === 'OTHER')) P('OTHER_BUYER must belong only to the other org');
  for (const p of personas) if (expectedCanView(p, 'VIEWER') && p.memberships.some((x) => x.org === 'OTHER')) P(`${p.key} is a viewer-org holder AND a member of OTHER — the leak probe would see a legitimate membership`);
  // Addresses.
  const ve = orgEmailOf(ok.VIEWER || {});
  if (!ve) P('the viewer org must carry an email (the org-copy target)');
  for (const p of personas.filter((x) => x.memberships.some((mm) => mm.org === 'VIEWER'))) {
    if (emailOf(p) && ve && emailOf(p).toLowerCase() === ve.toLowerCase()) P(`${p.key}'s address equals the viewer org's — the copy would be suppressed as a duplicate`);
  }
  const sa = ok.SAME_ADDRESS; const sab = pk[sa?.emailOfPersona];
  if (!sa || !sab || orgEmailOf(sa) !== emailOf(sab)) P('SAME_ADDRESS: the org email must EQUAL its buyer\'s');
  if (sa && upperVariant(orgEmailOf(sa)) === orgEmailOf(sa)) P('SAME_ADDRESS: email_upper equals email — the case-insensitivity boundary is gone');
  if (ok.NOEMAIL && orgEmailOf(ok.NOEMAIL)) P('NOEMAIL org carries an email');
  if (!personas.some((p) => p.memberships.some((x) => x.org === 'NOEMAIL') && p.order === 'NOEMAIL' && emailOf(p))) P('NOEMAIL org needs a buyer WITH an email and an order (the buyer email must still go)');
  const ne = pk.BUYER_NOEMAIL;
  if (!ne || !ne.noEmail || ne.login.includes('@') || !ne.order) P('BUYER_NOEMAIL must have no email, a non-email login and an order');
  if (ne && !ve) P('BUYER_NOEMAIL must sit in an org WITH an email (the copy still has a target)');
  // Long values.
  if ([...LONG_ORG_NAME].length !== 60) P(`LONG_ORG_NAME is ${[...LONG_ORG_NAME].length} chars, must be 60`);
  if (LONG_BUYER_NAME.length !== 32 || !/^[A-Za-z0-9]+$/.test(LONG_BUYER_NAME)) P('LONG_BUYER_NAME must be 32 characters with no break opportunity (letters/digits only)');
  if (pk.LONG_NAME_BUYER && fullNameOf(pk.LONG_NAME_BUYER) !== LONG_BUYER_NAME) P('LONG_NAME_BUYER\'s name must BE the 32-character value');
  // Orders and lines.
  if (ORDER_LINES[LINE_ROLE_X] === ORDER_LINES[LINE_ROLE_Y]) P('both order lines carry the same quantity — a return landing on the wrong line is invisible');
  for (const [role, q] of Object.entries(OTHER_RETURN.requested)) if (q > ORDER_LINES[role]) P(`${OTHER_RETURN.alias} requests ${q} of ${role}, more than ordered`);
  for (const g of FIXTURE_GAPS) if (OWNED_ALIASES.includes(g.alias)) P(`${g.alias} is both a FIXTURE-GAP and a seeded alias`);
  return { ok: problems.length === 0, problems };
}
