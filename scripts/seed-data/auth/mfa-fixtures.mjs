#!/usr/bin/env node
/**
 * mfa-fixtures.mjs — the VCST-5904 MFA-by-email CREATOR + helpers (library) and its live proof (CLI).
 *
 * Why a creator and not a seeded pool, why our own store, why @example.com: mfa-fixtures-specs.mjs.
 *
 * LIBRARY (import it from a case runner; call `init()` ONCE — it mints ONE admin token and reuses it):
 *   createMfaStore(runId, { mode = 'Enabled', sourceStoreId = STORE_ID })   → { id, mode }
 *   setMfaStoreMode(runId, mode)                          our store only ('Enabled' | 'Disabled' | 'Use global setting' | null)
 *   createMfaAccount({ runId, store, kind, n })           → { kind, email, userId, contactId, storeId, orgs, memberships, target?, passwordVar }
 *   readLatestMfaCode({ email | userId, after, excludeIds, timeoutMs }) → { code, createdDate, status, id, latencyMs }
 *   membership helpers: lockMembership(id, lockoutEnd|null) · unlockMembership(id) · setMembershipStatus(id, status|null)
 *                       setContactOrganization(contactId, { current, default })
 *   grants (raw /connect/token, no admin token): passwordGrant({...}) · mfaGrant({...})
 *   teardown(runId)                                        the run's ledger ∪ everything carrying the run marker, zero-residue assert
 *
 * CLI:
 *   TEST_ENV=vcst node scripts/seed-data/auth/mfa-fixtures.mjs --prove [--run <id>] [--handle <path>]
 *       create the store (Enabled) + customer-confirmed, run password grant → journal code → mfa grant,
 *       then create one of every other kind; LEAVES them in place and writes the run handle.
 *   TEST_ENV=vcst node scripts/seed-data/auth/mfa-fixtures.mjs --teardown --run <id>
 *
 * ADMIN AUTH (`init()`, in this order; never an admin password grant when either variable is set):
 *   VC_ADMIN_REFRESH_FILE  path to a file holding an admin REFRESH token. init() mints the bearer with
 *                          grant_type=refresh_token, writes the rotated refresh_token back to the file
 *                          FIRST (the one just sent is spent), re-mints ~2 min before expires_in (unref'd
 *                          timer) and once more on any 401. Tokens are never printed. Use it for long runs
 *                          and for any run that straddles a global-MFA window.
 *                          BOUND TO ONE STAND: the file is JSON {"host": "<BACK_URL host>", "refresh_token": "..."}
 *                          and nothing is sent unless `host` equals the host TEST_ENV's BACK_URL names. A LEGACY
 *                          file holding a bare token is accepted only with VC_ADMIN_REFRESH_HOST=<that host>
 *                          set and equal to BACK_URL's host; the first successful refresh rewrites it as JSON.
 *                          The minted bearer's `iss` host must equal BACK_URL's host too, or it is not used.
 *   VC_ADMIN_TOKEN         a pre-minted admin bearer, used as-is (no refresh: a run that outlives it fails 401).
 *                          BOUND TO ONE STAND: its payload is decoded (not verified) and its `iss` host must
 *                          equal BACK_URL's host — otherwise init() aborts before any request.
 *   neither                seed-common auth() — the admin password grant (challenged while global MFA is on).
 *
 * LEDGER: every entity the creator makes (store, role, orgs, contacts, users, memberships) is appended to
 * <os.tmpdir()>/mfa-fixtures-<user>/ledger-<runId>.json AS IT IS CREATED (a user before its create call).
 * The directory is per OS user, created 0700, and refused when it is not owned by the current uid or is
 * group/world-writable (POSIX); ledger + handle files are written 0600. The ledger is still NOT trusted:
 * teardown re-verifies every entry against the platform (run-marker email, AGENT-TEST-MFA-<runId> name or
 * outerId, the derived role/store id, memberships only between verified users and verified orgs) and an
 * entry that fails is REFUSED — not deleted, reported, and the exit code is non-zero. Teardown deletes the
 * verified union of the ledger and the run-marker searches, and the residue check reads every id back by
 * GET — never through the search index — counting an unreadable entity as residue, never as gone.
 *
 * SAFETY: assertSafeTarget (ENV_RISK=production aborts). Never writes MultiFactorAuthentication.Enabled
 * and never writes a store this module did not create (setMfaStoreMode refuses any other id). Never
 * types a wrong password for any account; the only grants it sends are for accounts it created, with
 * the password it set. Teardown deletes only entities this run created or whose email/name carries the run marker.
 */
import "../../lib/sync-stdio.mjs";
import { writeFileSync, mkdirSync, readFileSync, existsSync, lstatSync, chmodSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir, userInfo } from 'node:os';
import { assertSafeTarget, auth, useToken, api as rawApi, log, DRY_RUN, STORE_ID, BACK_URL } from '../../lib/seed-common.mjs';
import { findUserByEmail, searchMemberships } from '../../lib/user-provision.mjs';
import {
  KINDS, KIND_NAMES, PASSWORD_VAR, STORE_MODE_SETTING, STORE_MODES, MFA_NOTIFICATION_TYPE, MEMBERSHIP_STATUSES,
  ORG_ROLE_MEMBER, BACKOFFICE_PERMISSIONS, PREFIX, assertRunId, newRunId, storeIdFor, roleNameFor, orgNameFor,
  runMarker, emailFor, isRunEmail, isRunName, storeBody, storeModeOf, contactBody, accountBody, accountProblems,
  extractCode, pickLatestRow, jwtClaims, hostOf, issHostOf, parseRefreshFile, refreshFileBody,
} from './mfa-fixtures-specs.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ORG_ROLE_NAMES = { 'org-employee': 'Organization employee', 'org-maintainer': 'Organization maintainer' };
let _ready = false;

/* ── private per-user temp dir (ledger + handles) ────────────────────────────── */

const POSIX = typeof process.getuid === 'function';
function ownerTag() {
  let n = '';
  try { n = userInfo().username; } catch { /* no passwd entry */ }
  n = String(n || '').replace(/[^A-Za-z0-9._-]/g, '');
  return n || String(POSIX ? process.getuid() : 'user');
}
/** Per OS user: a shared /tmp/mfa-fixtures could be pre-created (and a ledger planted) by another local user. */
const TMP_ROOT = join(tmpdir(), `mfa-fixtures-${ownerTag()}`);

/**
 * Refuse a path another local user could have planted or can write: a symlink, the wrong kind, and on
 * POSIX a different owner or any group/world write bit. (Windows: os.tmpdir() is the per-user %TEMP%.)
 */
function assertPrivate(path, { dir = false } = {}) {
  const st = lstatSync(path);
  const why = st.isSymbolicLink() ? 'is a symlink'
    : dir && !st.isDirectory() ? 'is not a directory'
      : !dir && !st.isFile() ? 'is not a regular file'
        : POSIX && st.uid !== process.getuid() ? `is owned by uid ${st.uid}, not ${process.getuid()}`
          : POSIX && (st.mode & 0o022) ? `is group/world-writable (mode ${(st.mode & 0o777).toString(8)})`
            : null;
  if (why) throw new Error(`refusing ${path}: it ${why} — another local user could have planted or altered it`);
}
function privateDir() {
  mkdirSync(TMP_ROOT, { recursive: true, mode: 0o700 });
  assertPrivate(TMP_ROOT, { dir: true });
  return TMP_ROOT;
}
/** 0600 on create; an existing file is re-chmodded on POSIX (mode is ignored by writeFileSync then). */
function writePrivate(path, text) {
  writeFileSync(path, text, { mode: 0o600 });
  if (POSIX) chmodSync(path, 0o600);
}
/** Read a JSON file we wrote — after checking nobody else could have. */
function readPrivateJson(path) {
  if (resolve(dirname(path)) === resolve(TMP_ROOT)) privateDir();
  assertPrivate(path);
  return JSON.parse(readFileSync(path, 'utf8'));
}

/* ── admin auth ──────────────────────────────────────────────────────────────── */

/** Re-mint this long before the bearer's expires_in, and never sooner than the floor. */
const REMINT_LEAD_MS = 120000;
const REMINT_FLOOR_MS = 30000;
let _refreshFile = null;
let _minting = null;
let _remintTimer = null;

/**
 * Mint the admin bearer from the refresh token in VC_ADMIN_REFRESH_FILE. The rotated refresh_token is
 * written back BEFORE anything else (the one just sent is spent). Concurrent callers share one mint.
 * Never prints a token; on failure there is NO password-grant fallback.
 */
/** The host BACK_URL names — the ONLY host an admin credential may be sent to. */
function standHost() {
  const h = hostOf(BACK_URL);
  if (!h) throw new Error('BACK_URL is not set — refusing to send an admin credential anywhere (nothing was sent)');
  return h;
}
/** Abort, before any request, unless `host` (where a credential was minted) is the stand BACK_URL names. */
function assertBoundToStand(what, host) {
  const want = standHost();
  if (host !== want) {
    throw new Error(`${what} is bound to "${host || '(no host)'}" but TEST_ENV=${process.env.TEST_ENV || 'vcst'} resolves BACK_URL to ${want}`
      + ' — refusing to send an admin credential to another stand (nothing was sent)');
  }
}

function mintFromRefreshFile() {
  if (_minting) return _minting;
  _minting = (async () => {
    const { host, refreshToken: rt } = parseRefreshFile(readFileSync(_refreshFile, 'utf8'));
    if (!rt) throw new Error(`VC_ADMIN_REFRESH_FILE (${_refreshFile}) holds no refresh token`);
    if (host) assertBoundToStand(`VC_ADMIN_REFRESH_FILE (${_refreshFile})`, host);
    else {
      // Legacy bare token: the file says nothing about where it was minted, so the operator must.
      if (!process.env.VC_ADMIN_REFRESH_HOST) {
        throw new Error(`VC_ADMIN_REFRESH_FILE (${_refreshFile}) holds a bare refresh token with no host — set VC_ADMIN_REFRESH_HOST=<the host it was minted on>`
          + ' for this first use (the file is rewritten as {"host","refresh_token"} after it succeeds); nothing was sent');
      }
      assertBoundToStand('VC_ADMIN_REFRESH_HOST', hostOf(process.env.VC_ADMIN_REFRESH_HOST));
    }
    const boundHost = standHost();
    const res = await fetch(`${BACK_URL}/connect/token`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: rt }),
      signal: AbortSignal.timeout(60000),
    });
    let body = null;
    try { body = await res.json(); } catch { /* non-JSON */ }
    // Written back FIRST and bound to the host that just issued it (a legacy bare file becomes JSON here).
    if (body?.refresh_token) writePrivate(_refreshFile, refreshFileBody(boundHost, body.refresh_token));
    if (!res.ok || !body?.access_token) {
      throw new Error(`admin refresh_token grant → ${res.status} ${body?.error ?? ''} ${body?.error_description ?? ''}`.trim()
        + ' — no admin password grant is attempted while VC_ADMIN_REFRESH_FILE is set; put a fresh admin refresh token in the file');
    }
    assertBoundToStand('the minted admin bearer (iss)', issHostOf(body.access_token));
    useToken(body.access_token);
    const ttlMs = Number(body.expires_in) > 0 ? Number(body.expires_in) * 1000 : 0;
    if (_remintTimer) clearTimeout(_remintTimer);
    _remintTimer = null;
    if (ttlMs) {
      const inMs = Math.max(REMINT_FLOOR_MS, ttlMs - REMINT_LEAD_MS);
      _remintTimer = setTimeout(() => { mintFromRefreshFile().catch((e) => log(`admin re-mint failed: ${e.message}`)); }, inMs);
      _remintTimer.unref();
    }
    log(`Auth: admin bearer from VC_ADMIN_REFRESH_FILE (refresh token rotated: ${body.refresh_token ? 'yes' : 'no'}; expires_in ${body.expires_in ?? '?'}s)`);
  })().finally(() => { _minting = null; });
  return _minting;
}

/**
 * seed-common's api() with ONE retry after a re-mint on a 401 — only when a refresh file is set (a
 * pre-minted VC_ADMIN_TOKEN cannot be renewed, so its 401 surfaces as before). A 401 means the request
 * was not executed, so retrying a write is safe.
 */
async function api(method, path, body = null, opts = {}) {
  try {
    return await rawApi(method, path, body, opts);
  } catch (e) {
    if (!_refreshFile || !/ → 401:/.test(String(e?.message))) throw e;
    log(`401 on ${method} ${path} — re-minting the admin bearer and retrying once`);
    await mintFromRefreshFile();
    return rawApi(method, path, body, opts);
  }
}

/**
 * ONE admin bearer per process (ADMIN AUTH in the header). A refresh file or VC_ADMIN_TOKEN (minted
 * before a global-MFA window) wins over a password grant: with MultiFactorAuthentication.Enabled on, the
 * admin password grant itself answers two_factor_required and its code is only in the journal, which
 * needs an admin token. Measured on vcst 2026-10-23 — a creator run straddling the window could not
 * re-authenticate.
 */
export async function init() {
  if (_ready) return;
  assertSafeTarget();
  _refreshFile = process.env.VC_ADMIN_REFRESH_FILE || null;
  if (_refreshFile) await mintFromRefreshFile();
  else if (process.env.VC_ADMIN_TOKEN) {
    assertBoundToStand('VC_ADMIN_TOKEN (iss)', issHostOf(process.env.VC_ADMIN_TOKEN));
    useToken(process.env.VC_ADMIN_TOKEN);
    log('Auth: reusing VC_ADMIN_TOKEN (no refresh; iss bound to BACK_URL)');
  }
  else await auth();
  _ready = true;
}

/**
 * user-provision.mjs helpers, called with THIS module's api() (refreshing bearer, 401 retry) passed
 * explicitly: nothing in that library is swapped, so concurrent callers cannot affect each other.
 * findUser: search first, then GET-by-name; errors read as "not found" — fine for a lookup, never for a residue check.
 */
const findUser = (email) => findUserByEmail(email, { api });
const userMemberships = (userId) => searchMemberships(userId, { api });

function password() {
  const p = process.env[PASSWORD_VAR];
  if (!p && !DRY_RUN) throw new Error(`${PASSWORD_VAR} is not set (resolve through .env.local) — refusing to create an account with a fallback password`);
  return p;
}

/* ── run ledger ──────────────────────────────────────────────────────────────── */

export const ledgerPathFor = (runId) => join(TMP_ROOT, `ledger-${assertRunId(runId)}.json`);
/** The ledger as written — owner/mode-checked, but NOT trusted: teardown re-verifies every entry. */
export function readLedger(runId) {
  const p = ledgerPathFor(runId);
  return existsSync(p) ? readPrivateJson(p) : { runId, entries: [] };
}
function writeLedger(runId, l) {
  privateDir();
  writePrivate(ledgerPathFor(runId), `${JSON.stringify(l, null, 2)}\n`);
}
/** Append (or enrich) one entity of the run. `key` = the platform id, or the lower-cased userName for a user. */
function record(runId, type, key, extra = {}) {
  if (DRY_RUN || !key) return;
  const l = readLedger(runId);
  const hit = l.entries.find((e) => e.type === type && e.key === key);
  if (hit) Object.assign(hit, extra);
  else l.entries.push({ type, key, ...extra, at: new Date().toISOString() });
  writeLedger(runId, l);
}

/* ── store defaults: a contact's currency + language come from its bound store ── */

const _storeDefaults = new Map();
/** { currencyCode, defaultLanguage } of a store — read ONCE per process per store, never transcribed. */
function storeDefaults(storeId) {
  if (!_storeDefaults.has(storeId)) {
    _storeDefaults.set(storeId, (async () => {
      const s = await api('GET', `/api/stores/${encodeURIComponent(storeId)}`, null, { expectStatus: [200, 204, 404] });
      if (!s?.id && DRY_RUN && storeId !== STORE_ID) return storeDefaults(STORE_ID); // a dry run never created the run's store
      if (!s?.id) throw new Error(`store ${storeId} not found — a contact's currency and language are read from the store its account is bound to`);
      if (!s.defaultCurrency || !s.defaultLanguage) throw new Error(`store ${storeId} has no defaultCurrency/defaultLanguage to give the contact`);
      return { currencyCode: s.defaultCurrency, defaultLanguage: s.defaultLanguage };
    })().catch((e) => { _storeDefaults.delete(storeId); throw e; }));
  }
  return _storeDefaults.get(storeId);
}

/* ── store ───────────────────────────────────────────────────────────────────── */

export async function createMfaStore(runId, { mode = 'Enabled', sourceStoreId = STORE_ID } = {}) {
  await init();
  const id = storeIdFor(runId);
  const existing = await api('GET', `/api/stores/${encodeURIComponent(id)}`, null, { expectStatus: [200, 204, 404] });
  if (existing?.id) { record(runId, 'store', id); await setMfaStoreMode(runId, mode); return { id, mode, reused: true }; }
  const source = await api('GET', `/api/stores/${encodeURIComponent(sourceStoreId)}`);
  if (!source?.id) throw new Error(`source store ${sourceStoreId} not found`);
  await api('POST', '/api/stores', storeBody(runId, source, mode), { expectStatus: [200, 201, 204] });
  record(runId, 'store', id);
  const back = await readStoreMode(id);
  if (!DRY_RUN && back !== (mode ?? null)) {
    // Create may drop settings on some builds — write it explicitly, then re-read.
    await setMfaStoreMode(runId, mode);
  }
  log(`✓ store ${id} (catalog ${source.catalog}, ${source.currencies?.length} currencies, ${source.languages?.length} languages) StoreMode=${JSON.stringify(await readStoreMode(id))}`);
  return { id, mode, sourceStoreId };
}

export async function readStoreMode(storeId) {
  const s = await api('GET', `/api/stores/${encodeURIComponent(storeId)}`, null, { expectStatus: [200, 204, 404] });
  return s?.id ? storeModeOf(s) : undefined;
}

/** Our store ONLY. A full-store PUT is safe here because the store is ours (never a shared one). */
export async function setMfaStoreMode(runId, mode) {
  await init();
  if (mode !== null && !STORE_MODES.includes(mode)) throw new Error(`StoreMode "${mode}" not in ${STORE_MODES.join(' / ')}`);
  const id = storeIdFor(runId); // derived here, never taken from a caller: this can only ever be the run's own store
  const store = await api('GET', `/api/stores/${encodeURIComponent(id)}`);
  if (!store?.id) throw new Error(`store ${id} does not exist`);
  const others = (store.settings || []).filter((s) => s.name !== STORE_MODE_SETTING);
  // Omitting the setting does not clear it, and null never clears an override — "" does (measured
  // 2026-10-23: dropping it from the PUT left "Disabled" in place).
  store.settings = [...others, { name: STORE_MODE_SETTING, valueType: 'ShortText', value: mode ?? '', objectType: 'Store', objectId: id }];
  await api('PUT', '/api/stores', store, { expectStatus: [200, 204] });
  const back = await readStoreMode(id);
  if (!DRY_RUN && back !== mode) throw new Error(`StoreMode on ${id} reads ${JSON.stringify(back)} after writing ${JSON.stringify(mode)}`);
  return back;
}

/* ── accounts ────────────────────────────────────────────────────────────────── */

async function ensureBackofficeRole(runId) {
  const id = roleNameFor(runId);
  await api('PUT', '/api/platform/security/roles', { id, name: id, permissions: BACKOFFICE_PERMISSIONS.map((name) => ({ name })) }, { expectStatus: [200, 201, 204] });
  record(runId, 'role', id);
  return { id, name: id };
}

async function ensureOrg(runId, tag) {
  const name = orgNameFor(runId, tag);
  const created = await api('POST', '/api/members', { memberType: 'Organization', name, status: 'Approved', outerId: `${PREFIX}:${runId}:${tag}` }, { expectStatus: [200, 201] });
  if (!created?.id) throw new Error(`POST /api/members org ${name} returned no id`);
  record(runId, 'org', created.id, { name });
  return { id: created.id, name };
}

/** The membership row of `userId` in `orgId`, read back — never taken from a POST body, which may be empty. */
async function readMembership(userId, orgId, { tries = 3 } = {}) {
  for (let i = 0; i < tries; i++) {
    const m = (await userMemberships(userId)).find((x) => x.organizationId === orgId);
    if (m?.id) return m;
    if (i < tries - 1) await sleep(1000);
  }
  return null;
}

/** One membership row per org, with its org-scoped role (find-or-create; POST does not link contact.organizations — the contact was created with them). */
async function ensureMemberships(runId, userId, orgs, roleId) {
  const live = await userMemberships(userId);
  const out = [];
  for (const o of orgs) {
    let m = live.find((x) => x.organizationId === o.id);
    if (!m) {
      const posted = await api('POST', '/api/customer/organization-memberships', {
        userId, organizationId: o.id, organizationName: o.name, roles: [{ roleId, roleName: ORG_ROLE_NAMES[roleId] }], isLocked: false,
      }, { expectStatus: [200, 201, 204] });
      m = await readMembership(userId, o.id);
      if (!m?.id) {
        throw new Error(`FIXTURE-GAP: no membership of user ${userId} in ${o.name} (${o.id}) can be read back after POST /api/customer/organization-memberships`
          + ` (it answered ${posted ? `a body${posted.id ? ` with id ${posted.id}` : ' without an id'}` : 'no body'}) — the account would carry no org role`);
      }
    }
    if (!(m.roles || []).some((r) => (r.roleId || r.id) === roleId)) {
      throw new Error(`FIXTURE-GAP: membership ${m.id} of user ${userId} in ${o.name} reads roles ${JSON.stringify((m.roles || []).map((r) => r.roleId || r.id))}, expected ${roleId}`);
    }
    record(runId, 'membership', m.id, { userId, organizationId: o.id });
    out.push({ id: m.id, organizationId: o.id, organizationName: o.name, role: roleId });
  }
  return out;
}

async function createOneAccount({ runId, kind, email, storeId, orgs = [], roles = [] }) {
  const k = KINDS[kind];
  if (!k) throw new Error(`unknown kind ${kind}`);
  if (await findUser(email)) throw new Error(`${email} already exists — a runId is single-use`);
  let contactId = null;
  if (k.hasContact) {
    // Currency + language of the store the account is bound to; a store-less kind takes {{STORE_ID}}'s.
    const defaults = await storeDefaults(storeId || STORE_ID);
    const c = await api('POST', '/api/members', contactBody({ email, runId, kind, orgIds: orgs.map((o) => o.id), defaults }), { expectStatus: [200, 201] });
    if (!c?.id) throw new Error(`contact for ${email}: no id`);
    contactId = c.id;
    record(runId, 'contact', contactId, { email });
  }
  // Ledgered BEFORE the call: a create that commits and then errors must still be torn down.
  record(runId, 'user', email.toLowerCase(), { contactId });
  const body = accountBody({ email, kind, password: password(), memberId: contactId, storeId, roles });
  const res = await api('POST', '/api/platform/security/users/create', body, { expectStatus: [200, 201] });
  if (res && res.succeeded === false) throw new Error(`users/create ${email}: ${JSON.stringify(res.errors)}`);
  const user = DRY_RUN ? { id: '' } : await findUser(email); // users/create returns no id (KB-60601EDD)
  if (!DRY_RUN && !user?.id) throw new Error(`created ${email} but the users search cannot find it`);
  record(runId, 'user', email.toLowerCase(), { userId: user?.id });
  return { user, contactId, createResponse: res };
}

/**
 * Re-assert flags users/create may have ignored, with a full-entity PUT, and report which ones the
 * platform still refuses (FIXTURE-GAP) with the exact response.
 */
async function enforceFlags(kind, user) {
  const before = accountProblems(kind, user);
  if (!before.length || DRY_RUN) return { problems: before, gap: null };
  const k = KINDS[kind];
  const stored = await api('GET', `/api/platform/security/users/id/${encodeURIComponent(user.id)}`, null, { expectStatus: [200, 204, 404] });
  const full = { ...(stored?.id ? stored : user), emailConfirmed: k.emailConfirmed, lockoutEnabled: k.lockoutEnabled, twoFactorEnabled: k.twoFactorEnabled };
  delete full.password; delete full.passwordHash;
  let putResponse;
  try { putResponse = await api('PUT', '/api/platform/security/users', full, { expectStatus: [200, 204] }); }
  catch (e) { putResponse = { error: e.message }; }
  const after = accountProblems(kind, await findUser(user.userName));
  return { problems: after, gap: after.length ? { afterCreate: before, put: putResponse ?? '(204 no body)', afterPut: after } : null, createDropped: before };
}

export async function createMfaAccount({ runId, store, kind, n = 0 }) {
  await init();
  assertRunId(runId);
  const k = KINDS[kind];
  if (!k) throw new Error(`unknown kind ${kind} (one of ${KIND_NAMES.join(', ')})`);
  const storeId = k.storeScope === 'none' ? null : k.storeScope === 'b2b' ? (store?.b2bStoreId || STORE_ID) : (store?.id || store);
  if (k.storeScope === 'mfa' && !storeId) throw new Error(`${kind} is bound to the run's MFA store — pass store (createMfaStore's result)`);
  const email = emailFor(runId, kind, n);
  if (await findUser(email)) throw new Error(`${email} already exists — a runId is single-use (nothing was created)`);
  const roles = k.backofficeRole ? [await ensureBackofficeRole(runId)] : [];
  const orgs = [];
  if (k.orgs >= 1) orgs.push(await ensureOrg(runId, `${kind}${n ? `-${n}` : ''}-A`));
  if (k.orgs >= 2) orgs.push(await ensureOrg(runId, `${kind}${n ? `-${n}` : ''}-B`));

  const { user, contactId } = await createOneAccount({ runId, kind, email, storeId, orgs, roles });
  const flags = await enforceFlags(kind, user);
  if (roles.length && !DRY_RUN) {
    const stored = await api('GET', `/api/platform/security/users/id/${encodeURIComponent(user.id)}`, null, { expectStatus: [200, 204, 404] });
    const held = (stored?.roles || []).map((r) => r.id || r.name);
    const missing = roles.filter((r) => !held.includes(r.id) && !held.includes(r.name)).map((r) => r.name);
    if (missing.length) flags.gap = { ...(flags.gap || {}), rolesMissing: missing, rolesHeld: held };
  }
  const out = { kind, email, userId: user?.id || '', contactId, storeId, roles: roles.map((r) => r.id), passwordVar: PASSWORD_VAR, orgs, memberships: [] };
  if (orgs.length && !DRY_RUN) out.memberships = await ensureMemberships(runId, user.id, orgs, k.orgRole || ORG_ROLE_MEMBER);
  if (orgs.length === 2 && !DRY_RUN) await setContactOrganization(contactId, { current: orgs[0].id });
  if (k.targetKind && !DRY_RUN) {
    // The pair's other side (KINDS[k.targetKind].sibling === kind), in the SAME orgs on the SAME store.
    const tk = KINDS[k.targetKind];
    const temail = emailFor(runId, k.targetKind, n);
    const t = await createOneAccount({ runId, kind: k.targetKind, email: temail, storeId, orgs });
    out.target = { kind: k.targetKind, email: temail, userId: t.user.id, contactId: t.contactId, memberships: await ensureMemberships(runId, t.user.id, orgs, tk.orgRole || ORG_ROLE_MEMBER) };
  }
  if (flags.gap) out.fixtureGap = flags.gap;
  else if (flags.createDropped?.length) out.note = `users/create dropped [${flags.createDropped.join('; ')}]; a full PUT set it`;
  log(`${flags.gap ? '✗ FIXTURE-GAP' : '✓'} ${kind}: ${email} user=${out.userId} contact=${contactId ?? '-'} store=${storeId ?? '-'}${orgs.length ? ` orgs=${orgs.map((o) => o.name).join(',')}` : ''}${out.note ? ` (${out.note})` : ''}`);
  return out;
}

/* ── memberships / current org ───────────────────────────────────────────────── */

const getMembership = (id) => api('GET', `/api/customer/organization-memberships/${encodeURIComponent(id)}`, null, { expectStatus: [200, 404] });

/** Lock a membership (`lockoutEnd` null = permanent). Read back — a 200 with a null body means the id was unknown. */
export async function lockMembership(id, lockoutEnd = null) {
  await init();
  await api('POST', `/api/customer/organization-memberships/${encodeURIComponent(id)}/lock`, { lockoutEnd }, { expectStatus: [200, 201, 204] });
  const m = await getMembership(id);
  if (!DRY_RUN && !m?.isLocked) throw new Error(`membership ${id}: lock did not land`);
  return m;
}
export async function unlockMembership(id) {
  await init();
  await api('POST', `/api/customer/organization-memberships/${encodeURIComponent(id)}/unlock`, null, { expectStatus: [200, 201, 204] });
  const m = await getMembership(id);
  if (!DRY_RUN && m?.isLocked) throw new Error(`membership ${id}: unlock did not land`);
  return m;
}
/** PUT is a full replace, so the read row is sent back with only status changed. */
export async function setMembershipStatus(id, status) {
  await init();
  if (status !== null && !MEMBERSHIP_STATUSES.includes(status)) throw new Error(`status "${status}" not in ${MEMBERSHIP_STATUSES.join('/')}`);
  const m = await getMembership(id);
  if (!m?.id) throw new Error(`membership ${id} not found`);
  await api('PUT', `/api/customer/organization-memberships/${encodeURIComponent(id)}`, { ...m, status }, { expectStatus: [200, 204] });
  const back = await getMembership(id);
  if (!DRY_RUN && (back?.status ?? null) !== status) throw new Error(`membership ${id}: status reads ${back?.status}, wrote ${status}`);
  return back;
}
/** The contact's current (last-used) and/or default organization. Read back. */
export async function setContactOrganization(contactId, { current, default: def } = {}) {
  await init();
  const c = await api('GET', `/api/members/${encodeURIComponent(contactId)}`);
  if (!c?.id) throw new Error(`contact ${contactId} not found`);
  if (current !== undefined) c.currentOrganizationId = current;
  if (def !== undefined) c.defaultOrganizationId = def;
  await api('PUT', '/api/members', c, { expectStatus: [200, 204] });
  const back = await api('GET', `/api/members/${encodeURIComponent(contactId)}`);
  if (!DRY_RUN && current !== undefined && back?.currentOrganizationId !== current) throw new Error(`contact ${contactId}: currentOrganizationId reads ${back?.currentOrganizationId}`);
  return { currentOrganizationId: back?.currentOrganizationId ?? null, defaultOrganizationId: back?.defaultOrganizationId ?? null };
}

/* ── journal ─────────────────────────────────────────────────────────────────── */

export async function journalRows(email, take = 20) {
  const r = await api('POST', '/api/notifications/journal', { notificationType: MFA_NOTIFICATION_TYPE, keyword: email, sort: 'createdDate:desc', take });
  return r?.results || [];
}

/** Newest MfaSignInEmailNotification for the recipient (SendGrid may be out of credits: status Error, body still rendered). */
export async function readLatestMfaCode({ email, userId, after = null, excludeIds = [], timeoutMs = 90000, intervalMs = 1500 } = {}) {
  await init();
  if (!email && userId) {
    const u = await api('GET', `/api/platform/security/users/id/${encodeURIComponent(userId)}`, null, { expectStatus: [200, 204, 404] });
    email = u?.email;
  }
  if (!email) throw new Error('readLatestMfaCode: email or a resolvable userId is required');
  const t0 = Date.now();
  for (;;) {
    const row = pickLatestRow(await journalRows(email), { email, after, excludeIds });
    if (row) {
      const code = extractCode(row.body);
      if (code) return { code, createdDate: row.createdDate, status: row.status, id: row.id, latencyMs: Date.now() - t0 };
    }
    if (Date.now() - t0 > timeoutMs) return null;
    await sleep(intervalMs);
  }
}

/* ── raw grants (anonymous; for accounts this module created) ─────────────────── */

async function tokenCall(params) {
  if (DRY_RUN) { log(`[DRY RUN] POST /connect/token grant_type=${params.grant_type}`); return { status: 0, body: { _dryRun: true }, at: new Date().toISOString() }; }
  const res = await fetch(`${BACK_URL}/connect/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ''))),
    signal: AbortSignal.timeout(60000),
  });
  let body = null;
  try { body = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, body, at: new Date().toISOString() };
}
export const passwordGrant = ({ username, password: pw, storeId, scope = 'offline_access', ...extra }) =>
  tokenCall({ grant_type: 'password', username, password: pw, storeId, scope, ...extra });
export const mfaGrant = ({ twoFactorToken, code, storeId, organizationId, scope = 'offline_access' }) =>
  tokenCall({ grant_type: 'mfa', two_factor_token: twoFactorToken, code, storeId, organization_id: organizationId, scope });

/* ── teardown ────────────────────────────────────────────────────────────────── */

/** null = gone; otherwise the residue label. An entity that cannot be read is residue, never "gone". */
async function stillThere(label, path, http = api) {
  try {
    const r = await http('GET', path, null, { expectStatus: [200, 204, 404] });
    return r?.id ? label : null;
  } catch (e) {
    return `${label} (unreadable: ${String(e?.message).slice(0, 160)})`;
  }
}

/**
 * A platform user read BY ID: { state: 'present', user } | { state: 'gone' } | { state: 'unreadable', why }.
 * Measured on vcst-qa 2026-10-26: GET /api/platform/security/users/id/{id} for a nonexistent id answers
 * 200 with the JSON body `null` — so "gone" is exactly that body (or a 204/404), confirmed by a second
 * raw read because api() also returns null for a non-JSON 200. Anything else — an error, an empty or
 * non-JSON 200, a user whose id is not the one asked for — is "unreadable", never "gone".
 */
async function readUserById(id, http = api) {
  const path = `/api/platform/security/users/id/${encodeURIComponent(id)}`;
  const statusOf = (e) => (/ → (d{3}):/.exec(String(e?.message)) || [])[1];
  let u;
  try { u = await http('GET', path, null, { expectStatus: [200] }); } catch (e) {
    return ['204', '404'].includes(statusOf(e)) ? { state: 'gone' } : { state: 'unreadable', why: String(e?.message).slice(0, 160) };
  }
  if (u?.id === id) return { state: 'present', user: u };
  if (u !== null) return { state: 'unreadable', why: `200 without user ${id}` };
  try { await http('GET', path, null, { expectStatus: [] }); } catch (e) {
    if (/ → 200: nulls*$/.test(String(e?.message))) return { state: 'gone' };
    return { state: 'unreadable', why: `200 with a non-JSON or empty body (${String(e?.message).slice(0, 120)})` };
  }
  return { state: 'unreadable', why: '200 with an unconfirmable body' };
}

/** Residue label for a user known by id; null only when readUserById reads it as gone. */
async function userStillThere(label, id, http = api) {
  const r = await readUserById(id, http);
  if (r.state === 'gone') return null;
  return r.state === 'present' ? label : `${label} (unreadable: ${r.why})`;
}

/**
 * What teardown WOULD delete, every entity re-verified against the platform — the ledger is a list of
 * candidates, never an authority (a planted or edited ledger must not turn into an admin delete):
 *   account     its userName carries the run marker (isRunEmail), looked up by name (search, then GET); a
 *               ledger userId that is not that account's id is refused. When that lookup finds nothing but
 *               an id was claimed (ledger or search), each id is read back BY ID: a run user there is
 *               verified and deleted; an unreadable id is refused (non-zero exit), never counted as gone;
 *   contact/org the member read back by GET is AGENT-TEST-MFA-<runId> by name/firstName or by outerId;
 *   role/store  exactly roleNameFor(runId) / storeIdFor(runId) — the only ids ever deleted;
 *   membership  read back by GET, between a verified run account AND a verified run org.
 * A ledger (or search) candidate that fails is returned in `refused` and is NOT deleted. One that no
 * longer exists is simply gone. `http` is injectable (a fake api proves the refusals without a stand).
 */
export async function planTeardown(runId, { api: http = api } = {}) {
  assertRunId(runId);
  const refused = [];
  const refuse = (what, why) => refused.push(`${what}: ${why}`);
  const get = (path) => http('GET', path, null, { expectStatus: [200, 204, 404] });
  const marker = runMarker(runId);
  const storeId = storeIdFor(runId);
  const role = roleNameFor(runId);
  const isRunMember = (m) => !!m && (isRunName(m.name, runId) || isRunName(m.firstName, runId) || String(m.outerId || '').startsWith(`${PREFIX}:${runId}:`));

  const ledger = readLedger(runId);
  let entries = Array.isArray(ledger.entries) ? ledger.entries : [];
  if (ledger.runId !== runId) {
    entries.forEach((e) => refuse(`ledger ${e?.type} ${e?.key}`, `the ledger file names run ${JSON.stringify(ledger.runId)}, not ${runId}`));
    entries = [];
  }
  const KNOWN = ['store', 'role', 'org', 'contact', 'user', 'membership'];
  entries.filter((e) => !KNOWN.includes(e?.type)).forEach((e) => refuse(`ledger ${e?.type} ${e?.key}`, 'unknown entry type'));
  const led = (type) => entries.filter((e) => e?.type === type && e.key);
  led('store').filter((e) => e.key !== storeId).forEach((e) => refuse(`ledger store ${e.key}`, `not the run's store ${storeId}`));
  led('role').filter((e) => e.key !== role).forEach((e) => refuse(`ledger role ${e.key}`, `not the run's role ${role}`));

  // ── accounts: run-marker name, read back by name; a claimed id must be that account's ──
  const claimed = new Map(); // userName → [claimed ids]
  const claim = (name, id) => { if (!claimed.has(name)) claimed.set(name, []); if (id) claimed.get(name).push(id); };
  for (const e of led('user')) {
    const name = String(e.key).toLowerCase();
    if (!isRunEmail(name, runId)) refuse(`ledger account ${e.key}`, `not a ${marker}… address`);
    else claim(name, e.userId);
  }
  const searched = ((await http('POST', '/api/platform/security/users/search', { keyword: marker, take: 100 }))?.results || [])
    .filter((u) => isRunEmail(u.userName, runId));
  for (const u of searched) claim(String(u.userName).toLowerCase(), u.id);
  const users = new Map(); // verified userName → userId | null (null = already gone)
  const userResidueIds = new Map(); // userName → ids the residue check reads back BY ID (never by name)
  const contactCandidates = new Map(led('contact').map((e) => [e.key, 'ledger']));
  for (const [name, ids] of claimed) {
    let u = await findUserByEmail(name, { api: http });
    if (!u?.id) {
      // findUserByEmail reads a search/GET error as "not found", and its by-name GET is cache-flaky —
      // so a miss is not proof of "gone" while an id was ever claimed. Read every claimed id BY ID.
      const unread = [];
      for (const id of [...new Set(ids)]) {
        const r = await readUserById(id, http);
        if (r.state === 'gone') { unread.push(id); continue; }
        if (r.state === 'unreadable') { unread.push(id); refuse(`account ${name} id ${id}`, `the lookup found nothing and GET by id is unreadable (${r.why}) — not counted as gone`); continue; }
        const nm = String(r.user.userName || '').toLowerCase();
        if (nm !== name || !isRunEmail(r.user.userName, runId)) { refuse(`ledger account ${name} id ${id}`, `that id is ${r.user.userName}, not this run's account`); continue; }
        u = r.user;
      }
      if (!u?.id) { users.set(name, null); if (unread.length) userResidueIds.set(name, unread); continue; }
    }
    if (String(u.userName || '').toLowerCase() !== name) { refuse(`account ${name}`, `the account found is ${u.userName}, not this run's`); continue; }
    users.set(name, u.id);
    userResidueIds.set(name, [u.id]);
    ids.filter((id) => id !== u.id).forEach((id) => refuse(`ledger account ${name} id ${id}`, `${name} is ${u.id} — the claimed id is not deleted or searched`));
    if (u.memberId && !contactCandidates.has(u.memberId)) contactCandidates.set(u.memberId, `account ${name}`);
  }
  const userIds = new Set([...users.values()].filter(Boolean));

  // ── contacts + orgs: read back by GET, kept only when the member itself carries the run marker ──
  const cs = await http('POST', '/api/members/search', { memberType: 'Contact', keyword: `${PREFIX}-${runId}`, deepSearch: true, take: 100 });
  (cs?.results || []).filter(isRunMember).forEach((c) => { if (!contactCandidates.has(c.id)) contactCandidates.set(c.id, 'search'); });
  const verifyMember = async (id, label) => {
    let m;
    try { m = await get(`/api/members/${encodeURIComponent(id)}`); } catch (e) { refuse(`${label} ${id}`, `unreadable, cannot be verified (${String(e?.message).slice(0, 120)})`); return null; }
    if (!m?.id) return 'gone';
    if (!isRunMember(m)) { refuse(`${label} ${id}`, `"${m.name ?? m.firstName ?? '?'}" is not an ${PREFIX}-${runId} entity`); return null; }
    return m;
  };
  const contactIds = new Set();
  const contacts = [];
  for (const [id, from] of contactCandidates) {
    const m = await verifyMember(id, `contact (${from})`);
    if (m && m !== 'gone') { contactIds.add(id); contacts.push(m); }
  }
  const orgCandidates = new Map(led('org').map((e) => [e.key, 'ledger']));
  const os = await http('POST', '/api/members/search', { memberType: 'Organization', keyword: `${PREFIX}-${runId}`, deepSearch: true, take: 100 });
  (os?.results || []).filter(isRunMember).forEach((o) => { if (!orgCandidates.has(o.id)) orgCandidates.set(o.id, 'search'); });
  const orgIds = new Set();
  for (const [id, from] of orgCandidates) {
    const m = await verifyMember(id, `org (${from})`);
    if (m && m !== 'gone') orgIds.add(id);
  }
  // A verified contact's other orgs are discovery, not claims: added only if THEY carry the marker.
  for (const c of contacts) {
    for (const oid of c.organizations || []) {
      if (orgIds.has(oid)) continue;
      try { if (isRunMember(await get(`/api/members/${encodeURIComponent(oid)}`))) orgIds.add(oid); } catch { /* not ours to judge */ }
    }
  }

  // ── memberships: read back, between a verified run account and a verified run org ──
  const owner = new Map(); // membership id → the verified user whose server-side search returned it
  const membershipCandidates = new Map(led('membership').map((e) => [e.key, 'ledger']));
  for (const uid of userIds) {
    for (const m of await searchMemberships(uid, { api: http })) {
      if (!m?.id) continue;
      owner.set(m.id, uid);
      if (!membershipCandidates.has(m.id)) membershipCandidates.set(m.id, `account ${uid}`);
    }
  }
  const membershipIds = new Set();
  for (const [id, from] of membershipCandidates) {
    let m;
    try { m = await get(`/api/customer/organization-memberships/${encodeURIComponent(id)}`); } catch (e) { refuse(`membership ${id} (${from})`, `unreadable, cannot be verified (${String(e?.message).slice(0, 120)})`); continue; }
    if (!m?.id) continue; // gone
    const uid = m.userId ?? owner.get(id) ?? null;
    if (!orgIds.has(m.organizationId)) refuse(`membership ${id} (${from})`, `organization ${m.organizationId} is not a verified ${PREFIX}-${runId} org`);
    else if (!uid || !userIds.has(uid)) refuse(`membership ${id} (${from})`, `user ${uid ?? '(unknown)'} is not a verified run account`);
    else membershipIds.add(id);
  }
  return { storeId, role, users, userResidueIds, contactIds, orgIds, membershipIds, refused, ledgerEntries: entries.length };
}

export async function teardown(runId, { api: injected = null } = {}) {
  assertSafeTarget();
  if (!injected) await init();
  const http = injected || api;
  assertRunId(runId);
  const p = await planTeardown(runId, { api: http });
  const { storeId, role, users, userResidueIds, contactIds, orgIds, membershipIds, refused } = p;
  refused.forEach((r) => log(`  REFUSED (not deleted) ${r}`));

  const del = (path) => http('DELETE', path, null, { expectStatus: [200, 204, 404] });
  for (const id of membershipIds) await del(`/api/customer/organization-memberships?ids=${encodeURIComponent(id)}`);
  // security delete query param is `names` (NOT userNames — that binds an empty array). Only verified run names.
  for (const [name, id] of users) if (id) await del(`/api/platform/security/users?names=${encodeURIComponent(name)}`);
  for (const id of contactIds) await del(`/api/members?ids=${encodeURIComponent(id)}`);
  for (const id of orgIds) await del(`/api/members?ids=${encodeURIComponent(id)}`);
  await del(`/api/platform/security/roles?ids=${encodeURIComponent(role)}`);
  await del(`/api/stores?ids=${encodeURIComponent(storeId)}`);
  log(`teardown ${runId}: ${membershipIds.size} membership(s), ${[...users.values()].filter(Boolean).length} account(s), ${contactIds.size} contact(s), ${orgIds.size} org(s), role, store (ledger: ${p.ledgerEntries} entries; refused: ${refused.length})`);

  if (DRY_RUN) return refused.length;
  // Residue: read EVERY id back by GET — not through the search index, and an error counts as residue.
  // Accounts: BY ID whenever an id was ever known (ledger, search or plan) — an error or an empty/garbled
  // 200 is residue. Only an account no id was ever known for falls back to the by-name read, which
  // user-provision documents as cache-flaky (200 + empty/stale body): there is no id to do better with.
  const userChecks = [];
  for (const [name] of users) {
    const ids = userResidueIds.get(name) || [];
    if (ids.length) ids.forEach((id) => userChecks.push([`account ${name} (${id})`, id]));
    else userChecks.push([`account ${name}`, null, `/api/platform/security/users/${encodeURIComponent(name)}`]);
  }
  const checks = [
    ...[...membershipIds].map((id) => [`membership ${id}`, `/api/customer/organization-memberships/${encodeURIComponent(id)}`]),
    ...userChecks.filter(([, id]) => !id).map(([label, , path]) => [label, path]),
    ...[...contactIds, ...orgIds].map((id) => [`member ${id}`, `/api/members/${encodeURIComponent(id)}`]),
    [`role ${role}`, `/api/platform/security/roles/${encodeURIComponent(role)}`],
    [`store ${storeId}`, `/api/stores/${encodeURIComponent(storeId)}`],
  ];
  const left = [];
  for (const [label, id] of userChecks.filter(([, i]) => i)) { const x = await userStillThere(label, id, http); if (x) left.push(x); }
  for (const [label, path] of checks) { const x = await stillThere(label, path, http); if (x) left.push(x); }
  left.forEach((x) => log(`  residual ${x}`));
  if (!left.length && !refused.length && existsSync(ledgerPathFor(runId))) writeLedger(runId, { ...readLedger(runId), tornDownAt: new Date().toISOString() });
  log(left.length === 0 ? `Teardown complete — zero residue (${checks.length + userChecks.filter(([, i]) => i).length} ids read back by GET).` : `WARN: ${left.length} residual entity/entities remain.`);
  if (refused.length) log(`ERROR: ${refused.length} ledger/search entr${refused.length === 1 ? 'y' : 'ies'} REFUSED and NOT deleted — they do not verify as run ${runId}; find out who wrote ${ledgerPathFor(runId)}.`);
  return left.length + refused.length;
}

/* ── CLI: live proof ─────────────────────────────────────────────────────────── */

/**
 * The end-to-end sign-in proof for one MFA account on one store: password grant → 400 two_factor_required
 * → code from the journal → grant_type=mfa → 200 with amr=mfa. Exported so a case can call it.
 */
export async function proveSignIn(storeId, email) {
  await init();
  const prior = (await journalRows(email)).map((r) => r.id);
  const g1 = await passwordGrant({ username: email, password: password(), storeId });
  const challengedAt = Date.now();
  const p = { at: g1.at, passwordGrant: { status: g1.status, error: g1.body?.error, code: g1.body?.code ?? g1.body?.error_description, hasTwoFactorToken: !!g1.body?.twoFactorToken, provider: g1.body?.provider, providers: g1.body?.providers, hasAccessToken: !!g1.body?.access_token } };
  log(`password grant → ${g1.status} ${JSON.stringify(p.passwordGrant)}`);
  if (!g1.body?.twoFactorToken) return p;
  const c = await readLatestMfaCode({ email, excludeIds: prior, timeoutMs: 45000 });
  p.journal = c ? { found: true, status: c.status, createdDate: c.createdDate, pollLatencySec: +((Date.now() - challengedAt) / 1000).toFixed(1), createdMinusGrantSec: +((new Date(c.createdDate) - new Date(g1.at)) / 1000).toFixed(1) } : { found: false };
  log(`journal → ${JSON.stringify(p.journal)}`);
  if (!c) return p;
  const g2 = await mfaGrant({ twoFactorToken: g1.body.twoFactorToken, code: c.code, storeId });
  const claims = jwtClaims(g2.body?.access_token);
  const amr = claims?.amr ?? g2.body?.amr ?? null;
  p.mfaGrant = { status: g2.status, error: g2.body?.error, code: g2.body?.code, hasAccessToken: !!g2.body?.access_token, hasRefreshToken: !!g2.body?.refresh_token, amr, amrHasMfa: [].concat(amr ?? []).includes('mfa') };
  log(`mfa grant → ${g2.status} ${JSON.stringify(p.mfaGrant)}`);
  return p;
}

async function prove(runId, handlePath) {
  const handle = { runId, env: process.env.TEST_ENV || 'vcst', created: new Date().toISOString(), passwordVar: PASSWORD_VAR, ledger: ledgerPathFor(runId), store: null, accounts: [], fixtureGaps: [], proof: {} };
  const store = await createMfaStore(runId, { mode: 'Enabled' });
  handle.store = { id: store.id, mode: await readStoreMode(store.id), sourceStoreId: store.sourceStoreId };
  const save = () => {
    if (resolve(dirname(handlePath)) === resolve(TMP_ROOT)) privateDir();
    else mkdirSync(dirname(handlePath), { recursive: true, mode: 0o700 });
    writePrivate(handlePath, `${JSON.stringify(handle, null, 2)}\n`);
  };

  const cc = await createMfaAccount({ runId, store, kind: 'customer-confirmed' });
  handle.accounts.push(cc); save();

  handle.proof = await proveSignIn(store.id, cc.email); save();

  // ── one of every other kind; a target kind is created BY its operator kind (targetKind), never alone ──
  const targetKinds = new Set(KIND_NAMES.map((k) => KINDS[k].targetKind).filter(Boolean));
  for (const kind of KIND_NAMES.filter((k) => k !== 'customer-confirmed' && !targetKinds.has(k))) {
    try {
      const a = await createMfaAccount({ runId, store, kind });
      handle.accounts.push(a);
      if (a.fixtureGap) handle.fixtureGaps.push({ kind, email: a.email, ...a.fixtureGap });
    } catch (e) {
      handle.fixtureGaps.push({ kind, error: e.message.slice(0, 600) });
      log(`✗ ${kind}: ${e.message.slice(0, 300)}`);
    }
    save();
  }
  // b2b-two-org: prove the membership helpers round-trip and restore (lock → unlock, Invited → Approved).
  const b2b = handle.accounts.find((a) => a.kind === 'b2b-two-org');
  if (b2b?.memberships?.[1]?.id) {
    const mid = b2b.memberships[1].id;
    const steps = {};
    try {
      steps.lock = (await lockMembership(mid, null))?.isLocked;
      steps.unlock = (await unlockMembership(mid))?.isLocked === false;
      steps.invited = (await setMembershipStatus(mid, 'Invited'))?.status;
      steps.restored = (await setMembershipStatus(mid, 'Approved'))?.status;
      steps.currentOrg = (await setContactOrganization(b2b.contactId, { current: b2b.orgs[0].id })).currentOrganizationId === b2b.orgs[0].id;
    } catch (e) { steps.error = e.message.slice(0, 300); }
    handle.proof.membershipHelpers = steps;
    log(`membership helpers → ${JSON.stringify(steps)}`);
  }
  save();
  log(`handle: ${handlePath}`);
  log(`ledger: ${handle.ledger}`);
  return handle;
}

/** Default handle: one file per run under the OS temp dir. */
const handlePathFor = (runId) => join(TMP_ROOT, `handle-${assertRunId(runId)}.json`);

async function main() {
  const argv = process.argv.slice(2);
  const val = (f) => (argv.includes(f) ? argv[argv.indexOf(f) + 1] : null);
  const runId = val('--run');
  if (!['--teardown', '--signin-proof', '--prove'].some((f) => argv.includes(f))) {
    console.log('usage: --prove [--run <id>] [--handle <path>] | --signin-proof [--handle <path>] | --teardown --run <id>');
    return;
  }
  await init();
  if (argv.includes('--teardown')) {
    if (!runId) throw new Error('--teardown needs --run <id>');
    if ((await teardown(runId)) > 0) process.exitCode = 1;
    return;
  }
  if (argv.includes('--signin-proof')) {
    if (!val('--handle') && !runId) throw new Error('--signin-proof needs --run <id> or --handle <path>');
    const handlePath = val('--handle') || handlePathFor(runId);
    const h = readPrivateJson(handlePath);
    // The handle is a file, not an authority: a password grant goes only to this run's own address on its own store.
    assertRunId(h.runId);
    if (runId && h.runId !== runId) throw new Error(`${handlePath} holds run ${h.runId}, not --run ${runId} — refusing to sign in`);
    const cc = (h.accounts || []).find((a) => a.kind === 'customer-confirmed');
    if (!cc) throw new Error(`${handlePath} has no customer-confirmed account to sign in with`);
    if (!isRunEmail(cc.email, h.runId)) throw new Error(`${handlePath} names ${cc.email}, which is not a ${runMarker(h.runId)}… address of run ${h.runId} — refusing to send a password grant for it`);
    h.proof = { ...h.proof, ...(await proveSignIn(storeIdFor(h.runId), cc.email)) };
    writePrivate(handlePath, `${JSON.stringify(h, null, 2)}\n`);
    return;
  }
  if (argv.includes('--prove')) {
    const id = runId || newRunId();
    const handlePath = val('--handle') || handlePathFor(id);
    if (existsSync(handlePath)) {
      const old = readPrivateJson(handlePath);
      if (old.runId && old.runId !== id) throw new Error(`${handlePath} holds run ${old.runId} — tear it down (--teardown --run ${old.runId}) or pass another --handle`);
    }
    await prove(id, handlePath);
    return;
  }
  console.log('usage: --prove [--run <id>] [--handle <path>] | --signin-proof [--handle <path>] | --teardown --run <id>');
}

// Run main() only when executed directly — importing the library must have no side effects beyond init().
if (String(process.argv[1] || '').replace(/\\/g, '/').endsWith('/auth/mfa-fixtures.mjs')) {
  main().catch((e) => { console.error('MFA FIXTURES FAILED:', e.message); process.exit(1); });
}
