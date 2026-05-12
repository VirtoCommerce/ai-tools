import { config } from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
config({ path: join(ROOT, '.env.vcst'), override: true });
config({ path: join(ROOT, '.env.local'), override: true });

const BACK = process.env.BACK_URL;
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
  body: JSON.stringify({
    storeIds: ['B2B-store'],
    customerId: '143bc845-7ba3-4982-ae9a-a9446a399705',
    take: 100,
    sort: 'createdDate:asc',
  }),
});
const data = await sr.json();
const orders = data.results || [];

// Aggregate SKUs
const skus = {};
for (const o of orders) {
  for (const it of o.items || []) {
    if (!it.sku) continue;
    const k = it.sku;
    skus[k] = skus[k] || {
      sku: k, name: it.name, productId: it.productId,
      catalogId: it.catalogId, categoryId: it.categoryId,
      price: it.price, currency: it.currency,
      orders: 0, units: 0, orderNumbers: [],
    };
    skus[k].orders += 1;
    skus[k].units += it.quantity || 0;
    skus[k].orderNumbers.push(o.number);
    // Keep highest price seen (defensive — should be stable)
    if ((it.price || 0) > (skus[k].price || 0)) skus[k].price = it.price;
  }
}

const list = Object.values(skus).sort((a, b) => b.orders - a.orders || b.units - a.units);
console.log(`\nUnique SKUs across ${orders.length} orders: ${list.length}\n`);
console.log('SKU             Orders Units  Price       Name');
console.log('--------------- ------ ----- ---------- -----');
for (const s of list) {
  console.log(`${s.sku.padEnd(15)} ${String(s.orders).padStart(6)} ${String(s.units).padStart(5)} $${String((s.price || 0).toFixed(2)).padStart(8)}  ${(s.name || '').slice(0, 60)}`);
}

// Output for reuse in markdown
console.log('\n--- markdown pool table (paste into fixture) ---\n');
console.log('| # | SKU | Product | Price | In orders | Total units |');
console.log('|---|-----|---------|------:|---------:|------------:|');
list.forEach((s, i) => {
  const name = (s.name || '').replace(/\|/g, '\\|').slice(0, 70);
  console.log(`| ${i + 1} | \`${s.sku}\` | ${name} | $${(s.price || 0).toFixed(2)} | ${s.orders} | ${s.units} |`);
});

// Output JSON dump for programmatic reuse
import { writeFileSync } from 'fs';
writeFileSync(join(ROOT, 'test-data', 'b2b', 'john-mitchell-skus-vcst.json'),
  JSON.stringify({
    customer: 'John Mitchell',
    customerId: '143bc845-7ba3-4982-ae9a-a9446a399705',
    storeId: 'B2B-store',
    target: BACK,
    orderCount: orders.length,
    skuCount: list.length,
    skus: list,
  }, null, 2));
console.log(`\nJSON: test-data/b2b/john-mitchell-skus-vcst.json`);
