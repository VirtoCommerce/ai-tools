#!/usr/bin/env node
/**
 * Refreshes .claude/knowledge/api/graphql-schema.md from live GraphQL introspection.
 *
 * Usage:
 *   node scripts/refresh-graphql-schema.mjs              # uses BACK_URL from .env
 *   node scripts/refresh-graphql-schema.mjs --dry-run    # print to stdout only
 *   node scripts/refresh-graphql-schema.mjs --url https://custom-url.com
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parse } from 'dotenv';
import { resolveTestEnv } from './lib/resolve-test-env.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const OUTPUT = resolve(ROOT, '.claude/knowledge/api/graphql-schema.md');

// Parse args
const args = process.argv.slice(2);
// --check: validate that introspection succeeds and the schema renders, but write
// nothing (no file, no stdout). Used by `npm run schema:check` — cross-platform,
// so it needs no `> /dev/null` redirect (which is not valid on Windows cmd).
const check = args.includes('--check');
const dryRun = args.includes('--dry-run');
const urlIdx = args.indexOf('--url');
let backUrl = urlIdx !== -1 ? args[urlIdx + 1] : null;

// Resolve BACK_URL from the layered env files, matching config.js precedence:
//   .env.defaults → .env.${TEST_ENV} → .env.local → process.env (wins).
// The legacy monolithic .env file was removed from this project, so reading it
// (as this script used to) always failed. Read the same layered files config.js does.
const testEnv = resolveTestEnv('vcst');
if (!backUrl) {
  const merged = {};
  for (const layer of ['.env.defaults', `.env.${testEnv}`, '.env.local']) {
    const p = resolve(ROOT, layer);
    if (existsSync(p)) Object.assign(merged, parse(readFileSync(p)));
  }
  backUrl = process.env.BACK_URL || merged.BACK_URL || null;
}

if (!backUrl) {
  console.error(
    `Error: BACK_URL not found in .env.defaults / .env.${testEnv} / .env.local and --url not provided`
  );
  process.exit(1);
}

// Strip any trailing slash so we don't build `https://host//graphql`.
const GQL = `${backUrl.trim().replace(/\/+$/, '')}/graphql`;

async function gql(query) {
  const res = await fetch(GQL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(`GraphQL error: ${JSON.stringify(json.errors[0].message)}`);
  return json.data;
}

// Render an arg's type faithfully (unwrapping NON_NULL/LIST), e.g. `ids: [String!]!`.
// Relies on renderType (hoisted) + args being introspected deep enough (see below).
function formatArg(a) {
  return `${a.name}: ${renderType(a.type)}`;
}

function formatField(f) {
  return f.name;
}

// Render a GraphQL type reference to standard notation, unwrapping NON_NULL (`!`)
// and LIST (`[...]`) so e.g. emails: [String!]! renders faithfully (not `String`).
function renderType(t) {
  if (!t) return '?';
  if (t.kind === 'NON_NULL') return `${renderType(t.ofType)}!`;
  if (t.kind === 'LIST') return `[${renderType(t.ofType)}]`;
  return t.name || '?';
}

// Nest ofType 3 deep so wrapped arg types like [String!]! (NON_NULL→LIST→NON_NULL→SCALAR)
// render faithfully via renderType, instead of collapsing to the bare inner scalar name.
const ARG_TYPE_REF = `name kind ofType { name kind ofType { name kind ofType { name kind } } }`;

async function introspectQueries() {
  const data = await gql(`{
    __schema {
      queryType { fields { name args { name type { ${ARG_TYPE_REF} } } } }
    }
  }`);
  return data.__schema.queryType.fields;
}

async function introspectMutations() {
  const data = await gql(`{
    __schema {
      mutationType { fields { name args { name type { ${ARG_TYPE_REF} } } } }
    }
  }`);
  return data.__schema.mutationType.fields;
}

async function introspectType(typeName) {
  // Nest ofType 3 deep so wrapped types like [String!]! (NON_NULL→LIST→NON_NULL→SCALAR) resolve fully.
  const typeRef = `name kind ofType { name kind ofType { name kind ofType { name kind } } }`;
  const data = await gql(`{
    __type(name: "${typeName}") {
      kind
      fields { name type { ${typeRef} } }
      inputFields { name type { ${typeRef} } }
    }
  }`);
  return data.__type;
}

// Group queries by domain based on name patterns
function categorizeQuery(name) {
  if (/product|category|categories|brand|childCateg|properties|property|fulfillment/i.test(name)) return 'Catalog';
  if (/cart|coupon|pickup|saved|prices/i.test(name)) return 'Cart';
  if (/order|payment|shipment/i.test(name)) return 'Orders';
  if (/^me$|organization|contact|vendor|user|role|check.*Unique|validate.*Password|invite/i.test(name)) return 'Profile';
  if (/page|menu|builder|document/i.test(name)) return 'CMS';
  if (/wishlist/i.test(name)) return 'Wishlists';
  if (/quote/i.test(name)) return 'Quotes';
  if (/whiteLabel/i.test(name)) return 'WhiteLabeling';
  return 'Other';
}

function categorizeMutation(name) {
  if (/cart|item|coupon|shipment|payment|currency|comment|purchaseOrder|saved|configuration/i.test(name) && !/order/i.test(name)) return 'Cart';
  if (/order|payment.*(?!cart)/i.test(name) && /order/i.test(name)) return 'Orders';
  if (/wishlist/i.test(name)) return 'Wishlists';
  if (/organization|contact|member|personal|user|role|password|email|invite|registration|address.*Favorite|logo/i.test(name)) return 'Profile';
  if (/quote/i.test(name)) return 'Quotes';
  if (/task|fcm|push/i.test(name)) return 'Notifications';
  if (/review|feedback/i.test(name)) return 'Reviews';
  if (/skyflow/i.test(name)) return 'Payment';
  if (/backInStock|historical|search/i.test(name)) return 'Other';
  if (/file/i.test(name)) return 'Files';
  return 'Other';
}

async function main() {
  console.error(`Introspecting ${GQL}...`);

  const [queries, mutations] = await Promise.all([
    introspectQueries(),
    introspectMutations(),
  ]);

  console.error(`Found ${queries.length} queries, ${mutations.length} mutations`);

  // Introspect key return types
  const keyTypes = [
    'CartType', 'LineItemType', 'CustomerOrderType', 'Product', 'VariationType',
    'CouponType', 'MoneyType', 'CurrencyType', 'PriceType', 'ProductConnection',
    'TermFacet', 'FacetTermType', 'RangeFacet', 'FacetRangeType', 'PageType',
    'AvailabilityData',
    // Payment domain (VCST-5009: allowCartPayment + cart-payment initialization)
    'PaymentMethodType', 'PaymentType', 'PaymentInType',
    'InitializeCartPaymentResultType', 'InitializePaymentResultType',
    'AuthorizePaymentResultType', 'KeyValueType',
  ];

  // Introspect key input types (from mutations used in suite 050)
  const keyInputTypes = [
    'InputAddItemType', 'InputRemoveItemType', 'InputChangeCartItemQuantityType',
    'InputAddCouponType', 'InputRemoveCouponType', 'InputCreateOrderFromCartType',
    'InputChangeCartCurrencyType', 'InputAddOrUpdateCartShipmentType',
    'InputAddOrUpdateCartPaymentType', 'InputCreateOrganizationType',
    'InputUpdateContactType', 'InputCreateContactType', 'InputUpdatePersonalDataType',
    'InputUpdateMemberAddressType', 'InputRemoveCartType', 'InputClearCartType',
    'InputShipmentType', 'InputPaymentType', 'InputMemberAddressType',
    'InputPersonalDataType',
    // Payment initialization/authorization (VCST-5009)
    'InputInitializeCartPaymentType', 'InputInitializePaymentType',
    'InputAuthorizePaymentType',
    // VCST-5028: per-organization roles & access control
    'InputInviteUserType', 'InputChangeOrganizationContactRoleType',
    'InputLockUnlockOrganizationContactType',
  ];

  const typeResults = {};
  for (const t of [...keyTypes, ...keyInputTypes]) {
    try {
      typeResults[t] = await introspectType(t);
    } catch { /* skip missing types */ }
  }

  console.error(`Introspected ${Object.keys(typeResults).length} types`);

  // Build markdown
  const today = new Date().toISOString().split('T')[0];
  let md = '';

  md += `# GraphQL xAPI Schema Reference\n\n`;
  md += `> **Source**: Live introspection of \`{{BACK_URL}}/graphql\` (${today})\n`;
  md += `> **Purpose**: Agents MUST consult this file before writing or reviewing GraphQL queries/mutations.\n`;
  md += `> **Refresh**: \`node scripts/refresh-graphql-schema.mjs\` — run when schema may have changed.\n\n`;

  // Critical rules
  md += `## Critical Rules\n\n`;
  md += `1. **All mutations use \`command\` wrapper**: \`mutation { foo(command: { ...fields }) { ...return } }\`\n`;
  md += `2. **No \`createCart\` mutation** — use \`cart(storeId, currencyCode)\` query to get/create a cart\n`;
  md += `3. **MoneyType structure**: \`{ amount currency { code } }\` — NOT \`{ amount currencyCode }\`\n`;
  md += `4. **CartType has flat money fields**: \`subTotal\`, \`total\`, \`discountTotal\` directly — NOT nested under \`totals\`\n`;
  md += `5. **Auth token**: \`grant_type=password&scope=offline_access&username=...&password=...&storeId=...\` — NO \`client_id\`\n`;
  md += `6. **Facets on ProductConnection**: \`term_facets { terms { term label count } }\`, \`range_facets { ranges { from to count } }\` — NOT \`facets { values }\`\n`;
  md += `7. **Products search**: arg is \`query\`, not \`keyword\` (but \`brands\` query uses \`keyword\`)\n`;
  md += `8. **Variations**: \`availabilityData\` (not \`availability\`)\n`;
  md += `9. **Order addresses/payments**: \`addresses[]\` and \`inPayments[]\` (not \`shippingAddress\` or \`payment\`)\n`;
  md += `10. **All cart mutations require \`userId\`**: \`addItem\`, \`addOrUpdateCartShipment\`, \`addOrUpdateCartPayment\`, \`clearCart\` — get from \`me { id }\`\n`;
  md += `11. **\`addOrUpdateCartShipment\` requires \`price\`**: \`CartShipmentValidator\` rejects if price doesn't match available shipping rate. Query \`availableShippingMethods\` first.\n\n`;

  md += `---\n\n`;

  // Queries grouped by domain
  md += `## Queries\n\n`;
  const queryGroups = {};
  for (const q of queries) {
    const cat = categorizeQuery(q.name);
    if (!queryGroups[cat]) queryGroups[cat] = [];
    queryGroups[cat].push(q);
  }
  for (const [cat, qs] of Object.entries(queryGroups).sort((a, b) => a[0].localeCompare(b[0]))) {
    md += `### ${cat}\n\n\`\`\`\n`;
    for (const q of qs) {
      md += `${q.name}(${q.args.map(formatArg).join(', ')})\n`;
    }
    md += `\`\`\`\n\n`;
  }

  // Mutations grouped by domain
  md += `---\n\n## Mutations\n\n`;
  md += `> **All mutations use \`command\` wrapper**: \`mutation { name(command: { ...fields }) { ...return } }\`\n\n`;

  const mutGroups = {};
  for (const m of mutations) {
    const cat = categorizeMutation(m.name);
    if (!mutGroups[cat]) mutGroups[cat] = [];
    mutGroups[cat].push(m);
  }
  for (const [cat, ms] of Object.entries(mutGroups).sort((a, b) => a[0].localeCompare(b[0]))) {
    md += `### ${cat}\n\n`;
    md += `| Mutation | Command Type |\n|----------|-------------|\n`;
    for (const m of ms) {
      const arg = m.args[0];
      const typeName = arg ? (arg.type.name || (arg.type.ofType && arg.type.ofType.name) || '?') : 'none';
      md += `| \`${m.name}\` | \`${typeName}\` |\n`;
    }
    md += `\n`;
  }

  // Key return types
  md += `---\n\n## Key Return Types\n\n`;
  for (const name of keyTypes) {
    const t = typeResults[name];
    if (!t || !t.fields) continue;
    md += `### ${name}\n\n`;
    md += `Fields: \`${t.fields.map(formatField).join('`, `')}\`\n\n`;
  }

  // Key input types
  md += `---\n\n## Key Input Types\n\n`;
  for (const name of keyInputTypes) {
    const t = typeResults[name];
    if (!t) continue;
    const fields = t.inputFields || t.fields;
    if (!fields) continue;
    md += `### ${name}\n\n`;
    md += `Fields: \`${fields.map(f => `${f.name}: ${renderType(f.type)}`).join('`, `')}\`\n\n`;
  }

  // Common patterns
  md += `---\n\n## Common Query Patterns\n\n`;
  md += `### Get/create cart\n\`\`\`graphql\nquery { cart(storeId: "B2B-store" currencyCode: "USD") { id itemsCount items { id productId quantity listPrice { amount } } } }\n\`\`\`\n\n`;
  md += `### Add item to cart\n\`\`\`graphql\nmutation { addItem(command: { storeId: "B2B-store" userId: "<USER_ID>" productId: "<PRODUCT_ID>" quantity: 1 currencyCode: "USD" cultureName: "en-US" }) { id itemsCount items { productId quantity listPrice { amount } } } }\n\`\`\`\n> **Note:** \`userId\` is required. Get from \`query { me { id } }\`.\n\n`;
  md += `### Search products\n\`\`\`graphql\nquery { products(storeId: "B2B-store" query: "laptop" currencyCode: "USD") { totalCount items { id name code imgSrc price { actual { amount } } } term_facets { name terms { term label count } } } }\n\`\`\`\n\n`;
  md += `### Full checkout flow (verified — see order-creation-matrix.md)\n\`\`\`graphql\n# 1. Get userId\nquery { me { id } }\n# 2. Add item (userId required)\nmutation { addItem(command: { storeId: "B2B-store" userId: "<USER_ID>" productId: "<PRODUCT_ID>" quantity: 1 currencyCode: "USD" cultureName: "en-US" }) { id } }\n# 3. Set shipment (price MUST match rate)\nmutation { addOrUpdateCartShipment(command: { storeId: "B2B-store" userId: "<USER_ID>" currencyCode: "USD" cultureName: "en-US" shipment: { shipmentMethodCode: "FixedRate" shipmentMethodOption: "Ground" price: 150 deliveryAddress: { city: "New York" countryCode: "US" countryName: "United States" firstName: "Test" lastName: "User" line1: "123 Test St" postalCode: "10001" } } }) { id } }\n# 4. Set payment\nmutation { addOrUpdateCartPayment(command: { storeId: "B2B-store" userId: "<USER_ID>" currencyCode: "USD" cultureName: "en-US" payment: { paymentGatewayCode: "DefaultManualPaymentMethod" } }) { id } }\n# 5. Create order\nmutation { createOrderFromCart(command: { cartId: "<CART_ID>" }) { id number status } }\n\`\`\`\n`;

  if (check) {
    console.error(
      `[check] OK — ${queries.length} queries, ${mutations.length} mutations, ` +
        `${Object.keys(typeResults).length} types, ${md.length} bytes rendered (nothing written).`
    );
  } else if (dryRun) {
    process.stdout.write(md);
    console.error('\n[dry-run] Schema printed to stdout. Use without --dry-run to write to file.');
  } else {
    writeFileSync(OUTPUT, md, 'utf-8');
    console.error(`Written to ${OUTPUT}`);
    console.error(`  Queries: ${queries.length}`);
    console.error(`  Mutations: ${mutations.length}`);
    console.error(`  Types: ${Object.keys(typeResults).length}`);
  }
}

main().catch(e => {
  console.error('Failed:', e.message);
  process.exit(1);
});
