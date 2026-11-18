// CART-101 — the executable twin of row CART-101 in ../030-cart-merge.csv. The CSV row is the truth for
// WHAT is checked (Preconditions, Steps, Assertions, Cross_Layer_Checks); this file is HOW. A failure
// here is fixed in this file or reported as a product finding — never by editing the row's expectation.
import { test, expect, type DisposableCustomer } from "../../../../lib/fixtures.js";
import { env, td } from "../../../../lib/data.js";
import {
  addFromPdp,
  cartLineFor,
  cartLines,
  cartPageLines,
  formatMoney,
  includedSubtotal,
  jsErrors,
  mutationsSince,
  resetCart,
  signOutHere,
  trafficMark,
  watchCartTraffic,
} from "../../../../lib/cart.js";
import { testIdSelector } from "../../../../../scripts/lib/storefront-selectors.generated.js";

// [PRE:DISPOSABLE_CUSTOMER:personal]: a personal customer created for this test and deleted after it (the
// disposableCustomer fixture), so no shared account is signed in, locked or left with cart state.
let customer: DisposableCustomer | undefined;
const pdp = (alias: string) => ({ sku: td(`@td(${alias}.sku)`), id: td(`@td(${alias}.id)`), slug: td(`@td(${alias}.slug)`) });

// Cleanup: "Remove items from cart".
test.afterEach(async ({ apiAs }) => {
  if (customer) await resetCart(await apiAs(customer));
  customer = undefined;
});

test("CART-101: Cart Merge - No Duplicate SKUs", async ({ page, apiAs, signInHere, disposableCustomer }) => {
  const user = (customer = await disposableCustomer("personal"));
  const productA = pdp("BUYABLE_NO_MIN_QTY");
  const api = await apiAs(user);
  // [PRE:RESET_CART]
  await resetCart(api);
  const traffic = watchCartTraffic(page);

  // [NAV] log in to {{FRONT_URL}} as the user — in this page, so the later sign-in merges into this account.
  await signInHere(page, user);
  // [ACT] add Product A to cart with qty=2 + [WAIT] the cart mutation settles.
  const adds = traffic.cartMutations.length;
  await addFromPdp(page, productA, 2);
  // Precondition guard (BLOCKED): the account cart holds exactly Product A x2 before signing out.
  const before = await cartLines(api);
  if (before.length !== 1 || before[0].sku !== productA.sku || before[0].quantity !== 2) {
    throw new Error(`precondition: account cart is not Product A x2 (${JSON.stringify(before)})`);
  }

  // [ACT] account button -> 'Logout' + [WAIT] signed-out state confirmed.
  await signOutHere(page);

  // [NAV] navigate to {{FRONT_URL}} as guest; [ACT] add the same Product A with qty=1 as guest.
  await page.goto(env("FRONT_URL"));
  await addFromPdp(page, productA, 1);
  const addMutations = traffic.cartMutations.slice(adds);

  // [ACT] sign in with the user — the storefront merges the guest cart in this session.
  const merges = trafficMark(traffic);
  await signInHere(page, user);
  // [NAV] navigate to {{FRONT_URL}}/cart
  await page.goto(`${env("FRONT_URL")}/cart`);
  const lines = await cartPageLines(page);
  const lineA = cartLineFor(lines, productA);

  // [STATE] single line item for Product A (no duplicates) / verify exactly one line item for Product A.
  expect(lineA).toHaveLength(1);
  // [DOM] quantity shows "3" (merged sum).
  expect(lineA[0].quantity).toBe(3);
  // [MATH] line total = unit price x 3.
  expect(formatMoney(lineA[0].total)).toBe(formatMoney(lineA[0].price * 3));
  // [MATH] cart subtotal = sum of (unit price x quantity) over every included line (2 decimal places).
  await expect(page.locator(testIdSelector("cart-subtotal-label"))).toHaveText(formatMoney(includedSubtotal(lines)));

  // [STATE] verify qty=3 (2+1) and no duplicate line items — read back from the server-side cart.
  const server = await cartLines(api);
  expect(server.filter((l) => l.sku === productA.sku)).toEqual([{ sku: productA.sku, quantity: 3 }]);
  expect(new Set(server.map((l) => l.sku)).size).toBe(server.length);

  // [API] mergeCart mutation response errors[] is empty.
  const merge = mutationsSince(traffic, merges, "mergeCart");
  expect(merge.read.length + merge.unread, "mergeCart was sent").toBeGreaterThan(0);
  expect(merge.read.flatMap((m) => m.errors)).toEqual([]);
  if (!merge.read.length) test.info().annotations.push({ type: "not-evaluated", description: "[API] mergeCart errors[]: response unreadable (the page navigated first)" });
  // [CONSOLE] no JS errors on sign-in and cart page.
  expect(jsErrors(traffic.consoleErrors)).toEqual([]);
  // [NETWORK] no 4xx/5xx during merge (the merge and every cart call go to /graphql).
  expect(traffic.httpErrors.filter((e) => e.includes("/graphql"))).toEqual([]);
  // [API] the add-to-cart mutations returned errors[] empty (the row names addItem; the PDP buy box sends
  // the storefront's own add mutation — see addFromPdp).
  expect(addMutations.length).toBeGreaterThan(0);
  expect(addMutations.flatMap((m) => m.errors)).toEqual([]);
});
