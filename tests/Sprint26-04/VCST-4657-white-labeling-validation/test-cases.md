# Test Cases — VCST-4657: Add Validation to White Labeling

**Ticket:** [VCST-4657](https://virtocommerce.atlassian.net/browse/VCST-4657)
**Sprint:** Sprint 26-04 | **Date:** 2026-03-04

---

## Group A — POST /api/whitelabeling: StoreId / OrganizationId Mutual Exclusivity

### WLV-001: POST with both StoreId and OrganizationId set (invalid)

**Priority:** High | **Type:** Negative | **Agent:** qa-backend-expert

**Preconditions:** Admin authenticated. Valid StoreId and OrganizationId exist.

**Steps:**
1. Send POST `/api/whitelabeling` with body: `{ "storeId": "<valid_store_id>", "organizationId": "<valid_org_id>", "logoUrl": "https://example.com/logo.png" }`
2. Inspect response status code
3. Inspect response body structure

**Expected Result:**
- Status: 400 Bad Request
- Body contains validation error array: `[ { "errorCode": "...", "errorMessage": "..." } ]` (FluentValidation format)
- Error references the mutual exclusivity rule

---

### WLV-002: POST with neither StoreId nor OrganizationId set (invalid)

**Priority:** High | **Type:** Negative | **Agent:** qa-backend-expert

**Preconditions:** Admin authenticated.

**Steps:**
1. Send POST `/api/whitelabeling` with body: `{ "logoUrl": "https://example.com/logo.png" }` (no storeId, no organizationId)
2. Inspect response status code
3. Inspect response body structure

**Expected Result:**
- Status: 400 Bad Request
- Body contains validation error indicating that at least one of StoreId/OrganizationId is required

---

### WLV-003: POST with only StoreId set (valid — happy path)

**Priority:** Critical | **Type:** Positive | **Agent:** qa-backend-expert

**Preconditions:** Admin authenticated. Target store has no existing WL settings.

**Steps:**
1. Send POST `/api/whitelabeling` with body: `{ "storeId": "<store_without_wl>", "logoUrl": "https://example.com/logo.png" }`
2. Inspect response status code
3. Verify record created by calling GET

**Expected Result:**
- Status: 201 Created
- Record persisted and retrievable
- No validation error

---

### WLV-004: POST with only OrganizationId set (valid — happy path)

**Priority:** Critical | **Type:** Positive | **Agent:** qa-backend-expert

**Preconditions:** Admin authenticated. Target organization has no existing WL settings.

**Steps:**
1. Send POST `/api/whitelabeling` with body: `{ "organizationId": "<org_without_wl>", "logoUrl": "https://example.com/logo.png" }`
2. Inspect response status code
3. Verify record created by calling GET

**Expected Result:**
- Status: 201 Created
- Record persisted and retrievable
- No validation error

---

## Group B — POST /api/whitelabeling: Duplicate Detection

### WLV-005: POST duplicate WL setting for same StoreId

**Priority:** High | **Type:** Negative | **Agent:** qa-backend-expert

**Preconditions:** A WL setting already exists for the target StoreId.

**Steps:**
1. Send POST `/api/whitelabeling` with body referencing the same StoreId: `{ "storeId": "<store_with_existing_wl>" }`
2. Inspect response status code
3. Inspect response body

**Expected Result:**
- Status: 400 Bad Request
- Error message indicates duplicate setting for this store

---

### WLV-006: POST duplicate WL setting for same OrganizationId

**Priority:** High | **Type:** Negative | **Agent:** qa-backend-expert

**Preconditions:** A WL setting already exists for the target OrganizationId.

**Steps:**
1. Send POST `/api/whitelabeling` with body referencing the same OrganizationId: `{ "organizationId": "<org_with_existing_wl>" }`
2. Inspect response status code
3. Inspect response body

**Expected Result:**
- Status: 400 Bad Request
- Error message indicates duplicate setting for this organization

---

## Group C — PUT /api/whitelabeling/{id}: Immutability of StoreId / OrganizationId

### WLV-007: PUT attempting to change StoreId (invalid)

**Priority:** High | **Type:** Negative | **Agent:** qa-backend-expert

**Preconditions:** Existing WL setting with StoreId="StoreA". A different StoreId="StoreB" exists.

**Steps:**
1. Retrieve the existing WL setting ID
2. Send PUT `/api/whitelabeling/{id}` with body: `{ "id": "<id>", "storeId": "StoreB", "logoUrl": "https://example.com/new-logo.png" }`
3. Inspect response status code

**Expected Result:**
- Status: 400 Bad Request
- Error message indicates StoreId cannot be changed after creation

---

### WLV-008: PUT attempting to change OrganizationId (invalid)

**Priority:** High | **Type:** Negative | **Agent:** qa-backend-expert

**Preconditions:** Existing WL setting with OrganizationId="OrgA". A different OrganizationId="OrgB" exists.

**Steps:**
1. Retrieve the existing WL setting ID
2. Send PUT `/api/whitelabeling/{id}` with body: `{ "id": "<id>", "organizationId": "OrgB", "logoUrl": "https://example.com/new-logo.png" }`
3. Inspect response status code

**Expected Result:**
- Status: 400 Bad Request
- Error message indicates OrganizationId cannot be changed after creation

---

### WLV-009: PUT with unchanged StoreId (valid update)

**Priority:** Critical | **Type:** Positive | **Agent:** qa-backend-expert

**Preconditions:** Existing WL setting with StoreId and a logoUrl.

**Steps:**
1. Retrieve the existing WL setting
2. Send PUT `/api/whitelabeling/{id}` with the same StoreId but a new logoUrl value
3. Inspect response status code
4. Retrieve updated record and verify logoUrl changed

**Expected Result:**
- Status: 200 OK
- logoUrl updated in persisted record
- StoreId unchanged

**Note:** This tests that the immutability check does not falsely reject updates where the StoreId value is the same as the original. This is the most critical regression scenario.

---

### WLV-010: PUT with unchanged OrganizationId (valid update)

**Priority:** Critical | **Type:** Positive | **Agent:** qa-backend-expert

**Preconditions:** Existing WL setting with OrganizationId and a logoUrl.

**Steps:**
1. Retrieve the existing WL setting
2. Send PUT `/api/whitelabeling/{id}` with same OrganizationId but a different logoUrl
3. Inspect response status code
4. Retrieve updated record and verify logoUrl changed

**Expected Result:**
- Status: 200 OK
- logoUrl updated
- OrganizationId unchanged

---

## Group D — Error Response Shape

### WLV-011: Verify 400 error response contains FluentValidation array

**Priority:** High | **Type:** Contract | **Agent:** qa-backend-expert

**Preconditions:** Any failing validation scenario (e.g., both StoreId and OrganizationId set).

**Steps:**
1. Trigger any 400 response (use WLV-001 payload)
2. Inspect response Content-Type header
3. Inspect response body JSON structure

**Expected Result:**
- Content-Type: application/json
- Body is an array or object with error details
- Each error item includes: error code/key and human-readable message
- No stack trace exposed in response body
- No raw exception details visible

---

## Group E — Admin SPA Blade Error Display

### WLV-012: Admin blade shows error on validation failure (create)

**Priority:** High | **Type:** UI | **Agent:** qa-testing-expert

**Preconditions:** Admin authenticated in Admin SPA. Navigate to White Labeling blade for a store or organization.

**Steps:**
1. Open the White Labeling settings blade in Admin SPA
2. Attempt to create a duplicate WL setting (if Admin UI allows this scenario) OR observe what happens when saving a misconfigured entry
3. Capture the UI response after submit
4. Check browser console for Angular errors

**Expected Result:**
- An error notification or inline message is displayed to the user
- Message is human-readable (i18n string, not a raw key like `whiteLabeling.errors.duplicateSetting`)
- No unhandled exception / 500 modal
- `bladeNavigationService` error notification visible in blade header or notification area

---

### WLV-013: Admin blade i18n error strings render in English

**Priority:** Medium | **Type:** UI | **Agent:** qa-testing-expert

**Preconditions:** Admin SPA in English locale.

**Steps:**
1. Trigger a validation failure via the Admin blade (attempt to save invalid config)
2. Inspect the displayed error text

**Expected Result:**
- Error text is in English and human-readable
- Not a raw translation key (no dots-separated format like `module.error.code`)
- Text meaningfully describes the problem

---

## Group F — Regression (No False Positives)

### WLV-014: Existing valid store WL settings can be saved (PUT regression)

**Priority:** Critical | **Type:** Regression | **Agent:** qa-backend-expert

**Preconditions:** At least one existing WL setting for a store in QA environment.

**Steps:**
1. Open the existing WL setting in Admin blade OR via API GET
2. Send PUT with the original payload (no changes) or minor field update (e.g., update logoUrl)
3. Inspect response

**Expected Result:**
- Status: 200 OK
- No 400 returned for a valid, unchanged, pre-existing setting

---

### WLV-015: Existing valid org WL settings can be saved (PUT regression)

**Priority:** Critical | **Type:** Regression | **Agent:** qa-backend-expert

**Preconditions:** At least one existing WL setting for an organization in QA environment.

**Steps:**
1. Open the existing org WL setting
2. Send PUT with same payload or minor non-identity-field change
3. Inspect response

**Expected Result:**
- Status: 200 OK
- No false-positive 400

---

### WLV-016: Admin blade Save still works for valid existing settings

**Priority:** Critical | **Type:** Regression | **Agent:** qa-testing-expert

**Preconditions:** Admin SPA loaded. At least one WL setting exists.

**Steps:**
1. Navigate to the White Labeling blade for an existing configured store or org
2. Make a minor change (e.g., toggle a setting, update a text field)
3. Click Save
4. Verify save succeeds without error

**Expected Result:**
- Save completes with success indication (no error toast or notification)
- Change persisted on blade reload

---

## Summary Table

| ID | Title | Priority | Type | Agent |
|----|-------|----------|------|-------|
| WLV-001 | POST with both StoreId+OrgId | High | Negative | qa-backend-expert |
| WLV-002 | POST with neither StoreId nor OrgId | High | Negative | qa-backend-expert |
| WLV-003 | POST with StoreId only (valid) | Critical | Positive | qa-backend-expert |
| WLV-004 | POST with OrgId only (valid) | Critical | Positive | qa-backend-expert |
| WLV-005 | POST duplicate StoreId | High | Negative | qa-backend-expert |
| WLV-006 | POST duplicate OrgId | High | Negative | qa-backend-expert |
| WLV-007 | PUT change StoreId | High | Negative | qa-backend-expert |
| WLV-008 | PUT change OrgId | High | Negative | qa-backend-expert |
| WLV-009 | PUT with same StoreId (valid update) | Critical | Positive | qa-backend-expert |
| WLV-010 | PUT with same OrgId (valid update) | Critical | Positive | qa-backend-expert |
| WLV-011 | 400 error response shape | High | Contract | qa-backend-expert |
| WLV-012 | Admin blade shows error on failure | High | UI | qa-testing-expert |
| WLV-013 | Admin blade i18n strings in English | Medium | UI | qa-testing-expert |
| WLV-014 | PUT regression — store valid save | Critical | Regression | qa-backend-expert |
| WLV-015 | PUT regression — org valid save | Critical | Regression | qa-backend-expert |
| WLV-016 | Admin blade Save regression | Critical | Regression | qa-testing-expert |

**Total:** 16 test cases | **Critical:** 6 | **High:** 7 | **Medium:** 1 | **Contract:** 1 | **Regression:** 3
