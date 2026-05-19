# BL Proposals — TLC-2026-05-19-VCST4205

Run ID: TLC-2026-05-19-VCST4205
Date: 2026-05-19
Source: VCST-4205 execution + anomaly analysis
Status: PROPOSED — awaiting qa-lead-orchestrator approval before promotion to business-logic.md

---

## Staleness Review: Existing Invariants

### BL-CART-007 — STALE (partial coverage gap)

Current text (abbreviated):
> "Adding the same SKU to the cart a second time increments the existing line item's quantity... Exception: different product configurations (variants) create separate lines."

**Gap identified:** The exception clause says "different product configurations (variants)" — this language is ambiguous. It conflates two distinct mechanisms:
- **Variant selection** (e.g., picking Size=M vs Size=L on a regular product) — already creates separate lines
- **Configurable product configuration** (e.g., addItem with configurationSections payload) — ALWAYS creates a separate line, regardless of whether the configuration is identical to an existing line

CASE6 from VCST-4205 sprint CSV confirmed: addItem called twice on the same CFG_RING product with identical `configurationSections` payload (same text value) produces TWO distinct line items, each with quantity=1. The invariant's "exception" clause implies this requires "different" configurations — the actual rule is stricter: configurable products never consolidate, period.

**Proposed correction:** See PROPOSED-BL-CART-018 below; if approved, add a sub-bullet to BL-CART-007's exception clause:
> "Configurable products (those where addItem includes a configurationSections payload) ALWAYS produce a new line item regardless of configuration identity."

**Urgency:** Medium — CASE6 authoring mismatch was caused by this ambiguity.

---

### BL-CART-014 — VALID (no staleness)

Current text covers: (sectionId, type) as key for Text/File sections; option.productId required for Variation sections.

Post-VCST-4205 check: The backend execution (CASE1/2/3 PASS) confirms Text-section identification by sectionId+type is correct and exercised. Variation and File section types were not regressed in this sprint due to catalog shape-drift (only Product sections survived on CFG_HAT). The invariant text itself is accurate; coverage is incomplete but the rule is not stale.

**Action:** No edit needed. Coverage gap for Variation/File section types flagged as a separate test-generation task (see gap CFG-SFL-005 in Phase 3).

---

## New Invariant Proposals

---

### PROPOSED-BL-CART-015
**Domain:** Cart
**Trigger:** Anomaly A1 — SFL miniwidget price binding (Medium severity, frontend-execution-report.md)

**Proposed text:**
> BL-CART-015 — PROPOSED: The Save-for-Later cart sidebar miniwidget MUST display each item's lineItem.listPrice (the price at time of add, reflecting configurationItems value sum) — NOT the master product's base variant price. For a configurable product line item, listPrice is the configurable price (base + selected options) and will differ from the product's standalone price.salePrice or price.list fields. Asserting the base product price in the SFL miniwidget is a binding defect, not a display preference.

**Evidence:** frontend-execution-report.md Case 1 — SFL miniwidget shows $16 (base SKU price) for a Config A item whose lineItem.listPrice should be $33. Screenshot: case1-cart-with-3sfl.png vs case1-saved-for-later-page.png (correct $33/$30/$33 on the SFL page).
**Layer:** Storefront UI (SFL widget component)
**Priority:** Medium
**Related:** A1 defect; ECL-14.1; Anomaly A1 in VCST-4205 frontend report

---

### PROPOSED-BL-CART-016
**Domain:** Cart
**Trigger:** Anomaly A2 — SFL fragments missing configurationItems field (High severity, frontend-execution-report.md)

**Proposed text:**
> BL-CART-016 — PROPOSED: The GetSavedForLater / getSavedForLater GraphQL query and all associated fragment definitions MUST include configurationItems in the LineItemType selection set. Omitting configurationItems from SFL fragments causes the storefront to fall back to master product properties (e.g., Color: Emerald green, Size: S from the base variation) instead of displaying the user's actual configured values. This invariant applies to all query/fragment/widget layers that consume SFL data.

**Evidence:** frontend-execution-report.md Case 4 — wishlist-after-save-39.json shows no configurationItems selection in GetWishlist fragments. SFL page renders master variation properties instead of configured hat color/print. Backend CRL-GQL-092 field selection gap confirmed same root cause at GraphQL layer.
**Layer:** GraphQL (fragment definition); Storefront UI (SFL list page / wishlist widget)
**Priority:** High
**Related:** A2 defect; BL-CART-014 (section key identification); CRL-GQL-092 STALE sync

---

### PROPOSED-BL-CART-017
**Domain:** Cart
**Trigger:** Anomaly A3 — moveToSavedForLater/moveFromSavedForLater bulk behavior (High severity, frontend-execution-report.md)

**Proposed text:**
> BL-CART-017 — PROPOSED: moveToSavedForLater and moveFromSavedForLater mutations MUST honor the lineItemIds payload as a selective filter. When lineItemIds contains exactly one ID, only that line item MUST be moved; all other line items in the source cart MUST remain unchanged. Current observed behavior (VCST-4205 Case 1): passing lineItemIds=["one-id"] with two items in cart causes BOTH items to move — the mutation behaves as a bulk-all operation. This is a contract violation of the lineItemIds selective semantics.

**Evidence:** frontend-execution-report.md Anomaly A3 — case1-moveToSavedForLater-first-response.json shows payload lineItemIds: ["2b5a1921-…"] (one ID) but cart went from 2 items to 0 (both moved). The second moveToSavedForLater call also moved 0 items (already empty).
**Layer:** GraphQL xAPI (mutation contract); Backend service (XCart module)
**Priority:** High
**Related:** A3 defect; ECL-10.2; VCST-4205 Case 1 FAIL

---

### PROPOSED-BL-CART-018
**Domain:** Cart
**Trigger:** Anomaly A4 — Async cart-projection settle overwrites configurationItems (Critical severity, frontend-execution-report.md)

**Proposed text:**
> BL-CART-018 — PROPOSED [CRITICAL]: The cart-projection background job (async settle) MUST NOT overwrite configurationItems on existing line items during re-evaluation. After moveFromSavedForLater or any mutation that causes a background cart projection recalculation, the configurationItems payload as originally set by addItem MUST be preserved in the settled projection. Observed failure: the synchronous mutation response returns the correct configurationItems (e.g., [Green hat, P print]) but the subsequent cart-page render shows overwritten values (e.g., [Red hat, NY print] — first product variant values) for the same lineItemId. This indicates the background projection job re-evaluates configurationItems from the product default/first variant rather than preserving the user-submitted configuration payload.

**Evidence (Critical):** frontend-execution-report.md Anomaly A4 — Apollo cache extract shows LineItemType:f0287f34 configurationItems overwritten between mutation response and cart-page render. Case 2 FAIL: moveFromSavedForLater response correct → cart page DOM shows wrong configuration. Backend CASE1/2/3 PASS (synchronous GraphQL layer correct) confirms the race is in the async settle job, not the mutation handler itself.
**Layer:** Backend (cart-projection/settle job); Cross-layer (mutation correct, settled state wrong)
**Priority:** Critical — incorrect configuration displayed = wrong product delivered = revenue/quality risk
**Related:** A4 defect; BL-CART-014; BL-CART-010; VCST-4205 Case 2 FAIL; ECL-10.2

---

## Promotion Checklist (for qa-lead-orchestrator)

- [ ] Review PROPOSED-BL-CART-015 — approve/reject/modify wording
- [ ] Review PROPOSED-BL-CART-016 — approve/reject/modify wording
- [ ] Review PROPOSED-BL-CART-017 — approve/reject/modify wording
- [ ] PROPOSED-BL-CART-018 — HIGH PRIORITY: approve/reject/modify; consider P0 JIRA bug if not already filed
- [ ] BL-CART-007 staleness correction — approve the "configurable products never consolidate" sub-bullet addition
- [ ] After each approval: test-management-specialist updates business-logic.md body section ONLY (never the Invariant Coverage Summary table)

---

*This file is the only BL output for TLC-2026-05-19-VCST4205. Per feedback_minimize_reports: no intermediate analysis files produced.*
