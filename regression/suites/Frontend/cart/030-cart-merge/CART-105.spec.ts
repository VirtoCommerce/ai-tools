// CART-105 — the executable twin of row CART-105 in ../030-cart-merge.csv. The CSV row is the truth for
// WHAT is checked (Preconditions, Steps, Assertions, Cross_Layer_Checks); this file is HOW. A failure
// here is fixed in this file or reported as a product finding — never by editing the row's expectation.
import { test, expect, type DisposableCustomer } from "../../../../lib/fixtures.js";
import { env, td } from "../../../../lib/data.js";
import { addFromPdp, resetCart, watchCartTraffic } from "../../../../lib/cart.js";
import { testIdSelector } from "../../../../../scripts/lib/storefront-selectors.generated.js";

// [PRE:DISPOSABLE_CUSTOMER:personal]: a personal customer created for this test and deleted after it (the
// disposableCustomer fixture), so no shared account is signed in, locked or left with cart state.
let customer: DisposableCustomer | undefined;

// Cleanup: "none (verify cart state)" in the row; the cart is still reset so the next case starts empty.
test.afterEach(async ({ apiAs }) => {
  if (customer) await resetCart(await apiAs(customer));
  customer = undefined;
});

test("CART-105: Cart Merge - Smart Merge Failure Handling", async ({ page, apiAs, signInHere, disposableCustomer }) => {
  const user = (customer = await disposableCustomer("personal"));
  const product = {
    sku: td("@td(BUYABLE_NO_MIN_QTY.sku)"),
    id: td("@td(BUYABLE_NO_MIN_QTY.id)"),
    slug: td("@td(BUYABLE_NO_MIN_QTY.slug)"),
  };

  // [PRE:RESET_CART] — the account cart is emptied through the API before the guest session starts.
  await resetCart(await apiAs(user));
  const traffic = watchCartTraffic(page);

  // [NAV] navigate to {{FRONT_URL}} as guest — the plain page fixture is an anonymous context.
  await page.goto(env("FRONT_URL"));

  // [ACT] add products to cart as anonymous user + [WAIT] the cart mutation settles.
  const addedFrom = traffic.cartMutations.length;
  await addFromPdp(page, product);
  const guestAdds = traffic.cartMutations.slice(addedFrom);

  // [ACT] sign in as the disposable customer (normal merge) — in THIS session, so the storefront's sign-in merge runs.
  await signInHere(page, user);

  // [NAV] navigate to {{FRONT_URL}}/cart
  await page.goto(`${env("FRONT_URL")}/cart`);

  // [DOM] cart page accessible and functional after login (even if the merge produced a no-op result).
  await expect(page.locator(testIdSelector("cart.products-section"))).toBeVisible();

  // [STATE] no JS unhandled exception displayed to the user / [CONSOLE] no unhandled JS exceptions
  // during the normal sign-in merge flow (an unhandled exception surfaces as a pageerror).
  expect(traffic.consoleErrors.filter((e) => e.startsWith("pageerror:"))).toEqual([]);

  // [NETWORK] no 500 on the merge API response for the normal sign-in flow (every cart call is /graphql).
  expect(traffic.httpErrors.filter((e) => /^5\d\d /.test(e) && e.includes("/graphql"))).toEqual([]);

  // [API] the guest add-to-cart mutation returned errors[] empty. The row names addItem; the PDP buy box
  // sends the storefront's own add mutation (see addFromPdp), which is the one checked here.
  expect(guestAdds.length).toBeGreaterThan(0);
  expect(guestAdds.flatMap((m) => m.errors)).toEqual([]);
});
