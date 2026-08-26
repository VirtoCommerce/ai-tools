# BL Proposals — 2026-08-26

Two proposed **new** invariants surfaced while investigating
`reports/bugs/open/BUG-multi-cart-users-cannot-set-checkout-shipping-address-VCST-5811.md`. Both clear the **source** and
**live** axes but have **no docs axis**, so neither meets the 3-source bar for auto-apply. The oracle was **not**
edited. Ids `BL-CART-016`/`BL-CART-018` are already reserved by earlier proposals, so these take the next free
numbers — **never renumber a surviving or reserved entry**.

---

## 1. `BL-CART-019` (new) — MISSING, 2 of 3 axes

**Proposed rule:** one `(userId, storeId, currencyCode, cultureName)` tuple resolves to exactly **one** cart. Reads
(`Query.cart`) and writes (every cart mutation) must resolve the *same* cart for the same identity tuple.

- **Source: CONFIRMED.** The two sides are asymmetric by declaration. `GetCartQuery.cs:16` declares
  `public string CartName { get; set; }` with **no default**, and `GetCartQuery<T>()`
  (`ResolveFieldContextExtensions.cs`) reads it straight from the argument — absent ⇒ `null`.
  `CartCommandBase.cs:9` declares `public string CartName { get; set; } = "default";`. Both land in
  `ShoppingCartSearchCriteria.Name` (`GetCartQueryHandler.cs:52`, `CartAggregateRepository.GetCartAsync`) and are
  resolved by `SearchAllAsync(criteria).FirstOrDefault(...)`. So the query is name-**unfiltered** over an unordered
  result set while every mutation pins `"default"`. Note the command side hardcodes the literal rather than using the
  platform's own `ModuleConstants.DefaultCartName`.
- **Live: CONFIRMED.** Deterministic `PASS → FAIL → PASS` toggle on `vcst-qa` driven only by cart count: with one
  cart both paths return `f5896eb9…`; after adding a second, the nameless query returns `1b4281c3…` while the
  mutation writes to `f5896eb9…`. `addOrUpdateCartShipment` returned **HTTP 200, `errors: []`**, echoed the address,
  and the rendered cart stayed at `shipments.length = 0`.
- **Docs: NOT FOUND.** No VirtoOZ page states a one-cart-per-tuple guarantee. This is the axis that blocks auto-apply.

**Violation signal:** `Query.cart` and a cart mutation return different `id`s for identical `{storeId, userId,
currencyCode, cultureName}`; shipping address never binds; Place order stays disabled with no error.

**Scope note (why this is not only a theoretical contract clause):** the precondition is reachable in ordinary use,
because duplicate `default` carts are still being minted on current code — `agent-test-sr-primary` gained two in
B2B-store/EUR on 2026-08-19 and 2026-08-25, `createdBy` the user itself. A cart competes only when `type` is
genuinely `null`; `CartType` is a closed `Wishlist`/`SavedForLater` set, and a `type: ""` cart is silently excluded
because the platform tests `x.Type == null`.

**Decision needed:** accept on source+live (recommended — the source evidence is a two-line declaration diff, not an
inference), or hold for a docs citation. Deterministic guard now shipping:
`npm run carts:check` (`scripts/seed-data/carts/cart-hygiene-specs.mjs`).

## 2. `BL-CART-020` (new) — MISSING, 2 of 3 axes

**Proposed rule:** `addOrUpdateCartShipment` with no `shipment.id` **updates** the cart's existing shipment; it does
not append a second one.

- **Source: PARTIAL.** Not read to a line; inferred from observed behaviour plus the prior fix's own verification
  note claiming the path "is now an upsert".
- **Live: CONFIRMED.** Two identical id-less writes plus the storefront's own per-page-load
  `AddOrUpdateCartShipment(shipment: {})` bootstrap drove one cart **1 → 2 → 3** shipments. Affected accounts carried
  5 and 6 accreted blank shipments.
- **Docs: NOT FOUND.**

**Violation signal:** `shipments[]` length grows by one per id-less call; blank shipments accumulate on every cart
page load.

**Decision needed:** confirm the intended upsert semantics against the handler before adding, since "AddOrUpdate"
currently means "Add" whenever the id is omitted. Lower priority than #1 — it degrades data, it does not block
checkout.
