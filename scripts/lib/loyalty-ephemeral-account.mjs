/**
 * loyalty-ephemeral-account.mjs — mint / delete / sweep a per-run, genuinely ZERO-balance storefront
 * account.
 *
 * WHY THIS IS A SHARED MODULE AND NOT COPY-PASTE
 * ----------------------------------------------
 * Two seeders need this now — `seed-loyalty-ephemeral-user.mjs` (one account, alias
 * LOYALTY_ZERO_USER, suites 083b/083d MSN-E2E-004) and `seed-missions-e2e.mjs` (four accounts, one
 * per contended 083d case). The create path is NOT obvious: it is five calls in a fixed order, three
 * of which exist only because the platform's own `users/create` leaves the account unusable, and each
 * was found by a failing probe rather than by reading a doc:
 *
 *   1. `POST /api/members`                                  — the Contact
 *   2. `POST /api/platform/security/users/create`           — note the `/create` suffix; a plain POST
 *                                                             to `/users` is 405 Method Not Allowed
 *   3. `PUT  /api/platform/security/users`                  — status=Approved + emailConfirmed=true;
 *                                                             `create` leaves both unset
 *   4. `POST /api/platform/security/users/{email}/resetpassword`
 *                                                           — `create` does NOT apply the password in
 *                                                             its body (`lastPasswordChangedDate`
 *                                                             stays null)
 *   5. delete is `DELETE /api/platform/security/users?names=<email>` — the path form is 405
 *
 * Skip 3 or 4 and `/connect/token` answers `user_cannot_login_in_store`, an error that says nothing
 * about the real cause. A second copy of this sequence would drift from the first the moment either
 * is fixed, and the drift would present as an unexplained sign-in failure in whichever suite was not
 * updated. So it lives once, here.
 *
 * WHAT IS PARAMETERISED, AND WHAT IS DELIBERATELY NOT
 * ---------------------------------------------------
 * `prefix` varies (each caller owns a sweep namespace it alone may delete). The PASSWORD does not:
 * every ephemeral account uses `DEFAULT_TEST_PASSWORD`, because Playwright's `--secrets` substitutes
 * by NAME from a static dotenv and redacts the value. A per-run generated password cannot live in
 * that file and would be typed in plaintext into the transcript.
 *
 * Side-effect-free on import: no env load, no auth, no main(). The caller supplies the `api` helper
 * it has already authenticated.
 */

/** Every account this module mints carries the caller's prefix, which is the ONLY teardown guard. */
export const EMAIL_DOMAIN = 'test-agent.com';

/** The one password var. See the header — this is not a knob. */
export const PASSWORD_VAR = 'DEFAULT_TEST_PASSWORD';

export const password = () => process.env[PASSWORD_VAR] || '';

/**
 * A unique, sortable, sweepable handle: `<prefix><YYYYMMDDHHmmss>-<rand4>`.
 *
 * Deliberately the same timestamp shape as the missions-e2e run handle, because both are swept by
 * age and a second timestamp format would mean a second parser that can silently disagree with the
 * first.
 */
export function newHandle(prefix, now = new Date(), rand = Math.random()) {
  const ts = now.toISOString().replace(/[-:T]/g, '').slice(0, 14);
  return `${prefix}${ts}-${Math.floor(rand * 65536).toString(16).padStart(4, '0')}`;
}

/** Parse the creation instant back out of a handle so a sweep can spare recent accounts. Pure. */
export function handleAgeHours(handle, now = new Date()) {
  const m = /-(\d{14})-[0-9a-f]{4}/.exec(String(handle || ''));
  if (!m) return null;
  const s = m[1];
  const iso = `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(8, 10)}:${s.slice(10, 12)}:${s.slice(12, 14)}Z`;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : (now.getTime() - t) / 3_600_000;
}

/**
 * Create a Contact + an Approved, sign-in-capable security account.
 *
 * `withOrg` is load-bearing rather than cosmetic: PTS pricing is catalog-scoped and needs no org, but
 * the ORG is what supplies the shipping ADDRESSES a checkout case needs. A brand-new contact has
 * none, and without an address the cart never reaches a decisive place-order state (proven 2026-08-05
 * for suite 083b). Every caller that places an order must pass `withOrg: true`.
 *
 * `groups` puts the CONTACT into one or more customer groups, which is the ONLY input a
 * `UserGroupIsCondition` reads: `LoyaltyLogicService.GetUserGroups(userId)` resolves the security
 * account to its member and returns `member.Groups`. It exists so a targeting question can be asked
 * with a CONTROLLED pair — two accounts minted seconds apart, in the same org, differing in this
 * field alone. Two long-lived shared accounts would differ on org, order history, balance and every
 * other group they carry, so "the member saw it and the outsider did not" would name none of them.
 *
 * The groups the platform ACTUALLY stored are read back and returned as `observedGroups` rather than
 * echoed from the input: the server's match is `EqualsIgnoreCase` and is NOT trimmed, so an input
 * that was silently normalised, padded or dropped must be visible to the caller instead of asserted
 * by it.
 *
 * Returns `{ handle, email, memberId, userId, observedGroups }`.
 */
export async function createEphemeralAccount(api, {
  prefix, storeId, withOrg = true, orgName = 'TechFlow', groups = [],
  firstName = 'Agent', lastName = 'LoyZero', dryRun = false, log = () => {}, verbose = () => {},
} = {}) {
  if (!prefix) throw new Error('createEphemeralAccount needs a sweep prefix');
  const handle = newHandle(prefix);
  const email = `${handle}@${EMAIL_DOMAIN}`;
  const pw = password();
  if (!pw) throw new Error(`No password available — set ${PASSWORD_VAR} in .env.local`);

  if (dryRun) {
    log(`  [DRY] would create contact + account ${email}${withOrg ? ` in org ${orgName}` : ''}${groups.length ? ` in group(s) ${groups.join(',')}` : ''}`);
    return { handle, email, memberId: 'dry-member', userId: 'dry-user', observedGroups: [...groups], dry: true };
  }

  let organizations = [];
  if (withOrg) {
    const r = await api('POST', '/api/members/search', { memberType: 'Organization', keyword: orgName, take: 5 }, { expectStatus: [200, 201] });
    const org = (r?.results || []).find((m) => m?.name === orgName) || (r?.results || [])[0];
    if (!org?.id) {
      throw new Error(
        `organization "${orgName}" did not resolve on this env, so the account would have no shipping `
        + 'addresses and every checkout case bound to it would stall before place-order.',
      );
    }
    organizations = [org.id];
  }

  const contact = await api('POST', '/api/members', {
    memberType: 'Contact', name: handle, fullName: handle, firstName, lastName,
    emails: [email], groups: [...groups], organizations,
    addresses: [], dynamicProperties: [], status: 'Approved',
  }, { expectStatus: [200, 201] });
  verbose(`contact ${contact.id} (organizations: ${organizations.length ? organizations.join(',') : 'none'}, groups: ${(contact.groups || []).join(',') || 'none'})`);

  // The account is created SECOND, so any failure here would strand the contact above. Clean it up on
  // the way out rather than leaking it (the first probe runs leaked two contacts exactly this way).
  let userId;
  try {
    const result = await api('POST', '/api/platform/security/users/create', {
      userName: email, email, password: pw, memberId: contact.id,
      storeId, userType: 'Customer', isAdministrator: false, roles: [],
    }, { expectStatus: [200, 201] });
    if (result && result.succeeded === false) throw new Error(`security/users/create failed: ${JSON.stringify(result.errors)}`);
    const fresh = await api('GET', `/api/platform/security/users/${encodeURIComponent(email)}`, null, { expectStatus: [200, 404] });
    userId = fresh?.id;
    if (!userId) throw new Error(`created account ${email} but could not resolve its id`);
  } catch (e) {
    await api('DELETE', `/api/members?ids=${encodeURIComponent(contact.id)}`, null, { expectStatus: [200, 204, 404] }).catch(() => {});
    verbose(`rolled back orphaned contact ${contact.id}`);
    throw e;
  }

  // Steps 3 + 4 from the header — both required, both invisible until sign-in fails.
  const full = await api('GET', `/api/platform/security/users/${encodeURIComponent(email)}`, null, { expectStatus: [200] });
  full.status = 'Approved';
  full.emailConfirmed = true;
  await api('PUT', '/api/platform/security/users', full, { expectStatus: [200, 204] });
  await api('POST', `/api/platform/security/users/${encodeURIComponent(email)}/resetpassword`,
    { newPassword: pw, forcePasswordChangeOnNextSignIn: false }, { expectStatus: [200] });
  verbose('status=Approved, emailConfirmed=true, password applied');

  // Read the member BACK rather than trusting the create response: the groups a condition is
  // evaluated against are whatever the store holds now, and that is the only reading worth recording.
  const member = await api('GET', `/api/members/${encodeURIComponent(contact.id)}`, null, { expectStatus: [200, 404] });
  const observedGroups = Array.isArray(member?.groups) ? [...member.groups] : [];
  if (groups.length && !observedGroups.length) {
    throw new Error(
      `contact ${contact.id} was created with groups [${groups.join(', ')}] but the platform reports none. `
      + 'A group-targeted mission reads member.Groups and nothing else, so an audience account with no groups is '
      + 'silently OUTSIDE its own audience — the fixture would then agree with its own control whatever the '
      + 'server does, which is the one outcome a targeting control pair must not be able to produce.',
    );
  }

  log(`  ✓ ephemeral zero-balance user ${email} (member ${contact.id}, account ${userId}${observedGroups.length ? `, groups ${observedGroups.join(',')}` : ''})`);
  return { handle, email, memberId: contact.id, userId, observedGroups };
}

/**
 * Delete one ephemeral account + its contact. HARD-GUARDED on the prefix: this function will not
 * delete an account it did not mint, whatever the caller passes.
 *
 * Do NOT wrap these in `.catch()` — a swallowed 405 silently leaked accounts on the first probe runs
 * while reporting a clean teardown.
 */
export async function deleteEphemeralAccount(api, { email, memberId, prefix, verbose = () => {} } = {}) {
  if (!prefix) throw new Error('deleteEphemeralAccount needs the sweep prefix to guard against');
  if (!String(email).startsWith(prefix)) throw new Error(`refusing to delete non-ephemeral account: ${email}`);
  await api('DELETE', `/api/platform/security/users?names=${encodeURIComponent(email)}`, null, { expectStatus: [200, 204, 404] });
  if (memberId) await api('DELETE', `/api/members?ids=${encodeURIComponent(memberId)}`, null, { expectStatus: [200, 204, 404] });
  verbose(`deleted ${email}`);
}

/** Every live account under `prefix`. The set a sweep may consider — nothing outside it is touched. */
export async function findEphemeralAccounts(api, prefix) {
  const r = await api('POST', '/api/platform/security/users/search', { keyword: prefix, take: 200 }, { expectStatus: [200, 201, 404] });
  return (r?.results || r?.users || []).filter((u) => String(u?.userName || '').startsWith(prefix));
}

/**
 * Prefix sweep with an optional age floor. A sweep rather than an inline delete because a crashed run
 * leaks its account and nothing else would ever reclaim it; the age floor is what stops a concurrent
 * run being torn down underneath itself.
 *
 * Returns `{ removed, spared }`.
 */
export async function sweepEphemeralAccounts(api, {
  prefix, maxAgeHours = null, now = new Date(), dryRun = false, log = () => {}, verbose = () => {},
} = {}) {
  const users = await findEphemeralAccounts(api, prefix);
  let removed = 0; let spared = 0;
  for (const u of users) {
    const age = handleAgeHours(u.userName, now);
    if (maxAgeHours != null && age != null && age < maxAgeHours) { spared += 1; verbose(`spared ${u.userName} (${age.toFixed(1)}h old)`); continue; }
    if (dryRun) { log(`  [DRY] would delete ${u.userName}`); removed += 1; continue; }
    await deleteEphemeralAccount(api, { email: u.userName, memberId: u.memberId, prefix, verbose });
    removed += 1;
  }
  return { removed, spared };
}

/**
 * A storefront (customer) bearer token for an ephemeral account.
 *
 * The store MUST be passed as a camelCase `storeId` FORM parameter. Verified 2026-08-05: an
 * `X-StoreId` header is ignored and snake_case `store_id` is ignored — both leave xAPI's
 * ContactSignInValidator with a null store, which it reports as `user_cannot_login_in_store` (the
 * null-store branch at ContactSignInValidator.cs:53, NOT the store-mismatch branch at :77).
 */
export async function storefrontToken(backUrl, storeId, email, pw = password()) {
  const res = await fetch(`${backUrl}/connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'password', username: email, password: pw, scope: 'offline_access', storeId }),
  });
  const j = await res.json().catch(() => null);
  return j?.access_token || null;
}
