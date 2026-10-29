/**
 * passkey-specs.mjs — side-effect-free source of truth for the VCST-6121 passkey sign-in accounts.
 * Imported by the seeder (seed-passkey.mjs) and the drift guard (validate-passkey-data.mjs);
 * importing it reads no env, touches no file and makes no request.
 *
 * WHY EVERY ACCOUNT IS OURS AND DISPOSABLE. Registering a passkey, deleting a password, locking an
 * account and impersonating one all MUTATE the account, and a WebAuthn credential lives in a virtual
 * authenticator that dies with the browser context. So a case creates its passkeys IN-STEP on these
 * accounts (FIFTH RULE); what is provisioned here is only the accounts and their organizations.
 * Isolation is per ACCOUNT: two cases on one account read each other's keys / lockout count.
 *
 *   PK_BUYER          B2B buyer, ONE org (ORG-MAIN), Customer on STORE_ID.
 *   PK_BUYER_MULTI    buyer in TWO orgs: A = ORG-LOCKABLE (nobody else is a member — a case locks THIS
 *                     membership to test org fallback) and B = ORG-MAIN. The pair must stay two
 *                     DIFFERENT orgs, or the fallback has nowhere to go (validator [2]).
 *   PK_B2C            personal customer, NO organization, on STORE_ID.
 *   PK_LOCKOUT        buyer like PK_BUYER, dedicated to lockout cases (left LOCKED by a run).
 *   PK_PASSKEY_ONLY   buyer like PK_BUYER that a case strips of its password.
 *   PK_BO_MANAGER(_2) back-office Manager (not Customer, not Administrator), no contact, no store,
 *                     holding BO_ROLE (our own role, store:access + store:read only). Two accounts so
 *                     the Admin Shell and the AngularJS runs keep independent key sets.
 *   PK_OPERATOR       Manager holding OPERATOR_ROLE (our own role, platform:security:loginOnBehalf only)
 *                     — the impersonation operator. Exists because the shared IMPERSONATION_ADMIN does
 *                     not authenticate on every env with the lane's password; seeded on STORE_ID so it
 *                     can sign in to the storefront before it impersonates.
 *   PK_FOREIGN_STORE  personal customer, NO organization, on a FOREIGN store: an existing store that is
 *                     not STORE_ID, is not in STORE_ID's trustedGroups and does not trust STORE_ID,
 *                     chosen LIVE at seed time (pickForeignStore). Its password grant works only with
 *                     its own storeId, so with that token a case registers a real passkey on the run
 *                     storefront host and then proves the passkey grant on STORE_ID is refused by the
 *                     store rule (PKA-015). The non-existent-store contact OTP_FOREIGN_STORE_CONTACT
 *                     cannot do this: no grant ever gives it a token of its own.
 *
 * All accounts: lockoutEnabled true (with it off a lockout case cannot lock), emailConfirmed true,
 * passwordExpired false, password = the {{DEFAULT_TEST_PASSWORD}} token (VCST-5406, never a literal).
 * Business keys (emails, org names, role names) live here and in aliases.json; runtime ids ONLY in
 * aliases.<env>.json.
 */

export const SEED_PREFIX = 'AGENT-TEST-PK';
export const EMAIL_PREFIX = 'agent-test-pk-';
export const EMAIL_DOMAIN = 'test-agent.com';
export const PASSWORD_VAR = 'DEFAULT_TEST_PASSWORD';
export const PASSWORD_TOKEN = `{{${PASSWORD_VAR}}}`;
export const STORE_TOKEN = '{{STORE_ID}}';
/**
 * Marker for "a store looked up live by pickForeignStore". Deliberately NOT a {{VAR}}: no env file
 * names this store, and no store id may be committed for it (the set of stores differs per env).
 */
export const FOREIGN_STORE_MARKER = '<foreign-store>';

/** Org-scoped buyer role, granted per OrganizationMembership (never as a global role — VCST-5028). */
export const BUYER_ROLE_NAME = 'Purchasing agent';
/**
 * Least-privilege back-office role. OUR OWN, upserted under a pinned id and deleted by the teardown,
 * like OPERATOR_ROLE. It used to be an EXISTING role resolved by name ("Store access"), but that role
 * is hand-made stand data: present on vcptcore, absent on vcst, so the seed aborted there. No built-in
 * role is this small, and the hand-made roles several stands happen to share are just as per-env, so
 * the env-independent answer is to own the role. Its permissions are the ones vcptcore's "Store access"
 * carried when VCST-6121 ran there: enough to pass the Admin SPA's no-permission screen, nothing more.
 */
export const BO_ROLE = {
  id: 'AGENT-TEST-PK-BackOffice',
  name: 'AGENT-TEST-PK-BackOffice',
  description: 'AGENT-TEST VCST-6121 back-office passkey manager: store:access + store:read only. Safe to delete.',
  permissions: ['store:access', 'store:read'],
};
export const BO_ROLE_NAME = BO_ROLE.name;
/** Our own role — created and deleted by this seeder; it carries exactly one permission. */
export const OPERATOR_ROLE = {
  id: 'AGENT-TEST-PK-Impersonator',
  name: 'AGENT-TEST-PK-Impersonator',
  description: 'AGENT-TEST VCST-6121 impersonation operator: platform:security:loginOnBehalf only. Safe to delete.',
  permissions: ['platform:security:loginOnBehalf'],
};
/** Every role this seeder owns: upserted (pinned id) by the seed, deleted by the teardown. */
export const OWN_ROLES = [BO_ROLE, OPERATOR_ROLE];

export const ORGS = [
  { key: 'ORG-MAIN', alias: 'PK_ORG_MAIN', name: 'AGENT-TEST-PK-Org-Main' },
  { key: 'ORG-LOCKABLE', alias: 'PK_ORG_LOCKABLE', name: 'AGENT-TEST-PK-Org-Lockable' },
];

const email = (key) => `${EMAIL_PREFIX}${key.toLowerCase()}@${EMAIL_DOMAIN}`;
const buyer = (o) => ({ userType: 'Customer', isAdministrator: false, hasContact: true, storeId: STORE_TOKEN, roles: [], ...o });
const manager = (o) => ({ userType: 'Manager', isAdministrator: false, hasContact: false, orgs: [], ...o });

export const ACCOUNTS = [
  buyer({ key: 'BUYER', alias: 'PK_BUYER', kind: 'buyer', orgs: ['ORG-MAIN'],
    purpose: 'B2B buyer, one org — register / rename / delete keys, passkey sign-in journey, impersonation target' }),
  buyer({ key: 'BUYER-MULTI', alias: 'PK_BUYER_MULTI', kind: 'multi-org', orgs: ['ORG-LOCKABLE', 'ORG-MAIN'],
    purpose: 'buyer in two orgs — a case locks the ORG-LOCKABLE membership to test org fallback on passkey sign-in' }),
  buyer({ key: 'B2C', alias: 'PK_B2C', kind: 'b2c', orgs: [],
    purpose: 'personal customer without organization — passkey sign-in lands with no org claim' }),
  buyer({ key: 'LOCKOUT', alias: 'PK_LOCKOUT', kind: 'buyer', orgs: ['ORG-MAIN'], destructive: true,
    purpose: 'DESTRUCTIVE — a lockout case locks it; passkey sign-in of a locked account must be refused' }),
  buyer({ key: 'PASSKEY-ONLY', alias: 'PK_PASSKEY_ONLY', kind: 'buyer', orgs: ['ORG-MAIN'], destructive: true,
    purpose: 'DESTRUCTIVE — a case deletes its password (passkey-only account)' }),
  manager({ key: 'BO-MANAGER', alias: 'PK_BO_MANAGER', kind: 'bo-manager', storeId: '', roles: [BO_ROLE_NAME],
    purpose: 'back-office Manager — Admin Shell key management + back-office passkey sign-in' }),
  manager({ key: 'BO-MANAGER-2', alias: 'PK_BO_MANAGER_2', kind: 'bo-manager', storeId: '', roles: [BO_ROLE_NAME],
    purpose: 'back-office Manager — AngularJS key management + back-office passkey sign-in (key set independent of PK_BO_MANAGER)' }),
  manager({ key: 'OPERATOR', alias: 'PK_OPERATOR', kind: 'operator', storeId: STORE_TOKEN, roles: [OPERATOR_ROLE.name],
    purpose: 'impersonation operator (loginOnBehalf) — impersonates PK_BUYER; key management must be refused in that session' }),
  buyer({ key: 'FOREIGN-STORE', alias: 'PK_FOREIGN_STORE', kind: 'foreign-store', orgs: [], storeId: FOREIGN_STORE_MARKER,
    purpose: 'customer of a foreign (existing, untrusted) store — registers a passkey with its own-store token; the passkey grant on STORE_ID must be refused (PKA-015)' }),
].map((s) => ({ firstName: SEED_PREFIX, lastName: s.key, email: email(s.key), ...s }));

export const ALIASES = ACCOUNTS.map((a) => a.alias);
export const orgByKey = (key) => ORGS.find((o) => o.key === key);
export const seedOuterId = (key) => `${SEED_PREFIX}:${key}`;
export const isSeededOuterId = (v) => String(v || '').startsWith(`${SEED_PREFIX}:`);

/**
 * Resolve a spec store token: STORE_TOKEN → the env's STORE_ID, FOREIGN_STORE_MARKER → the store
 * pickForeignStore chose ('' when none was resolved — never a guess). '' stays ''.
 */
export function resolveStoreId(spec, envStoreId, foreignStoreId = '') {
  if (spec.storeId === STORE_TOKEN) return String(envStoreId || '');
  if (spec.storeId === FOREIGN_STORE_MARKER) return String(foreignStoreId || '');
  return String(spec.storeId || '');
}

const sameId = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase();
const trusts = (store, otherId) => (store?.trustedGroups || []).some((g) => sameId(g, otherId));

/**
 * Why `store` cannot serve as the foreign store for `runStore` ('' = it can). Both directions of trust
 * are excluded: whichever way the platform reads trustedGroups, a trusted pair would let the grant on
 * the run store succeed and PKA-015 would test nothing.
 */
export function foreignStoreRejection(store, runStore, { schemes = null } = {}) {
  if (!store?.id) return 'no such store';
  if (sameId(store.id, runStore?.id)) return 'it is the run store';
  if (trusts(runStore, store.id)) return `the run store ${runStore.id} trusts it`;
  if (trusts(store, runStore?.id)) return `it trusts the run store ${runStore?.id}`;
  if (schemes) {
    const on = (n) => schemes.some((s) => sameId(s.name, n) && s.isActive !== false);
    if (!on('Password')) return 'Password sign-in is not active on it';
    if (!on('Passkey')) return 'Passkey sign-in is not active on it';
  }
  return '';
}

/**
 * Choose the foreign store from the env's live stores. A store chosen earlier (`preferId`, from the
 * overlay) is kept while it still qualifies, so a re-seed does not move the account; otherwise the
 * first qualifying store by id, skipping other seeders' AGENT-TEST-* stores (they come and go).
 * Returns { id, rejected: [{id, why}] } — id '' when nothing qualifies (the caller must fail loudly).
 */
export function pickForeignStore(stores, runStoreId, { preferId = '', schemesById = {} } = {}) {
  const runStore = stores.find((s) => sameId(s.id, runStoreId)) || { id: runStoreId, trustedGroups: [] };
  const rejected = [];
  const ok = (s) => {
    const why = foreignStoreRejection(s, runStore, { schemes: schemesById[s.id] || null });
    if (why) rejected.push({ id: s.id, why });
    return !why;
  };
  const preferred = preferId ? stores.find((s) => sameId(s.id, preferId)) : null;
  if (preferred && ok(preferred)) return { id: preferred.id, rejected };
  const pool = stores.filter((s) => !String(s.id).toUpperCase().startsWith('AGENT-TEST-') && s !== preferred)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const pick = pool.find(ok);
  return { id: pick?.id || '', rejected };
}

/** POST /api/members body for an organization. */
export function orgBody(org) {
  return {
    memberType: 'Organization', name: org.name, status: 'Approved', outerId: seedOuterId(org.key),
    description: `${SEED_PREFIX} VCST-6121 passkey fixture org (${org.key}). Safe to delete.`,
  };
}

/** POST /api/members body for a buyer's contact; `orgIds` = the platform ids of spec.orgs, in order. */
export function contactBody(spec, orgIds) {
  const name = `${spec.firstName} ${spec.lastName}`;
  return {
    memberType: 'Contact', firstName: spec.firstName, lastName: spec.lastName, fullName: name, name,
    emails: [spec.email], organizations: orgIds, status: 'Approved', defaultLanguage: 'en-US', currencyCode: 'USD',
    outerId: seedOuterId(spec.key),
  };
}

/** POST /api/platform/security/users/create body. `roles` = [{id, name}] resolved live. */
export function accountBody(spec, { envStoreId, foreignStoreId = '', password, memberId, roles = [] }) {
  return {
    userName: spec.email, email: spec.email, password,
    memberId: spec.hasContact ? memberId : null,
    storeId: resolveStoreId(spec, envStoreId, foreignStoreId) || null,
    userType: spec.userType, isAdministrator: false, roles,
    status: 'Approved', emailConfirmed: true, lockoutEnabled: true, passwordExpired: false,
  };
}

const lc = (v) => String(v || '').trim().toLowerCase();

/**
 * Live state an account must be in before a run. [] = armed. `user` = security account,
 * `member` its contact (or null), `memberships` its org-membership rows, `orgIdsByKey` the live org
 * ids, `foreignStoreId` the store pickForeignStore resolved (PK_FOREIGN_STORE); `now` injectable.
 */
export function accountProblems(spec, user, { member = null, memberships = [], orgIdsByKey = {}, envStoreId, foreignStoreId = '', now = Date.now() } = {}) {
  if (!user) return [`${spec.alias}: no security account for ${spec.email}`];
  const out = [];
  const p = (m) => out.push(`${spec.alias}: ${m}`);
  if (user.userType !== spec.userType) p(`userType ${user.userType}, expected ${spec.userType}`);
  if (user.isAdministrator) p('isAdministrator true — permission checks would be bypassed');
  if (user.lockoutEnabled !== true) p('lockoutEnabled is not true');
  if (user.emailConfirmed !== true) p('emailConfirmed is not true');
  if (user.passwordExpired) p('passwordExpired is true');
  if (user.status && user.status !== 'Approved') p(`status ${user.status}, expected Approved`);
  const end = user.lockoutEnd ? new Date(user.lockoutEnd).getTime() : 0;
  if (user.lockoutEnabled && end > now) p(`LOCKED until ${user.lockoutEnd} — re-seed to re-arm`);
  if ((user.accessFailedCount || 0) > 0) p(`accessFailedCount ${user.accessFailedCount} — a lockout case would start mid-count`);
  const wantStore = resolveStoreId(spec, envStoreId, foreignStoreId);
  if (spec.storeId === FOREIGN_STORE_MARKER && !wantStore) p('no foreign store resolved on this env');
  if (lc(user.storeId) !== lc(wantStore)) p(`storeId "${user.storeId ?? ''}", expected "${wantStore}"`);
  const roleNames = (user.roles || []).map((r) => r.name);
  for (const r of spec.roles) if (!roleNames.includes(r)) p(`missing global role ${r}`);
  if (spec.userType === 'Customer' && roleNames.length) p(`Customer carries global role(s) ${roleNames.join(', ')} — org roles belong on the membership (VCST-5028)`);
  if (spec.hasContact) {
    if (!user.memberId) p('no memberId — the account is not linked to its contact');
    else if (member && member.memberType !== 'Contact') p(`member is ${member.memberType}, expected Contact`);
    if (member?.status && member.status !== 'Approved') p(`contact status ${member.status}, expected Approved`);
  } else if (user.memberId) p(`memberId present — a ${spec.kind} has no contact`);
  const wantOrgs = spec.orgs.map((k) => orgIdsByKey[k]).filter(Boolean);
  if (wantOrgs.length !== spec.orgs.length) p('an organization of this account does not exist');
  const contactOrgs = member?.organizations || [];
  for (const id of wantOrgs) {
    if (!contactOrgs.includes(id)) p(`contact.organizations lacks ${id}`);
    const m = memberships.find((x) => x.organizationId === id);
    if (!m) p(`no OrganizationMembership in ${id}`);
    else {
      if (m.isLocked) p(`membership in ${id} is LOCKED — re-seed to re-arm`);
      if (!(m.roles || []).some((r) => r.roleName === BUYER_ROLE_NAME)) p(`membership in ${id} lacks role ${BUYER_ROLE_NAME}`);
    }
  }
  if (!spec.orgs.length && (contactOrgs.length || memberships.length)) p('expected NO organization');
  return out;
}
