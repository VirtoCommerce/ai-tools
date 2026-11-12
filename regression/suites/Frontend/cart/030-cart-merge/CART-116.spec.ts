// CART-116 — the executable twin of row CART-116 in ../030-cart-merge.csv. The CSV row is the truth for
// WHAT is checked (Preconditions, Steps, Assertions, Cross_Layer_Checks); this file is HOW. A failure
// here is fixed in this file or reported as a product finding — never by editing the row's expectation.
import { test, expect, type DisposableCustomer } from "../../../../lib/fixtures.js";
import { env, td } from "../../../../lib/data.js";
import {
  addConfiguredFromPdp,
  cartConfiguredLines,
  cartLineComponents,
  formatMoney,
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
// Test_Data: optionA / optionB — two distinct options of the hat's color section.
const OPTION_A = "Black hat";
const OPTION_B = "Green hat";

// Cleanup: "Remove items from cart".
test.afterEach(async ({ apiAs }) => {
  if (customer) await resetCart(await apiAs(customer));
  customer = undefined;
});

test("CART-116: Cart Merge - Configurable Product, Different Configs Across User and Guest Carts", async ({ page, apiAs, signInHere, disposableCustomer }) => {
  const user = (customer = await disposableCustomer("personal"));
  const hat = { id: td("@td(CFG_HAT.id)"), slug: td("@td(CFG_HAT.slug)") };
  const hatPath = td("@td(CFG_HAT.url)");
  const api = await apiAs(user);
  await resetCart(api);
  const traffic = watchCartTraffic(page);

  // [NAV] log in as the user — in this page, so the later sign-in merges into this account.
  await signInHere(page, user);
  // [NAV] Configurable Hat PDP; [ACT] option A, Add to cart (qty 1); [WAIT] added.
  const adds = traffic.cartMutations.length;
  const totalA = await addConfiguredFromPdp(page, hatPath, OPTION_A);
  // [ASSERT] the user cart shows 1 line with option A — precondition guard (BLOCKED) read from the server.
  const userCart = await cartConfiguredLines(api);
  if (userCart.length !== 1 || !userCart[0].configuration.includes(OPTION_A)) {
    throw new Error(`precondition: user cart is not one option-A line (${JSON.stringify(userCart)})`);
  }

  // [ACT] account button -> 'Logout' + [WAIT] signed out; [NAV] as guest, the same PDP; option B; Add to cart.
  await signOutHere(page);
  await page.goto(env("FRONT_URL"));
  const totalB = await addConfiguredFromPdp(page, hatPath, OPTION_B);
  const addMutations = traffic.cartMutations.slice(adds);

  // [ACT] sign in (triggers merge); [NAV] /cart.
  const merges = traffic.cartMutations.length;
  await signInHere(page, user);
  await page.goto(`${env("FRONT_URL")}/cart`);
  const rows = page.locator(testIdSelector("cart.products-section")).locator(".vc-line-item").filter({ has: page.locator(productLinkSelector(hat)) });

  // [STATE] exactly 2 line items, both the Configurable Hat base product, one per configuration.
  await expect(rows).toHaveCount(2);
  const components = [await cartLineComponents(rows.nth(0)), await cartLineComponents(rows.nth(1))];
  // [DOM] the lines display different option labels: option A on one line, option B on the other.
  expect(components.filter((c) => c.includes(OPTION_A) && !c.includes(OPTION_B))).toHaveLength(1);
  expect(components.filter((c) => c.includes(OPTION_B) && !c.includes(OPTION_A))).toHaveLength(1);
  // [STATE] no quantity summing across distinct configurations: each line stays at 1.
  for (const row of await rows.all()) await expect(row.getByRole("spinbutton", { name: "Product quantity" })).toHaveValue("1");
  // [STATE] both line totals match the pre-merge per-configuration totals.
  const lineTotals = await rows.locator(".vc-line-item__total").allInnerTexts();
  expect(lineTotals.map((t) => t.trim()).sort()).toEqual([formatMoney(totalA), formatMoney(totalB)].sort());
  // [MATH] cart subtotal = configured total A + configured total B.
  await expect(page.locator(testIdSelector("cart-subtotal-label"))).toHaveText(formatMoney(totalA + totalB));

  // [API] getCart returns items[] of length 2 with distinct configurationItems per line.
  const server = await cartConfiguredLines(api);
  expect(server).toHaveLength(2);
  expect(new Set(server.map((l) => l.configuration.join("|"))).size).toBe(2);
  // [API] mergeCart mutation errors[] is empty.
  const merge = traffic.cartMutations.slice(merges).filter((m) => m.field === "mergeCart");
  expect(merge.length).toBeGreaterThan(0);
  expect(merge.flatMap((m) => m.errors)).toEqual([]);
  // [CONSOLE] no JS errors.
  expect(jsErrors(traffic.consoleErrors)).toEqual([]);
  // [NETWORK] no 4xx/5xx.
  expect(traffic.httpErrors.filter((e) => e.includes("/graphql"))).toEqual([]);
  // [API] add-to-cart (configured item) mutation response errors[] is empty.
  expect(addMutations.length).toBeGreaterThan(0);
  expect(addMutations.flatMap((m) => m.errors)).toEqual([]);
});
