// CART-106 — the executable twin of row CART-106 in ../030-cart-merge.csv. The CSV row is the truth for
// WHAT is checked (Preconditions, Steps, Assertions, Cross_Layer_Checks); this file is HOW. A failure
// here is fixed in this file or reported as a product finding — never by editing the row's expectation.
import { test, expect, type DisposableCustomer } from "../../../../lib/fixtures.js";
import { env, td } from "../../../../lib/data.js";
import {
  addFromPdp,
  cartLineFor,
  cartPageLines,
  cartSelection,
  discoverPdpProducts,
  formatMoney,
  includedSubtotal,
  jsErrors,
  mutationsSince,
  resetCart,
  setCartLineSelected,
  signOutHere,
  trafficMark,
  waitForCartSkus,
  watchCartTraffic,
} from "../../../../lib/cart.js";
import { testIdSelector } from "../../../../../scripts/lib/storefront-selectors.generated.js";

// The row signs in as USER_DEFAULT (a personal customer); the spec runs on a disposable personal customer
// created for this test and deleted after it, so no other run can lock the account or touch its cart.
let customer: DisposableCustomer | undefined;

// Cleanup: "Remove items from cart".
test.afterEach(async ({ apiAs }) => {
  if (customer) await resetCart(await apiAs(customer));
  customer = undefined;
});

test("CART-106: Cart Merge Selection - Empty Cart + Selected All (ON)", async ({ page, apiAs, signInHere, disposableCustomer }) => {
  const user = (customer = await disposableCustomer("personal"));
  const api = await apiAs(user);
  // live-discover: distinct products this customer can buy — the user's lines first, then the guest's.
  const products = await discoverPdpProducts(api, td("@td(VIRTUAL_CATALOG_B2B.id)"), 0 + 2);
  const userProducts = products.slice(0, 0);
  const guestProducts = products.slice(0);
  const userUnselected = userProducts.filter((_, i) => false);
  const guestUnselected = guestProducts.filter((_, i) => false);
  // [PRE:RESET_CART]
  await resetCart(api);
  const traffic = watchCartTraffic(page);

  // [NAV] log in to {{FRONT_URL}} — in this page, so the later sign-in merges into this account.
  await signInHere(page, user);
  const adds = traffic.cartMutations.length;
  // [ACT] the user's cart (row Steps), then [WAIT] each cart mutation settles.
  for (const p of userProducts) await addFromPdp(page, p);
  // Precondition guard (BLOCKED): every user product landed in the account cart before any selection change.
  await waitForCartSkus(api, userProducts.map((p) => p.sku));
  for (const p of userUnselected) await setCartLineSelected(page, p, false);
  // Precondition guard (BLOCKED): the account cart holds the user's lines with the intended selection.
  const userBefore = await cartSelection(api);
  for (const p of userProducts) {
    if (userBefore[p.sku] !== !userUnselected.includes(p)) {
      throw new Error(`precondition: user line ${p.sku} selection is ${userBefore[p.sku]} (${JSON.stringify(userBefore)})`);
    }
  }

  // [ACT] account button -> 'Logout' + [WAIT] signed out; [NAV] as guest, the guest's cart.
  await signOutHere(page);
  await page.goto(env("FRONT_URL"));
  for (const p of guestProducts) await addFromPdp(page, p);
  for (const p of guestUnselected) await setCartLineSelected(page, p, false);
  const addMutations = traffic.cartMutations.slice(adds);

  // [ACT] sign in (the storefront merges the guest cart in this session); [NAV] /cart.
  const merges = trafficMark(traffic);
  await signInHere(page, user);
  await page.goto(`${env("FRONT_URL")}/cart`);
  const lines = await cartPageLines(page);
  const line = (sku: string) => cartLineFor(lines, products.find((p) => p.sku === sku)!);
  const server = await cartSelection(api);
  const checkout = page.locator(testIdSelector("checkout-button"));

  // [STATE] items from both carts present after the merge (page and server), each exactly once.
  for (const p of products) {
    expect(line(p.sku), `${p.sku} on the cart page`).toHaveLength(1);
    expect(server[p.sku], `${p.sku} in the server cart`).toBeDefined();
  }
  // [DOM] each line's checkbox is the selection the server holds (the page renders the cart it has).
  for (const p of products) expect(line(p.sku)[0].selected, `${p.sku} checkbox`).toBe(server[p.sku]);
  // [DOM] all item checkboxes checked; [STATE] all items 'selected for checkout' = ON.
  // [API] getCart returns all items with selectedForCheckout=true.
  for (const p of products) expect(server[p.sku], `${p.sku} selectedForCheckout`).toBe(true);
  // [MATH] Order Summary subtotal = sum of (unit price x quantity) over the SELECTED lines only.
  await expect(page.locator(testIdSelector("cart-subtotal-label"))).toHaveText(formatMoney(includedSubtotal(lines)));
  // [STATE] Proceed to Checkout matches the selection: enabled when at least one line is selected. The
  // storefront renders it only in multi-step checkout; a stand on one-page checkout shows "Place order",
  // which is disabled until address and payment are filled whatever the selection — so there the check is
  // NOT evaluated, and the report says so (a row-vs-stand question for a human, not a pass).
  if (await checkout.count()) {
    if (lines.some((l) => l.selected)) await expect(checkout).toBeEnabled();
    else await expect(checkout).toBeDisabled();
  } else {
    test.info().annotations.push({ type: "not-evaluated", description: "[STATE] Proceed to Checkout: not rendered on this stand (one-page checkout)" });
  }

  // [CONSOLE] no JS errors.
  expect(jsErrors(traffic.consoleErrors)).toEqual([]);
  // [NETWORK] no 4xx/5xx (every cart call goes to /graphql).
  expect(traffic.httpErrors.filter((e) => e.includes("/graphql"))).toEqual([]);
  // [API] mergeCart mutation response errors[] is empty.
  const merge = mutationsSince(traffic, merges, "mergeCart");
  expect(merge.read.length + merge.unread, "mergeCart was sent").toBeGreaterThan(0);
  expect(merge.read.flatMap((m) => m.errors)).toEqual([]);
  if (!merge.read.length) test.info().annotations.push({ type: "not-evaluated", description: "[API] mergeCart errors[]: response unreadable (the page navigated first)" });
  // [API] the add-to-cart mutations returned errors[] empty (the row names addItem — see addFromPdp).
  expect(addMutations.length).toBeGreaterThan(0);
  expect(addMutations.flatMap((m) => m.errors)).toEqual([]);
});
