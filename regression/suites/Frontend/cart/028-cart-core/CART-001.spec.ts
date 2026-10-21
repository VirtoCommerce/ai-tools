// CART-001 — the executable twin of row CART-001 in ../028-cart-core.csv. The CSV row is the truth for
// WHAT is checked (Preconditions, Steps, Assertions, Cross_Layer_Checks); this file is HOW. A failure
// here is fixed in this file or reported as a product finding — never by editing the row's expectation.
import { test, expect } from "../../../../lib/fixtures.js";
import { env, td } from "../../../../lib/data.js";
import { cartQuantity, resetCart, sentMutation, watchCartTraffic } from "../../../../lib/cart.js";
import { testIdSelector } from "../../../../../scripts/lib/storefront-selectors.generated.js";

const ROLE = "USER_DEFAULT";
/** The mutation the row's [API] item names — asserted by name, never substituted (D7). */
const API_MUTATION = "updateCartQuantity";

/** The header cart link reads "<count><label>" with no separator ("1Cart"); match the leading count only. */
const badgeShows = (count: number) => new RegExp(`^\\s*${count}(?!\\d)`);

// Cleanup: "Remove added item from cart".
test.afterEach(async ({ apiAs }) => {
  await resetCart(await apiAs(ROLE));
});

test("CART-001: Add to Cart - From Product Page", async ({ signedInAs, apiAs }) => {
  const sku = td("@td(BUYABLE_NO_MIN_QTY.sku)");
  // The product card links by id or by slug — which one the storefront routes by is per environment.
  // `slug` is a column of the base fixture, so it is always set; `id` is a seed write-back that only
  // some environments carry, and td() refuses an empty value, so the id is used only where it exists.
  const linkKeys = new Set([td("@td(BUYABLE_NO_MIN_QTY.slug)")]);
  try {
    linkKeys.add(td("@td(BUYABLE_NO_MIN_QTY.id)"));
  } catch {
    /* no id written back on this TEST_ENV: the slug alone identifies the card */
  }

  // [PRE:RESET_CART] before the session opens, so the header renders the emptied cart.
  const api = await apiAs(ROLE);
  await resetCart(api);
  // [PRE:SIGNIN_AS:USER_DEFAULT]
  const page = await signedInAs(ROLE);
  const traffic = watchCartTraffic(page);
  const cartLink = page.getByRole("navigation", { name: "Main menu" }).getByRole("link", { name: /cart/i });

  // [NAV] navigate to {{FRONT_URL}}/search?q=@td(BUYABLE_NO_MIN_QTY.sku)
  await page.goto(`${env("FRONT_URL")}/search?q=${encodeURIComponent(sku)}`);

  // [ACT] click the matching product card for the SKU to open its PDP — the card whose product link
  // points at this product.
  await page
    .getByRole("main")
    .locator([...linkKeys].map((key) => `a[href*="${key}"]`).join(", "))
    .filter({ hasText: /\S/ })
    .first()
    .click();

  // [WAIT] wait for the PDP to load — it is the page that names this SKU.
  await expect(page.getByRole("main").getByText(`#${sku}`)).toBeVisible();

  // [ASSERT] verify quantity spinbutton visible on PDP (the buy box, not a recommendation card).
  const buyBox = page.getByRole("complementary", { name: "Sidebar" });
  const stepper = buyBox.locator(testIdSelector("quantity-stepper"));
  await expect(stepper.getByRole("spinbutton", { name: "Product quantity" })).toBeVisible();

  // [ACT] click '+' (Increase quantity) to add the product to the cart. The badge is read off the page
  // first, so "incremented by 1" is measured, not assumed from the reset.
  const badgeBefore = Number((await cartLink.innerText()).match(/\d+/)?.[0] ?? 0);
  const sinceClick = {
    console: traffic.consoleErrors.length,
    http: traffic.httpErrors.length,
    mutations: traffic.cartMutations.length,
  };
  await stepper.getByRole("button", { name: "Increase quantity" }).click();

  // [WAIT] + [DOM] "in Cart" indicator visible adjacent to stepper showing "1".
  const inCart = buyBox.getByTitle("in Cart");
  await expect(inCart).toBeVisible();
  await expect(inCart.locator(testIdSelector("count-in-cart-label"))).toHaveText("1");

  // [DOM] cart badge count incremented by "1".
  await expect(cartLink).toHaveText(badgeShows(badgeBefore + 1));

  // [STATE] product appears in cart — read back from the server-side cart, not from the page.
  await expect.poll(() => cartQuantity(api, sku)).toBe(1);

  // [API] updateCartQuantity mutation response errors[] is empty — the mutation the row names, by name.
  const sent = () => sentMutation(traffic.cartMutations.slice(sinceClick.mutations), API_MUTATION);
  await expect.poll(() => sent().length, { message: `${API_MUTATION} was sent after the '+' click` }).toBeGreaterThan(0);
  expect(sent().flatMap((m) => m.errors)).toEqual([]);

  // [CONSOLE] no JS errors after add-to-cart click.
  expect(traffic.consoleErrors.slice(sinceClick.console)).toEqual([]);

  // [NETWORK] no 4xx/5xx on cart API requests (every cart operation goes to the GraphQL endpoint).
  expect(traffic.httpErrors.slice(sinceClick.http).filter((e) => e.includes("/graphql"))).toEqual([]);

  // [STATE] verify cart badge count incremented — it survives a reload, so it is the cart's, not the widget's.
  await page.reload();
  await expect(cartLink).toHaveText(badgeShows(badgeBefore + 1));
});
