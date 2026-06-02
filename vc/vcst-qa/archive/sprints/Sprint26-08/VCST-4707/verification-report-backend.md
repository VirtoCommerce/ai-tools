# VCST-4707 — Backend GraphQL Fix Verification

**Date:** 2026-04-29
**Environment:** QA — `BACK_URL=https://vcst-qa.govirto.com`, `FRONT_URL=https://vcst-qa-storefront.govirto.com`
**Storefront SPA Ver.:** `2.48.0-pr-2269-dfb0-dfb0c1e5`
**Build versions echoed (from prompt, not introspectable as storefront user):**
- Platform: 3.1025.0
- VirtoCommerce.XPickup: 3.1001.0-pr-8-3380 (PR #8 head SHA `3380304`)

**Auth method:** OAuth2 password grant (`/connect/token`) for storefront user `USER2` (`milamuller2024@yahoo.com`) — read at runtime from `.env`. All GraphQL calls were Bearer-authenticated against `${BACK_URL}/graphql`.

**Browser:** `playwright-edge` (locale `en-US`).

---

## Final Verdict: **VERIFIED — VCST-4707 / BL-BOPIS-008 fix is correctly deployed**

The `IncludeLocationIds` prepend semantics described in PR vc-module-x-pickup#8 are observable in xAPI: confirmed cart pickup location appears at `cartPickupLocations.items[0]` regardless of paging or keyword filter, and does NOT leak into the non-cart `pickupLocations` query.

| Block | Verdict |
|-------|---------|
| **B1** — Confirmed location at items[0] with `first:1` | **PASS** |
| **B2** — No-match keyword still returns confirmed location | **PASS** |
| **B3** — Non-cart `pickupLocations` query unaffected (no leak) | **PASS** |
| **B4** — No errors, pageInfo + totalCount intact across paging | **PASS** |

---

## Test Setup

**User & cart:**
- `userId = 8f5a430e-263a-455b-ad4b-8e97704b63fe` (Mila Müller, USER2)
- `cartId = 003dc748-0252-444e-83a7-0d15b20f3e83` (default cart, currency USD, culture en-US)
- Item present: `b3f5bd0c-45e4-46dc-8f2d-ad089718fc32` (Canvas Pencil Case — `BUYABLE_NO_MIN_QTY` from `aliases.json`).

**Pickup-location universe (B2B-store):**
- `totalCount = 102` — confirmed via `cartPickupLocations(first: 200)`.
- Default sort: ASCII alphabetical by `name`.
- `LAST_LOCATION_ID = b5e87c7b-c393-4fd7-97f3-31dec3e3b7f3` (`Zacharyside`) — natural index **101 of 102** (well past the `first:50` boundary; the original VCST-4707 reproduces specifically with locations at index ≥ 50).

**Setting the confirmed shipment** (BL-BOPIS-002 — pickup price MUST be $0):

```graphql
mutation AOUS($command: InputAddOrUpdateCartShipmentType!) {
  addOrUpdateCartShipment(command: $command) {
    id
    shipments { id pickupLocation { id name } shipmentMethodCode shipmentMethodOption }
  }
}
```

```jsonc
"command": {
  "storeId": "B2B-store",
  "userId": "8f5a430e-263a-455b-ad4b-8e97704b63fe",
  "cultureName": "en-US",
  "currencyCode": "USD",
  "shipment": {
    "pickupLocationId": "b5e87c7b-c393-4fd7-97f3-31dec3e3b7f3",
    "shipmentMethodCode": "BuyOnlinePickupInStore",
    "shipmentMethodOption": "Pickup",
    "price": 0,
    "currency": "USD"
  }
}
```

Response (success): `addOrUpdateCartShipment.shipments[0].pickupLocation = { id: "b5e87c7b-c393-4fd7-97f3-31dec3e3b7f3", name: "Zacharyside" }`, `shipmentMethodCode = "BuyOnlinePickupInStore"`, `errors[]` empty.

> Note: an earlier attempt with `shipmentMethodCode: "BopisPickup"` failed with `JSON_READER` because that code does not exist in this store; the canonical method code is `BuyOnlinePickupInStore` (resolved at runtime via `cart.availableShippingMethods`). This is a test-runner concern only and does not affect the backend fix.

---

## B1 — Confirmed location at `items[0]` with `first: 1`

```graphql
cartPickupLocations(cartId: $cartId, storeId: "B2B-store", cultureName: "en-US", first: 1) {
  totalCount, pageInfo { hasNextPage hasPreviousPage startCursor endCursor },
  items { id name }
}
```

```jsonc
"cartPickupLocations": {
  "totalCount": 102,
  "pageInfo": { "hasNextPage": true, "hasPreviousPage": false, "startCursor": "0", "endCursor": "1" },
  "items": [
    { "id": "b5e87c7b-c393-4fd7-97f3-31dec3e3b7f3", "name": "Zacharyside" },          // ← prepended (confirmed)
    { "id": "2108d7c9-6aad-46a7-b4c5-a46593cb0ac8", "name": "Brooklyn Academy of Music" }  // ← natural sort head
  ]
}
```

`errors`: absent. items.length = 2 (1 prepended confirmed + `first:1` natural). `items[0].id === LAST_LOCATION_ID`. **PASS.**

---

## B2 — Keyword that matches zero other locations

```graphql
cartPickupLocations(cartId: $cartId, storeId: "B2B-store", cultureName: "en-US", first: 50, keyword: "xyzzy-no-match-zzzzzzz") {
  totalCount, pageInfo { ... },
  items { id name }
}
```

```jsonc
"cartPickupLocations": {
  "totalCount": 0,
  "pageInfo": { "hasNextPage": false, "hasPreviousPage": false, "startCursor": "0", "endCursor": "0" },
  "items": [
    { "id": "b5e87c7b-c393-4fd7-97f3-31dec3e3b7f3", "name": "Zacharyside" }   // ← prepended despite filter
  ]
}
```

`errors`: absent. The keyword filter excludes every location naturally (totalCount = 0), but the confirmed location is still surfaced via `IncludeLocationIds` so the BOPIS modal can keep its pre-selection state. **PASS.**

---

## B3 — Non-cart `pickupLocations` query unaffected

```graphql
pickupLocations(storeId: "B2B-store", first: 50) {
  totalCount, pageInfo { ... },
  items { id name }
}
```

```jsonc
"pickupLocations": {
  "totalCount": 102,
  "pageInfo": { "hasNextPage": true, "hasPreviousPage": false, "startCursor": "0", "endCursor": "50" },
  "items": [
    { "id": "8734a4cf-7cd8-4a1f-a417-12e0d23dec6a", "name": "West Karlieville" },   // ← natural-order head
    { "id": "b692585c-ee38-4a37-90b0-c4065a0b4916", "name": "East Garrett" },
    { "id": "b5e87c7b-c393-4fd7-97f3-31dec3e3b7f3", "name": "Zacharyside" },        // ← at natural position (NOT prepended)
    { "id": "0e344bce-079b-4772-92d9-53af820e71cd", "name": "East Palma" },
    { "id": "69b6e14f-0997-4054-bb51-6dffc10c2b9a", "name": "West Jeffery" }
    /* … 45 more in natural sort order … */
  ]
}
```

`errors`: absent. `Zacharyside` appears at index **2** (the store's natural ordering for this query, which differs from `cartPickupLocations`' alphabetical sort) — **not** at index 0. The IncludeLocationIds prepend semantic is correctly scoped to `cartPickupLocations` only. **PASS.**

---

## B4 — No errors, pageInfo + totalCount intact when paging triggered

```graphql
cartPickupLocations(cartId: $cartId, storeId: "B2B-store", cultureName: "en-US", first: 50) {
  totalCount, pageInfo { ... },
  items { id name }
}
```

```jsonc
"cartPickupLocations": {
  "totalCount": 102,
  "pageInfo": { "hasNextPage": true, "hasPreviousPage": false, "startCursor": "0", "endCursor": "50" },
  "items": [
    { "id": "b5e87c7b-c393-4fd7-97f3-31dec3e3b7f3", "name": "Zacharyside" },          // ← prepended (confirmed)
    { "id": "2108d7c9-6aad-46a7-b4c5-a46593cb0ac8", "name": "Brooklyn Academy of Music" },
    { "id": "38e58798-6c60-4413-b405-abf4b38de806", "name": "Staten Island Children's Museum" }
    /* … 47 more, items.length = 50 total … */
  ]
}
```

`errors`: absent across **all four** queries (B1, B2, B3, B4). `pageInfo` shape correct (`hasNextPage`, `hasPreviousPage`, `startCursor`, `endCursor` present). `totalCount = 102 > first(50)` → paging triggered. **PASS.**

---

## Cross-Layer Anchors

- **API (backend GraphQL `/graphql`)**: All four blocks PASS — fix verified at the contract.
- **Admin (out of scope)**: not applicable (xpickup module read-model is GraphQL-only on storefront).
- **Storefront integration (BFF)**: the storefront SPA's own `AddOrUpdateCartShipment` mutation currently fails when called from the SPA cart with the SPA's minimal command shape (`{ shipment: { pickupLocationId } }`) — server returns `JSON_READER` because no `shipmentMethodCode` is supplied. This is **independent of the VCST-4707 fix** (the fix is read-side; this is a write-side wiring concern in the storefront `AddOrUpdateCartShipment` payload). Worth a separate ticket if not already tracked, but does **not** block this verification — the backend xAPI for the read query is the surface VCST-4707 patches, and that surface is correct.

---

## Notes / Caveats

1. **Schema field corrections vs. the runner-native CSV (`050k-graphql-xpickup.csv` GQL-094)**: the canonical `addOrUpdateCartShipment` command needs `shipmentMethodCode: "BuyOnlinePickupInStore"` and `shipmentMethodOption: "Pickup"` (resolved from `cart.availableShippingMethods`), not `BopisPickup`. The reference suite step `set_shipment_pickup` in `050k` should be updated; the prior REG-2026-04-29-1015 run failed exactly here with `VALIDATION` because the shipment command was missing both fields. Recommend a follow-up edit to `regression/suites/Backend/graphql/050k-graphql-xpickup.csv`.
2. The `cart` and `cartPickupLocations` GraphQL fields use `pickupLocation { id }` (not `pickupLocationId`) — the latter is the input-only field on `InputShipmentType`. Aligns with the schema introspection.
3. `pickupLocations` query does **not** accept `cultureName` (only `cartPickupLocations` does). Useful baseline to assert the prepend semantic is scoped to cart-bound query.
4. The `BUYABLE_NO_MIN_QTY` alias still resolves cleanly: `addItem(qty:1)` returned `validationErrors=[]` and put a single line item into the cart for this verification.

