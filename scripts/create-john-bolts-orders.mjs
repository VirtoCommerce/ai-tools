#!/usr/bin/env node
/**
 * Create 2 orders for John Mitchell with products from /bolts category:
 *   - 1 order paid via CyberSource gateway
 *   - 1 order paid via AuthorizeNet gateway
 *
 * Cart is created with a unique cartName, removed first to avoid sticky items.
 *
 * Run:  TEST_ENV=vcst node scripts/create-john-bolts-orders.mjs
 */

import { readFileSync, existsSync } from "node:fs";

const ENV = process.env.TEST_ENV || "vcst";
function load(p) {
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf-8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
load(".env.defaults");
load(`.env.${ENV}`);
load(".env.local");

const BACK_URL = process.env.BACK_URL;
const STORE_ID = process.env.STORE_ID || "B2B-store";
const CURRENCY = "USD";
const CULTURE = "en-US";

const JOHN_EMAIL = "test-john.mitchell-20260310@test-agent.com";
const JOHN_PASSWORD = "TestPass123!";

async function gql(query, variables, token) {
  const res = await fetch(`${BACK_URL}/graphql`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ query, variables }),
  });
  const text = await res.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }
  if (parsed.errors?.length) {
    throw new Error(`GQL errors: ${JSON.stringify(parsed.errors, null, 2)}`);
  }
  return parsed.data;
}

async function authenticate() {
  const body = new URLSearchParams({
    grant_type: "password",
    scope: "offline_access",
    username: JOHN_EMAIL,
    password: JOHN_PASSWORD,
    storeId: STORE_ID,
  });
  const res = await fetch(`${BACK_URL}/connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) throw new Error(`Auth failed ${res.status}: ${await res.text()}`);
  return (await res.json()).access_token;
}

async function findBoltsCategoryId(token) {
  // Walk a bigger page of categories looking for "bolts" by slug or name
  const data = await gql(`
    query($first: Int) {
      categories(storeId: "${STORE_ID}", cultureName: "${CULTURE}", first: $first) {
        items { id code name slug level }
      }
    }
  `, { first: 500 }, token);
  const items = data?.categories?.items ?? [];
  const match = items.find(c =>
    (c.slug || "").toLowerCase() === "bolts" ||
    (c.slug || "").toLowerCase().endsWith("/bolts") ||
    (c.name || "").toLowerCase() === "bolts"
  );
  if (!match) {
    const partial = items.filter(c => (c.slug || "").toLowerCase().includes("bolt") || (c.name || "").toLowerCase().includes("bolt"));
    throw new Error(`Bolts category not found. Closest matches: ${JSON.stringify(partial.slice(0, 5))}`);
  }
  return match;
}

async function discoverProductsInCategory(token, _categoryId, limit = 3) {
  // The /bolts category subtree returns 0 indexed products on this env after the 2026-05-15 catalog restore.
  // Fall back to free-text "bolt" search, then narrow to products whose category slug starts with "bolts/".
  const data = await gql(`
    query($storeId: String!, $first: Int) {
      products(storeId: $storeId, cultureName: "${CULTURE}", query: "bolt", first: $first) {
        totalCount
        items {
          id code name slug
          category { id name slug }
          variations { id code name }
        }
      }
    }
  `, { storeId: STORE_ID, first: 30 }, token);
  const items = data?.products?.items ?? [];
  const inBolts = items.filter(p => (p.category?.slug || "").startsWith("bolts/"));
  const pool = inBolts.length ? inBolts : items;
  console.log(`     query "bolt" totalCount=${data?.products?.totalCount}  in /bolts subtree=${inBolts.length}`);
  return pool.slice(0, limit);
}

async function getMe(token) {
  return (await gql(`
    query { me { id userName email memberId } }
  `, {}, token)).me;
}

async function getOrgAddresses(token) {
  const data = await gql(`
    query { currentOrganizationAddresses(first: 50) {
      items { id firstName lastName line1 line2 city countryCode countryName postalCode regionId regionName phone addressType }
    } }
  `, {}, token);
  return data?.currentOrganizationAddresses?.items ?? [];
}

async function addItem(token, userId, productId, cartName, qty = 1) {
  const data = await gql(`
    mutation($cmd: InputAddItemType!) {
      addItem(command: $cmd) {
        id name organizationId organizationName itemsCount
        items { id productId sku quantity }
      }
    }
  `, {
    cmd: { storeId: STORE_ID, userId, cartName, currencyCode: CURRENCY, cultureName: CULTURE, productId, quantity: qty },
  }, token);
  return data.addItem;
}

async function removeCart(token, cartId) {
  try {
    await gql(`
      mutation($cmd: InputRemoveCartType!) { removeCart(command: $cmd) }
    `, { cmd: { cartId } }, token);
  } catch (e) {
    // ignore — best-effort cleanup
  }
}

async function getCart(token, userId, cartName) {
  const data = await gql(`
    query($storeId: String!, $currencyCode: String!, $userId: String, $cartName: String, $cultureName: String) {
      cart(storeId: $storeId, currencyCode: $currencyCode, userId: $userId, cartName: $cartName, cultureName: $cultureName) {
        id name organizationId organizationName customerId
        itemsCount items { id productId sku name quantity }
        availableShippingMethods { code name optionName price { amount } }
        availablePaymentMethods { code paymentMethodType }
      }
    }
  `, { storeId: STORE_ID, currencyCode: CURRENCY, userId, cartName, cultureName: CULTURE }, token);
  return data.cart;
}

async function addShipment(token, userId, cartName, address, rate) {
  const shipment = {
    shipmentMethodCode: "FixedRate",
    shipmentMethodOption: "Ground",
    price: rate,
    currency: CURRENCY,
    deliveryAddress: {
      firstName: address.firstName || "John",
      lastName: address.lastName || "Mitchell",
      line1: address.line1,
      line2: address.line2 || "",
      city: address.city,
      countryCode: address.countryCode,
      countryName: address.countryName,
      postalCode: address.postalCode,
      regionId: address.regionId,
      regionName: address.regionName,
      phone: address.phone || "+1-212-555-1010",
      addressType: 2,
    },
  };
  await gql(`
    mutation($cmd: InputAddOrUpdateCartShipmentType!) {
      addOrUpdateCartShipment(command: $cmd) { id shipments { id shipmentMethodCode } }
    }
  `, {
    cmd: { storeId: STORE_ID, userId, cartName, currencyCode: CURRENCY, cultureName: CULTURE, shipment },
  }, token);
}

async function addPayment(token, userId, cartName, gatewayCode, address) {
  const payment = {
    paymentGatewayCode: gatewayCode,
    currency: CURRENCY,
    billingAddress: {
      firstName: address.firstName || "John",
      lastName: address.lastName || "Mitchell",
      line1: address.line1,
      line2: address.line2 || "",
      city: address.city,
      countryCode: address.countryCode,
      countryName: address.countryName,
      postalCode: address.postalCode,
      regionId: address.regionId,
      regionName: address.regionName,
      phone: address.phone || "+1-212-555-1010",
      addressType: 1,
    },
  };
  await gql(`
    mutation($cmd: InputAddOrUpdateCartPaymentType!) {
      addOrUpdateCartPayment(command: $cmd) { id payments { id paymentGatewayCode } }
    }
  `, {
    cmd: { storeId: STORE_ID, userId, cartName, currencyCode: CURRENCY, cultureName: CULTURE, payment },
  }, token);
}

async function createOrder(token, cartId) {
  const data = await gql(`
    mutation($cmd: InputCreateOrderFromCartType!) {
      createOrderFromCart(command: $cmd) {
        id number status organizationId organizationName customerId
        total { amount currency { code } }
        items { id productId sku name quantity }
        inPayments { id gatewayCode sum { amount currency { code } } paymentMethod { code paymentMethodType } }
      }
    }
  `, { cmd: { cartId } }, token);
  return data.createOrderFromCart;
}

function pickGatewayCode(available, candidates) {
  for (const c of candidates) {
    const m = available.find(a => a.code?.toLowerCase() === c.toLowerCase());
    if (m) return m.code;
  }
  return null;
}

(async () => {
  console.log(`Env: ${ENV} | BACK_URL=${BACK_URL}`);

  console.log("1) Auth as John Mitchell…");
  const token = await authenticate();
  const me = await getMe(token);
  const userId = me.id;
  console.log(`   userId=${userId}`);

  console.log("2) Resolving address…");
  const addrs = await getOrgAddresses(token);
  if (!addrs.length) throw new Error("No org addresses for John");
  const address = addrs[0];
  console.log(`   ${address.line1}, ${address.city}, ${address.regionName} ${address.postalCode}`);

  console.log("3) Finding /bolts category…");
  const bolts = await findBoltsCategoryId(token);
  console.log(`   id=${bolts.id}  slug=${bolts.slug}  name=${bolts.name}  level=${bolts.level}`);

  console.log("4) Discovering products in /bolts (subtree)…");
  const products = await discoverProductsInCategory(token, bolts.id, 3);
  if (!products.length) throw new Error("No products in /bolts category");
  for (const p of products) console.log(`   • ${p.code}  ${p.name}  id=${p.id}`);

  // Available payment gateway codes vary per env. Try the canonical codes.
  // CyberSource: "CyberSource" / "CyberSourceCheckout"
  // AuthorizeNet: "Authorize.Net" / "AuthorizeNet"
  const gatewayPlans = [
    { label: "CyberSource",  candidates: ["CyberSourcePaymentMethod", "CyberSourceCheckout", "CyberSource"] },
    { label: "AuthorizeNet", candidates: ["AuthorizeNetPaymentMethod", "AuthorizeNet", "Authorize.Net"] },
  ];

  const results = [];
  for (let i = 0; i < gatewayPlans.length; i++) {
    const plan = gatewayPlans[i];
    const cartName = `AGENT-TEST-John-Bolts-${plan.label}-${Date.now()}-${i + 1}`;
    console.log(`\n5.${i + 1}) Building cart "${cartName}" for ${plan.label}…`);

    // Pick one product (rotate) from bolts list; prefer first variation if the parent has any
    const parent = products[i % products.length];
    const useId = parent.variations?.[0]?.id ?? parent.id;
    const useSku = parent.variations?.[0]?.code ?? parent.code;
    console.log(`     product = ${useSku}  ${parent.name}  (cat=${parent.category?.slug || "-"})`);

    try {
      // Pre-clean: remove any default cart for this user to avoid sticky line items
      const stale = await getCart(token, userId, cartName);
      if (stale?.id && stale.itemsCount > 0) {
        console.log(`     pre-clean: removing stale cart ${stale.id} (items=${stale.itemsCount})`);
        await removeCart(token, stale.id);
      }

      // 1. add item with unique cartName
      const cart0 = await addItem(token, userId, useId, cartName, 2);
      console.log(`     addItem: cart=${cart0.id} org=${cart0.organizationId} (${cart0.organizationName}) itemsCount=${cart0.itemsCount}`);

      // 2. fetch cart with available methods
      const cart1 = await getCart(token, userId, cartName);
      console.log(`     cart fetched: id=${cart1.id} items=${cart1.itemsCount} availPay=[${cart1.availablePaymentMethods?.map(p => p.code).join(", ")}]`);

      const gateway = pickGatewayCode(cart1.availablePaymentMethods || [], plan.candidates);
      if (!gateway) {
        throw new Error(`${plan.label} gateway not available. Available: ${cart1.availablePaymentMethods?.map(p => p.code).join(", ")}`);
      }
      console.log(`     selected gateway = ${gateway}`);

      const ground = cart1.availableShippingMethods?.find(m => m.code === "FixedRate" && (m.optionName || m.name)?.toLowerCase() === "ground") || cart1.availableShippingMethods?.[0];
      const rate = ground?.price?.amount ?? 0;

      await addShipment(token, userId, cartName, address, rate);
      console.log(`     shipment FixedRate/Ground @ $${rate}`);

      await addPayment(token, userId, cartName, gateway, address);
      console.log(`     payment ${gateway}`);

      const order = await createOrder(token, cart1.id);
      console.log(`     ✓ Order ${order.number}  status=${order.status}  total=$${order.total?.amount}  org=${order.organizationId}`);
      console.log(`       items: ${order.items?.map(i => `${i.sku}×${i.quantity}`).join(", ")}`);
      console.log(`       payments: ${order.inPayments?.map(p => `${p.gatewayCode || p.paymentMethod?.code}=$${p.sum?.amount}`).join(", ")}`);

      results.push({ label: plan.label, gateway, number: order.number, status: order.status, total: order.total?.amount, productSku: p.code });
    } catch (e) {
      console.error(`     ✗ FAILED: ${e.message}`);
      results.push({ label: plan.label, error: e.message });
    }
  }

  console.log("\n=== SUMMARY ===");
  for (const r of results) {
    if (r.error) console.log(`  ${r.label.padEnd(13)} ✗ ${r.error.slice(0, 200)}`);
    else console.log(`  ${r.label.padEnd(13)} ✓ #${r.number}  ${r.status}  $${r.total}  (gateway=${r.gateway}, sku=${r.productSku})`);
  }
  const ok = results.filter(r => !r.error).length;
  console.log(`\n${ok}/${results.length} orders created.`);
  process.exit(ok === results.length ? 0 : 1);
})().catch(e => {
  console.error("FATAL:", e.message);
  process.exit(2);
});
