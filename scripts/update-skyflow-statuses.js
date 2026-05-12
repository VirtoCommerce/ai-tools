/**
 * Update statuses on the 4 Skyflow orders that need to differ from the seed default.
 * Mapping (per demo plan):
 *   CO26050800107 (Skyflow, was Completed) → Processing
 *   CO26050800111 (Skyflow, was Pending)   → Processing
 *   CO26050800115 (Skyflow, was New)       → Payment required
 *   CO26050800119 (Skyflow, was New)       → Payment required
 *
 * Reads test-data/b2b/_seed-results-orders-virtostart.json, GETs each target order,
 * mutates `status`, PUTs it back, then re-reads to verify and rewrites the results JSON.
 *
 * Usage: node scripts/update-skyflow-statuses.js [--dry-run]
 */

import { config } from 'dotenv';
import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
config({ path: join(ROOT, '.env.virtostart'), override: false });
config({ path: join(ROOT, '.env.local'), override: false });

const BACK = process.env.BACK_URL;
const ADMIN = process.env.ADMIN_VIRTO || process.env.ADMIN;
const PWD = process.env.ADMIN_VIRTO_PASSWORD || process.env.ADMIN_PASSWORD;
const DRY = process.argv.includes('--dry-run');

const RESULTS_FILE = join(ROOT, 'test-data', 'b2b', '_seed-results-orders-virtostart.json');

const TARGETS = {
  CO26050800107: 'Processing',
  CO26050800111: 'Processing',
  CO26050800115: 'Payment required',
  CO26050800119: 'Payment required',
};

const tokenRes = await fetch(`${BACK}/connect/token`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: `grant_type=password&username=${ADMIN}&password=${PWD}&scope=offline_access`,
});
const { access_token } = await tokenRes.json();
const auth = { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' };

const results = JSON.parse(readFileSync(RESULTS_FILE, 'utf-8'));

console.log(`\n📝 Updating ${Object.keys(TARGETS).length} Skyflow orders${DRY ? ' [DRY RUN]' : ''}\n`);

for (const [orderNumber, newStatus] of Object.entries(TARGETS)) {
  const seedEntry = results.orders.find(o => o.orderNumber === orderNumber);
  if (!seedEntry) {
    console.error(`  ✗ ${orderNumber} not found in results JSON; skipping`);
    continue;
  }
  // Fetch full order
  const getRes = await fetch(`${BACK}/api/order/customerOrders/${seedEntry.orderId}`, { headers: auth });
  if (!getRes.ok) {
    console.error(`  ✗ GET ${orderNumber} → ${getRes.status}`);
    continue;
  }
  const order = await getRes.json();
  const before = order.status;
  order.status = newStatus;

  if (DRY) {
    console.log(`  [DRY] ${orderNumber}  ${before.padEnd(12)} → ${newStatus}`);
    continue;
  }

  // PUT (update) — VC accepts the full order object
  const putRes = await fetch(`${BACK}/api/order/customerOrders`, {
    method: 'PUT',
    headers: auth,
    body: JSON.stringify(order),
  });
  if (!putRes.ok) {
    const t = await putRes.text();
    console.error(`  ✗ PUT ${orderNumber} → ${putRes.status}: ${t.slice(0, 300)}`);
    continue;
  }

  // Re-fetch to verify the new status stuck
  const reread = await fetch(`${BACK}/api/order/customerOrders/${seedEntry.orderId}`, { headers: auth });
  const after = (await reread.json()).status;
  const ok = after === newStatus ? '✓' : '⚠';
  console.log(`  ${ok} ${orderNumber}  ${before.padEnd(12)} → ${after} ${ok === '⚠' ? `(asked for ${newStatus})` : ''}`);

  // Update local results
  seedEntry.status = after;
}

if (!DRY) {
  writeFileSync(RESULTS_FILE, JSON.stringify(results, null, 2));
  console.log(`\nResults JSON updated: ${RESULTS_FILE}`);
}
console.log('\n✅ Done.\n');
