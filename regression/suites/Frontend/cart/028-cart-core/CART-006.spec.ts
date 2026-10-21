// CART-006 — the executable twin of row CART-006 in ../028-cart-core.csv. The CSV row is the truth for
// WHAT is checked (Preconditions, Steps, Assertions, Cross_Layer_Checks); this file is HOW. A failure
// here is fixed in this file or reported as a product finding — never by editing the row's expectation.
import { test, expect } from "../../../../lib/fixtures.js";
import { env, td } from "../../../../lib/data.js";
import { addToCart, cartQuantity, formatMoney, money, resetCart, sentMutation, watchCartTraffic } from "../../../../lib/cart.js";
import { testIdSelector } from "../../../../../scripts/lib/storefront-selectors.generated.js";

const ROLE = "USER_DEFAULT";
/** The mutation the row's [API] item names — asserted by name, never substituted (D7). */
const API_MUTATION = "changeCartItemsQuantity";

// Cleanup: "Restore item quantity to 1 or remove item" — removed.
test.afterEach(async ({ apiAs }) => {
  await resetCart(await apiAs(ROLE));
});

test("CART-006: Update Quantity - Increase", async ({ signedInAs, apiAs }) => {
  const sku = td("@td(BUYABLE_NO_MIN_QTY.sku)");

  // [PRE:RESET_CART] + "Product in cart with qty=1", seeded before the session opens.
  const api = await apiAs(ROLE);
  await resetCart(api);
  await addToCart(api, sku, 1);
  // [PRE:SIGNIN_AS:USER_DEFAULT]
  const page = await signedInAs(ROLE);
  const traffic = watchCartTraffic(page);

  // [NAV] navigate to {{FRONT_URL}}/cart
  await page.goto(`${env("FRONT_URL")}/cart`);
  const products = page.locator(testIdSelector("cart.products-section"));
  const lines = products.locator(".vc-line-item"); // the UI kit's line-item row; it carries no test id
  const line = lines.first();
  const quantity = line.getByRole("spinbutton", { name: "Product quantity" });
  await quantity.waitFor();
  // Precondition guard — a plain Error (BLOCKED), not an expect (FAIL): the seed is not the product under test.
  if ((await lines.count()) !== 1 || (await quantity.inputValue()) !== "1") {
    throw new Error(`precondition: expected one line at qty 1, found ${await lines.count()} line(s)`);
  }
  const unitPrice = money(await line.locator(".vc-line-item__price").innerText());

  // [ACT] click '+' (Increase quantity) on the line item.
  const sinceClick = traffic.cartMutations.length;
  await line.getByRole("button", { name: "Increase quantity" }).click();

  // [WAIT] + [DOM] line item quantity shows "2".
  await expect(quantity).toHaveValue("2");

  // [MATH] line total = unit price x 2 (2 decimal places) — from the price read off the page.
  await expect(line.locator(".vc-line-item__total")).toHaveText(formatMoney(unitPrice * 2));

  // [MATH] cart subtotal = sum of all updated line totals.
  const lineTotals = (await products.locator(".vc-line-item__total").allInnerTexts()).map(money);
  await expect(page.locator(testIdSelector("cart-subtotal-label"))).toHaveText(
    formatMoney(lineTotals.reduce((a, b) => a + b, 0)),
  );

  // [STATE] verify quantity incremented to 2 — read back from the server-side cart.
  await expect.poll(() => cartQuantity(api, sku)).toBe(2);

  // [API] changeCartItemsQuantity mutation response errors[] is empty — the mutation the row names, by name.
  const sent = () => sentMutation(traffic.cartMutations.slice(sinceClick), API_MUTATION);
  await expect.poll(() => sent().length, { message: `${API_MUTATION} was sent after the click` }).toBeGreaterThan(0);
  expect(sent().flatMap((m) => m.errors)).toEqual([]);

  // [CONSOLE] no JS errors.
  expect(traffic.consoleErrors).toEqual([]);

  // [NETWORK] no 4xx/5xx.
  expect(traffic.httpErrors).toEqual([]);
});
