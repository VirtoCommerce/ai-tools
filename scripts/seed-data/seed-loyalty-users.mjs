/**
 * seed-loyalty-users.mjs — Loyalty test users (storefront Customer accounts).
 *
 * Provisions the VIP-group Customer storefront user(s) the loyalty mixed-cart suites
 * (075b / 083b, VCST-5103/5104) authenticate as. Currently the only user that needs
 * seeding is LOYALTY_NOBAL_USER — a VIP-group Customer whose loyalty balance is ZERO,
 * required by MCO-GQL-005 to trigger LOYALTY_INSUFFICIENT_BALANCE. (LOYALTY_VIP_USER
 * already exists on vcst-qa with a large balance and is NOT re-seeded here.)
 *
 * IMPORTANT: this seeder deliberately does NOT grant any loyalty balance — a freshly
 * created member starts at 0 points, which is exactly the fixture MCO-GQL-005 needs.
 *
 * Conventions: scripts/lib/seed-common.mjs (ENV_RISK prod-guard, auth, api).
 * Email/group from the LOYALTY_NOBAL_USER alias in test-data/aliases.json (no hardcoding
 * beyond what the alias already pins). AGENT-TEST- prefix → /qa-seed-data teardown sweeps it.
 * Idempotent: reuses an existing member/account by email if present.
 *
 * Usage:
 *   node scripts/seed-loyalty-users.mjs               # create LOYALTY_NOBAL_USER if missing
 *   node scripts/seed-loyalty-users.mjs --dry-run -v
 *   node scripts/seed-loyalty-users.mjs --teardown    # delete the AGENT-TEST nobal member + account
 */
import {
  STORE_ID, DATE_STAMP, DRY_RUN, TEARDOWN, VERBOSE,
  log, verbose, assertSafeTarget, auth, api, loadAliases, writeResults,
} from '../lib/seed-common.mjs';

const NOBAL_PASSWORD = process.env.LOYALTY_NOBAL_USER_PASSWORD || 'TestNoBal1!';

function contactBody(firstName, lastName, email) {
  return {
    memberType: 'Contact',
    firstName,
    lastName,
    fullName: `${firstName} ${lastName}`,
    name: `${firstName} ${lastName}`,
    emails: [email],
    phones: ['+1-555-AGENT-LOY-005'],
    organizations: [],
    status: 'Approved',
    groups: ['VIP'],
    addresses: [{
      addressType: 'BillingAndShipping',
      firstName,
      lastName,
      line1: '789 Loyalty Lane',
      city: 'New York',
      regionId: 'NY',
      regionName: 'New York',
      postalCode: '10001',
      countryCode: 'US',
      countryName: 'United States',
      phone: '+1-555-AGENT-LOY-005',
      email,
    }],
    timeZone: 'America/New_York',
    defaultLanguage: 'en-US',
    currencyCode: 'USD',
  };
}

function userBody(email, password, contactId) {
  return {
    userName: email,
    email,
    password,
    storeId: STORE_ID,
    memberId: contactId,
    isAdministrator: false,
    userType: 'Customer',
    emailConfirmed: true,
    roles: [],
  };
}

async function findContactByEmail(email) {
  const r = await api('POST', '/api/members/search', { memberType: 'Contact', keyword: email, take: 20 }, { expectStatus: [200, 201] });
  const results = r?.results || r?.members || [];
  return results.find((m) => (m.emails || []).some((e) => e?.toLowerCase() === email.toLowerCase())) || null;
}

async function findUserByName(userName) {
  const u = await api('GET', `/api/platform/security/users/${encodeURIComponent(userName)}`, null, { expectStatus: [200, 404] });
  return u && u.id ? u : null;
}

async function seed() {
  const aliases = loadAliases();
  const nobal = aliases.aliases?.LOYALTY_NOBAL_USER || aliases.LOYALTY_NOBAL_USER;
  if (!nobal) { log('⚠ LOYALTY_NOBAL_USER alias missing from aliases.json — aborting.'); return; }
  const email = nobal.email;
  log(`LOYALTY_NOBAL_USER → ${email} (group VIP, store ${STORE_ID}, balance 0)`);

  // 1. Member (Contact)
  let contact = DRY_RUN ? null : await findContactByEmail(email);
  if (contact) {
    log(`Reusing member ${email} (${contact.id})`);
  } else {
    contact = await api('POST', '/api/members', contactBody('NoBalance', 'Loyalty', email), { expectStatus: [200, 201] });
    log(`Created member ${email} (${contact.id})`);
  }

  // 2. Security account (Customer)
  let user = DRY_RUN ? null : await findUserByName(email);
  if (user) {
    log(`Reusing security account ${email} (${user.id})`);
  } else {
    const created = await api('POST', '/api/platform/security/users/create', userBody(email, NOBAL_PASSWORD, contact.id), { expectStatus: [200, 201] });
    // create returns { succeeded, errors } or the user; re-fetch for the id
    user = DRY_RUN ? { id: created?.id } : (await findUserByName(email)) || created;
    log(`Created security account ${email} (${user?.id || 'n/a'})`);
  }

  log('NOTE: no loyalty balance seeded — member starts at 0 PTS (the MCO-GQL-005 fixture).');
  log('Add to .env.local:');
  log(`  LOYALTY_NOBAL_USER_EMAIL=${email}`);
  log(`  LOYALTY_NOBAL_USER_PASSWORD=${NOBAL_PASSWORD}`);

  writeResults(`test-data/loyalty/_seed-results-loyalty-users-${DATE_STAMP}.json`, {
    seededAt: new Date().toISOString(),
    storeId: STORE_ID,
    nobalUser: { email, memberId: contact?.id, securityAccountId: user?.id, group: 'VIP', balance: 0 },
  });
}

async function teardown() {
  const aliases = loadAliases();
  const nobal = aliases.aliases?.LOYALTY_NOBAL_USER || aliases.LOYALTY_NOBAL_USER;
  const email = nobal?.email;
  if (!email) { log('  no LOYALTY_NOBAL_USER alias — nothing to tear down'); return; }
  log(`Teardown LOYALTY_NOBAL_USER → ${email}`);
  const user = await findUserByName(email);
  if (user?.id) {
    await api('DELETE', `/api/platform/security/users?userNames=${encodeURIComponent(email)}`, null, { expectStatus: [200, 204, 404] });
    log(`  ✓ deleted security account ${user.id}`);
  } else { log('  security account not found'); }
  const contact = await findContactByEmail(email);
  if (contact?.id) {
    await api('DELETE', `/api/members?ids=${contact.id}`, null, { expectStatus: [200, 204, 404] });
    log(`  ✓ deleted member ${contact.id}`);
  } else { log('  member not found'); }
}

(async () => {
  console.log(`🎁 Seed Loyalty Users${DRY_RUN ? ' [DRY RUN]' : ''}${TEARDOWN ? ' [TEARDOWN]' : ''}`);
  assertSafeTarget();
  await auth();
  if (TEARDOWN) await teardown(); else await seed();
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
