// CART-007 — the executable twin of row CART-007 in ../028-cart-core.csv. The CSV row is the truth for
// WHAT is checked (Preconditions, Steps, Assertions, Cross_Layer_Checks); this file is HOW. A failure
// here is fixed in this file or reported as a product finding — never by editing the row's expectation.
import { test, expect } from "../../../../lib/fixtures.js";
import { env, td } from "../../../../lib/data.js";
import { addToCart, cartQuantity, formatMoney, money, resetCart, watchCartTraffic } from "../../../../lib/cart.js";
import { testIdSelector } from "../../../../../scripts/lib/storefront-selectors.generated.js";

const ROLE = "USER_DEFAULT";

// Cleanup: "Restore or remove item" — removed.
test.afterEach(async ({ apiAs }) => {
  await resetCart(await apiAs(ROLE));
});

test("CART-007: Update Quantity - Decrease", async ({ signedInAs, apiAs }) => {
  const sku = td("@td(BUYABLE_NO_MIN_QTY.sku)");

  // [PRE:RESET_CART] + "Product in cart with qty > 1 (e.g., qty=2)", seeded before the session opens.
  const api = await apiAs(ROLE);
  await resetCart(api);
  await addToCart(api, sku, 2);
  // [PRE:SIGNIN_AS:USER_DEFAULT]
  const page = await signedInAs(ROLE);
  const traffic = watchCartTraffic(page);

  // [NAV] navigate to {{FRONT_URL}}/cart
  await page.goto(`${env("FRONT_URL")}/cart`);
  const products = page.locator(testIdSelector("cart.products-section"));
  const lines = products.locator(".vc-line-item"); // the UI kit's line-item row; it carries no test id
  const line = lines.first();
  const quantity = line.getByRole("spinbutton", { name: "Product quantity" });
  const decrease = line.getByRole("button", { name: "Decrease quantity" });
  await quantity.waitFor();
  // Precondition guard — a plain Error (BLOCKED), not an expect (FAIL): the seed is not the product under test.
  if ((await lines.count()) !== 1 || (await quantity.inputValue()) !== "2") {
    throw new Error(`precondition: expected one line at qty 2, found ${await lines.count()} line(s)`);
  }
  const unitPrice = money(await line.locator(".vc-line-item__price").innerText());

  // [ACT] click '-' (Decrease quantity) on the line item.
  const sinceClick = traffic.cartMutations.length;
  await decrease.click();

  // [WAIT] + [DOM] line item quantity shows "1".
  await expect(quantity).toHaveValue("1");

  // [DOM] '-' (Decrease quantity) button is disabled at qty=1.
  await expect(decrease).toBeDisabled();

  // [MATH] line total = unit price x 1 (2 decimal places) — from the price read off the page.
  await expect(line.locator(".vc-line-item__total")).toHaveText(formatMoney(unitPrice * 1));

  // [MATH] cart subtotal recalculated = sum of (unit price x quantity) over every INCLUDED line
  // (its checkbox is the checkout selection), read off the page line by line.
  let included = 0;
  for (const row of await lines.all()) {
    if (!(await row.getByRole("checkbox").isChecked())) continue;
    const price = money(await row.locator(".vc-line-item__price").innerText());
    included += price * Number(await row.getByRole("spinbutton", { name: "Product quantity" }).inputValue());
  }
  await expect(page.locator(testIdSelector("cart-subtotal-label"))).toHaveText(formatMoney(included));

  // [STATE] verify quantity decremented to 1 — read back from the server-side cart.
  await expect.poll(() => cartQuantity(api, sku)).toBe(1);

  // [API] changeCartItemsQuantity mutation response errors[] is empty — the operation the row names (D7).
  const sent = () => traffic.cartMutations.slice(sinceClick).filter((m) => m.field === "changeCartItemsQuantity");
  await expect.poll(() => sent().some((m) => m.lines.some((l) => l.sku === sku && l.quantity === 1))).toBe(true);
  expect(sent().flatMap((m) => m.errors)).toEqual([]);

  // [CONSOLE] no JS errors.
  expect(traffic.consoleErrors).toEqual([]);

  // [NETWORK] no 4xx/5xx.
  // Only the cart's own traffic: a missing image or a third-party 404 is not this case's failure.
  expect(traffic.httpErrors.filter((e) => e.includes("/graphql"))).toEqual([]);

  // [STATE] verify '-' (Decrease quantity) is disabled when qty=1 — after a reload, so it is the
  // persisted cart that disables it, not the click's local state.
  await page.reload();
  await expect(quantity).toHaveValue("1");
  await expect(decrease).toBeDisabled();
});
