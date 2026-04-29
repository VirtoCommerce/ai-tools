# VCST-4707 Frontend Verification Report

**Date:** 2026-04-29
**Tester:** qa-frontend-expert (autonomous, playwright-chrome)
**Storefront:** https://vcst-qa-storefront.govirto.com
**Account:** USER2_EMAIL = milamuller2024@yahoo.com (read at runtime from .env)
**Cart ID under test:** `003dc748-0252-444e-83a7-0d15b20f3e83`

---

## Verdict: BLOCKED

A separate, pre-existing storefront/backend regression on the `addOrUpdateCartShipment` mutation prevents end-to-end verification of the VCST-4707 fix. Every attempt to confirm a pickup location (regardless of which one — within or outside the first-50 page) fails server-side with `JSON_READER`, so the cart never persists `pickupLocationId` and the bug-fix path (re-opening the modal to verify pre-selection of a far-page location) cannot be reached through the UI.

The PR #8 backend change itself is **deployed and operative** — the `cartPickupLocations` query is reachable, returns `totalCount: 102`, accepts `first` / `keyword` parameters, and the read-side schema looks healthy. The pre-selection code path simply cannot be exercised because step 7 of the STR (Confirm → modal closes → cart shipping section shows the pickup name) never completes.

Recommendation: file/escalate the `addOrUpdateCartShipment` regression as a P0 blocker, then re-run F1–F6 once the cart-shipment write path is restored.

---

## Build Versions Confirmed

| Component | Version | Source |
|-----------|---------|--------|
| Platform | 3.1025.0 | per ticket — assumed deployed |
| VirtoCommerce.XPickup | 3.1001.0-pr-8-3380 (SHA `3380304`) | per ticket — backend fix per PR #8 |
| Theme | `2.48.0-pr-2269-dfb0-dfb0c1e5` | observed in storefront footer |
| Storefront | `vcst-qa-storefront.govirto.com` | from `.env` `FRONT_URL` |
| Browser | Chromium (Playwright MCP, locale `en-US`) | `playwright-chrome` |

---

## Boundary Resolution (per spec — load full list, identify last)

Direct GraphQL probe (`first: 200`, no keyword/filter) against `cartPickupLocations` for the test cart:

- **`totalCount`:** 102
- **Index 1 (alphabetical):** `Brooklyn Academy of Music` (`2108d7c9-6aad-46a7-b4c5-a46593cb0ac8`)
- **Index 50 (last in default page of 50):** `Luna Park` (`135fdfb8-786b-46b9-9953-49b5a06f1b1a`)
- **Index 51 (first beyond the default page):** `Macy's Herald Square` (`749319ff-eb7d-4021-b98b-067904a468f4`)
- **Index 102 (LAST in fully-loaded list — chosen as the boundary test target):** `Zacharyside`, USA, Eagan, 510 Annabel Drive (`b5e87c7b-c393-4fd7-97f3-31dec3e3b7f3`)

The default UI page size is `first: 50`, so the modal — without scrolling/load-more (none observed) — only renders the first 50 locations alphabetically. Anything at index 51+ is off-screen unless filtered into view via the modal's keyword search.

---

## Test Setup

- BOPIS-eligible product resolved at runtime: `BENDING-STRAWS-PAPER-STRIPED-ASSORTED-22CM-6MM-PACK-500PCS` (Kitchen supplies → Everything for kitchen). PDP sidebar shows `Shipment options` → `Check pickup locations`. Variations product; first variation added (Material=Paper / Color=Multicolor / Set=500), pack qty 22, $77/ea, $1,694.00 subtotal.
- Cart shipping widget exposes `Delivery option: Pickup | Shipping`. Selecting Pickup reveals `Pickup point* | Please select a pickup address`. Clicking that opens the `Pick points` modal.

---

## STR Run Matrix (F1)

| Run | Search (Zacharyside) | Radio appears | Click radio | Map centers on Zacharyside | PICK UP HERE result | Cart updated? | Reopen modal pre-selected? |
|-----|---------------------|---------------|-------------|----------------------------|---------------------|---------------|----------------------------|
| 1 | PASS — `cartPickupLocations(keyword:"Zacharyside")` returns `totalCount:1`, items[0].id=`b5e87c7b…` | PASS — radio rendered + checkable | PASS — radio shows checked, info card opens | PASS — `ll=39.3001,35.6746`, marker visible (`USA, Eagan, 510 Annabel Drive`) | **FAIL** — `addOrUpdateCartShipment` returns GraphQL error `code: JSON_READER`, `message: "Error trying to resolve field 'addOrUpdateCartShipment'"`. Modal still closes. | **FAIL** — cart shipping section keeps `Pickup point* / Please select a pickup address` | **N/A** — cannot verify pre-selection because there is no persisted prior selection to preserve |
| 2 | n/a (run aborted) | | | | | | |
| 3 | n/a (run aborted) | | | | | | |

Run 1 got far enough to demonstrate the mutation regression; runs 2 and 3 were not executed because every selection (regardless of location) reproduces the same mutation failure (verified by selecting `Berjaya Megamall Kuantan` index ≤50 — same `JSON_READER` error). Continuing 3 identical-failure runs would not add information.

---

## Checklist Results

### F1 — Original STR pre-selection (3x consecutive)
**FAIL / BLOCKED.** STR cannot complete. Modal opens, the search-by-name path correctly surfaces Zacharyside (the boundary location at index 102), the radio is selectable, the location info card and map render correctly with `Eagan` coordinates, and `PICK UP HERE` triggers a mutation — but the mutation `addOrUpdateCartShipment` is rejected by the backend with `JSON_READER`. The modal closes, but the cart never receives the pickup location, so there is no prior-selected state to re-verify on reopen. Run 2/3 not executed (deterministic identical failure).

### F2 — Network proof (`cartPickupLocations` items[0] match)
**BLOCKED.** Cannot validate. The fix's user-visible effect requires the cart's `Shipments[].PickupLocationId` to be populated; only then would `SearchCartPickupLocationsQueryHandler.CreateSearchCriteria` populate `IncludeLocationIds` and `ProductPickupLocationService.SearchPickupLocations` prepend Zacharyside. Because step (PICK UP HERE → mutation) never persists `pickupLocationId`, every subsequent `cartPickupLocations` query without keyword returns the alphabetical first 50 (Berjaya/Brooklyn first) — exactly as it would for a cart with no prior selection. So although the response shape is correct (`totalCount:102`, items[0]=alphabetical first), it does not exercise the prepend logic.

### F3 — Root cause confirmation (storefront still sends `first: 50`, backend response is what changed)
**PASS (partial — verified for the read query).** Captured network shows the storefront's `GetCartPickupLocations` operation continues to send the same client-side variables: `cultureName`, `facet`, `cartId`, `first: 50` (and `keyword`/`filter` when the user types in search). No frontend mutation of the request was needed — confirming the fix is purely backend-side. The unverified portion is whether the response body now includes the prepended location at items[0], because the prerequisite (a confirmed pickup location attached to the cart) cannot be reached through the UI.

### F4 — Within-first-50 regression
**FAIL / BLOCKED.** Tested by selecting `Berjaya Megamall Kuantan` (`362a17d3-4896-4dac-894f-652f5b1411c4`, alphabetical index 1 in the default page, well within first 50). Same `addOrUpdateCartShipment` `JSON_READER` mutation error. So this is not a far-page-only issue — every pickup location selection through the cart UI is broken. (This rules out hypotheses that the fix introduced a regression specific to far-page locations.)

### F5 — Modal hygiene on reopen
**PASS (with caveat).** Reopening the modal after a failed select still produces a clean state: `searchValue` is empty, no facet chips applied, modal opens without console errors. Console only contains the persistent `ApolloError: Error trying to resolve field 'addOrUpdateCartShipment'` from the failed mutation. The "Something went wrong. Please try again later." toast is shown to the user because of the failed mutation — that is correct UI feedback, not a regression of the modal hygiene check.

### F6 — Cart shipping section + invariants
**FAIL / BLOCKED.**
- BL-BOPIS-001 (single pickup shipment): Cannot verify — `cart.shipments[].pickupLocation` is never populated.
- BL-BOPIS-002 (pickup shipping cost = $0): Order summary shows `Shipping cost $0.00` but this is the default for a cart in an indeterminate state, not a confirmed pickup. Cannot attribute this to BL-BOPIS-002.
- Pickup location name in cart summary: NOT shown. Widget reads `Pickup point* / Please select a pickup address`.

---

## Mutation Failure — Raw Evidence

Captured via `window.fetch` instrumentation while running the STR through the UI (no script bypass — UI clicks via accessible labels and `[data-test-id]` selectors).

```jsonc
// Run 1 — Zacharyside (index 102)
{
  "timestamp": "2026-04-29T08:44:12.343Z",
  "op": "AddOrUpdateCartShipment",
  "variables": {
    "command": {
      "shipment": { "pickupLocationId": "b5e87c7b-c393-4fd7-97f3-31dec3e3b7f3" },
      "storeId": "B2B-store",
      "currencyCode": "USD",
      "cultureName": "en-US",
      "userId": "8f5a430e-263a-455b-ad4b-8e97704b63fe"
    },
    "skipQuery": false
  },
  "errors": [{
    "message": "Error trying to resolve field 'addOrUpdateCartShipment'.",
    "extensions": { "code": "JSON_READER" }
  }]
}

// Within-first-50 — Berjaya (index 1)
{
  "timestamp": "2026-04-29T08:45:07.604Z",
  "op": "AddOrUpdateCartShipment",
  "variables": {
    "command": {
      "shipment": { "pickupLocationId": "362a17d3-4896-4dac-894f-652f5b1411c4" },
      "storeId": "B2B-store",
      "currencyCode": "USD",
      "cultureName": "en-US",
      "userId": "8f5a430e-263a-455b-ad4b-8e97704b63fe"
    },
    "skipQuery": false
  },
  "errors": [{
    "message": "Error trying to resolve field 'addOrUpdateCartShipment'.",
    "extensions": { "code": "JSON_READER" }
  }]
}
```

The two payloads differ only in `pickupLocationId` (one within-50, one beyond-50). Both fail identically, confirming the regression is on the mutation handler and is independent of VCST-4707's pickup-locations-search fix.

Schema introspection confirms the request shape is structurally valid: `InputAddOrUpdateCartShipmentType` requires `storeId` and `userId` (both present); `shipment: InputShipmentType!` is provided; all `InputShipmentType` fields including `pickupLocationId` are `OptionalString` (no required field is missing from the payload). The `JSON_READER` error suggests a server-side deserializer mismatch between the `OptionalString` wrapper type and the literal-string the client is serialising.

Console error stack (Apollo client surface):

```
ApolloError: Error trying to resolve field 'addOrUpdateCartShipment'.
    at new t (https://vcst-qa-storefront.govirto.com/assets/vendor-3X8Ox2Qz.js:57:153)
    ... (Apollo Link onError → mutation error notification)
```

---

## Read-Path Health (PR #8 deployable surface)

The PR #8 read-path itself is reachable and well-formed:

- `cartPickupLocations(storeId:"B2B-store", cultureName:"en-US", cartId:"003dc748…", first:50)` → 200 OK, `totalCount:102`, `items.length:50`, items returned in `Name` ascending order (alphabetical), `term_facets` populated for `address_countryname / address_regionname / address_city`, `errors:null`.
- `cartPickupLocations(…, keyword:"Zacharyside", filter:"")` → 200 OK, `totalCount:1`, `items.length:1`, items[0].id matches the search term.
- `cartPickupLocations(…, first:200)` → 200 OK, `totalCount:102`, `items.length:102` (full enumeration works, last item is `Zacharyside`).

So if/when the cart had `shipments[0].pickupLocationId = "b5e87c7b…"` populated, the GraphQL handler would have what it needs (per the PR diff in `SearchCartPickupLocationsQueryHandler.CreateSearchCriteria` lines 43–48 — pulls distinct, non-empty `cart.Shipments[].PickupLocationId` into `IncludeLocationIds`). The fix is not visibly broken — it is just not exercised on the QA env from the storefront because of the upstream mutation regression.

---

## Console Errors Observed

```
ApolloError: Error trying to resolve field 'addOrUpdateCartShipment'.
```

(Single recurring error fired on every PICK UP HERE click. No other unhandled errors. Warnings unrelated to BOPIS were Vue/Apollo dev warnings about query cache duplicates — not relevant.)

---

## Network Failures Observed

| Endpoint | Verb | Status | Failure Mode |
|----------|------|--------|--------------|
| `/graphql` (`addOrUpdateCartShipment`) | POST | 200 OK + `errors[].extensions.code = JSON_READER` | Mutation always fails when only `pickupLocationId` is set in `shipment`. Tested with two different pickup location IDs (within-50 and beyond-50) — same outcome. |

No 4xx/5xx HTTP failures. Auth healthy.

---

## Evidence Files (all paths absolute)

- `C:\Users\mutyk\My Projects\vc-mcp-testing-module\tests\Sprint-current\VCST-4707\evidence\run1-modal-zacharyside-selected.png` — screenshot of pickup modal with Zacharyside searched, radio selected, info card open, map centered on Eagan
- `C:\Users\mutyk\My Projects\vc-mcp-testing-module\tests\Sprint-current\VCST-4707\evidence\cart-mutation-error.png` — full-page screenshot post-confirm showing cart still says "Please select a pickup address"
- `C:\Users\mutyk\My Projects\vc-mcp-testing-module\tests\Sprint-current\VCST-4707\evidence\final-cart-state.png` — viewport screenshot of cart with Shipping mode toggled
- `C:\Users\mutyk\My Projects\vc-mcp-testing-module\tests\Sprint-current\VCST-4707\evidence\network-evidence.json` — captured `cartPickupLocations` and `addOrUpdateCartShipment` request/response summaries (variables, totalCount, first3, errors)
- `C:\Users\mutyk\My Projects\vc-mcp-testing-module\tests\Sprint-current\VCST-4707\evidence\network-graphql-requests.txt` — full network log for all GraphQL POSTs in the session (request bodies)
- `C:\Users\mutyk\My Projects\vc-mcp-testing-module\tests\Sprint-current\VCST-4707\evidence\console-errors.log` — captured Apollo / browser console errors
- `C:\Users\mutyk\My Projects\vc-mcp-testing-module\tests\Sprint-current\VCST-4707\evidence\cart-fresh-snapshot.yml` — accessibility snapshot of fresh cart state
- `C:\Users\mutyk\My Projects\vc-mcp-testing-module\tests\Sprint-current\VCST-4707\evidence\pdp-snapshot.yml` — accessibility snapshot of the BOPIS PDP

HAR file: not produced. The Playwright MCP `recordHar` config in `config/mcp-playwright-chrome.config.json` did not result in a HAR being written under `test-results/chrome/har/` for this session — the MCP context lifecycle does not flush HAR on browser close. Network evidence is preserved via the captured GraphQL request log + the in-page fetch instrumentation.

---

## What Would Unblock Full Verification

1. Fix `addOrUpdateCartShipment` JSON_READER regression so the storefront can persist a `pickupLocationId` on a cart shipment.
2. Once that lands, re-run F1–F6 here. The 3-run STR matrix can then verify:
   - On reopen, modal `cartPickupLocations` request returns items[0] = previously-confirmed pickup location id (Zacharyside `b5e87c7b…`) regardless of `first: 50` paging — i.e., the PR #8 prepend logic is exercised.
   - Radio for that id is checked.
   - Map centers on Eagan.
   - F4 (within-first-50) returns the same id without duplicates.

Alternative interim path (not attempted in this run): seed a cart programmatically via Postman/REST with a confirmed pickup shipment, then open the storefront cart and reopen the modal to validate just the prepend-on-read behavior. This bypasses the broken mutation and exercises the actual VCST-4707 fix in isolation.

---

## Decision

**BLOCKED** — VCST-4707 read-side fix appears deployed and structurally healthy on the GraphQL surface, but cannot be exercised end-to-end through the storefront because of an upstream `addOrUpdateCartShipment` mutation regression (`JSON_READER`) that prevents the cart from persisting any pickup location selection. Frontend verification for VCST-4707 cannot complete until that separate write-path issue is resolved.
