/**
 * Single-order seed — Carriage Bolt family for John Mitchell on vcst-qa.
 *
 *   3 line items (all 3 variants of SKU 164W33 family):
 *     164W33 × 25  @ $17.00   = $425.00   (1" Steel, 1/4"-20, 1300 PK)
 *     164W34 × 15  @ $43.44   = $651.60   (1-1/4" Steel, 5/16"-18, 700 PK)
 *     164W48 × 10  @ $102.88  = $1,028.80 (1/2" Steel, 1/4"-20, 1800 PK)
 *   Subtotal $2,105.40 + $10 ship = $2,115.40
 *   Status:  Completed  /  Shipment: Send  /  Payment: CyberSourcePaymentMethod
 *   Number:  CO26050800121 (next after the 20-order seed batch)
 *
 * Usage: node scripts/seed-carriage-bolt-order-vcst.js [--dry-run]
 */
import { config } from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
config({ path: join(ROOT, '.env.vcst'), override: true });
config({ path: join(ROOT, '.env.local'), override: true });

const BACK = process.env.BACK_URL;
const DRY = process.argv.includes('--dry-run');

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

// Carriage bolt family — discovered via xAPI products query for SKU 164W33.
const LINES = [
  { productId: '5512e3a5201541769e1d81fc5217490c', sku: '164W33', name: 'Carriage Bolt 1" Steel, Grade A, Plain Finish, 1/4"-20 Dia/Thread Size, 1300 PK', price: 17.00,   qty: 25, catalogId: '7829d35f417e4dd98851f51322f32c23', categoryId: '4fbaca886f014767a52f3f38b9df648f' },
  { productId: '5623d43072ad486d9ec47ee75f6813d6', sku: '164W34', name: '1-1/4" Steel Carriage Bolt, Grade A, Plain Finish, 5/16"-18 Dia/Thread Size, 700 PK',     price: 43.44,   qty: 15, catalogId: '7829d35f417e4dd98851f51322f32c23', categoryId: '4fbaca886f014767a52f3f38b9df648f' },
  { productId: 'f800babf3cf5488ba45b21cfb343c22c', sku: '164W48', name: '1/2" Steel Carriage Bolt, Grade A, Plain Finish, 1/4"-20 Dia/Thread Size, 1800 PK',     price: 102.88,  qty: 10, catalogId: '7829d35f417e4dd98851f51322f32c23', categoryId: '4fbaca886f014767a52f3f38b9df648f' },
];

const SHIPPING = 10.00;
const ORDER_NUMBER = 'CO26050800121';

// --- auth ---
const tokenRes = await fetch(`${BACK}/connect/token`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: `grant_type=password&username=${process.env.ADMIN}&password=${process.env.ADMIN_PASSWORD}&scope=offline_access`,
});
const { access_token } = await tokenRes.json();
const auth = { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' };

// --- build order body ---
const items = LINES.map(L => {
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
const subTotal = +items.reduce((s, it) => s + it.extendedPrice, 0).toFixed(2);
const total = +(subTotal + SHIPPING).toFixed(2);

const body = {
  number: ORDER_NUMBER,
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

console.log(`\n📦 Carriage Bolt order${DRY ? ' [DRY RUN]' : ''}`);
console.log(`   Number:   ${ORDER_NUMBER}`);
console.log(`   Customer: ${CUSTOMER.fullName} (TechFlow)`);
console.log(`   Lines:`);
items.forEach(it => console.log(`     • ${it.sku.padEnd(8)} ${it.name.slice(0, 50)} × ${it.quantity} @ $${it.price} = $${it.extendedPrice}`));
console.log(`   Subtotal: $${subTotal}  |  Ship: $${SHIPPING}  |  Total: $${total}\n`);

if (DRY) { console.log('[DRY RUN] no POST issued.'); process.exit(0); }

const pr = await fetch(`${BACK}/api/order/customerOrders`, {
  method: 'POST',
  headers: auth,
  body: JSON.stringify(body),
});
if (!pr.ok) {
  console.error(`✗ POST → ${pr.status}: ${(await pr.text()).slice(0, 500)}`);
  process.exit(1);
}
const created = await pr.json();
console.log(`✓ Order created: ${created.number}  (id: ${created.id})`);
console.log(`  Admin: ${BACK}/#/orders/${created.id}`);
