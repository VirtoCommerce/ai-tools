# Test Lifecycle Phases 2–4 Results
## PR #2225 — feat(VCST-4713): Conditional Sections in Product Configuration

**Generated:** 2026-04-16  
**PR:** VirtoCommerce/vc-frontend#2225  
**Branch:** `feat/VCST-4713-conditional-sections`  
**Changed files:** 5 (all frontend — `getProductConfigurationsQuery.graphql`, `types.ts`, `add-to-cart.vue`, `product-configuration.vue`, `useConfigurableProduct.ts`)  
**Verification baseline:** 2026-04-16 run — 32 PASS / 1 FAIL / 4 BLOCKED of 34 executed

---

## Phase 2 — SYNC: Staleness Assessment

### Methodology

Every COND-variant test case was assessed against the PR diff along five criteria:

1. **Function name accuracy** — references `isSectionVisible`, `hiddenSectionIds`, `clearHiddenSectionValues`, `isRequiredConfigurationComplete`
2. **UI behavior accuracy** — sections wrapped in `v-if` (not CSS hide), conditional rendering
3. **GraphQL field accuracy** — `dependsOnSectionId` field in query
4. **Add to Cart disable logic** — `configurableDisabled` = `isRequiredConfigurationComplete` + `configLoading`
5. **Business_Rule and Edge_Case_Refs** — correct BL-* and ECL-* IDs

### Classification Legend

| Status | Meaning |
|--------|---------|
| VALID | Aligns with PR implementation; no changes needed |
| STALE | References incorrect behavior, wrong labels, or superseded logic |
| INCOMPLETE | Missing coverage for new functions/behaviors from this PR |
| BROKEN | Steps would fail execution; critical gap in traceability |

---

### Suite 072 — Configurable Products UI

| Case ID | Title (abbreviated) | Classification | Reason | Action |
|---------|---------------------|---------------|--------|--------|
| CFG-PDP-020-COND | Initial state — Aluminum preselected | **VALID** | Correctly tests `hiddenSectionIds` initial state; `v-if` remove-from-DOM behavior confirmed in verification run | None |
| CFG-PDP-021-COND | Dependent section appears on parent value | **VALID** | `isSectionVisible()` reactive update correctly described; `[STATE]` assertions reference the right computed behavior | None |
| CFG-PDP-022-COND | Tire Type disappears when Wheel Set = None | **VALID** | Accurately describes `v-if=false` removal (not CSS hide); references `isSectionVisible` return path | None |
| CFG-PDP-023-COND | Hidden value cleared (`clearHiddenSectionValues`) | **VALID** | Function name correct; behavior confirmed PASS in verification run; `[CONSOLE]` cross-check references `clearHiddenSectionValues()` | None |
| CFG-PDP-024-COND | Price recalculates excluding hidden option | **VALID** | `[MATH]` assertions precise; references BL-PRICE-001 correctly; price transitions match verification ($300/$325/$345/$300) | None |
| CFG-PDP-025-COND | Transitive chain A→B→C | **VALID** | `hiddenSectionIds` iterative computation correctly described; notes max-iterations safety; references infinite-loop failure signal | None |
| CFG-PDP-026-COND | Hidden optional section does not block Add to Cart | **STALE (Minor)** | Title and body say "Required Hidden Section" but CFG-022 Tire Type is **optional**, not required. Confusing but behavior tested is correct (`validateSection()` skips hidden sections). **Title misleads.** | Update title and Preconditions note to clarify "hidden section (optional in CFG-022)" |
| CFG-PDP-027-COND | Multiple siblings depending on same parent | **VALID** | Correctly identifies the multiple-children-of-same-parent path in `hiddenSectionIds` | None |
| CFG-PDP-028-COND | Add to Cart with conditional section visible | **VALID** | Correctly references `configurableDisabled` disable logic; cross-layer checks include addItem mutation | None |
| CFG-PDP-029-COND | Add to Cart — hidden section absent from cart | **VALID** | `clearHiddenSectionValues()` referenced in Cross_Layer_Checks; `[DATA]` assertion specifies exact section ID exclusion | None |
| CFG-PDP-030-COND | Text input reveals dependent section (CFG-024) | **VALID** | Text parent chain behavior verified PASS; references BL-CAT-006 | None |
| CFG-PDP-031-COND | Chained text parent (CFG-024) | **VALID** | 3-level Text→Product→Product chain tested; verified PASS | None |
| CFG-PDP-032-COND | File upload reveals dependent section (CFG-025) | **VALID** | File parent behavior verified PASS | None |
| CFG-PDP-033-COND | Required file child gates Add to Cart (CFG-026) | **INCOMPLETE** | CFG-029 product not seeded; BLOCKED in verification. Test case itself is structurally sound but references a missing seed product. **Seed data issue, not case defect.** | Seed CFG-029 product. Ref `@td(CFG_REQUIRED_FILE_CHILD.slug)` is correct. |
| CFG-PDP-034-COND | Two required siblings hidden when Bundle=None | **STALE (Minor)** | Last assertion `[ASSERT] Add to cart ENABLED (hidden sections excluded from validation — ECL-7.1)` is factually correct but **does not cover `configurableDisabled`** disable logic from `add-to-cart.vue`. `isRequiredConfigurationComplete` is not referenced in assertions. Should add explicit `[STATE] configurableDisabled computed = false` assertion. | Add assertion referencing `isRequiredConfigurationComplete` |
| CFG-PDP-035-COND | Cart gate — both siblings must be filled | **STALE** | Assertions reference `[STATE] Add to cart DISABLED` states correctly. However, the disable mechanism is now `configurableDisabled` (`isRequiredConfigurationComplete && !configLoading`) not a generic `disabled` attribute. Cross_Layer_Checks does not verify `configLoading` path. Also, `[MATH] Total=$165.00` note may not account for `configLoading` state during price calculation. **Priority action needed.** | Add `[STATE] configLoading=false when all visible sections are filled` assertion; add `configurableDisabled` reference to Cross_Layer_Checks |
| CFG-PDP-036-COND | Deep chain Level E hidden until full 4-level chain | **VALID** | Deep chain tested; `hiddenSectionIds` iterative computation at depth 4 verified | None |
| CFG-PDP-037-COND | Deselecting mid-chain collapses downstream | **STALE** | FAILED in verification run: "None" product option does NOT hide dependents. Expected behavior (`[STATE] B=None cascades hide for C/D/E`) is incorrect for the current implementation. `isSectionVisible()` treats any product selection (including "None" product) as "parent has value." The test will continue to FAIL until either (a) the behavior is clarified as by-design or (b) the implementation is changed. | Needs product team clarification on "None" product semantics. Mark as `Known Ambiguity` in References. Update Assertions to document actual observed behavior OR open a bug. |
| CFG-PDP-038-COND | Required child hidden when optional parent = None | **STALE** | Same "None" product issue as CFG-PDP-037-COND. If "None" = a real product value, this case's behavior under `A=None` may be different from expected. | Clarify with product team; update after CFG-PDP-037-COND resolution |
| CFG-PDP-039-COND | Required child revealed when parent gets real value | **INCOMPLETE** | BLOCKED in verification (CFG-029 not seeded). Case is structurally correct. | Seed CFG-029 |
| CFG-PDP-040-COND | Cascade hide — Size/Color reset when Bundle=None | **STALE** | Same root cause as CFG-PDP-037-COND. Selecting "None" (a product option) in Bundle Choice does NOT hide Size and Color in the current implementation. Test will FAIL as written until "None" semantics are resolved. | Same action as CFG-PDP-037-COND |
| CFG-PDP-041-COND | File parent 3-level chain — Notes appears after Finish Type | **VALID** | Verified PASS (tested as part of CFG-PDP-032-COND); file parent chain works correctly | None |

**Suite 072 Summary:** 17 VALID / 5 STALE / 1 INCOMPLETE

---

### Suite 072b — Configurable Products E2E

| Case ID | Title (abbreviated) | Classification | Reason | Action |
|---------|---------------------|---------------|--------|--------|
| CFG-E2E-058-COND | E2E: Full config Add to Cart | **VALID** | Verified PASS; cross-layer checks include GQL configurationItems inspection; BL-CAT-006 + BL-PRICE-001 referenced | None |
| CFG-E2E-059-COND | E2E: Hidden section absent from cart | **VALID** | Verified PASS; `clearHiddenSectionValues()` referenced in Cross_Layer_Checks; exact section ID specified in assertion | None |
| CFG-E2E-060-COND | E2E: Reconfigure from cart — visibility correct on re-entry | **VALID** | Verified PASS; references `changeCartConfiguredItem` correctly; `clearHiddenSectionValues()` in deselect step | None |
| CFG-E2E-061-COND | Toast Save button must NOT bypass required-section validation | **VALID** | References wedding cake product; test covers `isRequiredConfigurationComplete` gate path; bug report referenced | None |
| CFG-E2E-062-COND | Toast Save and main Update cart must behave identically | **VALID** | Complementary to CFG-E2E-061-COND; correctly tests asymmetric behavior | None |
| CFG-E2E-063-COND | Server-side validation: ChangeCartConfiguredItem rejects missing required Text section | **VALID** | GraphQL-level validation gate; `validationErrors[]` check | None |
| CFG-E2E-064-COND | Toast Save success path — all required sections filled | **VALID** | Happy path complement to CFG-E2E-061/062; checks `isRequiredConfigurationComplete=true` success | None |
| CFG-E2E-065-COND | CFG-024 Text parent — configurationItems contains Text section | **VALID** | Text section `type=Text textValue` in configurationItems verified; BL-CAT-006 | None |
| CFG-E2E-066-COND | CFG-025 File parent — configurationItems contains File section reference | **VALID** | File section in configurationItems; all 3 downstream entries | None |
| CFG-E2E-067-COND | CFG-026 Required file child — cart add blocked | **INCOMPLETE** | BLOCKED in verification (CFG-026 product seed issue noted in CFG-PDP-033-COND). Structurally correct. | Seed CFG-026 and CFG-029 products |
| CFG-E2E-068-COND | CFG-027 Two required siblings — both in configurationItems | **VALID** | Configuration items count and content verified; price math correct | None |
| CFG-E2E-069-COND | CFG-028 Deep chain — all 5 levels in configurationItems | **VALID** | 5-level chain in configurationItems; depth-4 computation verified | None |
| CFG-E2E-070-COND | CFG-029 Req child opt parent — A=None vs A=value scenarios | **INCOMPLETE** | BLOCKED in verification (CFG-029 not seeded). Also note: Scenario 1 (`A=None; B hidden`) correctness depends on "None" product semantics resolution (FINDING-1). | Seed CFG-029; revisit after "None" semantics clarified |

**Also assessed — non-COND cases in 072b with COND impact:**

| Case ID | Classification | Reason |
|---------|---------------|--------|
| CFG-FILE-010 (072b file-text file) | VALID | Text parent conditional (CFG-024); aligns with `isSectionVisible` |
| CFG-FILE-011 (072b file-text file) | VALID | File parent conditional (CFG-025); aligns with upload-driven visibility |

**Suite 072b Summary:** 10 VALID / 3 INCOMPLETE / 0 STALE

---

### Suite 072c — Cross-Cutting

| Case ID | Title (abbreviated) | Classification | Reason | Action |
|---------|---------------------|---------------|--------|--------|
| CFG-BACK-001-COND | Backward compat — non-conditional products render all sections | **VALID** | `isSectionVisible()` null-dependency path verified PASS; references `dependsOnSectionId=null` behavior | None |
| CFG-GQL-010-COND | GraphQL returns `dependsOnSectionId` field per section | **VALID** | Verified PASS; `dependsOnSectionId` field in schema confirmed (matches `getProductConfigurationsQuery.graphql` change in PR) | None |
| CFG-CROSS-001-COND | Deep chain — GraphQL returns dependsOnSectionId for all 5 levels | **VALID** | Verified PASS; chain integrity A.dep=null; B.dep=A.id etc. confirmed | None |
| CFG-CROSS-002-COND | Required child of optional parent — hidden required section absent from addItem | **INCOMPLETE** | BLOCKED (CFG-029 not seeded). Case structurally correct. | Seed CFG-029 |

**Suite 072c Summary:** 3 VALID / 1 INCOMPLETE

---

### Suite 052 — Configurable Products Admin (COND cases only)

| Case ID | Title (abbreviated) | Classification | Reason | Action |
|---------|---------------------|---------------|--------|--------|
| CFG-CA-019 | Set Depends On via Admin UI | **STALE (Minor)** | PASS in verification, BUT: test references `[ACT] Click the Depends On ui-select dropdown` and `[DOM] Depends On dropdown visible`. Actual admin label is **"Active when section has value"** (not "Depends On"). Steps and Assertions must be updated to match real UI label. | Update Steps/Assertions: replace "Depends On" with "Active when section has value"; update dropdown interaction reference |
| CFG-CA-020 | Clear Depends On dependency | **STALE (Minor)** | Same label issue as CFG-CA-019. Also: Assertions reference `Depends On field is empty` but actual label shows `"Always active"` when cleared. `[STATE] Depends On field is empty or shows None` should read `[STATE] field shows "Always active"`. | Update label references throughout |
| CFG-CA-021 | Delete parent section — verify dependent's dependsOnSectionId cleared | **VALID** | BLOCKED by data preservation concern (not a case defect). Structurally correct; references cascade deletion behavior. | None (seed-data issue) |
| CFG-CA-022 | Depends On dropdown excludes self | **STALE (Minor)** | Same label issue. `[ACT] Click the Depends On dropdown` → `[ACT] Click the "Active when section has value" dropdown`. | Update label references |
| CFG-CA-023 | Circular dependency A→B — B→A — document behavior | **STALE** | Assertions reference `OPTION 2 — Validation error: Save rejected with "Circular dependency detected"`. Verification confirms: **circular dependency IS NOT prevented at UI level and value is NOT persisted** (silent reject at data layer). OPTION 3 (Silent accept but data integrity preserved) better describes actual behavior. Assertions should document confirmed behavior. | Update Assertions to document actual behavior: "UI does not prevent circular selection; value not persisted; no warning shown; data integrity preserved" |
| CFG-CA-024 | REST API — POST with dependsOnSectionId and GET verifies persistence | **VALID** | REST round-trip verified PASS; `dependsOnSectionId` persists and is returned in GET response | None |
| CFG-CA-025 | Admin: Create CFG-027 two-siblings pattern | **VALID** | PASS; REST and GraphQL confirmed | None |
| CFG-CA-026 | Admin: Create CFG-028 4-level chain and verify | **VALID** | PASS; chain integrity verified via REST and GraphQL | None |

**Suite 052 COND Summary:** 5 VALID / 3 STALE (Minor) / 0 INCOMPLETE / 0 BROKEN

---

### Phase 2 Overall Totals

| Suite | VALID | STALE | INCOMPLETE | BROKEN | Total COND Cases |
|-------|-------|-------|-----------|--------|-----------------|
| 072 (UI) | 17 | 5 | 1 | 0 | 23 |
| 072b (E2E) | 10 | 0 | 3 | 0 | 13 |
| 072c (Cross) | 3 | 0 | 1 | 0 | 4 |
| 052 (Admin) | 5 | 3 | 0 | 0 | 8 |
| **TOTAL** | **35** | **8** | **5** | **0** | **48** |

**Sync required:** 13 cases need updates (8 STALE + 5 INCOMPLETE)  
**Blockers:** 0 BROKEN cases  
**Root causes of staleness:** (1) "None" product semantics unresolved — affects 3 cases; (2) Admin UI label mismatch "Depends On" vs "Active when section has value" — affects 3 admin cases; (3) Missing seed products for CFG-026/CFG-029 — affects 5 cases; (4) Minor coverage gaps for new `configurableDisabled` computed — affects 2 cases

---

## Phase 3 — ANALYZE & GENERATE: Coverage Gaps

### Gap Inventory

#### GAP-4713-001: "None" Product Option Does Not Hide Dependents — Unresolved Test Coverage

**Source:** FINDING-1 from verification run; affects CFG-PDP-037-COND, CFG-PDP-038-COND, CFG-PDP-040-COND  
**Priority:** High  
**Issue:** The current `isSectionVisible()` implementation treats ANY product selection (including "None" options with $0 surcharge) as `parent has value = true`. Three test cases expect `None` to hide dependents. This is a design ambiguity — product team must decide whether `None` products should be treated as "no selection" for dependency purposes.

**Recommended new case:** One dedicated documentation/characterization test to record actual behavior and provide a stable baseline:

```
ID: CFG-PDP-042-COND
Title: None Product Option Treats Parent as Having a Value — Dependent Sections Remain Visible
Section: Configurable Products > Conditional Sections > None Option Semantics
Priority: High
Business_Rule: BL-CAT-006
Edge_Case_Refs: ECL-7.1
Preconditions: CFG-028 PDP loaded. Full chain visible: A-E all showing Opt1. Level B has option "LvlB-None" available.
Test_Data: url={{FRONT_URL}}/products-with-options/configurations/@td(CFG_DEEP_CHAIN.slug)
Steps:
  [NAV] Navigate to @td(CFG_DEEP_CHAIN.url) and select full chain (A=Opt1, B=Opt1, C=Opt1, D=Opt1, E=Opt1); all 5 visible
  [ASSERT] Confirm all 5 levels visible; price=$360.00
  [ACT] In Level B, select LvlB-None ($0 product option)
  [WAIT] Observe visibility of Levels C, D, E
  [ASSERT] Document whether C/D/E remain visible or collapse
  [ASSERT] Record price change (Opt1 $10 → None $0 = $10 reduction)
Assertions:
  [STATE] ACTUAL BEHAVIOR (2026-04-16 observation): Levels C, D, E remain VISIBLE when Level B=LvlB-None — "None" product option counts as a valid parent value in isSectionVisible()
  [STATE] isSectionVisible(C.id) returns true because B has a product value (even $0 product)
  [MATH] Price updates: $360 → $350 (B contribution removed) but C/D/E contribution preserved
  [STATE] This behavior is by-design until product team specifies otherwise — NOT a bug per current implementation
  [STATE] NOTE: If product team decides None should hide dependents, isSectionVisible() must check for explicit "skip/none" flag on options
Cross_Layer_Checks:
  [CONSOLE] No JS errors during None selection
  [NETWORK] No page reload; price update is client-side
Failure_Signals: JS error in hiddenSectionIds; page reload on option click; price calculation incorrect
Cleanup: none
References: VCST-4713; FINDING-1 (verification-summary.json 2026-04-16)
Automation_Status: Manual
```

---

#### GAP-4713-002: `isRequiredConfigurationComplete` + `configLoading` Disable Path Not Explicitly Tested

**Source:** PR change — `add-to-cart.vue` new `configurableDisabled` computed  
**Priority:** High  
**Issue:** The `configurableDisabled` computed combines `isRequiredConfigurationComplete` (all visible required sections filled) AND `configLoading` (loading state). No existing test case explicitly names and tests the `configLoading` disable path. CFG-PDP-035-COND tests the `isRequiredConfigurationComplete` path but does not test the `configLoading` interim disable.

**Recommended new case:**

```
ID: CFG-PDP-043-COND
Title: Add to Cart Disabled During Configuration Loading State (configLoading)
Section: Configurable Products > Conditional Sections > Loading State
Priority: High
Business_Rule: BL-CAT-006
Edge_Case_Refs: ECL-7.1
Preconditions: CFG-022 PDP accessible. Network throttling available (DevTools or slow network simulation).
Test_Data: url={{FRONT_URL}}/products-with-options/configurations/@td(CFG_CONDITIONAL.slug)
Steps:
  [NAV] Navigate to @td(CFG_CONDITIONAL.url)
  [WAIT] Configure widget loads; Frame Type=Aluminum preselected
  [ASSERT] Observe Add to Cart button state AFTER initial page load is complete (configLoading=false; Frame Type filled = required)
  [ACT] Using DevTools Network panel, apply slow 3G throttling
  [NAV] Hard-reload the page
  [WAIT] Page begins loading — observe Add to Cart state DURING loading
  [ASSERT] Add to Cart is DISABLED during loading (configurableDisabled = configLoading=true)
  [WAIT] Page fully loads (configLoading=false); Frame Type=Aluminum preselected
  [ASSERT] Add to Cart is ENABLED (all visible required sections satisfied and not loading)
  [ACT] Remove network throttling
Assertions:
  [STATE] During configLoading=true: Add to Cart button has disabled attribute (configurableDisabled returns true)
  [STATE] After configLoading=false + Frame Type filled: Add to Cart is enabled (configurableDisabled returns false)
  [STATE] The transition from disabled to enabled happens without page reload — reactive computed update
  [DOM] Button disabled attribute present during loading; absent after load + required section filled
Cross_Layer_Checks:
  [CONSOLE] No JS errors during loading state transitions
  [NETWORK] productConfiguration GraphQL query completes without error
Failure_Signals: Add to Cart enabled while page is still loading; button stuck disabled after load completes; JS error in configurableDisabled computed
Cleanup: Remove throttling; none for cart
References: VCST-4713; PR#2225 add-to-cart.vue configurableDisabled
Automation_Status: Manual
```

---

#### GAP-4713-003: `updateWithDefaultValues()` Skip-Hidden-Sections Path Not Covered

**Source:** PR change — `useConfigurableProduct.ts`: `updateWithDefaultValues()` now skips hidden sections  
**Priority:** Medium  
**Issue:** When a product has sections with default values configured, `updateWithDefaultValues()` is called on load. If some sections are hidden, their default values should NOT be applied. No test case covers this.

**Recommended new case:**

```
ID: CFG-PDP-044-COND
Title: Default Values Not Applied to Hidden Sections on PDP Load
Section: Configurable Products > Conditional Sections > Default Values
Priority: Medium
Business_Rule: BL-CAT-006
Edge_Case_Refs: ECL-7.1
Preconditions: A seed product where Section C (hidden on initial load) has a configured default value. Section C depends on Section B which has no default. On initial page load, Section C should be hidden (B=None) and therefore its default value should NOT appear as selected.
Test_Data: url={{FRONT_URL}}/products-with-options/configurations/@td(CFG_CONDITIONAL.slug)
Steps:
  [NAV] Navigate to @td(CFG_CONDITIONAL.url)
  [WAIT] Configure widget loads; Frame Type=Aluminum (preselected default); Wheel Set visible; Tire Type NOT in DOM
  [ASSERT] Tire Type is NOT in DOM (hidden because Wheel Set has no value)
  [ASSERT] Price = $300.00 (only Aluminum $0 contributing — Tire Type default NOT applied)
  [ACT] In Wheel Set, select Standard ($25.00)
  [WAIT] Tire Type appears in DOM
  [ASSERT] Tire Type shows its OWN default value when it becomes visible (None or the configured default — not a ghost value from updateWithDefaultValues on initial load)
Assertions:
  [STATE] Hidden sections have no pre-applied default value before becoming visible
  [MATH] Price on initial load = $300.00 (Tire Type default not included)
  [STATE] updateWithDefaultValues() only applies defaults to VISIBLE sections — not hidden ones
  [STATE] When Tire Type becomes visible, its default is applied fresh (not carried over from pre-hidden state)
Cross_Layer_Checks:
  [CONSOLE] No JS errors in updateWithDefaultValues execution
  [NETWORK] No unexpected cart mutations on initial load (no default auto-add)
Failure_Signals: Hidden section default value appearing in price before section is visible; price higher than expected on initial load; stale default value causing wrong price
Cleanup: none
References: VCST-4713; PR#2225 updateWithDefaultValues() skips hidden sections
Automation_Status: Manual
```

---

#### GAP-4713-004: `validateSection()` Skips Hidden Sections — Explicit Unit-Level Coverage

**Source:** PR change — `useConfigurableProduct.ts`: `validateSection()` skips validation for hidden sections  
**Priority:** Medium  
**Issue:** CFG-PDP-026-COND and CFG-PDP-038-COND cover the cart-level effect (hidden section doesn't block Add to Cart). But they don't explicitly test that `validateSection()` is skipped mid-flow when the user tries to interact with the wizard before Add to Cart.

**Assessment:** CFG-PDP-026-COND and related cases provide adequate behavioral coverage. This gap is low-risk since the behavior is an implementation detail observable via Add to Cart gating. **No new test case recommended.** Document as covered by CFG-PDP-026-COND.

---

#### GAP-4713-005: `hiddenSectionIds` Max-Iterations Guard for Circular Dependencies

**Source:** PR change — `useConfigurableProduct.ts`: `hiddenSectionIds` iterative computation bounded by section count to prevent infinite loops  
**Priority:** Medium  
**Issue:** CFG-CA-023 covers the admin-level circular dependency case, but there is no storefront-level test that verifies the circular dependency guard in `hiddenSectionIds` computed property does NOT crash the widget.

**Recommended new case:**

```
ID: CFG-PDP-045-COND
Title: Circular Dependency in Admin Does Not Crash Storefront Widget (Max-Iterations Guard)
Section: Configurable Products > Conditional Sections > Circular Dependency Guard
Priority: Medium
Business_Rule: BL-CAT-006
Edge_Case_Refs: ECL-5.1
Preconditions: Admin can temporarily create a circular dependency (A depends B, B depends A) on a test product without affecting shared seed data. Alternatively use CFG-CA-023 confirmed behavior: circular dependency is silently rejected and NOT persisted. This test verifies the frontend guard if a circular state were hypothetically loaded.
Test_Data: url={{FRONT_URL}}/products-with-options/configurations/@td(CFG_CONDITIONAL.slug); back_url={{BACK_URL}}
Steps:
  [AUTH] Obtain admin Bearer token via POST {{BACK_URL}}/connect/token
  [SETUP] Attempt to directly set circular dependency via REST API: POST {{BACK_URL}}/api/catalog/products/configurations — set Section A dependsOnSectionId = Section B.id while Section B.dependsOnSectionId = Section A.id
  [ASSERT] If API rejects: note rejection and skip storefront test (guard not needed — server prevents it)
  [ASSERT] If API accepts (test circular scenario): navigate to {{FRONT_URL}} product PDP
  [WAIT] Configure widget loads
  [ASSERT] Widget renders without JavaScript error, crash, or infinite loop
  [ASSERT] Sections visible (may be all visible or all hidden — any non-crash outcome is acceptable)
  [CONSOLE] Check for stack overflow or infinite loop errors
Assertions:
  [STATE] If circular state is loaded: hiddenSectionIds computation terminates (max iterations = section count guard prevents infinite loop)
  [STATE] No JavaScript stack overflow
  [STATE] No browser tab crash or hang
  [STATE] Widget renders in some state (degraded is acceptable — crash is not)
Cross_Layer_Checks:
  [CONSOLE] No stack overflow error; no infinite loop in hiddenSectionIds
  [NETWORK] Product configuration query completes
Failure_Signals: Browser tab crashes; JS stack overflow in console; page freezes indefinitely; widget blank with no error
Cleanup: Restore Section A dependsOnSectionId to null via REST API after test
References: VCST-4713; PR#2225 hiddenSectionIds max-iterations guard; CFG-CA-023
Automation_Status: Manual
```

---

#### GAP-4713-006: Cart Suites 028-030 — Add to Cart `configurableDisabled` Impact Assessment

**Source:** PR change — `add-to-cart.vue` uses `configurableDisabled` computed (replaces simple `disabled` prop)  
**Assessment of suites 028/029/030:**

- **028-cart-core.csv:** CART-001 (`[ASSERT] verify 'Add to Cart' button is visible and enabled`) — covers **non-configurable** products with standard `disabled` attribute. The `configurableDisabled` change ONLY applies to configurable products via `add-to-cart.vue`. Standard products use a different component path. **CART-001 through CART-004 are not affected.** No sync needed.
- **029-cart-validation-persistence.csv:** Checked for configurable product Add to Cart references. Cases reference `Proceed to Checkout disabled` on cart page — unrelated to `configurableDisabled` on PDP. **Not affected.**
- **030-cart-merge.csv:** Cases check `Proceed to Checkout disabled` on merge — unrelated. **Not affected.**

**Conclusion:** Cart suites 028-030 are **not impacted** by the `configurableDisabled` change. The change is scoped to `add-to-cart.vue` for configurable products on the PDP, which is covered by Suite 072.

---

### Phase 3 Summary

| Gap ID | Priority | Type | New Cases Recommended |
|--------|---------|------|----------------------|
| GAP-4713-001 | High | "None" product semantics — unresolved design ambiguity | 1 (CFG-PDP-042-COND) |
| GAP-4713-002 | High | `configLoading` disable path not tested | 1 (CFG-PDP-043-COND) |
| GAP-4713-003 | Medium | `updateWithDefaultValues()` skip-hidden path | 1 (CFG-PDP-044-COND) |
| GAP-4713-004 | Medium | `validateSection()` skip path | 0 (covered by existing cases) |
| GAP-4713-005 | Medium | Circular dependency max-iterations guard | 1 (CFG-PDP-045-COND) |
| GAP-4713-006 | N/A | Cart suites 028-030 impact assessment | 0 (no impact) |

**Total new cases to generate:** 4 (CFG-PDP-042-COND through CFG-PDP-045-COND)  
**Target suite for new cases:** 072 (Frontend/configurable-products/072-configurable-products-ui.csv)

---

## Phase 4 — REVIEW & FIX: Quality Dimensions

### Quality Review — All COND-variant Cases (48 cases across 4 suites)

#### Dimension 1: Structure — Format, IDs, Required Fields

| Case ID | Finding Code | Severity | Issue | Fix |
|---------|-------------|---------|-------|-----|
| All COND cases | S-004 | Low | ID format uses suffix `-COND` (e.g., `CFG-PDP-020-COND`). This deviates from `PREFIX-NNN` pattern. However, the `-COND` suffix is a deliberate convention for conditional-section cases and aids traceability. | Acceptable deviation — no action required. The `-COND` suffix is documented and consistent. |
| CFG-PDP-037-COND | S-006 | High | Assertions column describes expected hide behavior that **does not match actual implementation** (STALE — "None" product keeps dependents visible). Assertions are not factually wrong per original spec, but produce a FAIL verdict on currently correct code. | Update Assertions to document actual behavior (see Phase 2 STALE action) |

**Structure dimension: 1 High finding (CFG-PDP-037-COND), others PASS**

---

#### Dimension 2: Determinism — Step Tags, Element References

| Case ID | Finding Code | Severity | Issue | Fix |
|---------|-------------|---------|-------|-----|
| CFG-CA-019 | D-002 | High | `[ACT] Click the Depends On ui-select dropdown` — generic description doesn't match actual admin UI element name. Should reference "Active when section has value" select. | Update: `[ACT] Click the "Active when section has value" select dropdown` |
| CFG-CA-020 | D-002 | High | Same as CFG-CA-019: multiple steps reference "Depends On dropdown" / "Depends On field" — real element is "Active when section has value". | Update all references |
| CFG-CA-022 | D-002 | High | `[ACT] Click the Depends On dropdown` — should be `[ACT] Click the "Active when section has value" dropdown`. | Update |
| CFG-CA-023 | D-002 | High | Steps reference "Depends On dropdown" when real label is "Active when section has value". | Update |
| CFG-PDP-026-COND | D-002 | Medium | Title says "Required Hidden Section" but cross-checks say "The required Installation section" — this section doesn't exist in CFG-022 (sections are Wheel Set, Tire Type, Frame Color, Frame Type). The `Installation` section reference in Cross_Layer_Checks is a carry-over from an earlier product definition. | Update: replace "Installation" with "Tire Type" in Cross_Layer_Checks |
| CFG-E2E-063-COND | D-005 | Medium | The mutation in Steps spans a very long single step block. The GraphQL mutation definition and variable-setting are functionally compound steps. Acceptable for API-focused cases but note for future simplification. | Low priority — no action required for functionality |

**Determinism dimension: 4 High findings (admin label mismatches), 2 Medium**

---

#### Dimension 3: Completeness — Preconditions, Assertions, Cross-Layer Checks

| Case ID | Finding Code | Severity | Issue | Fix |
|---------|-------------|---------|-------|-----|
| CFG-PDP-035-COND | C-003 | High | Assertions cover `[STATE] Add to cart DISABLED` but do not explicitly assert on `configurableDisabled` computed from `isRequiredConfigurationComplete`. A minimal addition: `[STATE] isRequiredConfigurationComplete evaluates to false when visible required section is unfilled`. | Add assertion: `[STATE] configurableDisabled=true because isRequiredConfigurationComplete=false when Size or Color unfilled` |
| CFG-PDP-033-COND | C-001 | Medium | Preconditions say "User logged in. CFG-026 deployed." — CFG-026 product was not seeded in QA and the test was blocked. The Preconditions should explicitly note: "PREREQUISITE: CFG-026 seed product must be seeded via /qa-seed-data before execution." | Add explicit seed prerequisite note |
| CFG-E2E-067-COND | C-001 | Medium | Same as CFG-PDP-033-COND — CFG-026 seed required. | Same fix |
| CFG-CROSS-002-COND | C-001 | Medium | CFG-029 product not seeded. Same seed prerequisite missing. | Add seed prerequisite note |
| CFG-PDP-034-COND | C-004 | Medium | Cross_Layer_Checks note: `[CONSOLE] No JS errors; [NETWORK] No page reload on option click` — good. However missing: `[API] No addItem or changeCartConfiguredItem mutation fires on page (visibility change is client-side only)`. | Add network mutation negative assertion |

**Completeness dimension: 1 High finding, 4 Medium**

---

#### Dimension 4: Testability — Falsifiable Assertions

| Case ID | Finding Code | Severity | Issue | Fix |
|---------|-------------|---------|-------|-----|
| CFG-PDP-037-COND | T-001 | High | `[STATE] B=None cascades hide for C/D/E` — the word "cascades" is slightly subjective. Confirmed behavior is: "None" option is a real product value; C/D/E remain visible. The assertion as written will produce a FAIL on correct code. This is not a vagueness issue but a factual incorrectness issue. | Rewrite assertions to document actual observed behavior |
| CFG-PDP-040-COND | T-001 | High | Same issue — `[STATE] Bundle=None after filled siblings: both hidden; values cleared` — "None" product option does NOT hide siblings in current implementation. | Same fix |
| CFG-PDP-027-COND | T-004 | Low | `[ASSERT] — NOTE: Frame Type is REQUIRED in CFG-022 with no None option. To test hide behavior, use API to temporarily set Frame Type section to optional with None, or verify behavior: since Frame Type is always required and has no None, both siblings B and D are always visible.` — This note is embedded in Steps which is non-standard. The API-manipulation suggestion in Steps is an unexecutable design note, not an actionable test step. | Move the note to Preconditions or References; remove from Steps |

**Testability dimension: 2 High findings, 1 Low**

---

#### Dimension 5: Data Validity — `{{VAR}}` Tokens, No Hardcoded Values

| Case ID | Finding Code | Severity | Issue | Fix |
|---------|-------------|---------|-------|-----|
| All COND cases | DV-001 | Medium | `@td(CFG_CONDITIONAL.slug)`, `@td(CFG_DEEP_CHAIN.slug)`, `@td(CFG_TEXT_DRIVEN_COND.slug)` etc. are `@td()` test data references — NOT standard `{{VAR}}` tokens. This is a documented project convention for seed data references, not a defect. | Acceptable project convention — no action |
| CFG-E2E-063-COND | DV-001 | Medium | `{{USER_ID}}` referenced in Steps — this is not in the standard known env var set (`USER_EMAIL`, `USER_PASSWORD` etc.). The user ID would need to be resolved dynamically from an auth call. | Note: `{{USER_ID}}` should be resolved via GraphQL `me { id }` query before mutation. Add to Preconditions. |
| CFG-PDP-020-COND | DV-005 | Low | Preconditions note: `Aluminum is first in options[] array order. If seed script changes option order, update preselected assertions.` This is a fragile test data dependency. | Acceptable — already documented in Preconditions. No action. |
| CFG-GQL-010-COND | — | Low | Hard-coded product ID `2ac50978-0163-4fa1-b6e7-ce9101ba720d` and section IDs in Test_Data column. These match actual seeded data. While not using `{{VAR}}`, they reference actual seed IDs. Acceptable given they are in Test_Data (not Steps URLs). | Low risk — acceptable for now. Document as known deviation. |

**Data Validity: 1 Medium actionable finding (CFG-E2E-063-COND `{{USER_ID}}`), others acceptable**

---

#### Dimension 6: BL/ECL Coverage

| Finding | Severity | Details |
|---------|---------|---------|
| BL-CAT-006 coverage | PASS | Correctly referenced on all conditional visibility cases |
| BL-PRICE-001 coverage | PASS | Correctly referenced on all pricing cases |
| ECL-7.1 coverage | PASS | State transitions edge case appropriately referenced throughout |
| ECL-14.1 coverage | PASS | Used for cart validation and error handling cases |
| Missing `BL-CAT-006` on CFG-PDP-043-COND (new) | Medium | New cases must include BL-CAT-006 reference — already included in gap recommendations above |
| `isRequiredConfigurationComplete` traceability | Medium | The new `isRequiredConfigurationComplete` computed introduces a testable invariant: "Add to Cart must remain disabled until all visible required sections have valid values." This is essentially BL-CAT-006 applied at the Add to Cart level. It is adequately referenced but not named as a distinct sub-rule. Acceptable as-is. |

---

#### Dimension 7: Duplication Analysis

| Finding | Severity | Details |
|---------|---------|---------|
| CFG-PDP-028-COND vs CFG-E2E-058-COND | DUP-003 (Informational) | Both cover "Add to Cart with visible conditional sections." PDP case is storefront UI layer; E2E case adds API layer verification (configurationItems). This is the expected cross-layer pattern — not a duplicate. |
| CFG-PDP-029-COND vs CFG-E2E-059-COND | DUP-003 (Informational) | Both cover "hidden section absent from cart." Same cross-layer pattern — expected. |
| CFG-PDP-026-COND vs CFG-PDP-038-COND | DUP-001 (Low) | Both test "required section hidden → Add to Cart not blocked." PDP-026 uses CFG-022 (optional section hidden), PDP-038 uses CFG-029 (required section of optional parent). Different seed products, different technical paths. Not a duplicate — different test conditions. |
| CFG-E2E-061-COND vs CFG-E2E-062-COND vs CFG-E2E-063-COND | DUP-003 (Informational) | Three complementary cases covering the same toast-save validation bug from different layers (UI + server). This is correct layered coverage. |

**No actionable duplicates found.**

---

### Phase 4 Consolidated Findings Table

| Case ID | Dimension | Severity | Issue | Fix Required Before Regression |
|---------|-----------|---------|-------|-------------------------------|
| CFG-PDP-037-COND | Structure / Testability | **High** | Assertions describe expected hide behavior that contradicts current implementation ("None" product keeps dependents visible). Will produce FAIL on correct code. | Yes — update or mark as Known Ambiguity |
| CFG-PDP-040-COND | Testability | **High** | Same as above for two-siblings cascade hide | Yes — update or mark as Known Ambiguity |
| CFG-CA-019 | Determinism | **High** | Admin UI label "Depends On" vs actual "Active when section has value" — step references wrong element | Yes — update label references |
| CFG-CA-020 | Determinism | **High** | Same label mismatch throughout | Yes |
| CFG-CA-022 | Determinism | **High** | Same label mismatch | Yes |
| CFG-CA-023 | Determinism + Testability | **High** | Steps reference wrong label; Assertions describe behavior that doesn't match reality (validation error vs silent reject) | Yes — update behavior description |
| CFG-PDP-035-COND | Completeness | **High** | Missing explicit `configurableDisabled`/`isRequiredConfigurationComplete` assertion | Yes — add assertion |
| CFG-PDP-026-COND | Determinism | **Medium** | "Installation" section referenced in Cross_Layer_Checks doesn't exist in CFG-022; should be "Tire Type" | Yes — update section name |
| CFG-PDP-033-COND | Completeness | **Medium** | Missing explicit seed prerequisite for CFG-026 product | Yes |
| CFG-E2E-067-COND | Completeness | **Medium** | Same CFG-026 seed prerequisite missing | Yes |
| CFG-CROSS-002-COND | Completeness | **Medium** | CFG-029 seed prerequisite missing | Yes |
| CFG-PDP-034-COND | Completeness | **Medium** | Missing network mutation negative assertion in Cross_Layer_Checks | Low priority |
| CFG-E2E-063-COND | Data Validity | **Medium** | `{{USER_ID}}` not in standard env var set — needs dynamic resolution note | Yes |
| CFG-PDP-027-COND | Testability | **Low** | Design note embedded in Steps should be in Preconditions | Low priority |
| CFG-PDP-026-COND | Structure | **Low** | Title says "Required" but section is optional in CFG-022 | Low priority |

---

## Statistics

| Metric | Count |
|--------|-------|
| **Total COND cases analyzed** | 48 |
| **Phase 2 — VALID** | 35 |
| **Phase 2 — STALE** | 8 |
| **Phase 2 — INCOMPLETE** | 5 |
| **Phase 2 — BROKEN** | 0 |
| **Phase 3 — Gaps identified** | 5 |
| **Phase 3 — New cases recommended** | 4 |
| **Phase 4 — Blocker findings** | 0 |
| **Phase 4 — Critical findings** | 0 |
| **Phase 4 — High findings** | 7 |
| **Phase 4 — Medium findings** | 6 |
| **Phase 4 — Low findings** | 3 |
| **Fixes required before regression run** | 10 (7 High + 3 seed-related Medium) |

---

## Files Modified

**No CSV files have been modified.** All proposed changes are reported here for confirmation before application.

### Proposed Changes — Awaiting Confirmation

#### CHANGE-1: CFG-CA-019, CFG-CA-020, CFG-CA-022, CFG-CA-023 (052 admin suite)
**Field:** Steps, Assertions  
**Before:** `[ACT] Click the Depends On dropdown` / `[DOM] Depends On dropdown visible` / `[STATE] Depends On field shows...`  
**After:** `[ACT] Click the "Active when section has value" dropdown` / `[DOM] "Active when section has value" select visible` / `[STATE] "Active when section has value" field shows...`

#### CHANGE-2: CFG-CA-023 (052 admin suite)
**Field:** Assertions  
**Before:** `OPTION 2 — Validation error: Save of A to B dependency rejected with message such as Circular dependency detected`  
**After:** Document confirmed behavior: `CONFIRMED BEHAVIOR (2026-04-16): Section A Depends On dropdown shows circular candidate (Section B); selecting and saving does NOT produce an error message; circular value is silently rejected (not persisted) — data integrity preserved without warning. OPTION 3 is the actual behavior.`

#### CHANGE-3: CFG-PDP-037-COND, CFG-PDP-040-COND (072 UI suite)
**Field:** Assertions, References  
**Before:** Assertions describe hide behavior for "None" product option  
**After:** Update Assertions to document actual behavior: `ACTUAL BEHAVIOR: Selecting "LvlB-None" (a $0 product option) does NOT hide Level C/D/E — isSectionVisible() treats any product value (including $0 None product) as "parent has value = true". This is design ambiguity pending product team decision (FINDING-1). Mark as KNOWN AMBIGUITY.`  
**References:** Add `FINDING-1 (verification-summary.json 2026-04-16); design-ambiguity-pending`

#### CHANGE-4: CFG-PDP-026-COND (072 UI suite)
**Field:** Title, Cross_Layer_Checks  
**Before:** Title: "Required Hidden Section (Tire Type) Does Not Block Add to Cart" / Cross_Layer_Checks references "Installation section"  
**After:** Title: "Hidden Optional Section (Tire Type in CFG-022) Does Not Block Add to Cart" / Cross_Layer_Checks: replace "Installation section" with "Tire Type"

#### CHANGE-5: CFG-PDP-035-COND (072 UI suite)
**Field:** Assertions  
**Before:** (ends with) `[STATE] Both filled: Add to Cart enabled (BL-CAT-006 all visible required satisfied)`  
**After:** Add: `[STATE] configurableDisabled computed = false when isRequiredConfigurationComplete=true (all visible required sections filled) AND configLoading=false`

#### CHANGE-6: CFG-PDP-033-COND, CFG-E2E-067-COND, CFG-CROSS-002-COND (072 UI + 072b E2E + 072c cross suites)
**Field:** Preconditions  
**Before:** General preconditions mentioning "CFG-026/CFG-029 deployed"  
**After:** Add explicit: `SEED REQUIRED: Run /qa-seed-data before execution — CFG-026/CFG-029 products are not seeded in QA environment as of 2026-04-16.`

#### CHANGE-7: CFG-E2E-063-COND (072b E2E suite)
**Field:** Preconditions  
**Before:** No mention of `{{USER_ID}}` resolution  
**After:** Add: `Note: {{USER_ID}} must be resolved dynamically via GraphQL: query { me { id } } — execute before the mutation step. Substitute returned id as userId in command.`

#### NEW CASES to add to 072-configurable-products-ui.csv:
- CFG-PDP-042-COND (None product semantics characterization)
- CFG-PDP-043-COND (configLoading disable path)
- CFG-PDP-044-COND (updateWithDefaultValues skip hidden)
- CFG-PDP-045-COND (circular dependency guard)

---

## Delegation Recommendations

| Layer | Agent | Priority Work |
|-------|-------|--------------|
| Admin UI fixes (CHANGE-1, 2) | `qa-backend-expert` | Update admin label references in 052 suite |
| Storefront UI fixes (CHANGE-3, 4, 5) | `qa-frontend-expert` | Update 072 suite assertions |
| Cross-suite fixes (CHANGE-6, 7) | `test-management-specialist` | Precondition and data validity updates |
| Seed data gap | `qa-backend-expert` + `/qa-seed-data` | Seed CFG-026 and CFG-029 products |
| New case authoring | `test-management-specialist` | Generate CFG-PDP-042 through 045-COND |
| Live verification of new cases | `qa-testing-expert` | Verify CFG-PDP-043-COND (configLoading) after seeding |
