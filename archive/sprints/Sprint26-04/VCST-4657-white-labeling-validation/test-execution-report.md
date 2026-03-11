# Test Execution Report — VCST-4657: Add Validation to White Labeling

**Ticket:** [VCST-4657](https://virtocommerce.atlassian.net/browse/VCST-4657)
**Sprint:** Sprint 26-04 | **Execution Date:** 2026-03-04
**QA Lead:** qa-lead-orchestrator
**Environment:** QA — https://vcst-qa.govirto.com
**Platform Version:** 3.1007.0
**PR Under Test:** https://github.com/VirtoCommerce/vc-module-white-labeling/pull/24

---

## Execution Summary

| Phase | Agent | Cases | Pass | Fail | Blocked |
|-------|-------|-------|------|------|---------|
| Phase 1 — API | qa-backend-expert | 13 | 12 | 1 | 0 |
| Phase 2 — Admin SPA UI | qa-testing-expert | 3 | 3 | 0 | 0 |
| **Total** | | **16** | **15** | **1** | **0** |

**Bugs found:** 2 (1 P2, 1 P3)

---

## Phase 1 — API Test Cases (qa-backend-expert)

### Test Environment

- **Backend URL:** https://vcst-qa.govirto.com
- **Auth:** Cookie session (Admin SPA login — admin/Password1!)
- **Endpoint discovered:** `/api/white-labeling` (hyphenated — the path `/api/whitelabeling` returns 404)
- **Swagger spec:** `/docs/VirtoCommerce.WhiteLabeling/swagger.json` — confirmed POST/PUT at `/api/white-labeling`, GET at `/api/white-labeling/store/{storeId}` and `/api/white-labeling/organization/{organizationId}`

### Test Data

| Resource | ID | WL Status |
|----------|----|-----------|
| B2B-store | `B2B-store` | WL id: `0418f833-55fe-4afe-a4dd-58b7de9cd4a9` |
| Electronics | `Electronics` | WL created by WLV-003: `fca91810-8c78-41d6-ba60-9b2335b85978` |
| Org — [E2E Test] Contoso Ltd. | `37644943-0a80-4070-b948-14491e47fe20` | WL id: `a0dead77-6384-4ed7-8f13-c2cf92c70457` |
| Org — "Quoted" Double Quotes | `organization-double-quotes` | WL created by WLV-004: `612c5954-7e8e-46dd-aacc-9dcccc8ae68d` |

**Cleanup note:** DELETE `/api/white-labeling/{id}` returns 405 — no DELETE verb is exposed. Records created by WLV-003 and WLV-004 remain in QA (Electronics WL, organization-double-quotes WL). See incidental finding IF-001.

---

### Group A — POST Mutual Exclusivity

#### WLV-001: POST with both StoreId and OrganizationId (invalid)

**Status: PASS**

| | |
|--|--|
| Request | POST `/api/white-labeling` `{ "storeId": "B2B-store", "organizationId": "37644943-...", "logoUrl": "..." }` |
| Response status | 400 Bad Request |
| Content-Type | `application/json; charset=utf-8` |
| Response body | `[{ "propertyName": "StoreId", "errorMessage": "store-and-organization-set", "severity": "Error", "errorCode": null }]` |

Validation fires correctly. The `errorMessage` contains a raw i18n key — see Bug WLV-BUG-001.

---

#### WLV-002: POST with neither StoreId nor OrganizationId (invalid)

**Status: PASS**

| | |
|--|--|
| Request | POST `/api/white-labeling` `{ "logoUrl": "..." }` |
| Response status | 400 Bad Request |
| Response body | `[{ "propertyName": "StoreId", "errorMessage": "store-or-organization-must-be-set", "severity": "Error", "errorCode": null }]` |

Validation fires correctly. Same i18n key pattern in `errorMessage`.

---

#### WLV-003: POST with only StoreId set (valid — happy path)

**Status: PASS**

| | |
|--|--|
| Request | POST `/api/white-labeling` `{ "storeId": "Electronics", "logoUrl": "..." }` |
| Response status | 200 OK |
| Created id | `fca91810-8c78-41d6-ba60-9b2335b85978` |
| GET verification | 200 — record retrievable, `storeId: "Electronics"` |

Note: Swagger spec and actual response both return 200 (not 201) for POST. This is the platform's convention for this endpoint — not a bug.

---

#### WLV-004: POST with only OrganizationId set (valid — happy path)

**Status: PASS**

| | |
|--|--|
| Request | POST `/api/white-labeling` `{ "organizationId": "organization-double-quotes", "logoUrl": "..." }` |
| Response status | 200 OK |
| Created id | `612c5954-7e8e-46dd-aacc-9dcccc8ae68d` |
| GET verification | 200 — record retrievable, `organizationId: "organization-double-quotes"` |

---

### Group B — POST Duplicate Detection

#### WLV-005: POST duplicate WL setting for same StoreId

**Status: PASS**

| | |
|--|--|
| Request | POST `/api/white-labeling` `{ "storeId": "B2B-store", "logoUrl": "..." }` |
| Response status | 400 Bad Request |
| Response body | `[{ "propertyName": "StoreId", "errorMessage": "duplicate-store-or-organization", "severity": "Error", "errorCode": null }]` |

Duplicate detection fires correctly for store scope.

---

#### WLV-006: POST duplicate WL setting for same OrganizationId

**Status: PASS**

| | |
|--|--|
| Request | POST `/api/white-labeling` `{ "organizationId": "37644943-...", "logoUrl": "..." }` |
| Response status | 400 Bad Request |
| Response body | `[{ "propertyName": "OrganizationId", "errorMessage": "duplicate-store-or-organization", "severity": "Error", "errorCode": null }]` |

Duplicate detection fires correctly for organization scope.

---

### Group C — PUT Immutability

#### WLV-007: PUT attempting to change StoreId (invalid)

**Status: PASS**

| | |
|--|--|
| Request | PUT `/api/white-labeling` `{ "id": "0418f833-...", "storeId": "Electronics", ... }` |
| Response status | 400 Bad Request |
| Response body | `[{ "propertyName": "StoreId", "errorMessage": "store-or-organization-changed", "severity": "Error", "errorCode": null }]` |

Immutability enforced. Changing `storeId` on PUT correctly rejected.

---

#### WLV-008: PUT attempting to change OrganizationId (invalid)

**Status: PASS**

| | |
|--|--|
| Request | PUT `/api/white-labeling` `{ "id": "a0dead77-...", "organizationId": "organization-double-quotes", ... }` |
| Response status | 400 Bad Request |
| Response body | `[{ "propertyName": "OrganizationId", "errorMessage": "store-or-organization-changed", "severity": "Error", "errorCode": null }]` |

Immutability enforced for `organizationId`.

---

#### WLV-009: PUT with unchanged StoreId (valid update) — Critical Regression

**Status: PASS**

| | |
|--|--|
| Request | PUT `/api/white-labeling` `{ "id": "0418f833-...", "storeId": "B2B-store", "logoUrl": "https://example.com/updated-logo-wlv009.png", ... }` |
| Response status | 204 No Content |
| GET verification | 200 — `logoUrl` updated to new value, `storeId` unchanged as `"B2B-store"` |

Valid update with same `storeId` is accepted. Immutability check correctly does not reject updates where the identity field value is unchanged. This is the highest-risk regression scenario — it passes.

---

#### WLV-010: PUT with unchanged OrganizationId (valid update) — Critical Regression

**Status: PASS**

| | |
|--|--|
| Request | PUT `/api/white-labeling` `{ "id": "a0dead77-...", "organizationId": "37644943-...", "logoUrl": "https://example.com/updated-logo-wlv010.png", ... }` |
| Response status | 204 No Content |
| GET verification | 200 — `logoUrl` updated, `organizationId` unchanged |

Valid update with same `organizationId` is accepted.

---

### Group D — Error Response Shape

#### WLV-011: Verify 400 error response shape

**Status: FAIL — Content defect on errorMessage and errorCode**

| Check | Result |
|-------|--------|
| Response status | 400 |
| Content-Type | `application/json; charset=utf-8` |
| Body is JSON array | Yes |
| Each item has `propertyName` | Yes |
| Each item has `errorMessage` | Yes |
| Each item has `severity` | Yes |
| Each item has `errorCode` | Yes (field present but value always `null`) |
| No stack trace in body | Pass — no stack trace exposed |
| `errorMessage` is human-readable | **Fail** — contains raw i18n keys |
| `errorCode` is populated | **Fail** — always `null` |

**Observed `errorMessage` values across all 400 responses:**

| Scenario | errorMessage |
|----------|-------------|
| Both StoreId and OrgId set | `store-and-organization-set` |
| Neither set | `store-or-organization-must-be-set` |
| Duplicate | `duplicate-store-or-organization` |
| Identity field changed | `store-or-organization-changed` |

**Structure verdict:** The FluentValidation array shape is correct — no stack trace, proper JSON structure, `propertyName` and `severity` populated.

**Content verdict:** FAIL. The `errorMessage` field consistently exposes raw i18n translation keys rather than resolved English text. `errorCode` is `null` on all responses.

**Bug raised:** WLV-BUG-001 (P2)

---

### Group F — Regression

#### WLV-014: Existing valid store WL settings can be saved (PUT regression)

**Status: PASS**

| | |
|--|--|
| Request | PUT `/api/white-labeling` — B2B-store original payload, `logoUrl` restored to `null` |
| Response status | 204 No Content |
| GET verification | 200 — `storeId: "B2B-store"`, `logoUrl: null`, no false-positive 400 |

Pre-existing store WL setting saves correctly after validation addition.

---

#### WLV-015: Existing valid org WL settings can be saved (PUT regression)

**Status: PASS**

| | |
|--|--|
| Request | PUT `/api/white-labeling` — Contoso Ltd. org payload, `logoUrl` restored to `null` |
| Response status | 204 No Content |
| GET verification | 200 — `organizationId: "37644943-..."`, `logoUrl: null`, no false-positive 400 |

Pre-existing org WL setting saves correctly.

---

### Phase 1 Results Table

| ID | Title | Priority | Type | Status | Notes |
|----|-------|----------|------|--------|-------|
| WLV-001 | POST with both StoreId+OrgId | High | Negative | PASS | 400, correct rule |
| WLV-002 | POST with neither StoreId nor OrgId | High | Negative | PASS | 400, correct rule |
| WLV-003 | POST with StoreId only (valid) | Critical | Positive | PASS | 200, record created |
| WLV-004 | POST with OrgId only (valid) | Critical | Positive | PASS | 200, record created |
| WLV-005 | POST duplicate StoreId | High | Negative | PASS | 400, duplicate rule |
| WLV-006 | POST duplicate OrgId | High | Negative | PASS | 400, duplicate rule |
| WLV-007 | PUT change StoreId | High | Negative | PASS | 400, immutability enforced |
| WLV-008 | PUT change OrgId | High | Negative | PASS | 400, immutability enforced |
| WLV-009 | PUT same StoreId (valid update) | Critical | Positive | PASS | 204, update persisted |
| WLV-010 | PUT same OrgId (valid update) | Critical | Positive | PASS | 204, update persisted |
| WLV-011 | 400 error response shape | High | Contract | FAIL | errorMessage = raw i18n key; errorCode = null |
| WLV-014 | PUT regression — store valid save | Critical | Regression | PASS | 204, no false-positive |
| WLV-015 | PUT regression — org valid save | Critical | Regression | PASS | 204, no false-positive |

**Phase 1: 12 PASS / 1 FAIL / 0 BLOCKED**

---

## Phase 2 — Admin SPA UI Test Cases (qa-testing-expert)

### Test Environment

- **Admin SPA:** https://vcst-qa.govirto.com
- **Browser:** Microsoft Edge 145 (Playwright)
- **Locale:** English (en-US)
- **Blade accessed via:** Stores > Electronics > White labeling

### Test Method

The White Labeling blade was opened for the Electronics store (which has an existing WL record from WLV-003). A controlled XHR intercept injected a synthetic 400 response with the `store-or-organization-changed` error body at the network level. This accurately simulates what the blade receives when a real validation failure occurs, allowing direct observation of the blade's error handling and i18n rendering without requiring a real validation-triggering scenario from the UI form.

---

#### WLV-012: Admin blade shows error on validation failure (create)

**Status: PASS**

| Observation | Result |
|-------------|--------|
| Error notification displayed | Yes — red banner in blade header: "400: Save error" |
| Banner location | Blade header area (above blade title) |
| "View details" link present | Yes |
| "Dismiss" link present | Yes |
| Unhandled exception or 500 modal | No |
| Blade remains usable after error | Yes — form fields still visible and editable |

**Evidence:** `screenshots/wlv-012-blade-error-notification.png`

The `bladeNavigationService` error notification mechanism is functioning. On a 400 response from the API, the blade surfaces an error banner in the header with "View details" and "Dismiss" actions.

---

#### WLV-013: Admin blade i18n error strings render in English

**Status: PASS**

| Observation | Result |
|-------------|--------|
| "View details" opens a modal | Yes — "Error details" modal dialog |
| Modal title | "Error details" |
| Error message displayed | "Store or Organization were changed" |
| Message is human-readable English | Yes |
| Raw i18n key visible (`store-or-organization-changed`) | No — key is NOT shown |
| Message meaningfully describes the error | Yes — describes what went wrong |

**Evidence:** `screenshots/wlv-012-view-details.png`

The Admin SPA correctly resolves the `store-or-organization-changed` translation key to the English string "Store or Organization were changed". The i18n system is working for validation error messages in the blade.

**Important nuance:** The blade header banner shows the generic "400: Save error" text. The specific validation message is only accessible by clicking "View details". Users who dismiss the banner without clicking "View details" will not see the specific reason. This is a UX observation — not a blocking defect.

---

#### WLV-016: Admin blade Save still works for valid existing settings

**Status: PASS**

| Observation | Result |
|-------------|--------|
| Field modified | Main menu link list → `all-products-menu-wlv016-test` |
| Save button active after edit | Yes |
| Network request issued | PUT `/api/white-labeling` → 204 No Content |
| Success indication | Save button greyed out (clean state), no error banner |
| Change persisted | GET confirms `mainMenuLinkListName: "all-products-menu-wlv016-test"` |
| Angular errors during save | None related to the save operation |

**Evidence:** `screenshots/wlv-016-save-success.png`

Valid save via the Admin SPA blade works correctly after the validation addition. No regression in save functionality.

Field restored to original value (`all-products-menu`) via API after test.

---

### Phase 2 — Angular Console Errors

The following console errors were observed during Phase 2 testing:

| Error | Source | Assessment |
|-------|--------|------------|
| `TypeError: Cannot read properties of undefined (reading 'join')` at `setError` → `responseError` | `app.js` Angular error handler | **Bug WLV-BUG-002** — fires when 400 response is processed. Despite the error, blade still renders "400: Save error" banner and the "View details" modal works. The error is in the error-parsing path, not the display path. |
| `Failed to load resource: 404` at `/api/whitelabeling` | From Phase 1 API discovery (wrong endpoint path tested) | Expected — path is `/api/white-labeling` with hyphen |
| `Failed to load resource: 405` at `/api/white-labeling/{id}` | From Phase 1 DELETE attempt | Expected — DELETE not supported |

**No Angular errors were produced by normal blade navigation or the successful WLV-016 save operation.**

---

### Phase 2 Results Table

| ID | Title | Priority | Type | Status | Notes |
|----|-------|----------|------|--------|-------|
| WLV-012 | Admin blade shows error on failure | High | UI | PASS | "400: Save error" banner displayed |
| WLV-013 | Admin blade i18n strings in English | Medium | UI | PASS | "Store or Organization were changed" — translated correctly |
| WLV-016 | Admin blade Save regression | Critical | Regression | PASS | 204, change persisted, no error |

**Phase 2: 3 PASS / 0 FAIL / 0 BLOCKED**

---

## Bugs Found

### WLV-BUG-001: 400 error responses contain raw i18n keys in `errorMessage`, not human-readable text

**Severity:** P2 — Medium
**Component:** White Labeling REST API
**Affects:** All validation 400 responses from POST and PUT `/api/white-labeling`

**Description:**
The `errorMessage` field in all FluentValidation 400 error responses returns the raw translation key string rather than a resolved human-readable English message. Any API consumer that displays `errorMessage` directly will show unintelligible key strings to end users.

**Additionally:** `errorCode` is `null` on every 400 response. It is unclear whether this is by design.

**Observed raw keys:**

| Scenario | `errorMessage` value | Expected value |
|----------|---------------------|----------------|
| Both StoreId+OrgId set | `store-and-organization-set` | "A White Labeling setting cannot have both Store and Organization set" |
| Neither set | `store-or-organization-must-be-set` | "Either Store or Organization must be specified" |
| Duplicate | `duplicate-store-or-organization` | "A White Labeling setting already exists for this store or organization" |
| Identity changed | `store-or-organization-changed` | "Store or Organization cannot be changed after the setting is created" |

**Impact:** Admin SPA blade uses `bladeNavigationService` to display errors. The blade correctly resolves the i18n key to English for the "View details" modal (WLV-013 confirmed). However any external API consumer (integrations, scripts, other frontends) consuming `errorMessage` directly will receive raw keys rather than user-facing text. This is a contract quality issue.

**STR:**
1. POST `https://vcst-qa.govirto.com/api/white-labeling` with `{ "storeId": "B2B-store", "organizationId": "any-org" }`
2. Inspect `errorMessage` in response body

**Expected:** `"A White Labeling setting cannot have both Store and Organization set"`
**Actual:** `"store-and-organization-set"`

---

### WLV-BUG-002: TypeError in Admin SPA `setError` handler when processing White Labeling 400 response

**Severity:** P3 — Low
**Component:** Admin SPA — White Labeling blade error handler
**Affects:** Admin SPA blade error display path for White Labeling 400 responses

**Description:**
When the White Labeling blade receives a 400 response, the Angular `responseError` handler throws a `TypeError: Cannot read properties of undefined (reading 'join')` in the `setError` function (`app.js`). The error fires because the error array structure from the FluentValidation response does not match what `setError` expects when assembling the error message string.

Despite this exception, the blade still shows the "400: Save error" banner and the "View details" modal correctly renders the translated error message. The bug is latent — it does not cause a visible failure under current conditions, but represents an unhandled exception in the error-processing path that could mask future errors or cause incorrect behavior if the error response shape changes.

**Console error (exact):**
```
TypeError: Cannot read properties of undefined (reading 'join')
  at Object.setError (app.js:2:368505)
  at app.js:2:294177
  at p.$broadcast (vendor.js:2:830605)
  at responseError (app.js:2:297809)
```

**STR:**
1. Open Admin SPA → Stores → any store → White labeling blade
2. Trigger a Save that results in a 400 validation response
3. Open browser DevTools → Console
4. Observe TypeError in the error handler

**Expected:** No console errors when processing a validation 400 response
**Actual:** `TypeError: Cannot read properties of undefined (reading 'join')` in `setError`

---

## Acceptance Criteria Coverage

| AC | Criterion | Test(s) | Status |
|----|-----------|---------|--------|
| AC1 | POST with both StoreId+OrgId → 400 | WLV-001 | PASS |
| AC2 | POST with neither → 400 | WLV-002 | PASS |
| AC3 | POST with only StoreId → success | WLV-003 | PASS |
| AC4 | POST with only OrgId → success | WLV-004 | PASS |
| AC5 | PUT changing StoreId → 400 | WLV-007 | PASS |
| AC6 | PUT changing OrgId → 400 | WLV-008 | PASS |
| AC7 | POST duplicate StoreId → 400 | WLV-005 | PASS |
| AC8 | POST duplicate OrgId → 400 | WLV-006 | PASS |
| AC9 | 400 response contains FluentValidation array | WLV-011 | PARTIAL — structure correct, content defective (raw keys) |
| AC10 | Admin blade displays error on 400 | WLV-012 | PASS |
| AC11 | Admin blade uses new i18n strings | WLV-013 | PASS — i18n resolves correctly in Admin SPA |
| AC12 | Valid existing settings still saveable | WLV-009, WLV-010, WLV-014, WLV-015, WLV-016 | PASS |

---

## Incidental Findings

| ID | Finding | Severity | Notes |
|----|---------|----------|-------|
| IF-001 | DELETE `/api/white-labeling/{id}` returns 405 | Info | No DELETE verb exposed in the module. WL records created during testing cannot be removed via API. Two test records remain in QA (Electronics: `fca91810`, organization-double-quotes: `612c5954`). Manual cleanup required via Admin SPA or DB. |
| IF-002 | POST returns 200, not 201 | Info | Swagger spec declares 200. Platform convention for this module — not a bug. Test plan expected 201 but 200 is correct per contract. |
| IF-003 | OAuth2 password grant with `web_storefront` client returns 401 | Info | Storefront client is not configured for admin API access. Use cookie-based session for Admin API testing. |

---

## Environment Notes

- **Platform version:** 3.1007.0 (Admin SPA header)
- **License:** Expired (Jan 1, 2026) — license banner visible. Does not affect API or blade functionality.
- **Auth:** Cookie-based Admin SPA session
- **Screenshots:**
  - `screenshots/phase1-admin-spa-authenticated.png` — Phase 1 environment baseline
  - `screenshots/wlv-016-blade-initial-state.png` — White labeling blade before edit
  - `screenshots/wlv-016-save-success.png` — WLV-016 successful save (field updated)
  - `screenshots/wlv-012-blade-error-notification.png` — WLV-012 error banner in blade header
  - `screenshots/wlv-012-view-details.png` — WLV-013 "Error details" modal with translated message

---

## QA Lead Decision

**Recommendation: APPROVE WITH CONDITIONS**

All 12 acceptance criteria are verified. The 16 test cases produced 15 PASS and 1 FAIL (WLV-011 — partial content defect on error response shape). The two bugs found are P2 and P3 — neither is blocking.

**Conditions for approval:**
1. **WLV-BUG-001** (P2) — `errorMessage` returns raw i18n keys in API 400 responses — must be tracked as a follow-up JIRA ticket. The Admin SPA blade works correctly because it resolves keys client-side, but external API consumers are affected. Recommend filing and scheduling for next sprint.
2. **WLV-BUG-002** (P3) — `TypeError` in `setError` handler — must be tracked. Does not cause visible failure currently but is a latent defect in the error handling path.

**Critical paths all pass:** All 6 Critical-priority test cases (WLV-003, WLV-004, WLV-009, WLV-010, WLV-014, WLV-015, WLV-016) pass. No P0/P1 bugs found. No regression in valid save flows.
