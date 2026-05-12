/**
 * Demo 1b — Pre-populate John Mitchell's cart with the AI-suggested restock.
 *
 * Mirrors the push message's "Suggested reorder" line so that when John clicks
 * "Review & reorder →" in the bell notification, /cart shows exactly what the
 * AI proposed:
 *
 *   164W33 × 30 boxes @ $17.00 = $510.00
 *
 * Flow (deterministic for the demo — no leftovers from prior runs):
 *   1. admin `/api/inventory`   → ensure 164W33 stock ≥ HEADROOM (the historical
 *                                seed oversold it to -19 / status Disabled; xAPI
 *                                silently no-ops addItem on disabled stock)
 *   2. xAPI `cart` query        → get/create John's active cart on B2B-store
 *   3. xAPI `clearCart`         → empty it (if not already empty)
 *   4. xAPI `addItem`           → 164W33 × 30
 *   5. xAPI `cart` again        → verify totals & line count
 *
 * Auth: admin bearer token; mutations accept `userId: 143bc845-...` so the
 * cart belongs to John even though the call is admin-side.
 *
 * Usage:
 *   node scripts/seed-restock-cart-vcst.js                  # default: 164W33 × 30
 *   node scripts/seed-restock-cart-vcst.js --qty 25         # override quantity
 *   node scripts/seed-restock-cart-vcst.js --dry-run        # print, don't POST
 */
import { config } from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
config({ path: join(ROOT, '.env.vcst'), override: true });
config({ path: join(ROOT, '.env.local'), override: true });

const BACK = process.env.BACK_URL;
const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const qtyArg = args.find(a => a.startsWith('--qty='))?.split('=')[1]
  || (args.includes('--qty') ? args[args.indexOf('--qty') + 1] : null);
const QTY = qtyArg ? parseInt(qtyArg, 10) : 30;

// John Mitchell on TechFlow — see scripts/seed-carriage-bolt-order-vcst.js
const JOHN = {
  userId: '143bc845-7ba3-4982-ae9a-a9446a399705',
  fullName: 'John Mitchell',
};

// 164W33 — 1" Carriage Bolt, the recurring SKU in the 4-order consumption pattern
const PRODUCT = {
  productId: '5512e3a5201541769e1d81fc5217490c',
  sku: '164W33',
  name: 'Carriage Bolt 1" Steel, Grade A, Plain Finish, 1/4"-20 Dia/Thread Size, 1300 PK',
  price: 17.00,
};

const CART_CTX = {
  storeId: 'B2B-store',
  currencyCode: 'USD',
  cultureName: 'en-US',
  userId: JOHN.userId,
};

// --- GraphQL helper ---
async function gql(query, variables, headers) {
  const r = await fetch(`${BACK}/graphql`, {
    method: 'POST', headers,
    body: JSON.stringify({ query, variables }),
  });
  const j = await r.json();
  if (j.errors) {
    console.error(`✗ GraphQL errors:`, JSON.stringify(j.errors, null, 2));
    throw new Error(j.errors[0].message);
  }
  return j.data;
}

const Q_CART = `
  query($storeId: String!, $currencyCode: String!, $cultureName: String, $userId: String) {
    cart(storeId: $storeId, currencyCode: $currencyCode, cultureName: $cultureName, userId: $userId) {
      id
      name
      itemsCount
      itemsQuantity
      subTotal { amount currency { code } }
      total    { amount currency { code } }
      items {
        id productId sku name quantity
        listPrice    { amount }
        salePrice    { amount }
        extendedPrice{ amount }
      }
    }
  }`;

const M_CLEAR = `
  mutation($cmd: InputClearCartType!) {
    clearCart(command: $cmd) { id itemsCount }
  }`;

const M_ADD = `
  mutation($cmd: InputAddItemType!) {
    addItem(command: $cmd) {
      id itemsCount itemsQuantity
      subTotal { amount } total { amount }
      items { productId sku quantity extendedPrice { amount } }
    }
  }`;

// --- summary ---
const planned = +(PRODUCT.price * QTY).toFixed(2);
console.log(`\n🛒 Restock-cart seed${DRY ? ' [DRY RUN]' : ''}`);
console.log(`   Owner:    ${JOHN.fullName} (${JOHN.userId})`);
console.log(`   Store:    ${CART_CTX.storeId}`);
console.log(`   Item:     ${PRODUCT.sku} × ${QTY} @ $${PRODUCT.price} = $${planned}`);
console.log(`   Endpoint: ${BACK}/graphql\n`);

if (DRY) {
  console.log('[DRY RUN] — no calls issued.');
  process.exit(0);
}

// --- auth ---
const tokenRes = await fetch(`${BACK}/connect/token`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: `grant_type=password&username=${process.env.ADMIN}&password=${process.env.ADMIN_PASSWORD}&scope=offline_access`,
});
const { access_token } = await tokenRes.json();
if (!access_token) { console.error('✗ Auth failed'); process.exit(1); }
const headers = { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' };

// --- 0. Ensure 164W33 inventory is buyable (xAPI addItem silently no-ops on Disabled stock) ---
const HEADROOM = Math.max(200, QTY * 3);
const invRes = await fetch(`${BACK}/api/inventory/products/${PRODUCT.productId}`, { headers });
const invList = await invRes.json();
const inv = Array.isArray(invList) && invList[0];
if (!inv) {
  console.error(`✗ No inventory record for ${PRODUCT.sku}`);
  process.exit(1);
}
// InventoryStatus enum is { Disabled | Enabled | Ignored } (verified via swagger);
// "Enabled" + qty ≥ 0 makes the record buyable for xAPI addItem.
const needsFix = inv.status !== 'Enabled' || inv.inStockQuantity < QTY;
if (needsFix) {
  const ops = [
    { op: 'replace', path: '/inStockQuantity', value: HEADROOM },
    { op: 'replace', path: '/status',          value: 'Enabled' },
  ];
  const ur = await fetch(`${BACK}/api/inventory/${inv.id}`, {
    method: 'PATCH',
    headers: { ...headers, 'Content-Type': 'application/json-patch+json' },
    body: JSON.stringify(ops),
  });
  if (!ur.ok) {
    console.error(`✗ inventory PATCH → ${ur.status}: ${(await ur.text()).slice(0, 300)}`);
    process.exit(1);
  }
  console.log(`✓ stock   → ${PRODUCT.sku} restocked  qty=${HEADROOM}  status=Enabled  (was ${inv.inStockQuantity} / ${inv.status})`);
} else {
  console.log(`· stock   → ${PRODUCT.sku} healthy  qty=${inv.inStockQuantity}  status=${inv.status}`);
}

// --- 1. Get cart (may be null if John has never carted on this store) ---
const { cart: before } = await gql(Q_CART, CART_CTX, headers);
if (before) {
  console.log(`✓ cart    → id=${before.id}  items=${before.itemsCount}  qty=${before.itemsQuantity}  total=$${before.total.amount}`);
} else {
  console.log(`· cart    → none yet — addItem will create it`);
}

// --- 2. Clear if existing & non-empty (deterministic demo state) ---
if (before && before.itemsCount > 0) {
  const { clearCart: cleared } = await gql(M_CLEAR, { cmd: { ...CART_CTX, cartId: before.id } }, headers);
  console.log(`✓ clear   → id=${cleared.id}  itemsCount=${cleared.itemsCount}`);
} else {
  console.log(`· clear   → skipped (${before ? 'cart already empty' : 'no cart yet'})`);
}

// --- 3. Add 164W33 × 30 (cartId omitted when no cart exists → server creates one) ---
const addCmd = {
  ...CART_CTX,
  ...(before ? { cartId: before.id } : {}),
  productId: PRODUCT.productId,
  quantity: QTY,
};
const { addItem: added } = await gql(M_ADD, { cmd: addCmd }, headers);
console.log(`✓ addItem → items=${added.itemsCount}  qty=${added.itemsQuantity}  subTotal=$${added.subTotal.amount}  total=$${added.total.amount}`);
added.items.forEach(it =>
  console.log(`     • ${it.sku.padEnd(8)} × ${it.quantity}  = $${it.extendedPrice.amount}`));

// --- 4. Verify ---
const { cart: after } = await gql(Q_CART, CART_CTX, headers);
const sanity = after.items.find(it => it.productId === PRODUCT.productId);
if (!sanity || sanity.quantity !== QTY) {
  console.error(`\n⚠ Verification mismatch — expected ${PRODUCT.sku} × ${QTY}, got:`, after.items);
  process.exit(1);
}

console.log(`\n✅ Cart ready for demo.`);
console.log(`   Storefront /cart:   https://vcst-qa-storefront.govirto.com/cart`);
console.log(`   (sign in as John → bell → "Review & reorder" → the 164W33 × ${QTY} line is already there)\n`);
