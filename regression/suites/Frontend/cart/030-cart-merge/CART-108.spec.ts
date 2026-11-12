// CART-108 — the executable twin of row CART-108 in ../030-cart-merge.csv. The CSV row is the truth for
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
  resetCart,
  setCartLineSelected,
  signOutHere,
  jsErrors,
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

test("CART-108: Cart Merge Selection - Both Unselected All (ON)", async ({ page, apiAs, signInHere, disposableCustomer }) => {
  const user = (customer = await disposableCustomer("personal"));
  const api = await apiAs(user);
  // live-discover: distinct products this customer can buy — the user's lines first, then the guest's.
  const products = await discoverPdpProducts(api, td("@td(VIRTUAL_CATALOG_B2B.id)"), 2 + 2);
  const userProducts = products.slice(0, 2);
  const guestProducts = products.slice(2);
  const userUnselected = userProducts.filter((_, i) => true);
  const guestUnselected = guestProducts.filter((_, i) => true);
  // [PRE:RESET_CART]
  await resetCart(api);
  const traffic = watchCartTraffic(page);

  // [NAV] log in to {{FRONT_URL}} — in this page, so the later sign-in merges into this account.
  await signInHere(page, user);
  const adds = traffic.cartMutations.length;
  // [ACT] the user's cart (row Steps), then [WAIT] each cart mutation settles.
  for (const p of userProducts) await addFromPdp(page, p);
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
  const merges = traffic.cartMutations.length;
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
  // [DOM] selection state consistent with merge logic — either the unselected state is preserved or it
  // is reset to the default ON, and the SAME rule applies to every line (consistency is what the row checks).
  // [API] getCart returns items with correct selectedForCheckout values — the per-line DOM check above.
  expect(new Set(products.map((p) => server[p.sku])).size, "one rule for every line").toBe(1);
  // [MATH] Order Summary subtotal = sum of (unit price x quantity) over the SELECTED lines only.
  await expect(page.locator(testIdSelector("cart-subtotal-label"))).toHaveText(formatMoney(includedSubtotal(lines)));
  // [STATE] Proceed to Checkout matches the selection: enabled when at least one line is selected.
  if (lines.some((l) => l.selected)) await expect(checkout).toBeEnabled();
  else await expect(checkout).toBeDisabled();

  // [CONSOLE] no JS errors.
  expect(jsErrors(traffic.consoleErrors)).toEqual([]);
  // [NETWORK] no 4xx/5xx (every cart call goes to /graphql).
  expect(traffic.httpErrors.filter((e) => e.includes("/graphql"))).toEqual([]);
  // [API] mergeCart (where the storefront sends one) returned errors[] empty.
  expect(traffic.cartMutations.slice(merges).filter((m) => m.field === "mergeCart").flatMap((m) => m.errors)).toEqual([]);
  // [API] the add-to-cart mutations returned errors[] empty (the row names addItem — see addFromPdp).
  expect(addMutations.length).toBeGreaterThan(0);
  expect(addMutations.flatMap((m) => m.errors)).toEqual([]);
});
