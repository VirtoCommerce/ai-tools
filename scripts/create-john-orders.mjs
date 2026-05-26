#!/usr/bin/env node
/**
 * One-off seed: create 10 orders for John Mitchell with different products.
 * Uses xAPI (Manual payment + FixedRate Ground shipping).
 *
 * Run:  TEST_ENV=vcst node scripts/create-john-orders.mjs
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ENV = process.env.TEST_ENV || "vcst";
function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf-8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
loadEnvFile(".env.defaults");
loadEnvFile(`.env.${ENV}`);
loadEnvFile(".env.local");
loadEnvFile(".env");

const BACK_URL = process.env.BACK_URL;
const STORE_ID = process.env.STORE_ID || "B2B-store";
const CURRENCY = "USD";
const CULTURE = "en-US";
const VIRTUAL_CATALOG_ROOT = "fc596540864a41bf8ab78734ee7353a3";

const JOHN_EMAIL = "test-john.mitchell-20260310@test-agent.com";
const JOHN_PASSWORD = "TestPass123!";

if (!BACK_URL) {
  console.error("BACK_URL not set");
  process.exit(1);
}

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
  if (!res.ok) {
    throw new Error(`Auth failed ${res.status}: ${await res.text()}`);
  }
  const json = await res.json();
  return json.access_token;
}

async function discoverProducts(token, limit = 10) {
  const query = `
    query($storeId: String!, $filter: String, $first: Int) {
      products(storeId: $storeId, filter: $filter, first: $first, query: "") {
        items {
          id
          code
          name
          slug
          masterVariation { id code name }
          variations { id code name }
        }
      }
    }
  `;
  const data = await gql(query, {
    storeId: STORE_ID,
    filter: `category.subtree:${VIRTUAL_CATALOG_ROOT} price.USD:(0 TO)`,
    first: 60,
  }, token);
  const items = data?.products?.items ?? [];
  // Prefer a mix: some products with variations, some without
  const withVar = items.filter(p => Array.isArray(p.variations) && p.variations.length > 0);
  const noVar  = items.filter(p => !p.variations || p.variations.length === 0);
  const picked = [];
  for (let i = 0; i < Math.min(withVar.length, 5); i++) {
    // pick a variation id rather than the parent
    const p = withVar[i];
    const v = p.variations[i % p.variations.length];
    picked.push({
      productId: v.id, sku: v.code,
      displayName: `${p.name} → ${v.name || v.code}`,
      parentName: p.name,
    });
  }
  for (let i = 0; picked.length < limit && i < noVar.length; i++) {
    const p = noVar[i];
    picked.push({
      productId: p.id, sku: p.code,
      displayName: p.name,
      parentName: p.name,
    });
  }
  while (picked.length < limit && items.length > picked.length) {
    const p = items[picked.length];
    picked.push({ productId: p.id, sku: p.code, displayName: p.name, parentName: p.name });
  }
  return picked.slice(0, limit);
}

async function getMe(token) {
  const data = await gql(`
    query {
      me {
        id
        userName
        contact {
          id
          firstName
          lastName
          addresses {
            items {
              id firstName lastName line1 line2 city
              countryCode countryName postalCode regionId regionName phone
              addressType
            }
          }
        }
      }
    }
  `, {}, token);
  return data.me;
}

async function getOrgAddresses(token) {
  const data = await gql(`
    query {
      currentOrganizationAddresses(first: 50) {
        items {
          id firstName lastName line1 line2 city
          countryCode countryName postalCode regionId regionName phone
          addressType
        }
      }
    }
  `, {}, token);
  return data?.currentOrganizationAddresses?.items ?? [];
}

async function getCart(token, userId, _organizationIdUnused, cartName) {
  const data = await gql(`
    query($storeId: String!, $currencyCode: String!, $userId: String, $cartName: String, $cultureName: String) {
      cart(storeId: $storeId, currencyCode: $currencyCode, userId: $userId, cartName: $cartName, cultureName: $cultureName) {
        id name organizationId organizationName customerId customerName
        itemsCount items { id productId quantity }
        availableShippingMethods { code name optionName price { amount } }
        availablePaymentMethods { code paymentMethodType }
      }
    }
  `, { storeId: STORE_ID, currencyCode: CURRENCY, userId, cartName, cultureName: CULTURE }, token);
  return data.cart;
}

async function addItem(token, userId, productId, cartName) {
  const data = await gql(`
    mutation($cmd: InputAddItemType!) {
      addItem(command: $cmd) {
        id name organizationId organizationName customerId itemsCount
        items { id productId sku quantity }
      }
    }
  `, {
    cmd: {
      storeId: STORE_ID,
      userId,
      cartName,
      currencyCode: CURRENCY,
      cultureName: CULTURE,
      productId,
      quantity: 1,
    },
  }, token);
  return data.addItem;
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
  const data = await gql(`
    mutation($cmd: InputAddOrUpdateCartShipmentType!) {
      addOrUpdateCartShipment(command: $cmd) {
        id shipments { id shipmentMethodCode shipmentMethodOption price { amount } }
      }
    }
  `, {
    cmd: {
      storeId: STORE_ID,
      userId,
      cartName,
      currencyCode: CURRENCY,
      cultureName: CULTURE,
      shipment,
    },
  }, token);
  return data.addOrUpdateCartShipment;
}

async function addPayment(token, userId, cartName, billingAddress) {
  const payment = {
    paymentGatewayCode: "DefaultManualPaymentMethod",
    currency: CURRENCY,
    billingAddress: {
      firstName: billingAddress.firstName || "John",
      lastName: billingAddress.lastName || "Mitchell",
      line1: billingAddress.line1,
      line2: billingAddress.line2 || "",
      city: billingAddress.city,
      countryCode: billingAddress.countryCode,
      countryName: billingAddress.countryName,
      postalCode: billingAddress.postalCode,
      regionId: billingAddress.regionId,
      regionName: billingAddress.regionName,
      phone: billingAddress.phone || "+1-212-555-1010",
      addressType: 1,
    },
  };
  const data = await gql(`
    mutation($cmd: InputAddOrUpdateCartPaymentType!) {
      addOrUpdateCartPayment(command: $cmd) {
        id payments { id paymentGatewayCode }
      }
    }
  `, {
    cmd: {
      storeId: STORE_ID,
      userId,
      cartName,
      currencyCode: CURRENCY,
      cultureName: CULTURE,
      payment,
    },
  }, token);
  return data.addOrUpdateCartPayment;
}

async function createOrder(token, cartId) {
  const data = await gql(`
    mutation($cmd: InputCreateOrderFromCartType!) {
      createOrderFromCart(command: $cmd) {
        id number status organizationId organizationName customerId customerName total { amount currency { code } }
        items { id productId sku quantity }
      }
    }
  `, { cmd: { cartId } }, token);
  return data.createOrderFromCart;
}

(async () => {
  console.log(`Env: ${ENV} | BACK_URL=${BACK_URL}`);

  console.log("1) Authenticating as John Mitchell…");
  const token = await authenticate();
  console.log("   ✓ token acquired");

  console.log("2) Fetching me + org context…");
  const me = await getMe(token);
  console.log(`   userId=${me.id} contact=${me.contact?.firstName} ${me.contact?.lastName}`);
  const userId = me.id;
  // Try to resolve organizationId — first contact's orgs, then org addresses' organization field
  let organizationId = null;
  let organizationName = null;
  if (me.contact?.id) {
    try {
      const c = await gql(`
        query($id: String!) {
          contact(id: $id) {
            id
            organizationsIds
          }
        }
      `, { id: me.contact.id }, token);
      const ids = c?.contact?.organizationsIds;
      if (Array.isArray(ids) && ids.length > 0) organizationId = ids[0];
    } catch (e) {
      // Field may not exist; ignore
    }
  }
  if (!organizationId) {
    // Try resolving via available organization id on org addresses query (uses inferred current org context)
    try {
      const orgAddrCheck = await gql(`
        query { currentOrganizationAddresses(first: 1) { items { id organizationId } } }
      `, {}, token);
      organizationId = orgAddrCheck?.currentOrganizationAddresses?.items?.[0]?.organizationId ?? null;
    } catch {}
  }
  console.log(`   resolved organizationId = ${organizationId}`);
  console.log(`   organizationId (from contact.organizations) = ${organizationId}`);

  let address = me.contact?.addresses?.items?.[0];
  if (!address) {
    const orgAddrs = await getOrgAddresses(token);
    address = orgAddrs[0];
    console.log(`   Falling back to org address: ${address?.id}`);
  }
  if (!address) {
    throw new Error("No address available for shipment");
  }
  console.log(`   shipping/billing address: ${address.line1}, ${address.city}, ${address.regionName} ${address.postalCode}`);

  console.log("3) Discovering 10 products…");
  const products = await discoverProducts(token, 10);
  if (products.length < 10) {
    console.warn(`   only ${products.length} products discovered`);
  }
  for (const [i, p] of products.entries()) {
    console.log(`   ${i + 1}. ${p.sku}  —  ${p.displayName}`);
  }

  console.log("4) Creating orders…");
  const orders = [];
  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    const cartName = `AGENT-TEST-John-Order-${Date.now()}-${i + 1}`;
    console.log(`\n  → Order ${i + 1}/10  cartName=${cartName}  product=${p.sku}`);
    try {
      const cart0 = await addItem(token, userId, p.productId, cartName);
      console.log(`    addItem: cart=${cart0.id} org=${cart0.organizationId} (${cart0.organizationName}) items=${cart0.itemsCount}`);

      const cart1 = await getCart(token, userId, organizationId, cartName);
      const ground = cart1.availableShippingMethods?.find(
        m => m.code === "FixedRate" && ((m.optionName || m.name)?.toLowerCase() === "ground"),
      ) || cart1.availableShippingMethods?.[0];
      const rate = ground?.price?.amount ?? 0;
      console.log(`    shipping rate (${ground?.code}/${ground?.optionName}) = ${rate}`);

      await addShipment(token, userId, cartName, address, rate);
      console.log(`    shipment added`);

      await addPayment(token, userId, cartName, address);
      console.log(`    payment added (Manual)`);

      const order = await createOrder(token, cart1.id);
      console.log(`    ✓ Order ${order.number} status=${order.status} org=${order.organizationId} total=${order.total?.amount} ${order.total?.currency?.code}`);
      orders.push({ idx: i + 1, sku: p.sku, name: p.displayName, orderNumber: order.number, orderId: order.id, organizationId: order.organizationId, total: order.total?.amount });
    } catch (e) {
      console.error(`    ✗ FAILED: ${e.message}`);
      orders.push({ idx: i + 1, sku: p.sku, name: p.displayName, error: e.message });
    }
  }

  console.log("\n=== SUMMARY ===");
  for (const o of orders) {
    if (o.error) {
      console.log(`  ${o.idx}. ${o.sku}  ✗ ${o.error.slice(0, 120)}`);
    } else {
      console.log(`  ${o.idx}. ${o.sku}  ✓ #${o.orderNumber}  $${o.total}  org=${o.organizationId}`);
    }
  }
  const ok = orders.filter(o => !o.error).length;
  console.log(`\n${ok}/${orders.length} orders created.`);
  process.exit(ok === orders.length ? 0 : 1);
})().catch(e => {
  console.error("FATAL:", e.message);
  process.exit(2);
});
