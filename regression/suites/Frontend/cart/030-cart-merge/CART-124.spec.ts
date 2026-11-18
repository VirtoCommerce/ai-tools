// CART-124 — the executable twin of row CART-124 in ../030-cart-merge.csv. The CSV row is the truth for
// WHAT is checked (Preconditions, Steps, Assertions, Cross_Layer_Checks); this file is HOW. A failure
// here is fixed in this file or reported as a product finding — never by editing the row's expectation.
import type { APIRequestContext, Page } from "@playwright/test";
import { test, expect, type DisposableCustomer } from "../../../../lib/fixtures.js";
import { env, td } from "../../../../lib/data.js";
import { testIdSelector } from "../../../../../scripts/lib/storefront-selectors.generated.js";

// [PRE:DISPOSABLE_CUSTOMER:personal]: a personal customer created for this test and deleted after it (the
// disposableCustomer fixture), so no shared account is signed in, locked or left with cart state.
let victimAccount: DisposableCustomer | undefined;
const VICTIM_CART = "AGENT-TEST-MERGEAUTH-BR-VICTIM";
const ANON_TARGET_CART = "AGENT-TEST-MERGEAUTH-BR-ANONTARGET";
/** The row's known image/service-worker 404s, as the browser words them. */
const KNOWN_404 = /^Failed to load resource:|bad HTTP response code \(404\) was received when fetching the script/;

type GqlBody = { data?: Record<string, any> | null; errors?: Array<{ message?: string; extensions?: { code?: string } }> };
type GqlResult = { status: number; body: GqlBody };

/** POST {{FRONT_URL}}/graphql. `token` = signed-in call; none = anonymous (no Authorization header). */
async function gql(req: APIRequestContext, query: string, variables: Record<string, unknown>, token?: string): Promise<GqlResult> {
  const res = await req.post(`${env("FRONT_URL")}/graphql`, {
    data: { query, variables },
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  return { status: res.status(), body: (await res.json()) as GqlBody };
}

/** The storefront keeps its session token in localStorage "auth", not in a cookie (row Preconditions). */
async function sessionToken(page: Page): Promise<string> {
  const token = await page.evaluate(() => {
    const auth = JSON.parse(localStorage.getItem("auth") ?? "{}");
    return (auth.access_token ?? auth.accessToken ?? auth.token ?? "") as string;
  });
  if (!token) throw new Error("precondition: no session token in localStorage \"auth\"");
  return token;
}

const cartArgs = () => ({ storeId: env("STORE_ID"), currencyCode: env("CURRENCY_CODE"), cultureName: env("CULTURE_NAME") });

// Cleanup state, filled as the case runs so afterEach can undo whatever was created.
let victim: { cartId: string; userId: string } | undefined;
let anonUserId: string | undefined;

test.afterEach(async ({ apiAs, playwright }) => {
  // removeCart on the victim cart, as its owner, if the case did not get that far.
  if (victim && victimAccount) {
    const api = await apiAs(victimAccount);
    await api.post("/graphql", {
      data: { query: `mutation($c: InputRemoveCartType!) { removeCart(command: $c) }`, variables: { c: victim } },
    });
  }
  // A leftover anonymous target (only when the merge was NOT refused) is a guest cart: anyone may remove it.
  if (anonUserId) {
    const anon = await playwright.request.newContext();
    const found = await gql(anon, `query($s: String!, $u: String!, $cur: String!, $cul: String!, $n: String!) {
      cart(storeId: $s, userId: $u, currencyCode: $cur, cultureName: $cul, cartName: $n) { id } }`,
      { s: env("STORE_ID"), u: anonUserId, cur: env("CURRENCY_CODE"), cul: env("CULTURE_NAME"), n: ANON_TARGET_CART });
    const id = found.body.data?.cart?.id;
    if (id) await gql(anon, `mutation($c: InputRemoveCartType!) { removeCart(command: $c) }`, { c: { cartId: id, userId: anonUserId } });
    await anon.dispose();
  }
  victim = undefined;
  anonUserId = undefined;
  victimAccount = undefined;
});

test("CART-124: Cart Merge - A Guest Session Cannot Merge a Signed-In Customer's Cart (API, mergeCart Unauthorized)", async ({ page, playwright, signInHere, disposableCustomer }) => {
  const victimUser = (victimAccount = await disposableCustomer("personal"));
  const statuses: number[] = []; // [NETWORK] every /graphql status this case produced
  const call = async (...a: Parameters<typeof gql>) => {
    const r = await gql(...a);
    statuses.push(r.status);
    return r;
  };

  // [PRE:CLEAR_SESSION] (the page fixture is a fresh context) + sign in as the victim customer.
  await page.goto(env("FRONT_URL"));
  await signInHere(page, victimUser);
  const consoleErrors: string[] = [];
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
  page.on("response", (r) => { if (new URL(r.url()).pathname.endsWith("/graphql")) statuses.push(r.status()); });

  // [API] read the signed-in token from localStorage "auth" -> CUSTOMER_TOKEN
  const userToken = await sessionToken(page);

  // [API] signed-in me { id userName } -> VICTIM_USER_ID; discover one in-stock product -> PRODUCT_ID
  const me = await call(page.request, `{ me { id userName } }`, {}, userToken);
  const victimUserId = me.body.data?.me?.id as string;
  const sessionUserId = await page.evaluate(() => localStorage.getItem("user-id"));
  // [ASSERT] guard — a plain Error (BLOCKED): a call that ran anonymously is a setup defect, not the product.
  if (me.body.data?.me?.userName?.toLowerCase() !== victimUser.email.toLowerCase() || victimUserId !== sessionUserId) {
    throw new Error(`precondition: me is not the victim (userName=${me.body.data?.me?.userName}) — the call ran anonymously`);
  }
  const products = await call(page.request, `query($s: String!, $cur: String!, $cul: String!, $f: String!) {
    products(storeId: $s, currencyCode: $cur, cultureName: $cul, filter: $f, first: 1) { items { id } } }`,
    { s: env("STORE_ID"), cur: env("CURRENCY_CODE"), cul: env("CULTURE_NAME"), f: `category.subtree:${td("@td(VIRTUAL_CATALOG_B2B.id)")} availability:InStock` },
    userToken);
  const productId = products.body.data?.products?.items?.[0]?.id as string | undefined;
  if (!productId) throw new Error("precondition: no in-stock product in the B2B virtual catalog");

  // [API] signed-in addItem into the NAMED victim cart -> VICTIM_CART_ID
  const add = await call(page.request, `mutation($c: InputAddItemType!) { addItem(command: $c) { id itemsCount isAnonymous customerId customerName } }`,
    { c: { ...cartArgs(), cartName: VICTIM_CART, userId: victimUserId, productId, quantity: 1 } }, userToken);
  const victimCart = add.body.data?.addItem;
  if (victimCart?.id) victim = { cartId: victimCart.id, userId: victimUserId };
  // [ASSERT] guard — the victim must be a CUSTOMER cart; a guest cart is exempt from the guard by design (VCST-6818).
  if (!victimCart || victimCart.isAnonymous !== false || victimCart.customerId !== victimUserId || victimCart.customerName === "Anonymous") {
    throw new Error(`precondition: victim cart is not a customer cart (${JSON.stringify(victimCart)})`);
  }

  // [ACT] sign out through the storefront UI (the session is now anonymous)
  await page.locator(testIdSelector("account-button")).click();
  await page.locator(testIdSelector("sign-out-button")).click();
  await page.locator(testIdSelector("account-button")).waitFor({ state: "detached" });

  // [API] the anonymous session's own user id from localStorage "user-id" -> ANON_USER_ID
  // Sign-out clears "user-id" first and the storefront writes the new guest id a moment later.
  const guestId = page.waitForFunction((was) => {
    const id = localStorage.getItem("user-id");
    return id && id !== was ? id : null;
  }, victimUserId, { timeout: 30_000 }).then((h) => h.jsonValue() as Promise<string>).catch(() => undefined);
  anonUserId = await guestId;
  if (!anonUserId) throw new Error("precondition: no anonymous user-id after sign-out");

  // [API] anonymous POST (no Authorization header, credentials omitted): mergeCart with secondCartId = victim
  const anon = await playwright.request.newContext();
  const merge = await call(anon, `mutation($c: InputMergeCartType!) { mergeCart(command: $c) { id itemsCount } }`,
    { c: { ...cartArgs(), userId: anonUserId, cartName: ANON_TARGET_CART, secondCartId: victimCart.id, deleteAfterMerge: true } });
  // [API] same anonymous call: read the anonymous target cart
  const anonTarget = await call(anon, `query($s: String!, $u: String!, $cur: String!, $cul: String!, $n: String!) {
    cart(storeId: $s, userId: $u, currencyCode: $cur, cultureName: $cul, cartName: $n) { id itemsCount } }`,
    { s: env("STORE_ID"), u: anonUserId, cur: env("CURRENCY_CODE"), cul: env("CULTURE_NAME"), n: ANON_TARGET_CART });
  await anon.dispose();

  // Sign in as the victim again, in this page; the session token is new.
  await signInHere(page, victimUser);
  const page2 = page;
  const userToken2 = await sessionToken(page2);
  // [API] signed-in read of the victim cart by name
  const victimAfter = await call(page2.request, `query($s: String!, $u: String!, $cur: String!, $cul: String!, $n: String!) {
    cart(storeId: $s, userId: $u, currencyCode: $cur, cultureName: $cul, cartName: $n) { id itemsCount items { productId quantity } } }`,
    { s: env("STORE_ID"), u: victimUserId, cur: env("CURRENCY_CODE"), cul: env("CULTURE_NAME"), n: VICTIM_CART }, userToken2);
  // [API] signed-in removeCart on the victim cart
  const remove = await call(page2.request, `mutation($c: InputRemoveCartType!) { removeCart(command: $c) }`,
    { c: { cartId: victimCart.id, userId: victimUserId } }, userToken2);
  if (remove.body.data?.removeCart === true) victim = undefined;

  // [API] the anonymous mergeCart response is HTTP 200 with data.mergeCart = null and errors[0].extensions.code = Unauthorized
  expect(merge.status).toBe(200);
  expect(merge.body.data?.mergeCart ?? null).toBeNull();
  expect(merge.body.errors?.[0]?.extensions?.code).toBe("Unauthorized");

  // [STATE] the victim cart still exists: id = VICTIM_CART_ID, itemsCount = 1, the item is PRODUCT_ID with quantity 1
  const after = victimAfter.body.data?.cart;
  expect(after?.id).toBe(victimCart.id);
  expect(after?.itemsCount).toBe(1);
  expect(after?.items).toEqual([{ productId, quantity: 1 }]);

  // [API] the anonymous target cart does not exist (a refused merge creates nothing)
  expect(anonTarget.body.data?.cart ?? null).toBeNull();

  // [API] the addItem and removeCart setup mutations return errors[] empty
  expect(add.body.errors ?? []).toEqual([]);
  expect(remove.body.errors ?? []).toEqual([]);

  // [NETWORK] no 5xx on /graphql during the case
  expect(statuses.filter((s) => s >= 500)).toEqual([]);

  // [CONSOLE] no new JS errors beyond the storefront's known image/service-worker 404s: a failed resource
  // load ("Failed to load resource: …" — a 404, or a content image on an unresolvable host) and the service
  // worker's script 404. Page errors and every other console error stay counted.
  expect(consoleErrors.filter((e) => !KNOWN_404.test(e))).toEqual([]);

  // [EVIDENCE] errors[0].message carries no cart contents, owner id or stack trace
  const message = merge.body.errors?.[0]?.message ?? "";
  for (const leak of [victimUserId, victimCart.id, productId]) expect(message).not.toContain(leak);
  expect(message).not.toMatch(/\bat [\w.]+\(|Exception/);
});
