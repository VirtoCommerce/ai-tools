/**
 * Quote Requests Seed — VirtoStart
 *
 * Creates 5 quote requests for John Mitchell (AcmeCorp admin) on B2B-store
 * based on his top-5 highest-value orders from
 * test-data/b2b/_seed-results-orders-virtostart.json.
 *
 * Each quote:
 *   - Status: "Processing" (buyer-submitted, awaiting manager proposal)
 *   - Qty-tier negotiated discount applied per-line via salePrice + proposalPrices:
 *       total ≥ $10K → 15% off
 *       total ≥ $5K  → 10% off
 *       total ≥ $1K  → 5% off
 *   - Quote # format: RFQ{yymmdd}-001NN (starting at 00101 to avoid collisions)
 *
 * Endpoint: POST /api/quote/requests   (VirtoCommerce.QuoteModule)
 *
 * Loads .env.virtostart for URLs/admin user, .env.local for ADMIN_VIRTO_PASSWORD.
 * Writes results to test-data/b2b/_seed-results-quotes-virtostart.json + markdown report.
 *
 * Usage:
 *   node scripts/seed-quotes-virtostart.js --dry-run [--verbose]
 *   node scripts/seed-quotes-virtostart.js          # real run
 *   node scripts/seed-quotes-virtostart.js --force  # overwrite existing results
 */

import { config } from 'dotenv';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

config({ path: join(ROOT, '.env.virtostart'), override: false });
config({ path: join(ROOT, '.env.local'), override: false });
for (const [k, v] of Object.entries(process.env)) {
  if (k.endsWith('_VIRTOSTART') && v) process.env[k.slice(0, -'_VIRTOSTART'.length)] = v;
}

const BACK_URL = process.env.BACK_URL;
const ADMIN = process.env.ADMIN_VIRTO || process.env.ADMIN;
const ADMIN_PASSWORD = process.env.ADMIN_VIRTO_PASSWORD
  || process.env.ADMIN_PASSWORD_VIRTOSTART
  || process.env.ADMIN_PASSWORD;
const STORE_ID = process.env.STORE_ID || 'B2B-store';
const DATE_STAMP = '20260511';
const SEQ_START = 101;

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const VERBOSE = args.includes('--verbose');
const FORCE = args.includes('--force');

const ORDERS_FILE = join(ROOT, 'test-data', 'b2b', '_seed-results-orders-virtostart.json');
const RESULTS_FILE = join(ROOT, 'test-data', 'b2b', '_seed-results-quotes-virtostart.json');
const REPORT_FILE = join(ROOT, 'test-data', 'b2b', `seed-report-quotes-virtostart-${DATE_STAMP}.md`);

// ---------- ADDRESS (per existing AcmeCorp seed) ----------

const SHIPPING_ADDRESS = {
  addressType: 'Shipping',
  firstName: 'John',
  lastName: 'Mitchell',
  organization: 'AGENT-TEST-Org-AcmeCorp-20260508',
  line1: '1200 Commerce Blvd',
  line2: 'Suite 400',
  city: 'New York',
  regionId: 'NY',
  regionName: 'New York',
  postalCode: '10001',
  countryCode: 'USA',
  countryName: 'United States',
  phone: '+1-212-555-1010',
  email: 'test-john.mitchell-20260508@test-agent.com',
};
const BILLING_ADDRESS = { ...SHIPPING_ADDRESS, addressType: 'Billing' };

// ---------- DISCOUNT TIER ----------

function discountPctFor(total) {
  if (total >= 10000) return 0.15;
  if (total >= 5000) return 0.10;
  if (total >= 1000) return 0.05;
  return 0;
}

// ---------- STATE ----------

const state = {
  adminToken: null,
  customer: null,        // from orders file
  selectedOrders: [],    // top 5
  quotes: [],            // results
};

const log = msg => console.log(`  ${msg}`);
const verbose = msg => { if (VERBOSE) console.log(`    [v] ${msg}`); };

async function api(method, path, body, { expectStatus = [200, 201, 204], formUrlEncoded = false, mutating = true } = {}) {
  const url = `${BACK_URL}${path}`;
  verbose(`${method} ${url}`);
  if (DRY_RUN && mutating && method !== 'GET') {
    verbose('  [DRY RUN] skipped');
    if (VERBOSE && body) console.log('    [v] body:', JSON.stringify(body).slice(0, 600));
    return { _dryRun: true, id: `dry-${Math.random().toString(36).slice(2, 10)}`, number: `RFQ-DRY-${Date.now() % 100000}` };
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

function loadTopFiveOrders() {
  if (!existsSync(ORDERS_FILE)) {
    throw new Error(`Orders seed file not found: ${ORDERS_FILE}`);
  }
  const raw = JSON.parse(readFileSync(ORDERS_FILE, 'utf-8'));
  state.customer = raw.customer;
  const sorted = [...raw.orders].sort((a, b) => b.total - a.total);
  state.selectedOrders = sorted.slice(0, 5);
  log(`Customer: ${state.customer.fullName}`);
  log(`Org:      ${state.customer.organizationName}`);
  log(`Top 5 orders by value:`);
  state.selectedOrders.forEach((o, i) => {
    log(`  [${i + 1}] ${o.orderNumber}  $${String(o.total).padStart(9)}  ${o.lines.length} line(s)`);
  });
}

function buildQuoteItem(line, discountPct) {
  const discountedUnit = +(line.unitPrice * (1 - discountPct)).toFixed(2);
  return {
    sku: line.sku,
    productId: line.productId,
    name: line.name,
    currency: state.customer.currency,
    listPrice: line.unitPrice,
    salePrice: discountedUnit,
    quantity: line.quantity,
    isConfigured: false,
    selectedTierPrice: { price: discountedUnit, quantity: line.quantity },
    proposalPrices: [{ price: discountedUnit, quantity: line.quantity }],
    configurationItems: [],
  };
}

function buildQuoteBody(order, idx) {
  const discountPct = discountPctFor(order.total);
  const items = order.lines.map(li => buildQuoteItem(li, discountPct));

  const originalSubTotalExlTax = +order.lines.reduce((s, li) => s + li.extended, 0).toFixed(2);
  const subTotalExlTax = +items.reduce((s, it) => s + it.salePrice * it.quantity, 0).toFixed(2);
  const discountTotal = +(originalSubTotalExlTax - subTotalExlTax).toFixed(2);
  const shippingTotal = 10;
  const taxTotal = 0;
  const grandTotalExlTax = +(subTotalExlTax + shippingTotal).toFixed(2);
  const grandTotalInclTax = +(grandTotalExlTax + taxTotal).toFixed(2);

  const quoteNumber = `RFQ${DATE_STAMP.slice(2)}-${String(SEQ_START + idx).padStart(5, '0')}`;

  return {
    body: {
      number: quoteNumber,
      storeId: STORE_ID,
      channelId: STORE_ID,
      isAnonymous: false,
      customerId: state.customer.userId,
      customerName: state.customer.fullName,
      organizationId: state.customer.organizationId,
      organizationName: state.customer.organizationName,
      currency: state.customer.currency,
      languageCode: 'en-US',
      status: 'Processing',
      tag: `demo:top-value-from:${order.orderNumber}`,
      comment: `Negotiated quote against ${order.orderNumber} (original $${order.total.toFixed(2)}). ${(discountPct * 100).toFixed(0)}% volume discount applied per-line.`,
      innerComment: 'Auto-seeded for Demo 1c (Submit-for-approval). Top-5 by value.',
      enableNotification: false,
      isLocked: false,
      isCancelled: false,
      manualShippingTotal: shippingTotal,
      manualSubTotal: 0,
      manualRelDiscountAmount: 0,
      totals: {
        originalSubTotalExlTax,
        subTotalExlTax,
        shippingTotal,
        discountTotal,
        taxTotal,
        adjustmentQuoteExlTax: discountTotal,
        grandTotalExlTax,
        grandTotalInclTax,
      },
      shipmentMethod: {
        shipmentMethodCode: 'FixedRate',
        optionName: 'Ground',
        currency: state.customer.currency,
        price: shippingTotal,
      },
      addresses: [
        { ...SHIPPING_ADDRESS, organization: state.customer.organizationName },
        { ...BILLING_ADDRESS, organization: state.customer.organizationName },
      ],
      items,
      attachments: [],
      taxDetails: [],
    },
    summary: {
      quoteNumber,
      sourceOrderNumber: order.orderNumber,
      sourceOrderTotal: order.total,
      discountPct,
      discountAmount: discountTotal,
      grandTotalInclTax,
      lineCount: items.length,
    },
  };
}

async function createQuote(order, idx) {
  const { body, summary } = buildQuoteBody(order, idx);
  const lineSummary = order.lines.map(li => `${li.sku}×${li.quantity}`).join(', ');
  log(`Quote ${idx + 1} ← ${order.orderNumber}  $${String(order.total).padStart(9)} → $${summary.grandTotalInclTax.toString().padStart(9)} (-${(summary.discountPct * 100).toFixed(0)}%)  ${lineSummary}`);

  const created = await api('POST', '/api/quote/requests', body, { expectStatus: [200, 201, 204] });

  state.quotes.push({
    idx,
    quoteId: created?.id || null,
    quoteNumber: created?.number || summary.quoteNumber,
    status: created?.status || 'Processing',
    sourceOrderId: order.orderId,
    sourceOrderNumber: order.orderNumber,
    sourceOrderTotal: order.total,
    discountPct: summary.discountPct,
    discountAmount: summary.discountAmount,
    originalSubTotalExlTax: body.totals.originalSubTotalExlTax,
    subTotalExlTax: body.totals.subTotalExlTax,
    shippingTotal: body.totals.shippingTotal,
    grandTotalInclTax: body.totals.grandTotalInclTax,
    currency: body.currency,
    lineCount: body.items.length,
    lines: body.items.map(it => ({
      sku: it.sku,
      name: it.name,
      productId: it.productId,
      quantity: it.quantity,
      listPrice: it.listPrice,
      salePrice: it.salePrice,
      extended: +(it.salePrice * it.quantity).toFixed(2),
    })),
  });
}

function buildResultsJson() {
  return {
    profile: 'quotes',
    target: BACK_URL,
    storeId: STORE_ID,
    dateStamp: DATE_STAMP,
    seededAt: new Date().toISOString(),
    dryRun: DRY_RUN,
    customer: { ...state.customer },
    sourceFile: '_seed-results-orders-virtostart.json',
    selectionRule: 'Top 5 orders by total value',
    discountTiers: { '>=10000': 0.15, '>=5000': 0.10, '>=1000': 0.05 },
    quoteStatusOnCreate: 'Processing',
    endpoint: 'POST /api/quote/requests',
    quotes: state.quotes,
  };
}

function buildMarkdownReport(results) {
  const L = [];
  L.push(`# Quote Requests Seed — VirtoStart — ${DATE_STAMP}${DRY_RUN ? ' (DRY RUN)' : ''}`);
  L.push('');
  L.push(`**Platform:** ${BACK_URL}`);
  L.push(`**Store:** ${STORE_ID}`);
  L.push(`**Customer:** ${state.customer.fullName} (\`${state.customer.userId}\`)`);
  L.push(`**Org:** ${state.customer.organizationName} (\`${state.customer.organizationId}\`)`);
  L.push(`**Date:** ${results.seededAt}`);
  L.push(`**Method:** Admin REST (\`POST /api/quote/requests\`)`);
  L.push(`**Source orders:** Top 5 by value from \`_seed-results-orders-virtostart.json\``);
  L.push(`**Status on create:** \`Processing\` (buyer-submitted, awaiting manager proposal)`);
  L.push('');
  L.push('## Discount tiers (per-line `salePrice` + `proposalPrices`)');
  L.push('');
  L.push('| Order total | Discount applied |');
  L.push('|-------------|------------------|');
  L.push('| ≥ $10,000   | 15%              |');
  L.push('| ≥ $5,000    | 10%              |');
  L.push('| ≥ $1,000    | 5%               |');
  L.push('| < $1,000    | 0%               |');
  L.push('');
  L.push('## Quotes Created');
  L.push('');
  for (const q of results.quotes) {
    L.push(`### Quote ${q.idx + 1} — ${q.quoteNumber}`);
    L.push('');
    L.push(`- **Quote ID:** \`${q.quoteId || '(pending)'}\``);
    L.push(`- **Quote #:** \`${q.quoteNumber}\``);
    L.push(`- **Status:** ${q.status}`);
    L.push(`- **Source order:** \`${q.sourceOrderNumber}\` ($${q.sourceOrderTotal.toFixed(2)})`);
    L.push(`- **Discount applied:** ${(q.discountPct * 100).toFixed(0)}% (saves $${q.discountAmount.toFixed(2)})`);
    L.push(`- **Quote subtotal:** $${q.subTotalExlTax.toFixed(2)} + shipping $${q.shippingTotal.toFixed(2)} = **$${q.grandTotalInclTax.toFixed(2)}**`);
    L.push('');
    L.push('| SKU | Qty | List | Sale | Extended |');
    L.push('|-----|-----|------|------|----------|');
    for (const li of q.lines) {
      L.push(`| \`${li.sku}\` | ${li.quantity} | $${li.listPrice.toFixed(2)} | $${li.salePrice.toFixed(2)} | $${li.extended.toFixed(2)} |`);
    }
    L.push('');
  }
  L.push('## Demo angle');
  L.push('');
  L.push('These five "in-flight" quotes back **Demo 1c** ("Procurement Compliance" / "Submit for approval"):');
  L.push('');
  L.push('- John has 20 historical orders + 5 active quote requests pending manager proposal');
  L.push('- Volume discount tiers visible on each item — supports the "AI-aware pricing assistant suggests negotiated discount" narrative (Demo 4b crossover)');
  L.push('- All quotes live at `/account/quotes` on storefront — buyer-visible list');
  L.push('');
  return L.join('\n');
}

async function main() {
  console.log(`\n📝 Quote Requests Seed — VirtoStart${DRY_RUN ? ' [DRY RUN]' : ''}`);
  console.log(`   Target:   ${BACK_URL}`);
  console.log(`   Store:    ${STORE_ID}`);
  console.log(`   Date:     ${DATE_STAMP}\n`);

  if (!BACK_URL || !ADMIN || !ADMIN_PASSWORD) {
    console.error('Missing BACK_URL, ADMIN, or ADMIN_PASSWORD. Check .env.virtostart + .env.local');
    process.exit(1);
  }
  if (!DRY_RUN && !FORCE && existsSync(RESULTS_FILE)) {
    console.error(`Results file already exists: ${RESULTS_FILE}\nRe-run with --force to overwrite.`);
    process.exit(1);
  }

  await authenticate();
  loadTopFiveOrders();

  console.log(`\n  Creating ${state.selectedOrders.length} quote requests:`);
  for (let i = 0; i < state.selectedOrders.length; i++) {
    await createQuote(state.selectedOrders[i], i);
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
  console.log('\n✅ Quote seed complete!\n');
}

main().catch(err => {
  console.error(`\n❌ Seed failed: ${err.message}`);
  if (VERBOSE) console.error(err.stack);
  process.exit(1);
});
