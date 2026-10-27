/**
 * mfa-fixtures-specs.mjs — side-effect-free source of truth for the VCST-5904 MFA-by-email fixtures.
 * Imported by the creator (`mfa-fixtures.mjs`) and the drift guard (`validate-mfa-fixtures-data.mjs`);
 * importing it reads no env, touches no file and makes no request.
 *
 * WHY A CREATOR AND NOT A SEEDED POOL (`.claude/rules/test-data.md` §FIFTH RULE): an MFA account carries
 * terminal per-sign-in state the environment and the case itself use up — the emailed code, the
 * two-factor ticket (single redemption), the wrong-code window and a 15-minute lockout. A shared seeded
 * account would be mid-window for the next case. So every case CREATES its own accounts (lifecycle
 * SCENARIO/STEP, `test-data/models/auth.data-model.json` data.auth.account.mfa-eligible) through
 * `createMfaAccount`, keyed by a per-run `runId`, and the run's teardown sweeps by that runId.
 *
 * WHY OUR OWN STORE: `MultiFactorAuthentication.StoreMode` on {{STORE_ID}} would put every
 * [PRE:SIGNIN_AS] suite into BLOCKED, and the global switch is a whole-stand window
 * (data.auth.platform.mfa-global-on). A disposable `AGENT-TEST-MFA-<runId>` store whose mode we own
 * separates the per-store rule from the global one without touching shared settings. It deliberately
 * carries NO `url`: the storefront resolves a store by host, and a second store with {{STORE_ID}}'s url
 * could capture its traffic. So our store is reachable by API grants that name `storeId`, not by a
 * storefront host — a case that needs the storefront UI uses the orchestrator's global/B2B-store window.
 *
 * NO PUBLIC INBOX: every address is `@example.com` (RFC 2606, undeliverable). A back-office account
 * here receives its code ONLY through the admin notification journal, which needs an admin token —
 * never on a public inbox (the reason the OTP set retired its back-office accounts).
 */

export const PREFIX = 'AGENT-TEST-MFA';
export const EMAIL_PREFIX = 'agent-test-mfa-';
export const EMAIL_DOMAIN = 'example.com';
/** The ONLY password source — an env var NAME, never a value (VCST-5406). */
export const PASSWORD_VAR = 'DEFAULT_TEST_PASSWORD';
export const STORE_MODE_SETTING = 'MultiFactorAuthentication.StoreMode';
/** Allowed values read live on vcst 2026-10-23 (setting allowedValues); null = no store override. */
export const STORE_MODES = Object.freeze(['Use global setting', 'Enabled', 'Disabled']);
export const MFA_NOTIFICATION_TYPE = 'MfaSignInEmailNotification';
/** OrganizationMembership.Status values (Customer.OrganizationMembershipStatuses, KB-A241C915). */
export const MEMBERSHIP_STATUSES = Object.freeze(['Approved', 'Invited', 'Rejected', 'Deleted']);
/** Org-scoped roles (VCST-5028 — org roles live on the membership, never global). */
export const ORG_ROLE_MEMBER = 'org-employee';
export const ORG_ROLE_OPERATOR = 'org-maintainer'; // carries platform:security:loginOnBehalf (live 2026-10-23)
/** A back-office role we create per run, read-only, so the Manager/Customer pair differs only by userType. */
export const BACKOFFICE_PERMISSIONS = Object.freeze(['platform:security:read']);

/**
 * The account kinds. Every field a kind does not set takes the baseline: Customer, contact, store =
 * the MFA store, emailConfirmed true, lockoutEnabled true, twoFactorEnabled false, no back-office role,
 * no org (the org role applies only when orgs > 0), no impersonation target.
 *
 * The falsifiability contract the drift guard enforces (`.claude/rules/test-data.md` §SECOND RULE):
 *   `sibling`          the kind this one is read AGAINST;
 *   `discriminates`    the ONE property that separates the pair — it must differ;
 *   `allowedConfounds` { field: why it cannot decide what the pair's cases observe } — EVERY other
 *                      data field that differs between the pair must be listed here (on either kind of
 *                      the pair) or the guard fails. An entry naming a field that no longer differs is
 *                      stale and fails too. Meta fields (`META_FIELDS`) are not compared.
 */
const BASE = Object.freeze({
  userType: 'Customer', hasContact: true, emailConfirmed: true, lockoutEnabled: true,
  twoFactorEnabled: false, backofficeRole: false, orgs: 0, orgRole: ORG_ROLE_MEMBER, storeScope: 'mfa', targetKind: null,
});
/** Contract fields, not account data: never compared between siblings. */
export const META_FIELDS = Object.freeze(['sibling', 'discriminates', 'allowedConfounds', 'purpose']);

/** Backoffice sign-in reads the GLOBAL switch only (VCST-5904 Jira comment 112278). Cited by both confounds of the userType pair. */
const BACKOFFICE_GLOBAL_ONLY = 'Backoffice sign-in decides the second factor from the global MultiFactorAuthentication.Enabled alone, for every user (VCST-5904 Jira comment 112278: "Backoffice sign-in: the global setting only")';

export const KINDS = Object.freeze({
  'customer-confirmed': { ...BASE, sibling: 'customer-unconfirmed', discriminates: 'emailConfirmed',
    purpose: 'MFA-eligible storefront customer (data.auth.account.mfa-eligible): challenged, served by email' },
  'customer-unconfirmed': { ...BASE, emailConfirmed: false, sibling: 'customer-confirmed', discriminates: 'emailConfirmed',
    purpose: 'Unconfirmed twin: MFA applies but the email provider cannot serve it (mfa_provider_not_available per PR)' },
  'manager-backoffice': { ...BASE, userType: 'Manager', hasContact: false, backofficeRole: true, storeScope: 'none',
    sibling: 'customer-role-for-backoffice', discriminates: 'userType',
    allowedConfounds: {
      storeScope: `${BACKOFFICE_GLOBAL_ONLY} — StoreMode is not an input on that path, so the store an account is bound to cannot decide the userType contrast, which is read on the Backoffice (MFA-001/011/012/016/020/023 against MFA-014). This kind's other cases (MFA-004/026/031/032) are not read against customer-role-for-backoffice.`,
      hasContact: `${BACKOFFICE_GLOBAL_ONLY} — the rule names no member-side input, and MFA-014 compares the customer-role account with its OWN control sign-in (controlStatus vs mfaStatus), so whether a contact backs the account is constant inside that comparison.`,
    },
    purpose: 'Back-office Manager with a back-office role: the Backoffice branch of global MFA' },
  'customer-role-for-backoffice': { ...BASE, backofficeRole: true, sibling: 'manager-backoffice', discriminates: 'userType',
    purpose: 'Customer holding the SAME back-office role: userType, not the role, decides the branch' },
  'b2b-two-org': { ...BASE, orgs: 2, storeScope: 'b2b', sibling: 'customer-confirmed', discriminates: 'orgs',
    allowedConfounds: {
      storeScope: `Whether a challenge happens is the same on both sides when the pair is read: the creator sets the MFA store to Enabled, and every b2b-two-org case is BLOCKED unless operator window W2 has {{STORE_ID}} StoreMode=Enabled (MFASF-005). The org outcome is read between this kind's OWN two memberships on one store (lock Org A, land in Org B), so the bound store is constant inside it. Precondition-dependent: outside W2 the store WOULD decide the challenge — kept because MFASF-005 (Automated) signs in on the storefront, which resolves only {{STORE_ID}}.`,
    },
    purpose: 'Contact in two AGENT-TEST orgs: per-org membership lock/status + current org on the mfa grant' },
  'impersonation-operator': { ...BASE, orgs: 1, orgRole: ORG_ROLE_OPERATOR, targetKind: 'impersonation-target', storeScope: 'b2b',
    sibling: 'impersonation-target', discriminates: 'orgRole',
    allowedConfounds: {
      targetKind: `targetKind provisions the OTHER side of this pair: the operator's fixture creates its impersonation-target in the operator's own org, so both sides of the orgRole contrast see the same accounts; it is not a property of either account's sign-in.`,
    },
    purpose: 'Org maintainer (loginOnBehalf) + a target member of the same org: does impersonation bypass MFA' },
  'impersonation-target': { ...BASE, orgs: 1, storeScope: 'b2b', sibling: 'impersonation-operator', discriminates: 'orgRole',
    purpose: `Org employee in the operator's org, the account impersonation-operator impersonates: created BY that kind (targetKind), never alone` },
  'lockout-disabled': { ...BASE, lockoutEnabled: false, sibling: 'customer-confirmed', discriminates: 'lockoutEnabled',
    purpose: 'lockoutEnabled false (data.auth.account.lockout-disabled): what MFA does with an account it cannot lock' },
  'per-user-2fa': { ...BASE, twoFactorEnabled: true, sibling: 'customer-confirmed', discriminates: 'twoFactorEnabled',
    purpose: 'Identity twoFactorEnabled true: per-user 2FA flag against store/global MFA' },
});
export const KIND_NAMES = Object.freeze(Object.keys(KINDS));

/** A runId is a short slug: it lands in emails, store ids and names. */
export function assertRunId(runId) {
  if (!/^[a-z0-9]{3,16}$/.test(String(runId || ''))) throw new Error(`runId "${runId}" must be 3-16 chars [a-z0-9]`);
  return runId;
}
export const newRunId = (now = Date.now()) => now.toString(36).slice(-6) + Math.random().toString(36).slice(2, 5);

export const storeIdFor = (runId) => `${PREFIX}-${assertRunId(runId)}`;
export const invalidUrlFor = (runId) => `https://agent-test-mfa-${assertRunId(runId)}.invalid`;
/** Storefront-binding fields a cloned store must never share with its source. */
export const STOREFRONT_BINDING_FIELDS = Object.freeze(['url', 'secureUrl']);
export const roleNameFor =(runId) => `${PREFIX}-${assertRunId(runId)}-Backoffice`;
export const orgNameFor = (runId, tag) => `${PREFIX}-${assertRunId(runId)}-${tag}`;
/** Every entity of a run carries this marker — the teardown sweep key. */
export const runMarker = (runId) => `${EMAIL_PREFIX}${assertRunId(runId)}-`;
export const emailFor = (runId, kind, n = 0) => {
  if (!KINDS[kind]) throw new Error(`unknown kind ${kind}`);
  return `${runMarker(runId)}${kind}${n ? `-${n}` : ''}@${EMAIL_DOMAIN}`;
};
export const isRunEmail = (email, runId) => String(email || '').toLowerCase().startsWith(runMarker(runId));
export const isRunName = (name, runId) => {
  const base = `${PREFIX}-${runId}`;
  const n = String(name || '');
  return n === base || n.startsWith(`${base}-`);
};

/** POST /api/stores body: the minimum cloned from a source store + our mode. */
export function storeBody(runId, source, mode) {
  if (mode !== null && mode !== undefined && !STORE_MODES.includes(mode)) throw new Error(`StoreMode "${mode}" not in ${STORE_MODES.join(' / ')}`);
  const id = storeIdFor(runId);
  return {
    id, name: id, storeState: 'Open', timeZone: source.timeZone || 'UTC',
    catalog: source.catalog, defaultCurrency: source.defaultCurrency, currencies: [...(source.currencies || [])],
    defaultLanguage: source.defaultLanguage, languages: [...(source.languages || [])],
    // email/emailName: a notification's From. url/secureUrl: NEVER cloned (header) — pinned to an
    // unresolvable .invalid host so no storefront host can ever resolve to this store (2026-10-23:
    // another throwaway store that copied B2B-store's url captured the shared storefront for ~7 min).
    url: invalidUrlFor(runId), secureUrl: invalidUrlFor(runId),
    email: source.email, emailName: source.emailName,
    settings: mode == null ? [] : [{ name: STORE_MODE_SETTING, valueType: 'ShortText', value: mode }],
  };
}

/** The store's own override; '' and absent both read as null (no override — the global setting decides). */
export const storeModeOf = (store) => (store?.settings || []).find((s) => s.name === STORE_MODE_SETTING)?.value || null;

/**
 * `defaults` = { currencyCode, defaultLanguage } read by the creator from the store the account is bound
 * to (the run's own store, the B2B store for a 'b2b' kind, {{STORE_ID}} for a store-less one) — GOLDEN
 * RULE: never a literal here, and no fallback: a missing value throws.
 */
export function contactBody({ email, runId, kind, orgIds = [], defaults = {} }) {
  const { currencyCode, defaultLanguage } = defaults;
  if (!currencyCode || !defaultLanguage) throw new Error(`contactBody ${kind}: currencyCode/defaultLanguage must come from the bound store (got ${JSON.stringify(defaults)})`);
  const first = `${PREFIX}-${runId}`;
  return {
    memberType: 'Contact', firstName: first, lastName: kind, fullName: `${first} ${kind}`, name: `${first} ${kind}`,
    emails: [email], organizations: orgIds, status: 'Approved', defaultLanguage, currencyCode,
    outerId: `${PREFIX}:${runId}:${kind}`,
  };
}

export function accountBody({ email, kind, password, memberId, storeId, roles = [] }) {
  const k = KINDS[kind] || BASE;
  return {
    userName: email, email, password, memberId: k.hasContact ? memberId : null,
    storeId: storeId || null, userType: k.userType, isAdministrator: false,
    roles, status: 'Approved', emailConfirmed: k.emailConfirmed, lockoutEnabled: k.lockoutEnabled,
    twoFactorEnabled: k.twoFactorEnabled, passwordExpired: false,
  };
}

/** The flags a created account must read back with. [] = the kind was produced. */
export function accountProblems(kind, user) {
  const k = KINDS[kind] || BASE;
  if (!user) return ['no security account'];
  const out = [];
  for (const f of ['userType', 'emailConfirmed', 'lockoutEnabled', 'twoFactorEnabled']) {
    if (user[f] !== k[f]) out.push(`${f} ${user[f]}, expected ${k[f]}`);
  }
  if (user.isAdministrator) out.push('isAdministrator true');
  if (user.passwordExpired) out.push('passwordExpired true');
  if (k.hasContact && !user.memberId) out.push('no memberId');
  return out;
}

/** The 6-digit code out of a rendered MfaSignInEmailNotification body (tags stripped). */
export function extractCode(body) {
  const strong = String(body || '').match(/<strong>\s*(\d{6})\s*<\/strong>/i);
  if (strong) return strong[1];
  const text = String(body || '')
    .replace(/<(style|script)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ');
  const m = text.match(/(?<![#\w])(\d{6})\b/);
  return m ? m[1] : null;
}

/** How far the runner's clock may run ahead of the server's: `after` is taken locally, createdDate on the server. */
export const CLOCK_SKEW_MS = 10000;
/** A server timestamp without an offset is UTC (the platform serializes it so); never let it parse as local time. */
const serverTime = (d) => new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(String(d)) ? d : `${d}Z`).getTime();

/** Newest journal row for exactly this recipient, created after `after` (less the clock skew) and not in `excludeIds`. */
export function pickLatestRow(rows, { email, after = null, excludeIds = [] }) {
  const e = String(email || '').toLowerCase();
  const t = after ? new Date(after).getTime() - CLOCK_SKEW_MS : 0;
  const ex = new Set(excludeIds);
  return (rows || [])
    .filter((r) => String(r.to || '').toLowerCase().split(/;\s*/).includes(e))
    .filter((r) => !ex.has(r.id) && serverTime(r.createdDate) > t)
    .sort((a, b) => serverTime(b.createdDate) - serverTime(a.createdDate))[0] || null;
}

/** Decode a JWT payload without verifying (read amr/claims of a token we just minted). */
export function jwtClaims(token) {
  try { return JSON.parse(Buffer.from(String(token).split('.')[1], 'base64url').toString('utf8')); } catch { return null; }
}

/* ── binding an admin credential to the stand it was minted on ── */

/** The lower-cased host[:port] a URL names; a bare host is accepted as-is; '' when there is none. */
export function hostOf(u) {
  const s = String(u || '').trim();
  if (!s) return '';
  try { return new URL(s.includes('://') ? s : `https://${s}`).host.toLowerCase(); } catch { return ''; }
}
/** The host of a JWT's `iss` claim, decoded WITHOUT verification — '' when the token carries none. */
export const issHostOf = (token) => hostOf(jwtClaims(token)?.iss);
/**
 * VC_ADMIN_REFRESH_FILE contents → { host, refreshToken }. The bound form is JSON
 * {"host": "<BACK_URL host>", "refresh_token": "..."}; anything else is a LEGACY bare token, whose
 * host is null (the caller must then be told the host out of band, VC_ADMIN_REFRESH_HOST).
 */
export function parseRefreshFile(text) {
  const t = String(text || '').trim();
  if (t.startsWith('{')) {
    let j = null;
    try { j = JSON.parse(t); } catch { /* malformed: no host, no token */ }
    return { host: hostOf(j?.host) || null, refreshToken: typeof j?.refresh_token === 'string' ? j.refresh_token.trim() : '' };
  }
  return { host: null, refreshToken: t };
}
export const refreshFileBody = (host, refreshToken) => `${JSON.stringify({ host, refresh_token: refreshToken })}\n`;

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
/** A reason short enough to be a label is not a reason. */
export const MIN_CONFOUND_REASON = 40;

/**
 * STATIC non-vacuity contract (`td:validate:mfa`). Every kind must differ from its declared sibling in
 * the property it claims to discriminate, and in NOTHING ELSE unless that field is an allowed confound
 * with a reason — and the baseline flags must stay as declared, or the pair observes the same thing on
 * both sides (or a different thing for a reason the pair does not name).
 */
export function specProblems(kinds = KINDS) {
  const out = [];
  for (const [name, k] of Object.entries(kinds)) {
    const sib = kinds[k.sibling];
    if (!sib) { out.push(`${name}: sibling "${k.sibling}" is not a kind`); continue; }
    if (!k.discriminates) out.push(`${name}: no discriminating property declared`);
    else if (same(k[k.discriminates], sib[k.discriminates])) {
      out.push(`${name}: ${k.discriminates} equals its sibling ${k.sibling}'s (${JSON.stringify(k[k.discriminates] ?? null)}) — the pair decides nothing`);
    }
    // Every other data field: equal, or an allowed confound declared on either kind of the pair.
    const allowed = { ...(sib.allowedConfounds || {}), ...(k.allowedConfounds || {}) };
    const fields = new Set([...Object.keys(k), ...Object.keys(sib)].filter((f) => !META_FIELDS.includes(f)));
    for (const f of fields) {
      if (f === k.discriminates || same(k[f], sib[f])) continue;
      if (!allowed[f]) out.push(`${name}: also differs from its sibling ${k.sibling} in ${f} (${JSON.stringify(k[f] ?? null)} vs ${JSON.stringify(sib[f] ?? null)}) — a confound: remove it, or declare allowedConfounds.${f} with why it cannot decide the observation`);
      else if (String(allowed[f]).trim().length < MIN_CONFOUND_REASON) out.push(`${name}: allowedConfounds.${f} gives no reason ("${allowed[f]}")`);
    }
    // A declared allowance that no longer matches a difference is stale — it would silently excuse the next one.
    for (const f of Object.keys(k.allowedConfounds || {})) {
      if (f === k.discriminates) out.push(`${name}: allowedConfounds.${f} names the discriminating property itself`);
      else if (same(k[f], sib[f])) out.push(`${name}: allowedConfounds.${f} is stale — ${f} no longer differs from ${k.sibling}`);
    }
    if (k.targetKind != null && !kinds[k.targetKind]) out.push(`${name}: targetKind "${k.targetKind}" is not a kind`);
    if (!k.purpose) out.push(`${name}: no purpose`);
  }
  const cc = kinds['customer-confirmed'];
  if (cc && !(cc.emailConfirmed && cc.lockoutEnabled && !cc.twoFactorEnabled && cc.userType === 'Customer' && cc.storeScope === 'mfa')) {
    out.push('customer-confirmed is no longer the MFA-eligible baseline (Customer, confirmed, lockout on, 2FA off, MFA store)');
  }
  if (kinds['lockout-disabled']?.lockoutEnabled !== false) out.push('lockout-disabled has lockoutEnabled !== false');
  if (kinds['per-user-2fa']?.twoFactorEnabled !== true) out.push('per-user-2fa has twoFactorEnabled !== true');
  if (kinds['b2b-two-org']?.orgs !== 2) out.push('b2b-two-org must sit in exactly 2 orgs');
  if (kinds['impersonation-operator']?.orgRole !== ORG_ROLE_OPERATOR) out.push('impersonation-operator must hold the operator org role');
  if (!/^[a-z0-9.-]+$/.test(EMAIL_DOMAIN) || !/example\.(com|org|net)$/.test(EMAIL_DOMAIN)) out.push(`EMAIL_DOMAIN ${EMAIL_DOMAIN} is not an RFC 2606 reserved domain — a back-office code would reach a real inbox`);
  if (!PREFIX.startsWith('AGENT-TEST-')) out.push('PREFIX must start with AGENT-TEST-');
  return out;
}
