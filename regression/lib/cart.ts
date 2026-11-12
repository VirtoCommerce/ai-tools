// Cart helpers for the executable .spec suites.
//
//   API side (acts on the cart of the user `api` is authenticated as — `apiAs(role)` — which is the
//   cart the storefront session of the same role renders):
//     resetCart(api)              `[PRE:RESET_CART]`
//     addToCart(api, sku, qty)    a line seeded through xAPI
//     cartQuantity(api, sku)      `[STATE]` read-back of one line's quantity
//     cartLines(api)              `[STATE]` read-back of every line
//   Page side:
//     addFromPdp(page, product)   add from the PDP buy box, as a shopper (guest or signed in)
//     signOutHere(page)           sign out through the header account menu
//     cartPageLines(page)         `[DOM]` / `[MATH]` the rendered /cart lines; includedSubtotal(lines)
//     discoverPdpProducts(root, n) live-discover n distinct addable in-stock products for addFromPdp
//     setCartLineSelected(page, sku, on) / cartSelection(api)  checkout selection on the page / on the server
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
  const { cart } = await gql<{ cart: { id: string; itemsQuantity: number } | null }>(api, CART, ctx);
  if (!cart || cart.itemsQuantity === 0) return; // a brand-new account has no cart yet
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
  const { cart } = await gql<{ cart: { items: Array<{ sku: string; quantity: number }> } | null }>(api, CART_LINES, ctx);
  return (cart?.items ?? []).filter((i) => i.sku === sku).reduce((sum, i) => sum + i.quantity, 0);
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

/** A product a page-side helper opens by its own data: code (SKU), id and slug (the slug may be empty). */
export interface PdpProduct {
  sku: string;
  id: string;
  slug: string;
}

/** A link to `product`: by id, or by slug when it has one (which of the two the storefront routes by is per env). */
export function productLinkSelector(product: Pick<PdpProduct, "id" | "slug">): string {
  return [product.id, product.slug]
    .filter(Boolean)
    .map((v) => `a[href*="${v}"]`)
    .join(", ");
}

/**
 * Page side: add `product` the way a shopper does — search by SKU, open its card, press '+' in the PDP
 * buy box `times` times, waiting each time for the "in Cart" count to follow. Works for a guest and a
 * signed-in page alike (the storefront picks the mutation; CART-001 observed `updateCartQuantity`).
 * Returns the "in Cart" count it ended on.
 */
export async function addFromPdp(page: Page, product: PdpProduct, times = 1): Promise<number> {
  await page.goto(`${env("FRONT_URL")}/search?q=${encodeURIComponent(product.sku)}`);
  await page
    .getByRole("main")
    .locator(productLinkSelector(product))
    .filter({ hasText: /\S/ })
    .first()
    .click();
  await page.getByRole("main").getByText(`#${product.sku}`).waitFor();
  const buyBox = page.getByRole("complementary", { name: "Sidebar" });
  const plus = buyBox.locator('[data-test-id="quantity-stepper"]').getByRole("button", { name: "Increase quantity" });
  const count = buyBox.getByTitle("in Cart").locator('[data-test-id="count-in-cart-label"]');
  const read = async () => ((await count.count()) ? Number(await count.innerText()) : 0);
  let inCart = await read();
  for (let i = 0; i < times; i++) {
    await plus.click();
    const target = inCart + 1;
    await count.filter({ hasText: new RegExp(`^${target}$`) }).waitFor();
    inCart = target;
  }
  // A second and later '+' goes out as a BATCHED, debounced quantity update: the count label moves at
  // once, the request follows the debounce. Let it fire before the network is called settled.
  if (times > 1) await page.waitForTimeout(1500);
  await page.waitForLoadState("networkidle");
  return inCart;
}

/** Page side: sign out through the header account menu and wait until the page is a guest session again. */
export async function signOutHere(page: Page): Promise<void> {
  await page.locator('[data-test-id="account-button"]').click();
  await page.locator('[data-test-id="sign-out-button"]').click();
  await page.locator('[data-test-id="account-button"]').waitFor({ state: "detached" });
  await page.waitForLoadState("networkidle");
}

/** `[STATE]`: every line of the user's server-side cart, as `{ sku, quantity }`. */
export async function cartLines(api: APIRequestContext): Promise<Array<{ sku: string; quantity: number }>> {
  const ctx = await context(api);
  const { cart } = await gql<{ cart: { items: Array<{ sku: string; quantity: number }> } | null }>(api, CART_LINES, ctx);
  return cart?.items ?? [];
}

/** One line of the rendered /cart page, read off the DOM (the UI kit's `.vc-line-item` row; no test id). */
export interface CartPageLine {
  text: string;
  /** Every link href in the line, space-joined — what `cartLineFor` matches a product by (a line need not show its SKU). */
  href: string;
  quantity: number;
  price: number;
  total: number;
  selected: boolean;
}

/**
 * Page side: every line of the cart page the page is on (`[DOM]` / `[MATH]` reads). `price` and `total`
 * are parsed with `money`, `selected` is the line's checkout checkbox. Waits for the products section.
 */
export async function cartPageLines(page: Page): Promise<CartPageLine[]> {
  const section = page.locator('[data-test-id="cart.products-section"]');
  await section.waitFor();
  const out: CartPageLine[] = [];
  for (const row of await section.locator(".vc-line-item").all()) {
    const checkbox = row.getByRole("checkbox");
    // Every link in the row: the product link is not necessarily the first anchor (actions come before it).
    const hrefs = await row.locator("a[href]").evaluateAll((as) => as.map((a) => a.getAttribute("href") ?? ""));
    out.push({
      text: await row.innerText(),
      href: hrefs.join(" "),
      quantity: Number(await row.getByRole("spinbutton", { name: "Product quantity" }).inputValue()),
      price: money(await row.locator(".vc-line-item__price").innerText()),
      total: money(await row.locator(".vc-line-item__total").innerText()),
      selected: (await checkbox.count()) ? await checkbox.isChecked() : true,
    });
  }
  return out;
}

/** The rendered cart lines that are `product`: their product link names its id or slug. */
export function cartLineFor(lines: CartPageLine[], product: Pick<PdpProduct, "id" | "slug">): CartPageLine[] {
  return lines.filter((l) => l.href.includes(product.id) || (!!product.slug && l.href.includes(product.slug)));
}

/**
 * `[CONSOLE]` JS errors only. Drops the two messages the BROWSER itself logs for a failed resource load —
 * "Failed to load resource: …" (a 404 image, or an image on an unresolvable host) and the service
 * worker's "A bad HTTP response code (404) was received when fetching the script." — which this stand
 * raises on every page and which are network events, not script errors. Page errors and every other
 * console error are kept.
 */
export function jsErrors(consoleErrors: string[]): string[] {
  const resourceLoad =
    /^console\.error: (Failed to load resource:|A bad HTTP response code \(\d{3}\) was received when fetching the script)/;
  return consoleErrors.filter((e) => !resourceLoad.test(e));
}

/** `[MATH]` the subtotal the cart page should show: sum of price x quantity over the SELECTED lines. */
export function includedSubtotal(lines: CartPageLine[]): number {
  return lines.filter((l) => l.selected).reduce((sum, l) => sum + l.price * l.quantity, 0);
}

/**
 * `live-discover`: `n` DISTINCT in-stock products of the B2B virtual catalog that a shopper can add one
 * at a time (no minimum quantity above 1), shaped for `addFromPdp`. For cases that only need "2-3
 * products" and assert on none of them by name. Read AS the customer (`api`), so it keeps only what
 * that customer can actually buy: buyable, in stock, priced above zero in its own price context.
 */
export async function discoverPdpProducts(api: APIRequestContext, catalogRootId: string, n: number): Promise<PdpProduct[]> {
  const ctx = await context(api);
  type Found = {
    id: string;
    code: string;
    slug: string | null;
    minQuantity: number | null;
    hasVariations: boolean;
    availabilityData: { isBuyable: boolean; isInStock: boolean } | null;
    price: { actual: { amount: number } | null } | null;
  };
  const { products } = await gql<{ products: { items: Found[] } }>(
    api,
    `query DiscoverPdpProducts($storeId: String!, $userId: String, $currencyCode: String, $cultureName: String, $filter: String!) {
      products(storeId: $storeId, userId: $userId, currencyCode: $currencyCode, cultureName: $cultureName, filter: $filter, first: 60) {
        items { id code slug minQuantity hasVariations availabilityData { isBuyable isInStock } price { actual { amount } } } } }`,
    { ...ctx, filter: `category.subtree:${catalogRootId} availability:InStock` },
  );
  const picked = products.items
    .filter((p) => (p.minQuantity ?? 1) <= 1 && !p.hasVariations)
    .filter((p) => p.availabilityData?.isBuyable && p.availabilityData.isInStock && (p.price?.actual?.amount ?? 0) > 0)
    .slice(0, n)
    .map((p) => ({ sku: p.code, id: p.id, slug: p.slug ?? "" }));
  if (picked.length < n) throw new Error(`cart: only ${picked.length} of ${n} addable in-stock products found`);
  return picked;
}

/**
 * Page side: tick or untick the checkout-selection checkbox of the /cart line for `product`, as a
 * shopper does, and wait for the server round-trip. Opens /cart first when the page is elsewhere.
 */
export async function setCartLineSelected(page: Page, product: PdpProduct, selected: boolean): Promise<void> {
  if (!new URL(page.url()).pathname.endsWith("/cart")) await page.goto(`${env("FRONT_URL")}/cart`);
  const sku = product.sku;
  const row = page
    .locator('[data-test-id="cart.products-section"]')
    .locator(".vc-line-item")
    .filter({ has: page.locator(productLinkSelector(product)) });
  const checkbox = row.getByRole("checkbox");
  await checkbox.waitFor();
  if ((await checkbox.isChecked()) !== selected) await checkbox.click();
  await page.waitForLoadState("networkidle");
  for (let i = 0; i < 20 && (await checkbox.isChecked()) !== selected; i++) await page.waitForTimeout(250);
  if ((await checkbox.isChecked()) !== selected) throw new Error(`cart: line ${sku} did not become ${selected ? "selected" : "unselected"}`);
}

/** `[API]` getCart: `selectedForCheckout` per SKU of the user's server-side cart. */
export async function cartSelection(api: APIRequestContext): Promise<Record<string, boolean>> {
  const ctx = await context(api);
  const { cart } = await gql<{ cart: { items: Array<{ sku: string; selectedForCheckout: boolean }> } | null }>(
    api,
    `query CartSelection($storeId: String!, $currencyCode: String!, $cultureName: String, $userId: String) {
      cart(storeId: $storeId, currencyCode: $currencyCode, cultureName: $cultureName, userId: $userId) { items { sku selectedForCheckout } } }`,
    ctx,
  );
  return Object.fromEntries((cart?.items ?? []).map((i) => [i.sku, i.selectedForCheckout]));
}

/**
 * Page side, configurable product: on the PDP at `path` (a `td(…url)` value), pick `option` — the
 * option's product name, e.g. "Black hat" — in the section that offers it, and add the configuration
 * to the cart. `newConfiguration` first clicks "Create new configuration" (the PDP of a product already
 * in the cart shows "Update cart" for the existing configuration). Returns the buy box's total for the
 * configuration as the page showed it right before the add (parsed with `money`).
 */
export async function addConfiguredFromPdp(
  page: Page,
  path: string,
  option: string,
  { newConfiguration = false }: { newConfiguration?: boolean } = {},
): Promise<number> {
  if (!page.url().endsWith(path)) await page.goto(`${env("FRONT_URL")}${path}`);
  if (newConfiguration) await page.getByRole("button", { name: "Create new configuration" }).or(page.getByRole("link", { name: "Create new configuration" })).first().click();
  await page.getByText("Configure the parameters").first().waitFor();
  const radio = page.getByRole("radio", { name: option, exact: true });
  if (!(await radio.isVisible())) {
    // Only the first section is expanded by default: open the one that holds the option.
    for (const section of await page.locator('[data-test-id="section"]').all()) {
      if (await section.getByRole("radio", { name: option, exact: true }).count()) {
        await section.locator('[data-test-id="section-title"]').click();
        break;
      }
    }
  }
  await radio.check();
  await page.waitForLoadState("networkidle");
  const buyBox = page.getByRole("complementary", { name: "Sidebar" });
  const total = money(await buyBox.locator(".product-price-block__product-price").first().innerText());
  await buyBox.getByRole("button", { name: "Add to cart", exact: true }).click();
  await buyBox.getByRole("button", { name: "Update cart", exact: true }).waitFor();
  await page.waitForLoadState("networkidle");
  return total;
}

/**
 * Page side: expand a cart line's "Components list" (shared/common/components/configuration-items.vue —
 * a toggle button over a table, collapsed by default) and return the table's text: the configuration
 * summary, one row per section with the chosen value. Throws when the line has no Components list.
 */
export async function cartLineComponents(row: import("@playwright/test").Locator): Promise<string> {
  const items = row.locator(".configuration-items").first();
  await items.waitFor();
  if ((await items.getAttribute("class"))?.includes("configuration-items--collapsed")) {
    await items.locator(".configuration-items__toggle").click();
  }
  const table = items.locator(".configuration-items__table");
  await table.waitFor({ state: "visible" });
  return table.innerText();
}

/** `[API]` getCart: every line with its product, quantity and the names of its configuration items. */
export async function cartConfiguredLines(
  api: APIRequestContext,
): Promise<Array<{ productId: string; quantity: number; configuration: string[] }>> {
  const ctx = await context(api);
  const { cart } = await gql<{
    cart: { items: Array<{ productId: string; quantity: number; configurationItems: Array<{ name: string }> | null }> } | null;
  }>(
    api,
    `query CartConfiguredLines($storeId: String!, $currencyCode: String!, $cultureName: String, $userId: String) {
      cart(storeId: $storeId, currencyCode: $currencyCode, cultureName: $cultureName, userId: $userId) {
        items { productId quantity configurationItems { name } } } }`,
    ctx,
  );
  return (cart?.items ?? []).map((i) => ({
    productId: i.productId,
    quantity: i.quantity,
    configuration: (i.configurationItems ?? []).map((c) => c.name).sort(),
  }));
}
