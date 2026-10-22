// CART-034 — the executable twin of row CART-034 in ../028-cart-core.csv. The CSV row is the truth for
// WHAT is checked (Preconditions, Steps, Assertions, Cross_Layer_Checks); this file is HOW. A failure
// here is fixed in this file or reported as a product finding — never by editing the row's expectation.
import { test, expect } from "../../../../lib/fixtures.js";
import { env, td } from "../../../../lib/data.js";
import { addToCart, cartQuantity, resetCart, watchCartTraffic } from "../../../../lib/cart.js";
import { testIdSelector } from "../../../../../scripts/lib/storefront-selectors.generated.js";

const ROLE = "USER_DEFAULT";

// Cleanup: "none" in the row; the cart is still reset so the next case starts from an empty cart.
test.afterEach(async ({ apiAs }) => {
  await resetCart(await apiAs(ROLE));
});

test("CART-034: Quantity Stepper - Cart Page Minimum is 1", async ({ signedInAs, apiAs }) => {
  const sku = td("@td(BUYABLE_NO_MIN_QTY.sku)");

  // [PRE:RESET_CART] + "Product in cart with qty=1", seeded before the session opens.
  const api = await apiAs(ROLE);
  await resetCart(api);
  await addToCart(api, sku, 1);
  // [PRE:SIGNIN_AS:USER_DEFAULT]
  const page = await signedInAs(ROLE);
  const traffic = watchCartTraffic(page);
  // Every GraphQL mutation the page sends — the row's [NETWORK] item is "no API call", not only
  // "no cart-returning call", so this counts requests, whatever they return.
  const mutationsSent: string[] = [];
  page.on("request", (req) => {
    if (req.method() !== "POST" || !new URL(req.url()).pathname.endsWith("/graphql")) return;
    const sent = req.postDataJSON() as { operationName?: string; query?: string } | null;
    if (sent?.query?.trim().startsWith("mutation")) mutationsSent.push(sent.operationName ?? "(anonymous)");
  });

  // [NAV] navigate to {{FRONT_URL}}/cart
  await page.goto(`${env("FRONT_URL")}/cart`);
  const products = page.locator(testIdSelector("cart.products-section"));
  const lines = products.locator(".vc-line-item"); // the UI kit's line-item row; it carries no test id
  const line = lines.first();
  const quantity = line.getByRole("spinbutton", { name: "Product quantity" });
  const decrease = line.getByRole("button", { name: "Decrease quantity" });
  await quantity.waitFor();
  // Precondition guard — a plain Error (BLOCKED), not an expect (FAIL): the seed is not the product under test.
  if ((await lines.count()) !== 1) {
    throw new Error(`precondition: expected one cart line, found ${await lines.count()}`);
  }

  // [ASSERT] + [DOM] spinbutton shows '1'.
  await expect(quantity).toHaveValue("1");

  // [ASSERT] + [DOM] 'Decrease quantity' button is disabled at qty=1 on the cart page.
  await expect(decrease).toBeDisabled();

  // [ACT] attempt to click '-'. `force` skips Playwright's wait for an enabled target, so the click is
  // really attempted on the disabled button instead of timing out (which would read as BLOCKED, D8).
  const sinceClick = { mutations: mutationsSent.length, cart: traffic.cartMutations.length };
  await decrease.click({ force: true });

  // [WAIT] wait for quantity to update and totals to recalculate — whatever the click set off settles first.
  await page.waitForLoadState("networkidle");

  // [STATE] quantity cannot go below 1 via the stepper: the line is still there, still at 1, on the page …
  await expect(lines).toHaveCount(1);
  await expect(quantity).toHaveValue("1");
  // … and in the server-side cart.
  expect(await cartQuantity(api, sku)).toBe(1);

  // [NETWORK] no API call fired when the disabled button was clicked.
  expect(mutationsSent.slice(sinceClick.mutations)).toEqual([]);
  expect(traffic.cartMutations.slice(sinceClick.cart)).toEqual([]);

  // [CONSOLE] no JS errors on the disabled button interaction.
  expect(traffic.consoleErrors).toEqual([]);
});
