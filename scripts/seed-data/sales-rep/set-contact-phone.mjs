/**
 * VCST-5589 verification helper — set/clear a seeded test contact's phone via the Platform REST API.
 *
 * Out-of-band mutation used to prove the storefront's `cache-and-network` refetch picks up a
 * server-side change that never passed through the browser's Apollo client. This is the lever the
 * PR #2412 author explicitly asked QA to exercise on Company -> Sales reps.
 *
 * Usage:  TEST_ENV=vcst node scripts/seed-data/sales-rep/set-contact-phone.mjs <contactId> <phone|--clear>
 *
 * Reads BACK_URL / ADMIN_USER / ADMIN_PASSWORD from the layered env loader (config.js).
 * Never logs the password or the access token.
 */
import '../../../config.js';

const [, , contactId, phoneArg] = process.argv;

if (!contactId || !phoneArg) {
  console.error('usage: set-contact-phone.mjs <contactId> <phone|--clear>');
  process.exit(2);
}

const BACK_URL = process.env.BACK_URL;
if (!BACK_URL) {
  console.error('BACK_URL is not set for TEST_ENV=' + (process.env.TEST_ENV ?? '(unset)'));
  process.exit(2);
}

const nextPhones = phoneArg === '--clear' ? [] : [phoneArg];

const tokenRes = await fetch(`${BACK_URL}/connect/token`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'password',
    username: process.env.ADMIN_USER || 'admin',
    password: process.env.ADMIN_PASSWORD,
    scope: 'offline_access',
  }),
});

if (!tokenRes.ok) {
  console.error('token request failed:', tokenRes.status);
  process.exit(1);
}

const token = (await tokenRes.json()).access_token;
const auth = { Authorization: `Bearer ${token}` };

const readMember = async () => {
  const res = await fetch(`${BACK_URL}/api/members/${contactId}`, { headers: auth });
  if (!res.ok) {
    console.error('GET member failed:', res.status);
    process.exit(1);
  }
  return res.json();
};

const before = await readMember();
console.log('before:', before.name, '| memberType', before.memberType, '| phones', JSON.stringify(before.phones));

before.phones = nextPhones;

const put = await fetch(`${BACK_URL}/api/members`, {
  method: 'PUT',
  headers: { ...auth, 'Content-Type': 'application/json' },
  body: JSON.stringify(before),
});
console.log('PUT:', put.status, put.ok ? '' : (await put.text()).slice(0, 300));

// Read back from the server — a 2xx PUT is NOT proof; this platform can silently no-op
// (a member write returns {"succeeded":true} and leaves the record untouched).
const after = await readMember();
console.log('phones now:', JSON.stringify(after.phones));

if (JSON.stringify(after.phones) !== JSON.stringify(nextPhones)) {
  console.error(`MISMATCH: expected ${JSON.stringify(nextPhones)}, server still reports ${JSON.stringify(after.phones)}`);
  process.exit(1);
}
