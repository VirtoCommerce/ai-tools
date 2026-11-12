// CART-125 — the executable twin of row CART-125 in ../030-cart-merge.csv. The CSV row is the truth for
// WHAT is checked (Preconditions, Steps, Assertions, Cross_Layer_Checks); this file is HOW. A failure
// here is fixed in this file or reported as a product finding — never by editing the row's expectation.
import { randomUUID } from "node:crypto";
import type { APIRequestContext, Page } from "@playwright/test";
import { test, expect, type DisposableCustomer } from "../../../../lib/fixtures.js";
import { env, td } from "../../../../lib/data.js";

// The row signs in as USER2 (a personal customer); the spec runs on a disposable personal customer
// created for this test and deleted after it, so no other run can lock the account or touch its carts.
let account: DisposableCustomer | undefined;
const GUEST_CART = "AGENT-TEST-MERGEAUTH-BR-GUEST";
const TARGET_CART = "AGENT-TEST-MERGEAUTH-BR-TARGET";
/** The row's known storefront 404s, as the browser words them. */
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
const CART_BY_NAME = `query($s: String!, $u: String!, $cur: String!, $cul: String!, $n: String!) {
  cart(storeId: $s, userId: $u, currencyCode: $cur, cultureName: $cul, cartName: $n) { id } }`;
const CART_BY_ID = `query($s: String!, $u: String!, $cur: String!, $cul: String!, $id: String!) {
  cart(storeId: $s, userId: $u, currencyCode: $cur, cultureName: $cul, cartId: $id) { id } }`;
const REMOVE = `mutation($c: InputRemoveCartType!) { removeCart(command: $c) }`;

// Cleanup state, filled as the case runs so afterEach can undo whatever was created.
let target: { cartId: string; userId: string } | undefined;
let guest: { cartId: string; userId: string } | undefined;

test.afterEach(async ({ apiAs, playwright }) => {
  if (target && account) {
    const api = await apiAs(account);
    await api.post("/graphql", { data: { query: REMOVE, variables: { c: target } } });
  }
  // A guest cart the merge did not consume is a guest cart: anyone may remove it.
  if (guest) {
    const anon = await playwright.request.newContext();
    await gql(anon, REMOVE, { c: guest });
    await anon.dispose();
  }
  target = undefined;
  guest = undefined;
  account = undefined;
});

test("CART-125: Cart Merge - A Signed-In Customer Can Still Merge a Guest Cart Explicitly by secondCartId (isAnonymous exemption)", async ({ page, playwright, signInHere, disposableCustomer }) => {
  const user = (account = await disposableCustomer("personal"));
  const statuses: number[] = []; // [NETWORK] every /graphql status this case produced
  const call = async (...a: Parameters<typeof gql>) => {
    const r = await gql(...a);
    statuses.push(r.status);
    return r;
  };

  // [PRE:CLEAR_SESSION] + [NAV] as a guest: anonymous calls use a fresh request context (no Authorization, no cookies).
  const anon = await playwright.request.newContext();

  // [API] anonymous: discover two different in-stock products; a fresh random guest id (never the session's own)
  const products = await call(anon, `query($s: String!, $cur: String!, $cul: String!, $f: String!) {
    products(storeId: $s, currencyCode: $cur, cultureName: $cul, filter: $f, first: 2) { items { id } } }`,
    { s: env("STORE_ID"), cur: env("CURRENCY_CODE"), cul: env("CULTURE_NAME"), f: `category.subtree:${td("@td(VIRTUAL_CATALOG_B2B.id)")} availability:InStock` });
  const [productId, product2Id] = (products.body.data?.products?.items ?? []).map((i: { id: string }) => i.id);
  if (!productId || !product2Id || productId === product2Id) throw new Error("precondition: two different in-stock products not found");
  const guestUserId = randomUUID();

  // [API] anonymous addItem into the NAMED guest cart -> GUEST_CART_ID; it reads back with isAnonymous = true
  const addGuest = await call(anon, `mutation($c: InputAddItemType!) { addItem(command: $c) { id isAnonymous } }`,
    { c: { ...cartArgs(), cartName: GUEST_CART, userId: guestUserId, productId, quantity: 1 } });
  const guestCart = addGuest.body.data?.addItem;
  if (guestCart?.id) guest = { cartId: guestCart.id, userId: guestUserId };
  if (!guestCart || guestCart.isAnonymous !== true) {
    throw new Error(`precondition: the guest cart is not a guest cart (${JSON.stringify(guestCart)})`);
  }

  // Sign in as the customer — in a fresh page context (the guest cart above lives only on the server).
  await page.goto(env("FRONT_URL"));
  await signInHere(page, user);
  const consoleErrors: string[] = [];
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
  page.on("response", (r) => { if (new URL(r.url()).pathname.endsWith("/graphql")) statuses.push(r.status()); });

  // [API] read the signed-in token from localStorage "auth" -> USER2_TOKEN
  const userToken = await sessionToken(page);

  // [API] signed-in me { id userName } -> USER2_ID
  const me = await call(page.request, `{ me { id userName } }`, {}, userToken);
  const userId = me.body.data?.me?.id as string;
  const sessionUserId = await page.evaluate(() => localStorage.getItem("user-id"));
  // [ASSERT] guard — a plain Error (BLOCKED): a call that ran anonymously is a setup defect, not the product.
  if (me.body.data?.me?.userName?.toLowerCase() !== user.email.toLowerCase() || userId !== sessionUserId) {
    throw new Error(`precondition: me is not the customer (userName=${me.body.data?.me?.userName}) — the call ran anonymously`);
  }

  // [API] signed-in addItem into the NAMED target cart with PRODUCT_2_ID -> TARGET_CART_ID
  const addTarget = await call(page.request, `mutation($c: InputAddItemType!) { addItem(command: $c) { id isAnonymous customerId } }`,
    { c: { ...cartArgs(), cartName: TARGET_CART, userId, productId: product2Id, quantity: 1 } }, userToken);
  const targetCart = addTarget.body.data?.addItem;
  if (targetCart?.id) target = { cartId: targetCart.id, userId };
  // [ASSERT] guard — the target must be a CUSTOMER cart, or the merge is a guest-to-guest merge (vacuous PASS).
  if (!targetCart || targetCart.isAnonymous !== false || targetCart.customerId !== userId) {
    throw new Error(`precondition: the target is not a customer cart (${JSON.stringify(targetCart)})`);
  }

  // [API] signed-in mergeCart with secondCartId = the guest cart
  const merge = await call(page.request, `mutation($c: InputMergeCartType!) { mergeCart(command: $c) { id itemsCount items { productId quantity } } }`,
    { c: { ...cartArgs(), userId, cartName: TARGET_CART, secondCartId: guestCart.id, deleteAfterMerge: true } }, userToken);

  // [API] anonymous reads of the guest cart, by id and by name, under the guest id
  const guestById = await call(anon, CART_BY_ID, { s: env("STORE_ID"), u: guestUserId, cur: env("CURRENCY_CODE"), cul: env("CULTURE_NAME"), id: guestCart.id });
  const guestByName = await call(anon, CART_BY_NAME, { s: env("STORE_ID"), u: guestUserId, cur: env("CURRENCY_CODE"), cul: env("CULTURE_NAME"), n: GUEST_CART });
  await anon.dispose();
  if (!guestById.body.data?.cart && !guestByName.body.data?.cart) guest = undefined;

  // [API] signed-in removeCart on the target
  const remove = await call(page.request, REMOVE, { c: { cartId: targetCart.id, userId } }, userToken);
  if (remove.body.data?.removeCart === true) target = undefined;

  // [API] mergeCart returns no errors[]
  expect(merge.body.errors ?? []).toEqual([]);

  // [STATE] the merged target carries both products: PRODUCT_ID from the guest cart and PRODUCT_2_ID from its own line
  const mergedProducts = (merge.body.data?.mergeCart?.items ?? []).map((i: { productId: string }) => i.productId);
  expect(mergedProducts).toEqual(expect.arrayContaining([productId, product2Id]));

  // [STATE] the guest cart no longer resolves after the merge, by id or by name (deleteAfterMerge true)
  expect(guestById.body.data?.cart ?? null).toBeNull();
  expect(guestByName.body.data?.cart ?? null).toBeNull();

  // [API] the addItem and removeCart setup mutations return errors[] empty
  expect(addGuest.body.errors ?? []).toEqual([]);
  expect(addTarget.body.errors ?? []).toEqual([]);
  expect(remove.body.errors ?? []).toEqual([]);

  // [NETWORK] no 5xx on /graphql during the case
  expect(statuses.filter((s) => s >= 500)).toEqual([]);

  // [CONSOLE] no new JS errors beyond known storefront 404s: a failed resource load ("Failed to load
  // resource: …" — a 404, or a content image on an unresolvable host) and the service worker's script 404.
  expect(consoleErrors.filter((e) => !KNOWN_404.test(e))).toEqual([]);
});
