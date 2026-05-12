/**
 * Order Seed — VirtoStart
 *
 * Creates 20 orders for John Mitchell (AcmeCorp admin, seeded 2026-05-08) on
 * the VirtoStart B2B-store, using a varied pool of products discovered live
 * from the storefront catalog via xAPI GraphQL.
 *
 *   Payment mix:   5 CyberSource · 5 AuthorizeNet · 5 Skyflow · 5 DefaultManual
 *   Status mix:
 *     CyberSource (5):  2 Completed · 1 Pending · 2 New
 *     AuthorizeNet (5): 2 Completed · 1 Pending · 2 New
 *     Skyflow (5):      1 Completed · 2 Processing · 2 "Payment required"
 *     DefaultManual (5):2 Completed · 1 Pending · 2 New
 *   Lines per order: 1–3, drawn from a 15-SKU pool (no repeats within an order)
 *   Quantities: 1–10 per line
 *
 * Loads .env.virtostart for URLs/admin user, .env.local for ADMIN_PASSWORD.
 * Writes IDs/SKUs to test-data/b2b/_seed-results-orders-virtostart.json and a
 * markdown report alongside it.
 *
 * Usage:
 *   node scripts/seed-orders-virtostart.js --dry-run [--verbose]
 *   node scripts/seed-orders-virtostart.js          # real run
 *   node scripts/seed-orders-virtostart.js --force  # overwrite existing results
 */

import { config } from 'dotenv';
import { writeFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

config({ path: join(ROOT, '.env.virtostart'), override: false });
config({ path: join(ROOT, '.env.local'), override: false });

// Promote *_VIRTOSTART suffixed vars to their base names (matches config.js).
// Lets .env.local carry ADMIN_PASSWORD_VIRTOSTART without leaking into committed files.
for (const [key, value] of Object.entries(process.env)) {
  if (key.endsWith('_VIRTOSTART') && value) {
    process.env[key.slice(0, -'_VIRTOSTART'.length)] = value;
  }
}

const BACK_URL = process.env.BACK_URL;
// Virtostart-specific admin (per .env.virtostart + .env.local conventions):
//   .env.virtostart: ADMIN_VIRTO=virto-admin
//   .env.local:      ADMIN_VIRTO_PASSWORD=<password>
// Fallback chain handles either naming style (_VIRTOSTART suffix or _VIRTO infix).
const ADMIN = process.env.ADMIN_VIRTO || process.env.ADMIN;
const ADMIN_PASSWORD = process.env.ADMIN_VIRTO_PASSWORD
  || process.env.ADMIN_PASSWORD_VIRTOSTART
  || process.env.ADMIN_PASSWORD;
const STORE_ID = process.env.STORE_ID || 'B2B-store';
const DATE_STAMP = '20260508';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const VERBOSE = args.includes('--verbose');
const FORCE = args.includes('--force');

const RESULTS_FILE = join(ROOT, 'test-data', 'b2b', '_seed-results-orders-virtostart.json');
const REPORT_FILE = join(ROOT, 'test-data', 'b2b', `seed-report-orders-virtostart-${DATE_STAMP}.md`);

// ---------- TARGET CUSTOMER (from _seed-results-orgs-virtostart.json) ----------

const CUSTOMER = {
  userId: 'f2f838d8-2195-4a36-8d8d-01de34ae66c3',
  contactId: '08f73abb-3a81-4531-be3b-2718259519d3',
  userName: 'test-john.mitchell-20260508@test-agent.com',
  fullName: 'John Mitchell-20260508',
  firstName: 'John',
  lastName: 'Mitchell',
  organizationId: '8a64d782-d3f5-4f3f-835a-525b8b41b496',
  organizationName: 'AGENT-TEST-Org-AcmeCorp-20260508',
  currency: 'USD',
};

const ADDRESS = {
  addressType: 'BillingAndShipping', // VC enum: Undefined | Billing | Shipping | BillingAndShipping | Pickup
  firstName: 'John',
  lastName: 'Mitchell',
  organization: CUSTOMER.organizationName,
  line1: '1200 Commerce Blvd',
  line2: 'Suite 400',
  city: 'New York',
  regionId: 'NY',
  regionName: 'New York',
  postalCode: '10001',
  countryCode: 'USA',
  countryName: 'United States',
  phone: '+1-212-555-1010',
  email: CUSTOMER.userName,
};

const ORDER_COUNT = 20;
const POOL_SIZE = 15;        // how many distinct products to pull from xAPI

// Per-order plan (idx 0..19). Round-robin payment + per-payment status mix.
// idx % 4 → payment method:  0=CyberSource, 1=AuthorizeNet, 2=Skyflow, 3=DefaultManual
const STATUS_MIX = [
  /*  0 CyberSource */ { status: 'Completed',        shipmentStatus: 'Send', tag: 'completed' },
  /*  1 AuthorizeNet*/ { status: 'Completed',        shipmentStatus: 'Send', tag: 'completed' },
  /*  2 Skyflow     */ { status: 'Completed',        shipmentStatus: 'Send', tag: 'completed' },
  /*  3 DefaultMan. */ { status: 'Completed',        shipmentStatus: 'Send', tag: 'completed' },
  /*  4 CyberSource */ { status: 'Completed',        shipmentStatus: 'Send', tag: 'completed' },
  /*  5 AuthorizeNet*/ { status: 'Completed',        shipmentStatus: 'Send', tag: 'completed' },
  /*  6 Skyflow     */ { status: 'Processing',       shipmentStatus: 'New',  tag: 'processing' },
  /*  7 DefaultMan. */ { status: 'Completed',        shipmentStatus: 'Send', tag: 'completed' },
  /*  8 CyberSource */ { status: 'Pending',          shipmentStatus: 'New',  tag: 'pending'  },
  /*  9 AuthorizeNet*/ { status: 'Pending',          shipmentStatus: 'New',  tag: 'pending'  },
  /* 10 Skyflow     */ { status: 'Processing',       shipmentStatus: 'New',  tag: 'processing' },
  /* 11 DefaultMan. */ { status: 'Pending',          shipmentStatus: 'New',  tag: 'pending'  },
  /* 12 CyberSource */ { status: 'New',              shipmentStatus: 'New',  tag: 'new'      },
  /* 13 AuthorizeNet*/ { status: 'New',              shipmentStatus: 'New',  tag: 'new'      },
  /* 14 Skyflow     */ { status: 'Payment required', shipmentStatus: 'New',  tag: 'payment-required' },
  /* 15 DefaultMan. */ { status: 'New',              shipmentStatus: 'New',  tag: 'new'      },
  /* 16 CyberSource */ { status: 'New',              shipmentStatus: 'New',  tag: 'new'      },
  /* 17 AuthorizeNet*/ { status: 'New',              shipmentStatus: 'New',  tag: 'new'      },
  /* 18 Skyflow     */ { status: 'Payment required', shipmentStatus: 'New',  tag: 'payment-required' },
  /* 19 DefaultMan. */ { status: 'New',              shipmentStatus: 'New',  tag: 'new'      },
];

// Payment method registry — 4 registered methods on virtostart B2B-store, verified via
// /api/order/customerOrders/search probe (counts in last 50 orders shown for context).
const PAYMENT_METHODS = [
  { code: 'CyberSourcePaymentMethod',  group: 'BankCard',    type: 'Standard',      logo: 'credit-card.svg' },
  { code: 'AuthorizeNetPaymentMethod', group: 'Alternative', type: 'PreparedForm',  logo: 'credit-card.svg' },
  { code: 'SkyflowPaymentMethod',      group: 'Alternative', type: 'PreparedForm',  logo: 'credit-card.svg' },
  { code: 'DefaultManualPaymentMethod', group: 'Manual',     type: 'Unknown',       logo: null },
];

// Round-robin assignment so each payment method gets ~5 of the 20 orders
function paymentForOrder(idx) {
  return PAYMENT_METHODS[idx % PAYMENT_METHODS.length];
}

// Deterministic pseudo-random so dry-run and real-run pick the same plan
function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(20260508);

function buildOrderPlan(pool) {
  const plan = [];
  for (let i = 0; i < ORDER_COUNT; i++) {
    const status = STATUS_MIX[i];
    const lineCount = 1 + Math.floor(rng() * 3); // 1..3
    // Pick distinct products for this order
    const indices = new Set();
    while (indices.size < Math.min(lineCount, pool.length)) {
      indices.add(Math.floor(rng() * pool.length));
    }
    const products = [...indices].map(idx => pool[idx]);
    const quantities = products.map(p => {
      const max = Math.min(10, p.availableQuantity);
      return 1 + Math.floor(rng() * Math.max(1, max));
    });
    plan.push({
      idx: i,
      label: `Order ${i + 1}`,
      lineCount: products.length,
      products,
      quantities,
      targetStatus: status.status,
      shipmentStatus: status.shipmentStatus,
      tag: status.tag,
      payment: paymentForOrder(i),
    });
  }
  return plan;
}

// ---------- STATE ----------

const state = {
  adminToken: null,
  catalogRootId: null,
  products: [],   // [{ id, code, name, productType, catalogId, categoryId, priceActual, priceCurrency, isInStock }]
  orders: [],     // [{ idx, label, orderNumber, orderId, status, shipmentStatus, lineCount, lines: [...], total }]
};

// ---------- HELPERS ----------

const log = msg => console.log(`  ${msg}`);
const verbose = msg => { if (VERBOSE) console.log(`    [v] ${msg}`); };

async function api(method, path, body, { expectStatus = [200, 201, 204], formUrlEncoded = false, mutating = true } = {}) {
  const url = `${BACK_URL}${path}`;
  verbose(`${method} ${url}`);
  if (DRY_RUN && mutating && method !== 'GET') {
    verbose('  [DRY RUN] skipped');
    if (VERBOSE && body) console.log('    [v] body:', JSON.stringify(body).slice(0, 500));
    return { _dryRun: true, id: `dry-${Math.random().toString(36).slice(2, 10)}`, number: `CO-DRY-${Date.now() % 100000}` };
  }
  const headers = {};
  if (state.adminToken) headers['Authorization'] = `Bearer ${state.adminToken}`;

  let fetchBody;
  if (body && formUrlEncoded) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    fetchBody = Object.entries(body).map(([k, v]) => `${k}=${v}`).join('&');
  } else if (body) {
    headers['Content-Type'] = 'application/json';
    fetchBody = JSON.stringify(body);
  }
  const res = await fetch(url, { method, headers, body: fetchBody });
  if (!expectStatus.includes(res.status)) {
    const text = await res.text().catch(() => '');
    throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 600)}`);
  }
  const ct = res.headers.get('content-type') || '';
  return ct.includes('application/json') ? res.json() : null;
}

async function gql(query, variables) {
  const url = `${BACK_URL}/graphql`;
  verbose(`POST ${url}  [op=${(query.match(/(query|mutation)\s+(\w+)/) || [])[2] || '?'}]`);
  const headers = { 'Content-Type': 'application/json' };
  if (state.adminToken) headers['Authorization'] = `Bearer ${state.adminToken}`;
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ query, variables }) });
  if (!res.ok) throw new Error(`GraphQL HTTP ${res.status}: ${(await res.text()).slice(0, 400)}`);
  const json = await res.json();
  if (json.errors?.length) throw new Error(`GraphQL errors: ${JSON.stringify(json.errors).slice(0, 600)}`);
  return json.data;
}

async function authenticate() {
  log('Authenticating as admin...');
  const data = await api('POST', '/connect/token', {
    grant_type: 'password',
    username: ADMIN,
    password: ADMIN_PASSWORD,
    scope: 'offline_access',
  }, { formUrlEncoded: true, expectStatus: [200], mutating: false });
  state.adminToken = data.access_token;
  log(`Auth: OK (expires in ${data.expires_in}s)`);
}

// ---------- PRODUCT DISCOVERY (read-only, runs in dry-run too) ----------

async function discoverProducts() {
  log(`Querying products visible to ${CUSTOMER.fullName} (need ${POOL_SIZE} in-stock with qty ≥ 10)...`);
  const query = `
    query Products($storeId: String!, $userId: String, $cultureName: String!, $currencyCode: String!, $first: Int) {
      products(storeId: $storeId, userId: $userId, cultureName: $cultureName, currencyCode: $currencyCode, first: $first) {
        totalCount
        items {
          id
          code
          name
          productType
          catalogId
          category { id }
          minQuantity
          maxQuantity
          price {
            actual { amount currency { code } }
            list   { amount currency { code } }
          }
          availabilityData {
            isAvailable
            isInStock
            availableQuantity
          }
        }
      }
    }`;
  const data = await gql(query, {
    storeId: STORE_ID,
    userId: CUSTOMER.userId,
    cultureName: 'en-US',
    currencyCode: CUSTOMER.currency,
    first: 200,
  });
  const items = data?.products?.items || [];
  log(`  total in catalog: ${data?.products?.totalCount ?? '?'}`);
  log(`  fetched: ${items.length}`);

  const eligible = items
    .map(p => ({
      id: p.id,
      code: p.code,
      name: p.name,
      productType: p.productType,
      catalogId: p.catalogId,
      categoryId: p.category?.id || null,
      minQuantity: p.minQuantity ?? 1,
      priceActual: p.price?.actual?.amount ?? 0,
      priceCurrency: p.price?.actual?.currency?.code ?? CUSTOMER.currency,
      isInStock: p.availabilityData?.isInStock ?? false,
      availableQuantity: p.availabilityData?.availableQuantity ?? 0,
    }))
    .filter(p => p.isInStock && p.priceActual > 0 && p.availableQuantity >= 10 && p.productType !== 'Configurable');

  if (eligible.length < POOL_SIZE) {
    throw new Error(`Need ${POOL_SIZE} in-stock priced products with qty ≥ 10; found ${eligible.length} eligible out of ${items.length} fetched.`);
  }
  // Pick a varied pool: take every Nth eligible to spread across categories rather than
  // bunching the first 15 (which tend to be from the same xAPI page slice).
  const stride = Math.max(1, Math.floor(eligible.length / POOL_SIZE));
  const picked = [];
  for (let i = 0; picked.length < POOL_SIZE && i * stride < eligible.length; i++) {
    picked.push(eligible[i * stride]);
  }
  state.products = picked;
  log(`  ✓ selected pool of ${picked.length}:`);
  picked.forEach((p, i) => {
    log(`    [${String(i + 1).padStart(2)}] ${p.code.padEnd(16)} ${p.name.slice(0, 48).padEnd(48)} ${String(p.priceActual).padStart(6)} ${p.priceCurrency} (stock ${p.availableQuantity})`);
  });
}

// ---------- ORDER BUILDING ----------

function buildLineItem(product, quantity) {
  const ext = +(product.priceActual * quantity).toFixed(2);
  return {
    productId: product.id,
    sku: product.code,
    name: product.name,
    productType: product.productType || 'Physical',
    catalogId: product.catalogId,
    categoryId: product.categoryId,
    quantity,
    currency: product.priceCurrency,
    price: product.priceActual,
    priceWithTax: product.priceActual,
    placedPrice: product.priceActual,
    placedPriceWithTax: product.priceActual,
    listPrice: product.priceActual,
    listPriceWithTax: product.priceActual,
    salePrice: product.priceActual,
    salePriceWithTax: product.priceActual,
    extendedPrice: ext,
    extendedPriceWithTax: ext,
    discountAmount: 0,
    discountAmountWithTax: 0,
    taxTotal: 0,
    taxPercentRate: 0,
    isGift: false,
  };
}

function buildOrderBody(plan, productsForOrder) {
  const items = productsForOrder.map((p, i) => buildLineItem(p, plan.quantities[i]));
  const subTotal = +items.reduce((s, it) => s + it.extendedPrice, 0).toFixed(2);
  const shippingPrice = 10.00;
  const total = +(subTotal + shippingPrice).toFixed(2);
  // Generate an order number that won't collide with existing CO260508* sequences.
  // Format mirrors VC live data: `CO{yymmdd}{seq:05}` → e.g. CO26050800101.
  const orderNumber = `CO${DATE_STAMP.slice(2)}${String(plan.idx + 101).padStart(5, '0')}`;

  return {
    number: orderNumber,
    storeId: STORE_ID,
    storeName: STORE_ID,
    customerId: CUSTOMER.userId,
    customerName: CUSTOMER.fullName,
    organizationId: CUSTOMER.organizationId,
    organizationName: CUSTOMER.organizationName,
    employeeId: null,
    channelId: STORE_ID,
    currency: CUSTOMER.currency,
    languageCode: 'en-US',
    status: plan.targetStatus,
    isApproved: plan.targetStatus === 'Completed',
    items,
    addresses: [{ ...ADDRESS, addressType: 'BillingAndShipping' }],
    shipments: [{
      shipmentMethodCode: 'FixedRate',
      shipmentMethodOption: 'Ground',
      currency: CUSTOMER.currency,
      price: shippingPrice,
      priceWithTax: shippingPrice,
      total: shippingPrice,
      totalWithTax: shippingPrice,
      taxTotal: 0,
      taxPercentRate: 0,
      discountAmount: 0,
      discountAmountWithTax: 0,
      status: plan.shipmentStatus,
      deliveryAddress: { ...ADDRESS, addressType: 'Shipping' },
      items: [],
    }],
    inPayments: [{
      customerId: CUSTOMER.userId,
      customerName: CUSTOMER.fullName,
      organizationId: CUSTOMER.organizationId,
      organizationName: CUSTOMER.organizationName,
      gatewayCode: plan.payment.code,
      paymentMethod: {
        code: plan.payment.code,
        typeName: plan.payment.code,
        name: plan.payment.code,
        paymentMethodGroupType: plan.payment.group,
        paymentMethodType: plan.payment.type,
        logoUrl: plan.payment.logo,
        isActive: true,
        storeId: STORE_ID,
      },
      paymentMethodCode: plan.payment.code,
      paymentMethodName: plan.payment.code,
      paymentStatus: plan.targetStatus === 'Completed' ? 'Paid' : 'New',
      currency: CUSTOMER.currency,
      sum: total,
      amount: total,
      total,
      totalWithTax: total,
      isCancelled: false,
      billingAddress: { ...ADDRESS, addressType: 'Billing' },
    }],
    subTotal,
    subTotalWithTax: subTotal,
    shippingTotal: shippingPrice,
    shippingTotalWithTax: shippingPrice,
    taxTotal: 0,
    discountTotal: 0,
    discountTotalWithTax: 0,
    total,
    totalWithTax: total,
  };
}

async function createOrder(plan) {
  const body = buildOrderBody(plan, plan.products);

  const skus = plan.products.map((p, i) => `${p.code}×${plan.quantities[i]}`).join(', ');
  const pm = plan.payment.code.replace('PaymentMethod', '');
  log(`${plan.label.padEnd(9)} [${plan.targetStatus.padEnd(9)}] [${pm.padEnd(13)}] ${plan.lineCount} line(s)  total ${String(body.total).padStart(7)} ${body.currency}  ${skus}`);

  // POST /api/order/customerOrders — create order directly via admin API
  const created = await api('POST', '/api/order/customerOrders', body, { expectStatus: [200, 201, 204] });

  state.orders.push({
    idx: plan.idx,
    label: plan.label,
    tag: plan.tag,
    orderId: created?.id || null,
    orderNumber: created?.number || null,
    status: plan.targetStatus,
    shipmentStatus: plan.shipmentStatus,
    paymentMethod: plan.payment.code,
    paymentGroup: plan.payment.group,
    total: body.total,
    currency: body.currency,
    lineCount: plan.lineCount,
    lines: plan.products.map((p, i) => ({
      sku: p.code,
      name: p.name,
      productId: p.id,
      quantity: plan.quantities[i],
      unitPrice: p.priceActual,
      extended: +(p.priceActual * plan.quantities[i]).toFixed(2),
    })),
  });
}

// ---------- OUTPUT ----------

function buildResultsJson() {
  return {
    profile: 'orders',
    target: BACK_URL,
    storeId: STORE_ID,
    dateStamp: DATE_STAMP,
    seededAt: new Date().toISOString(),
    dryRun: DRY_RUN,
    customer: { ...CUSTOMER },
    productsUsed: state.products.map(p => ({
      sku: p.code,
      productId: p.id,
      name: p.name,
      productType: p.productType,
      priceActual: p.priceActual,
      currency: p.priceCurrency,
    })),
    orders: state.orders,
  };
}

function buildMarkdownReport(results) {
  const L = [];
  L.push(`# Orders Seed — VirtoStart — ${DATE_STAMP}${DRY_RUN ? ' (DRY RUN)' : ''}`);
  L.push('');
  L.push(`**Platform:** ${BACK_URL}`);
  L.push(`**Store:** ${STORE_ID}`);
  L.push(`**Customer:** ${CUSTOMER.fullName} (\`${CUSTOMER.userId}\`)`);
  L.push(`**Org:** ${CUSTOMER.organizationName} (\`${CUSTOMER.organizationId}\`)`);
  L.push(`**Date:** ${results.seededAt}`);
  L.push(`**Method:** Admin REST (\`POST /api/order/customerOrders\`)`);
  L.push('');
  L.push('## Products Used');
  L.push('');
  L.push('| # | SKU | Name | Price | Currency |');
  L.push('|---|-----|------|-------|----------|');
  results.productsUsed.forEach((p, i) => {
    L.push(`| ${i + 1} | \`${p.sku}\` | ${p.name} | ${p.priceActual} | ${p.currency} |`);
  });
  L.push('');
  L.push('## Orders');
  L.push('');
  for (const o of results.orders) {
    L.push(`### ${o.label} — ${o.status}`);
    L.push('');
    L.push(`- **Order #:** \`${o.orderNumber || '(pending)'}\``);
    L.push(`- **Order ID:** \`${o.orderId || '(pending)'}\``);
    L.push(`- **Total:** ${o.total} ${o.currency}`);
    L.push(`- **Shipment status:** ${o.shipmentStatus}`);
    L.push('');
    L.push('| SKU | Qty | Unit | Extended |');
    L.push('|-----|-----|------|----------|');
    for (const li of o.lines) {
      L.push(`| \`${li.sku}\` | ${li.quantity} | ${li.unitPrice} | ${li.extended} |`);
    }
    L.push('');
  }
  return L.join('\n');
}

// ---------- MAIN ----------

async function main() {
  console.log(`\n📦 Order Seed — VirtoStart${DRY_RUN ? ' [DRY RUN]' : ''}`);
  console.log(`   Target:   ${BACK_URL}`);
  console.log(`   Store:    ${STORE_ID}`);
  console.log(`   Customer: ${CUSTOMER.fullName}`);
  console.log(`   Date:     ${DATE_STAMP}\n`);

  if (!BACK_URL || !ADMIN || !ADMIN_PASSWORD) {
    console.error('Missing BACK_URL, ADMIN, or ADMIN_PASSWORD in .env.virtostart / .env.local');
    process.exit(1);
  }

  if (!DRY_RUN && !FORCE && existsSync(RESULTS_FILE)) {
    console.error(`Results file already exists: ${RESULTS_FILE}\nRe-run with --force to overwrite.`);
    process.exit(1);
  }

  await authenticate();
  await discoverProducts();

  const orderPlans = buildOrderPlan(state.products);
  console.log(`\n  Creating ${orderPlans.length} orders:`);
  for (const plan of orderPlans) {
    await createOrder(plan);
  }

  const results = buildResultsJson();
  if (!DRY_RUN) {
    writeFileSync(RESULTS_FILE, JSON.stringify(results, null, 2));
    log(`\nResults JSON: ${RESULTS_FILE}`);
    writeFileSync(REPORT_FILE, buildMarkdownReport(results));
    log(`Report MD:    ${REPORT_FILE}`);
  } else {
    console.log('\n  [DRY RUN] — nothing was written. Re-run without --dry-run to seed.');
    if (VERBOSE) {
      console.log('\n--- Planned results JSON ---');
      console.log(JSON.stringify(results, null, 2));
    }
  }
  console.log('\n✅ Order seed complete!\n');
}

main().catch(err => {
  console.error(`\n❌ Seed failed: ${err.message}`);
  if (VERBOSE) console.error(err.stack);
  process.exit(1);
});
