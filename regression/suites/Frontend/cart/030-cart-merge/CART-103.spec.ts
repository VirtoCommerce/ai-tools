// CART-103 — the executable twin of row CART-103 in ../030-cart-merge.csv. The CSV row is the truth for
// WHAT is checked (Preconditions, Steps, Assertions, Cross_Layer_Checks); this file is HOW. A failure
// here is fixed in this file or reported as a product finding — never by editing the row's expectation.
import { test, expect, type DisposableCustomer } from "../../../../lib/fixtures.js";
import { env, td } from "../../../../lib/data.js";
import {
  addFromPdp,
  cartLines,
  cartPageLines,
  formatMoney,
  includedSubtotal,
  resetCart,
  signOutHere,
  jsErrors,
  watchCartTraffic,
} from "../../../../lib/cart.js";
import { testIdSelector } from "../../../../../scripts/lib/storefront-selectors.generated.js";

// The row signs in as USER_DEFAULT (a personal customer); the spec runs on a disposable personal customer
// created for this test and deleted after it, so no other run can lock the account or touch its cart.
let customer: DisposableCustomer | undefined;
const pdp = (alias: string) => ({ sku: td(`@td(${alias}.sku)`), id: td(`@td(${alias}.id)`), slug: td(`@td(${alias}.slug)`) });
const byQuantity = (lines: Array<{ text: string; quantity: number }>) => lines.map((l) => `${l.text.split("\n")[0]} x${l.quantity}`).sort();

// Cleanup: "Remove items from cart".
test.afterEach(async ({ apiAs }) => {
  if (customer) await resetCart(await apiAs(customer));
  customer = undefined;
});

test("CART-103: Cart Merge - Persists After Logout and Re-login", async ({ page, apiAs, signInHere, disposableCustomer }) => {
  const user = (customer = await disposableCustomer("personal"));
  const productB = pdp("BUYABLE_PRICED_PRODUCT");
  const api = await apiAs(user);
  // [PRE:RESET_CART]
  await resetCart(api);
  const traffic = watchCartTraffic(page);

  // [NAV] navigate to {{FRONT_URL}} as guest; [ACT] add Product B as guest + [WAIT] settle.
  await page.goto(env("FRONT_URL"));
  const adds = traffic.cartMutations.length;
  await addFromPdp(page, productB, 1);
  const addMutations = traffic.cartMutations.slice(adds);

  // [ACT] sign in as the user (triggers merge); [NAV] /cart; [ASSERT] note the merged cart contents.
  const merges = traffic.cartMutations.length;
  await signInHere(page, user);
  await page.goto(`${env("FRONT_URL")}/cart`);
  const merged = await cartPageLines(page);
  const mergedSubtotal = await page.locator(testIdSelector("cart-subtotal-label")).innerText();
  const mergedServer = await cartLines(api);
  // Precondition guard (BLOCKED): the merge brought Product B in, so there is something to persist.
  if (!mergedServer.some((l) => l.sku === productB.sku)) {
    throw new Error(`precondition: merged cart lacks Product B (${JSON.stringify(mergedServer)})`);
  }
  const mergeMutations = traffic.cartMutations.slice(merges).filter((m) => m.field === "mergeCart");

  // [ACT] account button -> 'Logout' + [WAIT] signed out; [ACT] sign in again; [NAV] /cart.
  await signOutHere(page);
  await signInHere(page, user);
  await page.goto(`${env("FRONT_URL")}/cart`);
  const after = await cartPageLines(page);

  // [STATE] merged cart contents identical after logout/re-login; [DOM] all items with correct quantities.
  expect(byQuantity(after)).toEqual(byQuantity(merged));
  // [MATH] cart subtotal matches the pre-logout value = sum of (unit price x quantity) over included lines.
  await expect(page.locator(testIdSelector("cart-subtotal-label"))).toHaveText(mergedSubtotal);
  expect(formatMoney(includedSubtotal(after))).toBe(mergedSubtotal.trim());
  // [STATE] no duplicate or missing items / same items and quantities / nothing lost or duplicated.
  const afterServer = await cartLines(api);
  expect([...afterServer].sort((a, b) => a.sku.localeCompare(b.sku))).toEqual(
    [...mergedServer].sort((a, b) => a.sku.localeCompare(b.sku)),
  );
  expect(new Set(afterServer.map((l) => l.sku)).size).toBe(afterServer.length);

  // [API] getCart query returns the same items after re-login — the server read-back above.
  // [CONSOLE] no JS errors.
  expect(jsErrors(traffic.consoleErrors)).toEqual([]);
  // [NETWORK] no 4xx/5xx (every cart call goes to /graphql).
  expect(traffic.httpErrors.filter((e) => e.includes("/graphql"))).toEqual([]);
  // [API] mergeCart mutation response errors[] is empty.
  expect(mergeMutations.length).toBeGreaterThan(0);
  expect(mergeMutations.flatMap((m) => m.errors)).toEqual([]);
  // [API] the add-to-cart mutation returned errors[] empty (the row names addItem — see addFromPdp).
  expect(addMutations.length).toBeGreaterThan(0);
  expect(addMutations.flatMap((m) => m.errors)).toEqual([]);
});
