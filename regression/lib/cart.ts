// Cart helpers for the executable .spec suites.
//
//   API side (acts on the cart of the user `api` is authenticated as — `apiAs(role)` — which is the
//   cart the storefront session of the same role renders):
//     resetCart(api)              `[PRE:RESET_CART]`
//     addToCart(api, sku, qty)    a line seeded through xAPI
//     cartQuantity(api, sku)      `[STATE]` read-back of one line's quantity
//   Page side:
//     watchCartTraffic(page)      `[CONSOLE]` / `[NETWORK]` / `[API]` collectors for Cross_Layer_Checks
//     money / formatMoney         `[MATH]` — parse and format amounts the way the culture writes them
//
// Every GraphQL operation below was taken from the introspected schema (scripts/.graphql-schema.cache.json,
// .claude/knowledge/api/graphql-schema.md) and validated with `graphql-runner.ts --query '<op>'` before
// use. Store, currency and culture come from env — the names the CSV runner substitutes
// (`{{STORE_ID}}`, `{{CURRENCY_CODE}}`, `{{CULTURE_NAME}}`) — never from a literal.
import type { APIRequestContext, Page } from "@playwright/test";
import { env } from "./data.js";

const ME = `query Me { me { id } }`;

const CART = `query Cart($storeId: String!, $currencyCode: String!, $cultureName: String, $userId: String) {
  cart(storeId: $storeId, currencyCode: $currencyCode, cultureName: $cultureName, userId: $userId) { id itemsQuantity }
}`;

const CART_LINES = `query CartLines($storeId: String!, $currencyCode: String!, $cultureName: String, $userId: String) {
  cart(storeId: $storeId, currencyCode: $currencyCode, cultureName: $cultureName, userId: $userId) { id itemsQuantity items { sku quantity } }
}`;

const CLEAR_CART = `mutation ClearCart($command: InputClearCartType!) {
  clearCart(command: $command) { id itemsQuantity }
}`;

const PRODUCTS_BY_SKU = `query ProductsBySku($storeId: String!, $userId: String, $currencyCode: String, $cultureName: String, $query: String) {
  products(storeId: $storeId, userId: $userId, currencyCode: $currencyCode, cultureName: $cultureName, query: $query, first: 20) { items { id code } }
}`;

const ADD_ITEM = `mutation AddItem($command: InputAddItemType!) {
  addItem(command: $command) { id items { productId quantity } validationErrors { errorCode errorMessage objectId } }
}`;

/** POST one operation to `BACK_URL/graphql`; throws on a non-2xx or on any GraphQL `errors[]`. */
async function gql<T>(api: APIRequestContext, query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const res = await api.post(`${env("BACK_URL")}/graphql`, { data: { query, variables } });
  const name = query.match(/^\s*(?:query|mutation)\s+(\w+)/)?.[1] ?? "operation";
  if (!res.ok()) throw new Error(`cart: ${name} -> HTTP ${res.status()}`);
  const body = (await res.json()) as { data?: T; errors?: Array<{ message: string }> };
  if (body.errors?.length) throw new Error(`cart: ${name} -> ${body.errors.map((e) => e.message).join("; ")}`);
  if (!body.data) throw new Error(`cart: ${name} -> no data`);
  return body.data;
}

/** The ambient context every cart operation takes (graphql-schema.md Critical Rules 10 and 12). */
async function context(api: APIRequestContext) {
  const { me } = await gql<{ me: { id: string } | null }>(api, ME);
  if (!me?.id) throw new Error("cart: me { id } is empty — the API context is not signed in");
  return {
    storeId: env("STORE_ID"),
    currencyCode: env("CURRENCY_CODE"),
    cultureName: env("CULTURE_NAME"),
    userId: me.id,
  };
}

/** `[PRE:RESET_CART]`: empty the user's current cart for the store/currency; throws if it is not empty after. */
export async function resetCart(api: APIRequestContext): Promise<void> {
  const ctx = await context(api);
  const { cart } = await gql<{ cart: { id: string; itemsQuantity: number } }>(api, CART, ctx);
  if (cart.itemsQuantity === 0) return;
  const { clearCart } = await gql<{ clearCart: { itemsQuantity: number } }>(api, CLEAR_CART, {
    command: { ...ctx, cartId: cart.id },
  });
  if (clearCart.itemsQuantity !== 0) throw new Error(`cart: clearCart left ${clearCart.itemsQuantity} item(s)`);
}

/** Add `qty` of the product whose code is `sku` to the user's cart; throws when the line does not land. */
export async function addToCart(api: APIRequestContext, sku: string, qty: number): Promise<void> {
  const ctx = await context(api);
  const { products } = await gql<{ products: { items: Array<{ id: string; code: string }> } }>(
    api,
    PRODUCTS_BY_SKU,
    { ...ctx, query: sku },
  );
  const product = products.items.find((p) => p.code === sku);
  if (!product) throw new Error(`cart: no product with code ${sku} in store ${ctx.storeId}`);
  const { cart } = await gql<{ cart: { id: string } }>(api, CART, ctx);
  const { addItem } = await gql<{
    addItem: { items: Array<{ productId: string; quantity: number }>; validationErrors: Array<{ errorCode: string }> };
  }>(api, ADD_ITEM, { command: { ...ctx, cartId: cart.id, productId: product.id, quantity: qty } });
  const line = addItem.items.find((i) => i.productId === product.id);
  if (!line || line.quantity < qty) {
    const codes = addItem.validationErrors.map((e) => e.errorCode).join(", ") || "no validation error";
    throw new Error(`cart: addItem ${sku} x${qty} did not land in the cart (${codes})`);
  }
}

/** `[STATE]`: the quantity of the line for `sku` in the user's server-side cart (0 when there is none). */
export async function cartQuantity(api: APIRequestContext, sku: string): Promise<number> {
  const ctx = await context(api);
  const { cart } = await gql<{ cart: { items: Array<{ sku: string; quantity: number }> } }>(api, CART_LINES, ctx);
  return cart.items.filter((i) => i.sku === sku).reduce((sum, i) => sum + i.quantity, 0);
}

/** One storefront GraphQL mutation whose root field returned a cart (`__typename: "CartType"`). */
export interface CartMutation {
  operationName: string;
  /** The root field that returned the cart (e.g. `changeCartItemsQuantity`) — the name a CSV row's `[API]` item uses. */
  field: string;
  errors: unknown[];
  lines: Array<{ sku: string; quantity: number }>;
}

/**
 * Collectors for a spec's Cross_Layer_Checks, attached to `page` from the moment of the call:
 * - `consoleErrors` — `[CONSOLE]`: uncaught page errors plus console messages of type `error`;
 * - `httpErrors`    — `[NETWORK]`: every response with status >= 400 (`"<status> <method> <url>"`);
 * - `cartMutations` — `[API]`: every GraphQL mutation the storefront sent that returned a cart,
 *   with its `errors[]` and the lines of the cart it returned.
 * Call it before the step it observes; slice by the array length taken just before an action to
 * keep only what that action caused.
 */
export function watchCartTraffic(page: Page) {
  const consoleErrors: string[] = [];
  const httpErrors: string[] = [];
  const cartMutations: CartMutation[] = [];
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(`console.error: ${m.text()}`);
  });
  page.on("response", async (res) => {
    const req = res.request();
    if (res.status() >= 400) httpErrors.push(`${res.status()} ${req.method()} ${res.url()}`);
    if (req.method() !== "POST" || !new URL(res.url()).pathname.endsWith("/graphql")) return;
    const sent = req.postDataJSON() as { operationName?: string; query?: string } | null;
    if (!sent?.query?.trim().startsWith("mutation")) return;
    let body: { data?: Record<string, unknown>; errors?: unknown[] };
    try {
      body = await res.json();
    } catch {
      return; // page closed before the body was read — nothing to classify
    }
    const roots = Object.entries(body.data ?? {}) as Array<[string, { __typename?: string; items?: CartMutation["lines"] } | null]>;
    const [field, cart] = roots.find(([, r]) => r?.__typename === "CartType") ?? ["(none)", undefined];
    if (!cart && !body.errors?.length) return;
    cartMutations.push({
      operationName: sent.operationName ?? "(anonymous)",
      field,
      errors: body.errors ?? [],
      lines: (cart?.items ?? []).map((i) => ({ sku: i.sku, quantity: i.quantity })),
    });
  });
  return { consoleErrors, httpErrors, cartMutations };
}

/** The culture's own decimal and group separators (CULTURE_NAME), so nothing assumes "." or ",". */
function separators() {
  const parts = new Intl.NumberFormat(env("CULTURE_NAME")).formatToParts(12345.6);
  return {
    decimal: parts.find((p) => p.type === "decimal")?.value ?? ".",
    group: parts.find((p) => p.type === "group")?.value ?? ",",
  };
}

/** `[MATH]`: the number an amount on the page stands for ("$1,234.50" -> 1234.5 under en-US). */
export function money(text: string): number {
  const { decimal, group } = separators();
  const kept = text.split(group).join("").replace(new RegExp(`[^0-9\\-${decimal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}]`, "g"), "");
  const value = Number(kept.replace(decimal, "."));
  if (!kept || Number.isNaN(value)) throw new Error(`money: "${text}" is not an amount`);
  return value;
}

/** `[MATH]`: `amount` written as the store's currency in the store's culture, to 2 decimal places. */
export function formatMoney(amount: number): string {
  return new Intl.NumberFormat(env("CULTURE_NAME"), {
    style: "currency",
    currency: env("CURRENCY_CODE"),
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.round(amount * 100) / 100);
}
