/**
 * Rename customerName on John Mitchell's orders on vcst-qa B2B-store.
 *   "John Mitchell-20260310" → "John Mitchell"
 *
 * Touches order records only — does NOT change the contact's fullName, the user's
 * userName, or the email (which is the login identifier).
 *
 * Usage: node scripts/fix-john-customer-name-vcst.js [--dry-run]
 */
import { config } from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
config({ path: join(ROOT, '.env.vcst'), override: true });
config({ path: join(ROOT, '.env.local'), override: true });

const BACK = process.env.BACK_URL;
const ADMIN = process.env.ADMIN;
const PWD = process.env.ADMIN_PASSWORD;
const DRY = process.argv.includes('--dry-run');

const JOHN_USER_ID = '143bc845-7ba3-4982-ae9a-a9446a399705';
const OLD_NAME_PREFIX = 'John Mitchell-';
const NEW_NAME = 'John Mitchell';

const tokenRes = await fetch(`${BACK}/connect/token`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: `grant_type=password&username=${ADMIN}&password=${PWD}&scope=offline_access`,
});
const { access_token } = await tokenRes.json();
const auth = { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' };

// Fetch all orders for John
const sr = await fetch(`${BACK}/api/order/customerOrders/search`, {
  method: 'POST',
  headers: auth,
  body: JSON.stringify({ storeIds: ['B2B-store'], customerId: JOHN_USER_ID, take: 100, sort: 'number:asc' }),
});
const data = await sr.json();
const all = data.results || [];
const targets = all.filter(o => o.customerName?.startsWith(OLD_NAME_PREFIX));

console.log(`\n📝 Renaming customerName on ${targets.length} of ${all.length} orders${DRY ? ' [DRY RUN]' : ''}`);
console.log(`   "${OLD_NAME_PREFIX}*" → "${NEW_NAME}"\n`);

let ok = 0;
let skip = 0;
let fail = 0;
for (const stub of targets) {
  // GET full order
  const gr = await fetch(`${BACK}/api/order/customerOrders/${stub.id}`, { headers: auth });
  if (!gr.ok) { console.error(`  ✗ GET ${stub.number} → ${gr.status}`); fail++; continue; }
  const order = await gr.json();
  const before = order.customerName;
  if (before === NEW_NAME) { skip++; continue; }
  order.customerName = NEW_NAME;

  if (DRY) {
    console.log(`  [DRY] ${stub.number}  "${before}" → "${NEW_NAME}"`);
    ok++;
    continue;
  }
  const pr = await fetch(`${BACK}/api/order/customerOrders`, {
    method: 'PUT',
    headers: auth,
    body: JSON.stringify(order),
  });
  if (!pr.ok) {
    console.error(`  ✗ PUT ${stub.number} → ${pr.status}: ${(await pr.text()).slice(0, 200)}`);
    fail++;
    continue;
  }
  // Verify
  const reread = await fetch(`${BACK}/api/order/customerOrders/${stub.id}`, { headers: auth });
  const after = (await reread.json()).customerName;
  console.log(`  ${after === NEW_NAME ? '✓' : '⚠'} ${stub.number}  "${before}" → "${after}"`);
  if (after === NEW_NAME) ok++; else fail++;
}

console.log(`\n${DRY ? '[DRY RUN] ' : ''}Done — ${ok} updated, ${skip} already correct, ${fail} failed.\n`);
