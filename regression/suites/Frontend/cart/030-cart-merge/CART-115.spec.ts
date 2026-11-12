// CART-115 — the executable twin of row CART-115 in ../030-cart-merge.csv. The CSV row is the truth for
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
  mutationsSince,
  productLinkSelector,
  resetCart,
  signOutHere,
  trafficMark,
  watchCartTraffic,
} from "../../../../lib/cart.js";
import { testIdSelector } from "../../../../../scripts/lib/storefront-selectors.generated.js";

// The row signs in as USER_DEFAULT (a personal customer); the spec runs on a disposable personal customer
// created for this test and deleted after it, so no other run can lock the account or touch its cart.
let customer: DisposableCustomer | undefined;
// Test_Data: option — the one option both carts configure identically.
const OPTION = "Black hat";

// Cleanup: "Remove items from cart".
test.afterEach(async ({ apiAs }) => {
  if (customer) await resetCart(await apiAs(customer));
  customer = undefined;
});

test("CART-115: Cart Merge - Same Configurable Product Same Configuration Stays Separate Lines (VCST-5053)", async ({ page, apiAs, signInHere, disposableCustomer }) => {
  const user = (customer = await disposableCustomer("personal"));
  const hat = { id: td("@td(CFG_HAT.id)"), slug: td("@td(CFG_HAT.slug)") };
  const hatPath = td("@td(CFG_HAT.url)");
  const api = await apiAs(user);
  await resetCart(api);
  const traffic = watchCartTraffic(page);
  const rows = () =>
    page.locator(testIdSelector("cart.products-section")).locator(".vc-line-item").filter({ has: page.locator(productLinkSelector(hat)) });
  const cartLink = page.getByRole("navigation", { name: "Main menu" }).getByRole("link", { name: /cart/i });

  // [NAV] log in; the hat PDP; option A, other sections at their defaults; Add to cart; [ASSERT] badge 1.
  await signInHere(page, user);
  const adds = traffic.cartMutations.length;
  const unit = await addConfiguredFromPdp(page, hatPath, OPTION);
  await expect(cartLink).toHaveText(/^\s*1(?!\d)/);

  // [ACT] Logout; [NAV] as guest, the same PDP; the SAME option with identical other sections; Add to cart.
  await signOutHere(page);
  await page.goto(env("FRONT_URL"));
  await addConfiguredFromPdp(page, hatPath, OPTION);
  // [NAV] /cart; [ACT] set quantity=2; [ASSERT] guest cart badge shows 2.
  await page.goto(`${env("FRONT_URL")}/cart`);
  await expect(rows()).toHaveCount(1);
  // The line's quantity change goes out as a batched, debounced update: wait for that request itself.
  const quantitySent = page.waitForResponse(
    (r) => new URL(r.url()).pathname.endsWith("/graphql") && r.request().headers()["x-graphql-operation-type"] === "mutation",
    { timeout: 30_000 },
  );
  await rows().first().getByRole("button", { name: "Increase quantity" }).click();
  await expect(rows().first().getByRole("spinbutton", { name: "Product quantity" })).toHaveValue("2");
  await quantitySent;
  await page.waitForLoadState("networkidle");
  await expect(cartLink).toHaveText(/^\s*2(?!\d)/);
  const addMutations = traffic.cartMutations.slice(adds);

  // [ACT] sign in (triggers merge); [NAV] /cart.
  const merges = trafficMark(traffic);
  await signInHere(page, user);
  await page.goto(`${env("FRONT_URL")}/cart`);

  // [STATE] exactly 2 line items for the hat even though both configurations are identical (VCST-5053).
  await expect(rows()).toHaveCount(2);
  // [DOM] one line qty 1, the other qty 2 — no quantity summing across the two configured lines.
  const quantities: string[] = [];
  for (const row of await rows().all()) quantities.push(await row.getByRole("spinbutton", { name: "Product quantity" }).inputValue());
  expect(quantities.sort()).toEqual(["1", "2"]);
  // [STATE] both lines retain option A — the same configuration on both.
  for (const row of await rows().all()) expect(await cartLineComponents(row)).toContain(OPTION);
  // [MATH] cart subtotal = configured unit price x 3 (sum of both lines).
  await expect(page.locator(testIdSelector("cart-subtotal-label"))).toHaveText(formatMoney(unit * 3));

  // [API] getCart: items[] of length 2, both configured with matching configurationItems, quantities 1 and 2.
  const server = await cartConfiguredLines(api);
  expect(server).toHaveLength(2);
  expect(server.map((l) => l.quantity).sort()).toEqual([1, 2]);
  expect(server[0].configuration.length).toBeGreaterThan(0);
  expect(server[0].configuration).toEqual(server[1].configuration);
  // [API] mergeCart mutation errors[] is empty.
  const merge = mutationsSince(traffic, merges, "mergeCart");
  expect(merge.read.length + merge.unread, "mergeCart was sent").toBeGreaterThan(0);
  expect(merge.read.flatMap((m) => m.errors)).toEqual([]);
  if (!merge.read.length) test.info().annotations.push({ type: "not-evaluated", description: "[API] mergeCart errors[]: response unreadable (the page navigated first)" });
  // [CONSOLE] no JS errors.
  expect(jsErrors(traffic.consoleErrors)).toEqual([]);
  // [NETWORK] no 4xx/5xx.
  expect(traffic.httpErrors.filter((e) => e.includes("/graphql"))).toEqual([]);
  // [API] add-to-cart (configured item) mutation response errors[] is empty.
  expect(addMutations.length).toBeGreaterThan(0);
  expect(addMutations.flatMap((m) => m.errors)).toEqual([]);
});
