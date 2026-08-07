/**
 * VCST-5589 verification helper — set a seeded test order's status via the Platform REST API.
 *
 * Out-of-band mutation used to prove the storefront's `cache-and-network` refetch picks up a
 * server-side change that never passed through the browser's Apollo client.
 *
 * Usage:  TEST_ENV=vcst node scripts/seed-data/orders/set-order-status.mjs <orderId> <status>
 *
 * Reads BACK_URL / ADMIN_USER / ADMIN_PASSWORD from the layered env loader (config.js).
 * Never logs the password or the access token.
 */
import '../../../config.js';

const [, , orderId, nextStatus] = process.argv;

if (!orderId || !nextStatus) {
  console.error('usage: set-order-status.mjs <orderId> <status>');
  process.exit(2);
}

const BACK_URL = process.env.BACK_URL;
if (!BACK_URL) {
  console.error('BACK_URL is not set for TEST_ENV=' + (process.env.TEST_ENV ?? '(unset)'));
  process.exit(2);
}

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

const readOrder = async () => {
  const res = await fetch(`${BACK_URL}/api/order/customerOrders/${orderId}`, { headers: auth });
  if (!res.ok) {
    console.error('GET order failed:', res.status);
    process.exit(1);
  }
  return res.json();
};

const before = await readOrder();
console.log('before:', before.number, '|', before.status, '| total', before.total);

before.status = nextStatus;

const put = await fetch(`${BACK_URL}/api/order/customerOrders`, {
  method: 'PUT',
  headers: { ...auth, 'Content-Type': 'application/json' },
  body: JSON.stringify(before),
});
console.log('PUT:', put.status, put.ok ? '' : (await put.text()).slice(0, 300));

// Read back from the server — a 2xx PUT is NOT proof; this platform can silently no-op.
const after = await readOrder();
console.log('status now:', after.status);

if (after.status !== nextStatus) {
  console.error(`MISMATCH: expected "${nextStatus}", server still reports "${after.status}"`);
  process.exit(1);
}
