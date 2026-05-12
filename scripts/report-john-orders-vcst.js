/**
 * Report — every customerOrder for John Mitchell on vcst-qa B2B-store.
 *
 * Pages through /api/order/customerOrders/search and writes a markdown report
 * to tests/demo/john-mitchell-orders-vcst-{YYYY-MM-DD}.md.
 *
 * Usage:
 *   node scripts/report-john-orders-vcst.js [--verbose]
 */
import { config } from 'dotenv';
import { writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
config({ path: join(ROOT, '.env.vcst'), override: true });
config({ path: join(ROOT, '.env.local'), override: true });

const BACK = process.env.BACK_URL;
const ADMIN = process.env.ADMIN;
const PWD = process.env.ADMIN_PASSWORD;
const STORE = process.env.STORE_ID || 'B2B-store';
const VERBOSE = process.argv.includes('--verbose');

// John Mitchell on vcst-qa (from test-data/b2b/_seed-results-orgs.json — 2026-03-10 seed)
const JOHN = {
  userId: '143bc845-7ba3-4982-ae9a-a9446a399705',
  contactId: 'd0f765ba-3d2d-4f4e-a4b4-e3306e153178',
  email: 'test-john.mitchell-20260310@test-agent.com',
  fullName: 'John Mitchell',
  organizationId: '6fb516c1-07f3-4af4-be5e-35961e3f7993',
  organizationName: 'AGENT-TEST-Org-TechFlow-20260310',
};

const today = new Date().toISOString().slice(0, 10);
const REPORT = join(ROOT, 'tests', 'demo', `john-mitchell-orders-vcst-${today}.md`);

// --- auth ---
const tokenRes = await fetch(`${BACK}/connect/token`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: `grant_type=password&username=${ADMIN}&password=${PWD}&scope=offline_access`,
});
const tokenJson = await tokenRes.json();
if (!tokenJson.access_token) {
  console.error('Auth failed:', JSON.stringify(tokenJson).slice(0, 300));
  process.exit(1);
}
const auth = { Authorization: `Bearer ${tokenJson.access_token}`, 'Content-Type': 'application/json' };
console.log(`Auth OK on ${BACK}`);

// --- search (paged) ---
const PAGE = 50;
let skip = 0;
const orders = [];
while (true) {
  const r = await fetch(`${BACK}/api/order/customerOrders/search`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({
      storeIds: [STORE],
      customerId: JOHN.userId,
      take: PAGE,
      skip,
      sort: 'createdDate:asc',
    }),
  });
  if (!r.ok) {
    console.error(`Search failed: ${r.status} ${(await r.text()).slice(0, 300)}`);
    process.exit(1);
  }
  const data = await r.json();
  const batch = data.results || [];
  orders.push(...batch);
  if (VERBOSE) console.log(`  fetched ${batch.length} (skip=${skip}, totalCount=${data.totalCount})`);
  if (batch.length < PAGE || orders.length >= (data.totalCount || 0)) break;
  skip += PAGE;
}
console.log(`Found ${orders.length} orders for John Mitchell on ${STORE}.`);

// --- aggregations ---
const byStatus = {};
const byPayment = {};
const byShipping = {};
const byMonth = {};
let grandTotal = 0;
const skuCounts = {};
for (const o of orders) {
  byStatus[o.status] = (byStatus[o.status] || 0) + 1;
  for (const p of o.inPayments || []) {
    const k = p.paymentMethod?.code || '?';
    byPayment[k] = (byPayment[k] || 0) + 1;
  }
  for (const s of o.shipments || []) {
    const k = s.shipmentMethodCode || '?';
    byShipping[k] = (byShipping[k] || 0) + 1;
  }
  const m = (o.createdDate || '').slice(0, 7);
  byMonth[m] = (byMonth[m] || 0) + 1;
  grandTotal += o.total || 0;
  for (const it of o.items || []) {
    if (!it.sku) continue;
    skuCounts[it.sku] = skuCounts[it.sku] || { sku: it.sku, name: it.name, orders: 0, units: 0 };
    skuCounts[it.sku].orders += 1;
    skuCounts[it.sku].units += it.quantity || 0;
  }
}
const topSkus = Object.values(skuCounts).sort((a, b) => b.orders - a.orders || b.units - a.units).slice(0, 15);

// --- markdown ---
const L = [];
L.push(`# John Mitchell — All Orders on vcst-qa B2B-store`);
L.push('');
L.push(`**Generated:** ${new Date().toISOString()}`);
L.push(`**Source:** \`POST ${BACK}/api/order/customerOrders/search\` (paged, customerId filter)`);
L.push(`**Customer:** ${JOHN.fullName} — \`${JOHN.email}\``);
L.push(`**User ID:** \`${JOHN.userId}\``);
L.push(`**Org:** ${JOHN.organizationName} (\`${JOHN.organizationId}\`)`);
L.push(`**Store:** ${STORE}`);
L.push('');
L.push('## Summary');
L.push('');
L.push(`- **Total orders:** ${orders.length}`);
L.push(`- **Grand total spend:** $${grandTotal.toFixed(2)} USD`);
L.push(`- **Date range:** ${orders[0]?.createdDate?.slice(0, 10) || '—'} → ${orders[orders.length - 1]?.createdDate?.slice(0, 10) || '—'}`);
L.push('');
L.push('### By status');
L.push('');
L.push('| Status | Count |');
L.push('|--------|------:|');
Object.entries(byStatus).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => L.push(`| ${k} | ${v} |`));
L.push('');
L.push('### By payment method');
L.push('');
L.push('| Method | Count |');
L.push('|--------|------:|');
Object.entries(byPayment).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => L.push(`| ${k} | ${v} |`));
L.push('');
L.push('### By shipping method');
L.push('');
L.push('| Method | Count |');
L.push('|--------|------:|');
Object.entries(byShipping).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => L.push(`| ${k} | ${v} |`));
L.push('');
L.push('### By month');
L.push('');
L.push('| Month | Orders |');
L.push('|-------|------:|');
Object.entries(byMonth).sort().forEach(([k, v]) => L.push(`| ${k || 'unknown'} | ${v} |`));
L.push('');
L.push('### Top SKUs');
L.push('');
L.push('| # | SKU | Product | Orders | Units |');
L.push('|---|-----|---------|------:|------:|');
topSkus.forEach((s, i) => L.push(`| ${i + 1} | \`${s.sku}\` | ${(s.name || '').slice(0, 60)} | ${s.orders} | ${s.units} |`));
L.push('');
L.push('---');
L.push('');
L.push('## All orders (chronological)');
L.push('');
L.push('| # | Order | Created | Status | Payment | Shipment | Total | Lines |');
L.push('|---|-------|---------|--------|---------|----------|------:|-------|');
orders.forEach((o, i) => {
  const pm = o.inPayments?.[0]?.paymentMethod?.code || '—';
  const sm = o.shipments?.[0]?.shipmentMethodCode || '—';
  const ss = o.shipments?.[0]?.status || '—';
  const lines = (o.items || []).map(it => `${it.sku}×${it.quantity}`).join(', ').slice(0, 80);
  L.push(`| ${i + 1} | \`${o.number}\` | ${(o.createdDate || '').slice(0, 10)} | ${o.status} | ${pm.replace('PaymentMethod', '')} | ${sm}/${ss} | $${(o.total || 0).toFixed(2)} | ${lines} |`);
});
L.push('');
L.push('---');
L.push('');
L.push('## Order detail (line items)');
L.push('');
for (const o of orders) {
  L.push(`### \`${o.number}\` — ${o.status}`);
  L.push('');
  L.push(`- Created: ${(o.createdDate || '').slice(0, 19).replace('T', ' ')}`);
  L.push(`- Order ID: \`${o.id}\``);
  L.push(`- Total: $${(o.total || 0).toFixed(2)} ${o.currency}`);
  L.push(`- Payment: ${o.inPayments?.[0]?.paymentMethod?.code || '—'} (${o.inPayments?.[0]?.paymentStatus || '—'})`);
  L.push(`- Shipment: ${o.shipments?.[0]?.shipmentMethodCode || '—'} / status ${o.shipments?.[0]?.status || '—'}`);
  L.push('');
  L.push('| SKU | Name | Qty | Price | Extended |');
  L.push('|-----|------|----:|------:|---------:|');
  for (const it of o.items || []) {
    L.push(`| \`${it.sku}\` | ${(it.name || '').slice(0, 50)} | ${it.quantity} | $${(it.price || 0).toFixed(2)} | $${((it.price || 0) * (it.quantity || 0)).toFixed(2)} |`);
  }
  L.push('');
}

writeFileSync(REPORT, L.join('\n'));
console.log(`Report written: ${REPORT}`);
