// CART-114 — the executable twin of row CART-114 in ../030-cart-merge.csv. The CSV row is the truth for
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
  watchCartTraffic,
} from "../../../../lib/cart.js";
import { testIdSelector } from "../../../../../scripts/lib/storefront-selectors.generated.js";

// The row signs in as USER_EMAIL (a personal customer); the spec runs on a disposable personal customer
// created for this test and deleted after it, so no other run can lock the account or touch its cart.
let customer: DisposableCustomer | undefined;
// Test_Data: optionA / optionB — two distinct options of the hat's color section.
const OPTION_A = "Black hat";
const OPTION_B = "Green hat";

// Cleanup: "Remove all items from cart".
test.afterEach(async ({ apiAs }) => {
  if (customer) await resetCart(await apiAs(customer));
  customer = undefined;
});

test("CART-114: Cart Merge - Configurable Product, Different Options Create Separate Lines", async ({ page, apiAs, signInHere, disposableCustomer }) => {
  const user = (customer = await disposableCustomer("personal"));
  const hat = { id: td("@td(CFG_HAT.id)"), slug: td("@td(CFG_HAT.slug)") };
  const hatPath = td("@td(CFG_HAT.url)");
  const api = await apiAs(user);
  // [PRE:RESET_CART] the account cart; [PRE:CLEAR_SESSION] the page fixture is a fresh guest context.
  await resetCart(api);
  const traffic = watchCartTraffic(page);
  const rows = () =>
    page.locator(testIdSelector("cart.products-section")).locator(".vc-line-item").filter({ has: page.locator(productLinkSelector(hat)) });
  const cartLink = page.getByRole("navigation", { name: "Main menu" }).getByRole("link", { name: /cart/i });
  const createNew = page.getByRole("button", { name: "Create new configuration" }).or(page.getByRole("link", { name: "Create new configuration" }));

  // [NAV] as guest, the Configurable Hat PDP; option A; [ASSERT] the PDP total for A (totalA); Add to cart.
  await page.goto(env("FRONT_URL"));
  const adds = traffic.cartMutations.length;
  const totalA = await addConfiguredFromPdp(page, hatPath, OPTION_A);
  // [ASSERT] badge 1, Add to cart became Update cart (the helper waited for it), "Create new configuration" visible.
  await expect(cartLink).toHaveText(/^\s*1(?!\d)/);
  await expect(createNew.first()).toBeVisible();
  // [ACT] "Create new configuration"; option B; [ASSERT] totalB != totalA; Add to cart; [ASSERT] badge 2.
  const totalB = await addConfiguredFromPdp(page, hatPath, OPTION_B, { newConfiguration: true });
  expect(totalB).not.toBe(totalA);
  await expect(cartLink).toHaveText(/^\s*2(?!\d)/);
  const addMutations = traffic.cartMutations.slice(adds);

  // [NAV] /cart: [ASSERT] exactly 2 hat lines; Components list shows A on one, B on the other; totals A and B.
  await page.goto(`${env("FRONT_URL")}/cart`);
  await expect(rows()).toHaveCount(2);
  const before = [await cartLineComponents(rows().nth(0)), await cartLineComponents(rows().nth(1))];
  expect(before.filter((c) => c.includes(OPTION_A) && !c.includes(OPTION_B))).toHaveLength(1);
  expect(before.filter((c) => c.includes(OPTION_B) && !c.includes(OPTION_A))).toHaveLength(1);
  const totalsBefore = (await rows().locator(".vc-line-item__total").allInnerTexts()).map((t) => t.trim()).sort();
  expect(totalsBefore).toEqual([formatMoney(totalA), formatMoney(totalB)].sort());

  // [ACT] sign in (anonymous -> user cart merge); [NAV] /cart.
  const merges = traffic.cartMutations.length;
  await signInHere(page, user);
  await page.goto(`${env("FRONT_URL")}/cart`);

  // [STATE] 2 distinct line items for the same base product preserved through the merge; badge reflects 2.
  await expect(rows()).toHaveCount(2);
  await expect(cartLink).toHaveText(/^\s*2(?!\d)/);
  // [DOM] with Components list expanded, the lines show option A vs option B; each keeps its configuration.
  const after = [await cartLineComponents(rows().nth(0)), await cartLineComponents(rows().nth(1))];
  expect(after.filter((c) => c.includes(OPTION_A) && !c.includes(OPTION_B))).toHaveLength(1);
  expect(after.filter((c) => c.includes(OPTION_B) && !c.includes(OPTION_A))).toHaveLength(1);
  // [STATE] no collapse and no quantity summing: each line at 1; per-line totals unchanged from pre-merge.
  for (const row of await rows().all()) await expect(row.getByRole("spinbutton", { name: "Product quantity" })).toHaveValue("1");
  expect((await rows().locator(".vc-line-item__total").allInnerTexts()).map((t) => t.trim()).sort()).toEqual(totalsBefore);
  // [MATH] cart subtotal = totalA + totalB.
  await expect(page.locator(testIdSelector("cart-subtotal-label"))).toHaveText(formatMoney(totalA + totalB));

  // [API] getCart returns items[] of length 2 with distinct configurationItems per line.
  const server = await cartConfiguredLines(api);
  expect(server).toHaveLength(2);
  expect(new Set(server.map((l) => l.configuration.join("|"))).size).toBe(2);
  // [API] mergeCart mutation response errors[] is empty.
  const merge = traffic.cartMutations.slice(merges).filter((m) => m.field === "mergeCart");
  expect(merge.length).toBeGreaterThan(0);
  expect(merge.flatMap((m) => m.errors)).toEqual([]);
  // [CONSOLE] no JS errors during sign-in and cart merge.
  expect(jsErrors(traffic.consoleErrors)).toEqual([]);
  // [NETWORK] no 4xx/5xx on cart fetch or merge mutation.
  expect(traffic.httpErrors.filter((e) => e.includes("/graphql"))).toEqual([]);
  // [API] add-to-cart (configured item) mutation response errors[] is empty.
  expect(addMutations.length).toBeGreaterThan(0);
  expect(addMutations.flatMap((m) => m.errors)).toEqual([]);
});
