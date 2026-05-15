# VCST-4960 Fix Verification Report

| Field | Value |
|-------|-------|
| **Ticket** | VCST-4960 |
| **Priority / Type** | High / Bug |
| **Linked PR** | [VirtoCommerce/vc-module-x-cart#113](https://github.com/VirtoCommerce/vc-module-x-cart/pull/113) "VCST-4987: align configuration validation between add and update paths" |
| **Verified On** | 2026-05-14 |
| **Environment** | vcst-qa.govirto.com |
| **Backend Version Confirmed** | VirtoCommerce.XCart **3.1013.0** (fix ships in ≥ 3.1011.0) — Cart 3.1003.0, XCatalog 3.1005.0, all modules `Healthy` per `/health` |
| **Mode** | Runner-native GraphQL — `npx tsx scripts/graphql-runner.ts --case …` (no browser; canonical per `feedback_use_canonical_graphql_runner`) |
| **Test Suite (CSV)** | `tests/Sprint-current/VCST-4960/vcst-4960-verification.csv` (5 cases, 38 verdict-affecting assertions) |
| **Verdict** | **FIX_CONFIRMED — 3/3 STR pass + adjacent regression pass + happy-path pass (38/38 assertions PASS)** |

---

## 1. Verdict per checklist item

### Fix Confirmation (3 consecutive STR runs)

| # | Item | Result | Evidence |
|---|------|--------|----------|
| 1 | STR Run 1: `changeCartConfiguredItem(sectionId="00000000-...")` returns non-empty `validationErrors[]` | **PASS** | `graphql-evidence/VCST-4960-STR-1.json` — `validationErrors.length = 1`, `errorCode = "CONFIGURATION_SECTION_NOT_FOUND"`, `errorMessage = "Configuration section with ID 00000000-0000-0000-0000-000000000000 not found"` |
| 2 | STR Run 2: same as #1 | **PASS** | `graphql-evidence/VCST-4960-STR-2.json` — same error code/message |
| 3 | STR Run 3: same as #1 | **PASS** | `graphql-evidence/VCST-4960-STR-3.json` — same error code/message |

**STR aggregate: 3/3 = PASS (deterministic).**

### Regression / Adjacent (PR title: "align add and update paths")

| # | Item | Result | Evidence |
|---|------|--------|----------|
| 4 | `addItem(...configurationSections sectionId="00000000-...")` also returns non-empty `validationErrors[]` (validation symmetry) | **PASS** | `graphql-evidence/VCST-4960-ADD-REGRESSION.json` — `data.addItem.validationErrors.length = 1`, identical `CONFIGURATION_SECTION_NOT_FOUND` error code and message. Add path was already rejecting per ticket; this PASS confirms post-fix add↔change parity. |
| 5 | `changeCartConfiguredItem(VALID sectionId)` succeeds — no false positive | **PASS** | `graphql-evidence/VCST-4960-VALID-CHANGE.json` — `validationErrors = 0`, mutation completes, read-back shows `configurationItems[?sectionId=f8004e62-...].productId = 3cc2ab6e-d031-488a-acad-127ee88f1858` (alt option "Beige", swapped from initial "Black" `aa8116e5-...`) |
| 6 | On rejection, cart state preserved — same configItem.id and productId | **PASS** | All 3 STR runs verified via `configurationItems` read-back: `configurationItems.0.id` and `.productId` IDENTICAL to captured `ORIG_CONFIG_ITEM_ID` / `ORIG_CONFIG_PRODUCT_ID`. |

### Cross-Layer / Response Shape

| # | Item | Result | Evidence |
|---|------|--------|----------|
| 7 | `validationErrors[].errorCode` and `.errorMessage` populated (not null) | **PASS** | Both fields populated in all 4 rejection responses. `objectType = "ConfigurationItem"`. `objectId = null` is acceptable here because there is no existing object to reference when the section itself doesn't exist (not a contract violation — `ValidationErrorType` schema makes objectId nullable). |
| 8 | HTTP 200, not 4xx | **PASS** | All 4 rejection responses: HTTP **200 OK**; GraphQL transport-level `errors[]` is **empty**; rejection is data-level via `validationErrors[]` on the CartType return — matches the design contract (`feedback_graphql_full_field_selection`). |

### Business Rules

| # | Item | Result | Evidence |
|---|------|--------|----------|
| 9 | Cart contents unchanged when validation fails (BL-CART family) | **PASS** | STR-1/2/3 read-back via `configurationItems(lineItemId)` query confirms `configurationItems.0.id` and `.productId` match the originals captured before the failing mutation. No phantom regeneration. |
| 10 | PR-asserted invariant: sectionId rejection happens because it doesn't match the product's `configurationSections[].id` | **PASS** | Error code `CONFIGURATION_SECTION_NOT_FOUND` + message `"Configuration section with ID <fabricated GUID> not found"` are direct confirmation that the validator looked up the input sectionId against the product's configuration definition and failed to find a match. Pre-fix behaviour per ticket: `validationErrors: []` + regenerated configurationItems → silent acceptance. Post-fix: explicit lookup miss surfaced with structured error. |

**Checklist total: 10/10 PASS.**

---

## 2. STR runs — request/response snippets

All three STR runs use identical mutation shape (fabricated sectionId, valid option product). Snippets shown for STR-1 (others differ only by the dynamically captured `cartId` / `lineItemId` / `configItemId`).

### STR-1 — `change_bad` request

```graphql
mutation ChangeBad($configurationSections: [ConfigurationSectionInput]) {
  changeCartConfiguredItem(command: {
    storeId: "B2B-store"
    userId: "user-acme-store-maintainer-1"
    lineItemId: "8dcf9845-3ffe-4041-a588-2302b4f1122b"
    configurationSections: $configurationSections
  }) {
    id
    validationErrors { errorCode errorMessage objectId objectType }
    items { id productId quantity configurationItems { id sectionId productId } }
  }
}
```

**variables:**
```json
{"configurationSections":[{"sectionId":"00000000-0000-0000-0000-000000000000","type":"Product","option":{"productId":"aa8116e5-1448-447b-af51-89db83cb5c19","quantity":1}}]}
```

### STR-1 — `change_bad` response (truncated to the salient fields)

```json
{
  "http": 200,
  "errors": [],
  "data": {
    "changeCartConfiguredItem": {
      "validationErrors": [
        {
          "errorCode": "CONFIGURATION_SECTION_NOT_FOUND",
          "errorMessage": "Configuration section with ID 00000000-0000-0000-0000-000000000000 not found",
          "objectId": null,
          "objectType": "ConfigurationItem"
        }
      ],
      "items": [{
        "id": "8dcf9845-3ffe-4041-a588-2302b4f1122b",
        "configurationItems": [{
          "id": "2c8cb824-8e62-4b19-9690-af18b1aa568c",
          "sectionId": "f8004e62-f820-4a00-8adb-774ab27c6011",
          "productId": "aa8116e5-1448-447b-af51-89db83cb5c19"
        }]
      }]
    }
  }
}
```

### STR-2 / STR-3

Same error code, same message, structurally identical response. Captured lineItemIds across runs:

| Run | lineItemId | configItem.id (preserved post-rejection) |
|-----|-----------|--------------------------------------------|
| STR-1 | `8dcf9845-3ffe-4041-a588-2302b4f1122b` | `2c8cb824-8e62-4b19-9690-af18b1aa568c` |
| STR-2 | (new cart per run, fresh token) | `35ac039b-7303-4dde-b8aa-642da70f37b1` |
| STR-3 | (new cart per run, fresh token) | `0366c81c-265c-45e8-b19c-4859d6e9b466` |

All three: HTTP 200, `errors: []`, `validationErrors.length = 1`, `errorCode = CONFIGURATION_SECTION_NOT_FOUND`, configItem.id preserved.

---

## 3. Adjacent / regression evidence

### Item 4 — addItem path (ADD-REGRESSION case)

```graphql
mutation AddBad($configurationSections: [ConfigurationSectionInput]) {
  addItem(command: {
    storeId: "B2B-store" userId: "user-acme-store-maintainer-1"
    productId: "38dbe95c-3f46-48ff-bb9a-8bd96f475214" quantity: 1
    configurationSections: $configurationSections
  }) { id itemsCount validationErrors { errorCode errorMessage objectId objectType } items { id ... } }
}
```

**Response:** HTTP 200, `errors: []`, `data.addItem.validationErrors = [{ errorCode: "CONFIGURATION_SECTION_NOT_FOUND", errorMessage: "Configuration section with ID 00000000-... not found", objectId: null, objectType: "ConfigurationItem" }]` — identical error envelope to changeCartConfiguredItem. **Add ↔ Update parity confirmed.**

### Items 5/6 — changeCartConfiguredItem(VALID) (VALID-CHANGE case)

Added cart with `OPT_BASE_ID = aa8116e5-... (Black hat)`, then `change_valid` with `OPT_ALT_ID = 3cc2ab6e-d031-488a-acad-127ee88f1858 (Beige hat)`:

- `data.changeCartConfiguredItem.validationErrors = []` (length 0)
- Read-back: `configurationItems[?sectionId=f8004e62-f820-4a00-8adb-774ab27c6011].productId = 3cc2ab6e-...`
- Update applied; no false positive from the new validation.

---

## 4. Anomalies and notes

- **`objectId: null` in `validationErrors[0]`** — schema-permitted (the field is nullable on `ValidationErrorType`). Reasonable when the input section ID doesn't reference any existing object. `objectType` is correctly populated as `"ConfigurationItem"`. Not a defect; flagged here in case downstream consumers (storefront error toaster, admin retry logic) require objectId for routing — should be a follow-up product-design decision rather than a bug.
- **Storefront user resolution**: `[AUTH role=ORG_USER]` resolves to `ORG_USER_EMAIL = acme_store_maintainer_1@acme.com` whose Platform Identity id is the seeded string `user-acme-store-maintainer-1` (not a GUID). Token issued via `/connect/token` with `grant_type=password&scope=offline_access` per `feedback_graphql_introspection`.
- **CFG_HAT alias** resolved as expected to `38dbe95c-3f46-48ff-bb9a-8bd96f475214` (matches ticket STR product `Configurable Hat` / SKU CFG-001). First section `f8004e62-...` ("Select your fav color") with first option `aa8116e5-...` ("Black hat"), second option `3cc2ab6e-...` ("Beige hat"). All resolved live via `productConfiguration(...)` — no hardcoded GUIDs in CSV.
- **STR cart isolation**: each STR case runs `cleanup_pre` (clearCart) immediately after acquiring its USER_ID — guarantees no cart pollution from a prior run. Confirmed by distinct configItem.id values across STR-1/2/3.
- **HTTP latency**: change_bad mutation = ~430–630 ms; valid path change = ~1.4 s; both well within the 2-second p95 backend target (`performance-thresholds.md`).

---

## 5. Artifacts

| Artifact | Path |
|----------|------|
| Test cases (canonical CSV) | `tests/Sprint-current/VCST-4960/vcst-4960-verification.csv` |
| STR-1 evidence (full op responses, assertions, variables) | `tests/Sprint-current/VCST-4960/graphql-evidence/VCST-4960-STR-1.json` |
| STR-2 evidence | `tests/Sprint-current/VCST-4960/graphql-evidence/VCST-4960-STR-2.json` |
| STR-3 evidence | `tests/Sprint-current/VCST-4960/graphql-evidence/VCST-4960-STR-3.json` |
| Add-path regression evidence (Item 4) | `tests/Sprint-current/VCST-4960/graphql-evidence/VCST-4960-ADD-REGRESSION.json` |
| Valid-path no-false-positive evidence (Items 5+6) | `tests/Sprint-current/VCST-4960/graphql-evidence/VCST-4960-VALID-CHANGE.json` |

---

## 6. Recommendation

- **Transition VCST-4960 to Done** (Ready for test → Testing → Done).
- The fix is deployed (XCart 3.1013.0), deterministic (3/3 STR), symmetric (add and update both reject identically), and non-regressive (valid sectionId still updates the configuration).
- No follow-up bug needed. Optional product polish: consider populating `objectId` with the lineItemId or sectionId on `CONFIGURATION_SECTION_NOT_FOUND` errors so storefront UIs can correlate; this is a UX nicety, not a defect.
