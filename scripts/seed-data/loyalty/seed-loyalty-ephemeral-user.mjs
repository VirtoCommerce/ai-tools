/**
 * seed-loyalty-ephemeral-user.mjs — a per-run, genuinely ZERO-balance loyalty user.
 *
 * WHY THIS EXISTS: a loyalty balance cannot be reset. vc-module-loyalty exposes the operation log
 * READ-ONLY (no write/delete, no balance set/debit) — balances are mutated only internally by the
 * earn/redeem order pipeline. So the shared `LOYALTY_NOBAL_USER` fixture drifts UPWARD every time a
 * case places an order with it, and `MCO-E2E-002` places a real order in its own second half — the
 * case poisons its own fixture. Observed drift: seeded ~0 → 85 PTS (2026-06-24) → 1,044 PTS
 * (2026-08-05, accrued 7/13 + 7/14 + 7/25). At 1,044 PTS the dearest PTS catalog item (PTS344) can
 * no longer produce a shortfall at qty 1, so the case silently tested NOTHING while reporting PASS.
 *
 * The fix is a fresh account per run: loyalty balance is keyed on the security-account userId, and a
 * new account starts at 0. That makes an insufficient-balance case deterministic at qty 1 and removes
 * contention between parallel runners (see feedback_concurrent_runners_distinct_org_users_taskstop).
 *
 * DESIGN CONSTRAINTS (each one is load-bearing — see the /qa-fix conversation that produced this):
 *  - ONE shared password var, never a per-run random. Playwright's `--secrets` substitutes by NAME
 *    from a static dotenv and redacts the value; a generated password cannot live in that file and
 *    would be typed in plaintext into the transcript. Uses DEFAULT_TEST_PASSWORD, which is the var
 *    actually present in .env.playwright.local (see the password() note below).
 *  - Teardown is a PREFIX SWEEP, not an inline delete, because a crashed run leaks the account.
 *    `--teardown` removes every AGENT-TEST-loyzero-* account; `--max-age-hours N` keeps recent ones
 *    so a concurrent run isn't torn down underneath itself.
 *  - Deleting the account does NOT purge its loyalty op-log (read-only, no purge API). Stranded rows
 *    are harmless for balances (the next account is a new id and starts at 0) but they accumulate —
 *    documented here so nobody reports them as orphaned-data corruption later.
 *  - No hardcoded GUIDs. Org/contact ids resolve at runtime; the created ids go to
 *    aliases.<env>.json per .claude/rules/test-data.md (never a committed CSV).
 *
 * Usage:
 *   node scripts/seed-data/loyalty/seed-loyalty-ephemeral-user.mjs                 # create + write alias
 *   node scripts/seed-data/loyalty/seed-loyalty-ephemeral-user.mjs --probe         # create, PROVE, tear down
 *   node scripts/seed-data/loyalty/seed-loyalty-ephemeral-user.mjs --teardown [--max-age-hours 2]
 *   ... [--dry-run] [--verbose]
 *
 * --probe answers the one assumption this design rests on: can a brand-new user (no VIP group) see
 * PTS prices and build a mixed cart? The PTS price list is assigned by catalogId, not memberId, so it
 * SHOULD be catalog-scoped rather than group-gated — but that is verified live, not assumed.
 */
import {
  STORE_ID, DRY_RUN, TEARDOWN, VERBOSE,
  log, verbose, assertSafeTarget, auth, api,
  writeEnvAliasOverride,
} from '../../lib/seed-common.mjs';

const argv = process.argv.slice(2);
const PROBE = argv.includes('--probe');
const MAX_AGE_HOURS = argv.includes('--max-age-hours')
  ? Number(argv[argv.indexOf('--max-age-hours') + 1])
  : null;

/** Hard teardown guard — this prefix is the ONLY thing this script will ever delete. */
const PREFIX = 'AGENT-TEST-loyzero-';
const EMAIL_DOMAIN = 'test-agent.com';
const ALIAS = 'LOYALTY_ZERO_USER';
const ORG_NAME = 'TechFlow';        // resolved at runtime; only used if org membership proves necessary

/**
 * Standardised on DEFAULT_TEST_PASSWORD — deliberately NOT a dedicated EPHEMERAL_USER_PASSWORD.
 *
 * Playwright's `--secrets` file substitutes only on an exact NAME match and redacts the value, so a
 * browser case can type the NAME and keep the plaintext out of the transcript. `.env.playwright.local`
 * carries DEFAULT_TEST_PASSWORD but NOT EPHEMERAL_USER_PASSWORD. Preferring the latter created a
 * latent trap: while it stayed unset everything worked, but the moment anyone SET it in .env.local the
 * seeder would use it and the runner could no longer type it by name — leaking it in plaintext.
 * One var that is actually present in the secrets file removes the trap entirely.
 */
const password = () => process.env.DEFAULT_TEST_PASSWORD || '';

/** Unique, sortable, sweepable handle: AGENT-TEST-loyzero-<utc-compact>-<rand4>. */
function newHandle() {
  const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);   // YYYYMMDDHHmmss
  const rand = Math.floor(Math.random() * 65536).toString(16).padStart(4, '0');
  return `${PREFIX}${ts}-${rand}`;
}

/** Parse the creation instant back out of a handle so --max-age-hours can spare recent accounts. */
function handleAgeHours(handle) {
  const m = /-(\d{14})-[0-9a-f]{4}/.exec(handle);
  if (!m) return null;
  const s = m[1];
  const iso = `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(8, 10)}:${s.slice(10, 12)}:${s.slice(12, 14)}Z`;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : (Date.now() - t) / 3_600_000;
}

async function resolveOrgId() {
  const r = await api('POST', '/api/members/search', { memberType: 'Organization', keyword: ORG_NAME, take: 5 }, { expectStatus: [200, 201] });
  const org = (r?.results || []).find((m) => m?.name === ORG_NAME) || (r?.results || [])[0];
  return org?.id || null;
}

/** Create the Contact + an Approved security account. Returns { handle, email, memberId, userId }. */
async function createUser({ withOrg }) {
  const handle = newHandle();
  const email = `${handle}@${EMAIL_DOMAIN}`;
  const pw = password();
  if (!pw) throw new Error('No password available — set DEFAULT_TEST_PASSWORD in .env.local');

  if (DRY_RUN) {
    log(`  [DRY] would create contact + account ${email}${withOrg ? ` in org ${ORG_NAME}` : ''}`);
    return { handle, email, memberId: 'dry-member', userId: 'dry-user', dry: true };
  }

  const organizations = withOrg ? [await resolveOrgId()].filter(Boolean) : [];
  const contact = await api('POST', '/api/members', {
    memberType: 'Contact', name: handle, fullName: handle, firstName: 'Agent', lastName: 'LoyZero',
    emails: [email], groups: [], organizations,
    addresses: [], dynamicProperties: [], status: 'Approved',
  }, { expectStatus: [200, 201] });
  verbose(`contact ${contact.id} (organizations: ${organizations.length ? organizations.join(',') : 'none'})`);

  // The account is created SECOND, so any failure here would strand the contact above. Clean it up
  // on the way out rather than leaking it (the first probe run leaked two contacts exactly this way).
  let userId;
  try {
    // NOTE the `/create` suffix: plain POST /api/platform/security/users is 405 Method Not Allowed.
    const result = await api('POST', '/api/platform/security/users/create', {
      userName: email, email, password: pw, memberId: contact.id,
      storeId: STORE_ID, userType: 'Customer', isAdministrator: false, roles: [],
    }, { expectStatus: [200, 201] });
    if (result && result.succeeded === false) {
      throw new Error(`security/users/create failed: ${JSON.stringify(result.errors)}`);
    }
    const fresh = await api('GET', `/api/platform/security/users/${encodeURIComponent(email)}`, null, { expectStatus: [200, 404] });
    userId = fresh?.id;
    if (!userId) throw new Error(`created account ${email} but could not resolve its id`);
  } catch (e) {
    await api('DELETE', `/api/members?ids=${encodeURIComponent(contact.id)}`, null, { expectStatus: [200, 204, 404] }).catch(() => {});
    verbose(`rolled back orphaned contact ${contact.id}`);
    throw e;
  }
  // Three post-create steps, each discovered the hard way (2026-08-05 probe) — all required:
  //  1. `users/create` reports succeeded:true but leaves `status: null` and `emailConfirmed: false`.
  //  2. It also does NOT apply the password in the body (`lastPasswordChangedDate` stays null);
  //     the password is a separate `/resetpassword` endpoint.
  // Without these, /connect/token answers `user_cannot_login_in_store` — a misleading error that
  // has nothing to do with the store.
  const full = await api('GET', `/api/platform/security/users/${encodeURIComponent(email)}`, null, { expectStatus: [200] });
  full.status = 'Approved';
  full.emailConfirmed = true;
  await api('PUT', '/api/platform/security/users', full, { expectStatus: [200, 204] });
  await api('POST', `/api/platform/security/users/${encodeURIComponent(email)}/resetpassword`,
    { newPassword: pw, forcePasswordChangeOnNextSignIn: false }, { expectStatus: [200] });
  verbose('status=Approved, emailConfirmed=true, password applied');

  log(`  ✓ ephemeral zero-balance user ${email} (member ${contact.id}, account ${userId})`);
  return { handle, email, memberId: contact.id, userId };
}

async function deleteUser({ email, memberId }) {
  if (!String(email).startsWith(PREFIX)) throw new Error(`refusing to delete non-ephemeral account: ${email}`);
  // Query-param form is the only one that works: DELETE /api/platform/security/users/{email}
  // returns 405 (verified 2026-08-05). Do NOT wrap these in .catch() — a swallowed 405 silently
  // leaked accounts on the first probe runs while reporting clean teardown.
  await api('DELETE', `/api/platform/security/users?names=${encodeURIComponent(email)}`, null, { expectStatus: [200, 204, 404] });
  if (memberId) await api('DELETE', `/api/members?ids=${encodeURIComponent(memberId)}`, null, { expectStatus: [200, 204, 404] });
  verbose(`deleted ${email}`);
}

/** Sweep every AGENT-TEST-loyzero-* account (optionally sparing ones younger than --max-age-hours). */
async function teardown() {
  const r = await api('POST', '/api/platform/security/users/search', { keyword: PREFIX, take: 200 }, { expectStatus: [200, 201, 404] });
  const users = (r?.results || r?.users || []).filter((u) => String(u?.userName || '').startsWith(PREFIX));
  if (!users.length) { log('  nothing to sweep'); return; }
  let removed = 0, spared = 0;
  for (const u of users) {
    const age = handleAgeHours(u.userName);
    if (MAX_AGE_HOURS != null && age != null && age < MAX_AGE_HOURS) { spared++; verbose(`spared ${u.userName} (${age.toFixed(1)}h old)`); continue; }
    if (DRY_RUN) { log(`  [DRY] would delete ${u.userName}`); removed++; continue; }
    await deleteUser({ email: u.userName, memberId: u.memberId });
    removed++;
  }
  log(`  swept ${removed} ephemeral account(s)${spared ? `, spared ${spared} younger than ${MAX_AGE_HOURS}h` : ''}`);

  // Blank the overlay entry unless a younger account was deliberately spared. aliases.<env>.json is
  // COMMITTED, so leaving a torn-down per-run email in it would (a) churn the file on every run and
  // (b) leave a dead identity that resolves to something non-empty — defeating the "unseeded env
  // resolves to '' = a clear miss" contract this fixture relies on.
  if (!spared && !DRY_RUN) {
    writeEnvAliasOverride({ [ALIAS]: { memberId: '', securityAccountId: '', email: '' } });
    log(`  ✓ overlay ${ALIAS} blanked (no dead identity left in the committed alias file)`);
  } else if (spared) {
    log(`  overlay ${ALIAS} left intact — ${spared} account(s) still live`);
  }

  log('  NOTE: loyalty op-log rows for deleted accounts are NOT purgeable (read-only API) and remain stranded.');
}

/**
 * Acquire a storefront token for the ephemeral user (password grant, store-scoped).
 *
 * The store MUST be passed as a **camelCase `storeId` form parameter**. Verified 2026-08-05:
 * an `X-StoreId` header is ignored and snake_case `store_id` is ignored — both leave xAPI's
 * ContactSignInValidator with a null store, which it reports as `user_cannot_login_in_store`
 * (see vc-module-x-api ContactSignInValidator.cs:53 — the null-store branch, NOT the
 * store-mismatch branch at :77). Only `storeId` works.
 */
async function userToken(email) {
  const body = new URLSearchParams({
    grant_type: 'password', username: email, password: password(),
    scope: 'offline_access', storeId: STORE_ID,
  });
  const res = await fetch(`${process.env.BACK_URL}/connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const j = await res.json().catch(() => null);
  if (!j?.access_token) verbose(`token failed: ${j?.errorDescription || j?.error || res.status}`);
  return j?.access_token || null;
}

async function gql(token, query) {
  const res = await fetch(`${process.env.BACK_URL}/graphql`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ query }),
  });
  return res.json().catch(() => null);
}

/**
 * Prove the design assumption, WITHOUT org membership first (the cheaper shape). If PTS prices are
 * invisible, retry WITH org membership so the report says which is actually required.
 */
async function probe() {
  const ptsCode = process.env.LOYALTY_CURRENCY || 'PTS';
  const results = [];
  for (const withOrg of [false, true]) {
    const label = withOrg ? 'WITH org membership' : 'WITHOUT org membership';
    log(`\n  --- probe: ${label} ---`);
    let user;
    try {
      user = await createUser({ withOrg });
      if (user.dry) { results.push({ withOrg, skipped: 'dry-run' }); continue; }

      const token = await userToken(user.email);
      if (!token) { results.push({ withOrg, auth: false }); log('  ✗ could not authenticate'); continue; }
      log('  ✓ authenticated');

      const bal = await gql(token, `query { loyaltyBalance(userId: "${user.userId}") { currentBalance } }`);
      const balance = bal?.data?.loyaltyBalance?.currentBalance;
      log(`  balance = ${JSON.stringify(balance)}`);

      const prods = await gql(token, `query { products(storeId: "${STORE_ID}" userId: "${user.userId}" currencyCode: "${ptsCode}" first: 3 filter: "price.${ptsCode}:(0 TO)") { totalCount items { id name } } }`);
      const ptsCount = prods?.data?.products?.totalCount ?? 0;
      log(`  PTS-priced products visible = ${ptsCount}`);

      results.push({ withOrg, auth: true, balance, ptsCount });
    } catch (e) {
      log(`  ✗ ${String(e.message).slice(0, 200)}`);
      results.push({ withOrg, error: String(e.message).slice(0, 200) });
    } finally {
      if (user && !user.dry) await deleteUser(user);
    }
  }

  console.log('\n=== PROBE RESULT ===');
  for (const r of results) {
    console.log(`  ${r.withOrg ? 'WITH' : 'WITHOUT'} org: ${JSON.stringify(r)}`);
  }
  const ok = results.find((r) => r.ptsCount > 0);
  console.log(ok
    ? `\n  VERDICT: a fresh user CAN see PTS prices ${ok.withOrg ? 'ONLY WITH org membership' : 'WITHOUT org membership'} — zero balance confirmed = ${JSON.stringify(ok.balance)}`
    : '\n  VERDICT: a fresh user could NOT see PTS prices in either shape — the ephemeral-user design does NOT work as-is.');
}

async function seed() {
  const user = await createUser({ withOrg: true });
  if (!user.dry) {
    // Field names match the other loyalty user aliases (memberId / securityAccountId), plus the
    // per-run `email` — which is run-variant, not env-invariant, so it lives ONLY in the overlay.
    writeEnvAliasOverride({ [ALIAS]: { memberId: user.memberId, securityAccountId: user.userId, email: user.email } });
    log(`  ✓ alias ${ALIAS} → member ${user.memberId} / account ${user.userId}`);
  }
}

async function main() {
  console.log(`👤 Loyalty ephemeral ZERO-balance user${DRY_RUN ? ' [DRY RUN]' : ''}${TEARDOWN ? ' [TEARDOWN]' : ''}${PROBE ? ' [PROBE]' : ''}`);
  assertSafeTarget();
  await auth();
  if (PROBE) await probe();
  else if (TEARDOWN) await teardown();
  else await seed();
}

main().catch((e) => { console.error(`\n❌ ${e.message}`); process.exit(1); });
