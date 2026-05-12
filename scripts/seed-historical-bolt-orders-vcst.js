/**
 * Backdated Carriage Bolt orders for John Mitchell on vcst-qa.
 *
 * Creates 3 historical orders to make `164W33` a real consumption pattern
 * (combined with the existing CO26050800121 from 2026-05-11):
 *
 *   CO260413-00091 — 2026-04-13 (4w ago) — 164W33×30                            = $510 + $10 ship
 *   CO260427-00091 — 2026-04-27 (2w ago) — 164W33×40 + 164W34×5                 = $897.20 + $10 ship
 *   CO260504-00091 — 2026-05-04 (1w ago) — 164W33×25                            = $425 + $10 ship
 *
 * Strategy for backdating:
 *   1. POST with createdDate in the body — VC may honor it.
 *   2. If POST returns a createdDate ≠ requested, PUT the order back with the
 *      desired createdDate (proven pattern from update-skyflow-statuses.js).
 *
 * Usage:
 *   node scripts/seed-historical-bolt-orders-vcst.js --dry-run [--verbose]
 *   node scripts/seed-historical-bolt-orders-vcst.js          # real run
 */
import { config } from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
config({ path: join(ROOT, '.env.vcst'), override: true });
config({ path: join(ROOT, '.env.local'), override: true });

const BACK = process.env.BACK_URL;
const DRY = process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose');

const CUSTOMER = {
  userId: '143bc845-7ba3-4982-ae9a-a9446a399705',
  fullName: 'John Mitchell',
  organizationId: '6fb516c1-07f3-4af4-be5e-35961e3f7993',
  organizationName: 'AGENT-TEST-Org-TechFlow-20260310',
  email: 'test-john.mitchell-20260310@test-agent.com',
  currency: 'USD',
};

const ADDR = {
  firstName: 'John', lastName: 'Mitchell', organization: CUSTOMER.organizationName,
  line1: '1200 Commerce Blvd', line2: 'Suite 400',
  city: 'New York', regionId: 'NY', regionName: 'New York',
  postalCode: '10001', countryCode: 'USA', countryName: 'United States',
  phone: '+1-212-555-1010', email: CUSTOMER.email,
};

// Carriage bolt SKUs (from CO26050800121 seed — IDs verified live).
const BOLT_164W33 = { productId: '5512e3a5201541769e1d81fc5217490c', sku: '164W33', name: 'Carriage Bolt 1" Steel, Grade A, Plain Finish, 1/4"-20 Dia/Thread Size, 1300 PK', price: 17.00,  catalogId: '7829d35f417e4dd98851f51322f32c23', categoryId: '4fbaca886f014767a52f3f38b9df648f' };
const BOLT_164W34 = { productId: '5623d43072ad486d9ec47ee75f6813d6', sku: '164W34', name: '1-1/4" Steel Carriage Bolt, Grade A, Plain Finish, 5/16"-18 Dia/Thread Size, 700 PK',   price: 43.44,  catalogId: '7829d35f417e4dd98851f51322f32c23', categoryId: '4fbaca886f014767a52f3f38b9df648f' };

const SHIPPING = 10.00;

const HISTORICAL_ORDERS = [
  {
    number: 'CO260413-00091',
    createdDate: '2026-04-13T10:30:00Z',
    lines: [{ ...BOLT_164W33, qty: 30 }],
  },
  {
    number: 'CO260427-00091',
    createdDate: '2026-04-27T14:15:00Z',
    lines: [
      { ...BOLT_164W33, qty: 40 },
      { ...BOLT_164W34, qty: 5 },
    ],
  },
  {
    number: 'CO260504-00091',
    createdDate: '2026-05-04T09:45:00Z',
    lines: [{ ...BOLT_164W33, qty: 25 }],
  },
];

// --- helpers ---
const verbose = msg => { if (VERBOSE) console.log(`    [v] ${msg}`); };

async function auth() {
  const r = await fetch(`${BACK}/connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=password&username=${process.env.ADMIN}&password=${process.env.ADMIN_PASSWORD}&scope=offline_access`,
  });
  const j = await r.json();
  if (!j.access_token) throw new Error(`Auth failed: ${JSON.stringify(j).slice(0, 200)}`);
  return { Authorization: `Bearer ${j.access_token}`, 'Content-Type': 'application/json' };
}

function buildItems(lines) {
  return lines.map(L => {
    const ext = +(L.price * L.qty).toFixed(2);
    return {
      productId: L.productId, sku: L.sku, name: L.name,
      productType: 'Physical',
      catalogId: L.catalogId, categoryId: L.categoryId,
      quantity: L.qty, currency: CUSTOMER.currency,
      price: L.price, priceWithTax: L.price,
      placedPrice: L.price, placedPriceWithTax: L.price,
      listPrice: L.price, listPriceWithTax: L.price,
      salePrice: L.price, salePriceWithTax: L.price,
      extendedPrice: ext, extendedPriceWithTax: ext,
      discountAmount: 0, discountAmountWithTax: 0,
      taxTotal: 0, taxPercentRate: 0,
      isGift: false,
    };
  });
}

function buildBody(order) {
  const items = buildItems(order.lines);
  const subTotal = +items.reduce((s, it) => s + it.extendedPrice, 0).toFixed(2);
  const total = +(subTotal + SHIPPING).toFixed(2);
  return {
    number: order.number,
    createdDate: order.createdDate,           // first try
    modifiedDate: order.createdDate,          // align audit field
    storeId: 'B2B-store', storeName: 'B2B-store',
    customerId: CUSTOMER.userId,
    customerName: CUSTOMER.fullName,
    organizationId: CUSTOMER.organizationId,
    organizationName: CUSTOMER.organizationName,
    channelId: 'B2B-store',
    currency: CUSTOMER.currency,
    languageCode: 'en-US',
    status: 'Completed',
    isApproved: true,
    items,
    addresses: [{ ...ADDR, addressType: 'BillingAndShipping' }],
    shipments: [{
      shipmentMethodCode: 'FixedRate', shipmentMethodOption: 'Ground',
      currency: CUSTOMER.currency, price: SHIPPING, priceWithTax: SHIPPING,
      total: SHIPPING, totalWithTax: SHIPPING,
      taxTotal: 0, taxPercentRate: 0, discountAmount: 0, discountAmountWithTax: 0,
      status: 'Send',
      deliveryAddress: { ...ADDR, addressType: 'Shipping' },
      items: [],
    }],
    inPayments: [{
      customerId: CUSTOMER.userId, customerName: CUSTOMER.fullName,
      organizationId: CUSTOMER.organizationId, organizationName: CUSTOMER.organizationName,
      gatewayCode: 'CyberSourcePaymentMethod',
      paymentMethod: {
        code: 'CyberSourcePaymentMethod', typeName: 'CyberSourcePaymentMethod',
        name: 'CyberSourcePaymentMethod',
        paymentMethodGroupType: 'BankCard', paymentMethodType: 'Standard',
        logoUrl: 'credit-card.svg', isActive: true, storeId: 'B2B-store',
      },
      paymentMethodCode: 'CyberSourcePaymentMethod',
      paymentMethodName: 'CyberSourcePaymentMethod',
      paymentStatus: 'Paid',
      currency: CUSTOMER.currency,
      sum: total, amount: total, total, totalWithTax: total,
      isCancelled: false,
      billingAddress: { ...ADDR, addressType: 'Billing' },
    }],
    subTotal, subTotalWithTax: subTotal,
    shippingTotal: SHIPPING, shippingTotalWithTax: SHIPPING,
    taxTotal: 0, discountTotal: 0, discountTotalWithTax: 0,
    total, totalWithTax: total,
  };
}

async function seedOne(order, headers) {
  const body = buildBody(order);
  const subTotal = body.subTotal;
  const total = body.total;
  const skuSummary = order.lines.map(L => `${L.sku}×${L.qty}`).join(' + ');
  console.log(`\n📦 ${order.number}  (target createdDate: ${order.createdDate})`);
  console.log(`   ${skuSummary} = $${subTotal} + $${SHIPPING} ship = $${total}`);

  if (DRY) { console.log('   [DRY RUN] — would POST + (if needed) PUT to backdate'); return; }

  // --- POST ---
  const pr = await fetch(`${BACK}/api/order/customerOrders`, {
    method: 'POST', headers, body: JSON.stringify(body),
  });
  if (!pr.ok) {
    console.error(`   ✗ POST → ${pr.status}: ${(await pr.text()).slice(0, 400)}`);
    return;
  }
  const created = await pr.json();
  console.log(`   ✓ POST  → number=${created.number}  id=${created.id}  createdDate=${created.createdDate}`);

  // --- check createdDate, PUT to fix if needed ---
  const wantDate = order.createdDate.slice(0, 10);
  const gotDate = (created.createdDate || '').slice(0, 10);
  if (gotDate === wantDate) {
    console.log(`   ✓ createdDate honored on POST (${gotDate})`);
    return;
  }
  console.log(`   ⟳ createdDate drift: requested ${wantDate}, got ${gotDate} — issuing PUT to fix`);
  // Re-fetch full order, then PUT
  const fr = await fetch(`${BACK}/api/order/customerOrders/${created.id}`, { headers });
  const fullOrder = await fr.json();
  fullOrder.createdDate = order.createdDate;
  fullOrder.modifiedDate = order.createdDate;
  const ur = await fetch(`${BACK}/api/order/customerOrders`, {
    method: 'PUT', headers, body: JSON.stringify(fullOrder),
  });
  if (!ur.ok) {
    console.error(`   ✗ PUT → ${ur.status}: ${(await ur.text()).slice(0, 300)}`);
    return;
  }
  // Verify
  const vr = await fetch(`${BACK}/api/order/customerOrders/${created.id}`, { headers });
  const v = await vr.json();
  const finalDate = (v.createdDate || '').slice(0, 10);
  if (finalDate === wantDate) {
    console.log(`   ✓ PUT   → createdDate now ${finalDate}`);
  } else {
    console.log(`   ⚠ PUT did not stick — createdDate still ${finalDate}. Narrate verbally during demo.`);
  }
}

// --- main ---
console.log(`\n🌱 Historical Carriage Bolt orders — vcst-qa${DRY ? ' [DRY RUN]' : ''}`);
console.log(`   Target:   ${BACK}`);
console.log(`   Customer: ${CUSTOMER.fullName} (${CUSTOMER.organizationName})`);
console.log(`   Orders:   ${HISTORICAL_ORDERS.length} backdated`);

const headers = DRY ? null : await auth();
for (const order of HISTORICAL_ORDERS) {
  await seedOne(order, headers);
}
console.log(`\n✅ Done.${DRY ? ' (dry run — no writes)' : ''}\n`);
