// CART-104 — the executable twin of row CART-104 in ../030-cart-merge.csv. The CSV row is the truth for
// WHAT is checked (Preconditions, Steps, Assertions, Cross_Layer_Checks); this file is HOW. A failure
// here is fixed in this file or reported as a product finding — never by editing the row's expectation.
import { test, expect, type DisposableCustomer } from "../../../../lib/fixtures.js";
import { env, td } from "../../../../lib/data.js";
import {
  addConfiguredFromPdp,
  addFromPdp,
  cartConfiguredLines,
  cartLineComponents,
  jsErrors,
  productLinkSelector,
  resetCart,
  signOutHere,
  watchCartTraffic,
} from "../../../../lib/cart.js";
import { testIdSelector } from "../../../../../scripts/lib/storefront-selectors.generated.js";

// The row signs in as USER_DEFAULT (a personal customer); the spec runs on a disposable personal customer
// created for this test and deleted after it, so no other run can lock the account or touch its cart.
let customer: DisposableCustomer | undefined;
// The configurable product's variant: an option of the hat's color section (row: "size/color variant selected").
const OPTION = "Black hat";

// Cleanup: "Remove items from cart".
test.afterEach(async ({ apiAs }) => {
  if (customer) await resetCart(await apiAs(customer));
  customer = undefined;
});

test("CART-104: Cart Merge - Different Product Types", async ({ page, apiAs, signInHere, disposableCustomer }) => {
  const user = (customer = await disposableCustomer("personal"));
  const hat = { id: td("@td(CFG_HAT.id)"), slug: td("@td(CFG_HAT.slug)") };
  const hatPath = td("@td(CFG_HAT.url)");
  const simple = { sku: td("@td(BUYABLE_NO_MIN_QTY.sku)"), id: td("@td(BUYABLE_NO_MIN_QTY.id)"), slug: td("@td(BUYABLE_NO_MIN_QTY.slug)") };
  const api = await apiAs(user);
  await resetCart(api);
  const traffic = watchCartTraffic(page);
  const section = () => page.locator(testIdSelector("cart.products-section"));

  // [NAV] log in; [ACT] add the configurable product with its variant option selected; [WAIT] settle.
  await signInHere(page, user);
  const adds = traffic.cartMutations.length;
  await addConfiguredFromPdp(page, hatPath, OPTION);
  // [ACT] Logout; [NAV] as guest; [ACT] add a simple product as guest; [WAIT] settle.
  await signOutHere(page);
  await page.goto(env("FRONT_URL"));
  await addFromPdp(page, simple);
  const addMutations = traffic.cartMutations.slice(adds);

  // [ACT] sign in; [NAV] /cart.
  const merges = traffic.cartMutations.length;
  await signInHere(page, user);
  await page.goto(`${env("FRONT_URL")}/cart`);
  const hatRows = section().locator(".vc-line-item").filter({ has: page.locator(productLinkSelector(hat)) });
  const simpleRows = section().locator(".vc-line-item").filter({ has: page.locator(productLinkSelector(simple)) });

  // [STATE] the simple product from the guest cart is present; the configurable one from the user cart too.
  await expect(simpleRows).toHaveCount(1);
  await expect(hatRows).toHaveCount(1);
  // [DOM] the merged configurable line shows the option selected before the merge (variant attributes kept).
  expect(await cartLineComponents(hatRows.first())).toContain(OPTION);
  // [STATE] no missing or mismatched products: the server cart is exactly these two, the configured one with A.
  const server = await cartConfiguredLines(api);
  expect(server).toHaveLength(2);
  expect(server.find((l) => l.configuration.length > 0)?.configuration).toContain(OPTION);
  expect(server.filter((l) => l.configuration.length === 0)).toHaveLength(1);

  // [API] mergeCart mutation response errors[] is empty.
  const merge = traffic.cartMutations.slice(merges).filter((m) => m.field === "mergeCart");
  expect(merge.length).toBeGreaterThan(0);
  expect(merge.flatMap((m) => m.errors)).toEqual([]);
  // [CONSOLE] no JS errors.
  expect(jsErrors(traffic.consoleErrors)).toEqual([]);
  // [NETWORK] no 4xx/5xx.
  expect(traffic.httpErrors.filter((e) => e.includes("/graphql"))).toEqual([]);
  // [API] the add-to-cart mutations returned errors[] empty (the row names addItem).
  expect(addMutations.length).toBeGreaterThan(0);
  expect(addMutations.flatMap((m) => m.errors)).toEqual([]);
});
