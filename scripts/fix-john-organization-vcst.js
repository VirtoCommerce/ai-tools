/**
 * Move John Mitchell's orders on vcst-qa to a different organization.
 *
 *   target organizationId:   6fb516c1-07f3-4af4-be5e-35961e3f7993
 *   target organizationName: AGENT-TEST-Org-TechFlow-20260310
 *
 * Updates 3 places per order to keep them consistent:
 *   - order.organizationId / organizationName
 *   - addresses[*].organization (so the shipping label reads correctly)
 *   - shipments[*].deliveryAddress.organization
 *   - inPayments[*].billingAddress.organization
 *
 * Usage: node scripts/fix-john-organization-vcst.js [--dry-run]
 */
import { config } from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
config({ path: join(ROOT, '.env.vcst'), override: true });
config({ path: join(ROOT, '.env.local'), override: true });

const BACK = process.env.BACK_URL;
const DRY = process.argv.includes('--dry-run');

const JOHN_USER_ID = '143bc845-7ba3-4982-ae9a-a9446a399705';
const NEW_ORG = {
  id: '6fb516c1-07f3-4af4-be5e-35961e3f7993',
  name: 'AGENT-TEST-Org-TechFlow-20260310',
};

const tokenRes = await fetch(`${BACK}/connect/token`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: `grant_type=password&username=${process.env.ADMIN}&password=${process.env.ADMIN_PASSWORD}&scope=offline_access`,
});
const { access_token } = await tokenRes.json();
const auth = { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' };

const sr = await fetch(`${BACK}/api/order/customerOrders/search`, {
  method: 'POST',
  headers: auth,
  body: JSON.stringify({ storeIds: ['B2B-store'], customerId: JOHN_USER_ID, take: 100, sort: 'number:asc' }),
});
const all = (await sr.json()).results || [];

console.log(`\n📝 Updating organization on ${all.length} orders${DRY ? ' [DRY RUN]' : ''}`);
console.log(`   organizationId   → ${NEW_ORG.id}`);
console.log(`   organizationName → ${NEW_ORG.name}\n`);

let ok = 0, skip = 0, fail = 0;
for (const stub of all) {
  const gr = await fetch(`${BACK}/api/order/customerOrders/${stub.id}`, { headers: auth });
  if (!gr.ok) { console.error(`  ✗ GET ${stub.number} → ${gr.status}`); fail++; continue; }
  const order = await gr.json();
  const beforeId = order.organizationId;
  const beforeName = order.organizationName;
  if (beforeId === NEW_ORG.id && beforeName === NEW_ORG.name) {
    console.log(`  ⏭  ${stub.number}  already on ${NEW_ORG.name.slice(0, 40)}`);
    skip++; continue;
  }
  // Update organization fields everywhere they appear
  order.organizationId = NEW_ORG.id;
  order.organizationName = NEW_ORG.name;
  for (const a of order.addresses || []) a.organization = NEW_ORG.name;
  for (const s of order.shipments || []) {
    if (s.deliveryAddress) s.deliveryAddress.organization = NEW_ORG.name;
  }
  for (const p of order.inPayments || []) {
    if (p.billingAddress) p.billingAddress.organization = NEW_ORG.name;
    p.organizationId = NEW_ORG.id;
    p.organizationName = NEW_ORG.name;
  }

  if (DRY) {
    console.log(`  [DRY] ${stub.number}  org "${beforeName || '—'}" → "${NEW_ORG.name}"`);
    ok++; continue;
  }
  const pr = await fetch(`${BACK}/api/order/customerOrders`, {
    method: 'PUT',
    headers: auth,
    body: JSON.stringify(order),
  });
  if (!pr.ok) {
    console.error(`  ✗ PUT ${stub.number} → ${pr.status}: ${(await pr.text()).slice(0, 200)}`);
    fail++; continue;
  }
  // Verify
  const reread = await fetch(`${BACK}/api/order/customerOrders/${stub.id}`, { headers: auth });
  const after = await reread.json();
  const matched = after.organizationId === NEW_ORG.id;
  console.log(`  ${matched ? '✓' : '⚠'} ${stub.number}  org "${(beforeName || '—').slice(0, 25)}" → "${(after.organizationName || '—').slice(0, 25)}"`);
  if (matched) ok++; else fail++;
}

console.log(`\n${DRY ? '[DRY RUN] ' : ''}Done — ${ok} updated, ${skip} already correct, ${fail} failed.\n`);
