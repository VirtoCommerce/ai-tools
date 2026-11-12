// CART-098 — the executable twin of row CART-098 in ../030-cart-merge.csv. The CSV row is the truth for
// WHAT is checked (Preconditions, Steps, Assertions, Cross_Layer_Checks); this file is HOW. A failure
// here is fixed in this file or reported as a product finding — never by editing the row's expectation.
import type { APIRequestContext, Page } from "@playwright/test";
import { test, expect, type DisposableCustomer } from "../../../../lib/fixtures.js";
import { env, td } from "../../../../lib/data.js";
import { addFromPdp, jsErrors, productLinkSelector, resetCart, signOutHere, watchCartTraffic } from "../../../../lib/cart.js";
import { testIdSelector } from "../../../../../scripts/lib/storefront-selectors.generated.js";

// The row signs in as USER_DEFAULT (a personal customer); the spec runs on a disposable personal customer
// created for this test and deleted after it, so no other run can lock the account or touch its cart.
let customer: DisposableCustomer | undefined;

/** The stock the PDP buy box shows: the "In stock" badge (that is its title) renders the quantity. */
async function pdpStock(page: Page): Promise<number> {
  const badge = page.getByRole("complementary", { name: "Sidebar" }).getByTitle("In stock").first();
  const n = (await badge.innerText()).match(/\d+/)?.[0];
  if (!n) throw new Error("precondition: the PDP shows no \"In stock\" quantity");
  return Number(n);
}

/** `[API]` getCart: the low-stock line's quantity and its validation errors (BACK_URL /graphql, as the user). */
async function serverLine(api: APIRequestContext, sku: string) {
  const me = await api.post("/graphql", { data: { query: "{ me { id } }" } });
  const userId = (await me.json()).data.me.id as string;
  const res = await api.post("/graphql", {
    data: {
      query: `query($s: String!, $cur: String!, $cul: String, $u: String) {
        cart(storeId: $s, currencyCode: $cur, cultureName: $cul, userId: $u) {
          items { sku quantity validationErrors { errorCode errorMessage } } } }`,
      variables: { s: env("STORE_ID"), cur: env("CURRENCY_CODE"), cul: env("CULTURE_NAME"), u: userId },
    },
  });
  const items = (await res.json()).data.cart.items as Array<{ sku: string; quantity: number; validationErrors: Array<{ errorCode: string; errorMessage: string }> }>;
  return items.find((i) => i.sku === sku);
}

// Cleanup: "Remove all items from cart; sign out" — the cart through the API; the page context closes itself.
test.afterEach(async ({ apiAs }) => {
  if (customer) await resetCart(await apiAs(customer));
  customer = undefined;
});

test("CART-098: Cart Merge - Combined Quantity Exceeding Available Stock Is Retained But Explicitly Flagged, Not Silently Oversold (Boundary)", async ({ page, apiAs, signInHere, disposableCustomer }) => {
  const user = (customer = await disposableCustomer("personal"));
  const product = { sku: td("@td(PROD_LOW_STOCK.sku)"), id: td("@td(PROD_LOW_STOCK.id)"), slug: td("@td(PROD_LOW_STOCK.slug)") };
  const api = await apiAs(user);
  // [PRE:RESET_CART]
  await resetCart(api);
  const traffic = watchCartTraffic(page);

  // [NAV] log in as the user — in this page, so the later sign-in merges into this account.
  await signInHere(page, user);
  // [NAV] the low-stock fixture's PDP; [ACT] set quantity to just over half of available stock; add to cart.
  const adds = traffic.cartMutations.length;
  await addFromPdp(page, product, 0);
  const stock = await pdpStock(page);
  // Precondition guard (BLOCKED): the fixture is a near-limit stock item (row: stock <= 10).
  if (stock < 2 || stock > 10) throw new Error(`precondition: PROD_LOW_STOCK stock is ${stock}, not 2..10`);
  const half = Math.floor(stock / 2) + 1;
  await addFromPdp(page, product, half);

  // [ACT] account button -> 'Logout' + [WAIT] signed out.
  await signOutHere(page);
  // [NAV] as guest, the same PDP; [ACT] just over half again, so user-qty + guest-qty > available stock.
  await page.goto(env("FRONT_URL"));
  await addFromPdp(page, product, half);
  const addMutations = traffic.cartMutations.slice(adds);

  // [ACT] sign in (triggers merge); [NAV] /cart.
  const merges = traffic.cartMutations.length;
  await signInHere(page, user);
  await page.goto(`${env("FRONT_URL")}/cart`);
  const line = page.locator(testIdSelector("cart.products-section")).locator(".vc-line-item").filter({ has: page.locator(productLinkSelector(product)) });
  const quantity = line.getByRole("spinbutton", { name: "Product quantity" });

  // [STATE] the merge retains the raw summed quantity (user + guest) — NOT capped to the stock.
  await expect(quantity).toHaveValue(String(half * 2));
  // [DOM] the line shows "You can order maximum <stock> item(s)", '+' is disabled, and "In stock <stock>".
  await expect(line.getByText(`You can order maximum ${stock} item(s)`)).toBeVisible();
  await expect(line.getByRole("button", { name: "Increase quantity" })).toBeDisabled();
  await expect(line.getByTitle("In stock").first()).toHaveText(String(stock));

  // [API] mergeCart mutation response errors[] is empty.
  const merge = traffic.cartMutations.slice(merges).filter((m) => m.field === "mergeCart");
  expect(merge.length).toBeGreaterThan(0);
  expect(merge.flatMap((m) => m.errors)).toEqual([]);
  // [API] getCart after merge: the raw summed quantity AND an explicit stock-validation flag on the line.
  const server = await serverLine(api, product.sku);
  expect(server?.quantity).toBe(half * 2);
  expect(server?.validationErrors.length).toBeGreaterThan(0);
  // [CONSOLE] no JS errors.
  expect(jsErrors(traffic.consoleErrors)).toEqual([]);
  // [NETWORK] no 4xx/5xx during merge.
  expect(traffic.httpErrors.filter((e) => e.includes("/graphql"))).toEqual([]);
  // [API] the add-to-cart mutations returned errors[] empty (the row names addItem — see addFromPdp).
  expect(addMutations.length).toBeGreaterThan(0);
  expect(addMutations.flatMap((m) => m.errors)).toEqual([]);
});
