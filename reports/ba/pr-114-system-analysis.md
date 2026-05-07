# PR #114 — System & Flow Analysis

**PR:** https://github.com/VirtoCommerce/vc-module-x-cart/pull/114
**Module:** `vc-module-x-cart` (xCart GraphQL layer)
**Author:** alexeyshibanov | **Created:** 2026-05-03 | **Status:** Open against `dev`
**Analyst:** ba-system-analyzer | **Date:** 2026-05-07
**Scope:** Pure backend GraphQL change. No vc-frontend changes in this PR. UI integration is forthcoming in a separate PR.

---

## 1. User Flow (Hypothesized)

The following sequence diagram describes the end-user flow that WILL become possible once vc-frontend wires up these mutations. This is a hypothesis based on the API shape and the analogous `changeCartItemSelected` family already implemented in the storefront cart.

```mermaid
sequenceDiagram
    actor User
    participant CartUI as Cart Page (/cart)
    participant xAPI as xCart GraphQL
    participant CartAgg as CartAggregate
    participant Container as ConfiguredLineItemContainer
    participant Pricing as UpdateConfiguredLineItemPrice

    User->>CartUI: Expand configured line item (e.g., "Configurable Hat")
    CartUI->>CartUI: Render configuration sections with current selectedForCheckout state
    Note over CartUI: Each section row shows a checkbox.<br/>Header row shows "Select all" toggle.

    alt Single section toggle
        User->>CartUI: Toggle checkbox for section "File Upload" (uncheck)
        CartUI->>xAPI: changeCartConfigurationItemSelected(lineItemId, configurationSection{sectionId, type}, selectedForCheckout: false)
        xAPI->>CartAgg: ChangeCartConfigurationItemSelectedAsync
        CartAgg->>CartAgg: FindConfigurationItem(sectionId, type, option?)
        CartAgg->>CartAgg: Flip selectedForCheckout = false
        CartAgg->>Container: UpdateConfiguredLineItemPrice(lineItem)
        Container->>Container: Sum only selected configItems into lineItem.listPrice
        Container-->>CartAgg: Updated listPrice
        CartAgg->>CartAgg: SaveAsync → RecalculateAsync (taxes, shipping, totals)
        xAPI-->>CartUI: Updated cart (items[].listPrice, total)
        CartUI->>User: File Upload section unchecked; line item price decreases; cart total recalculates
    end

    alt Select all sections for a line item
        User->>CartUI: Click "Select all" in section header
        CartUI->>xAPI: selectAllCartConfigurationItems(lineItemId)
        xAPI->>CartAgg: ChangeAllCartConfigurationItemsSelectedAsync (hardcoded true)
        CartAgg->>CartAgg: Flip ALL configItems.selectedForCheckout = true
        CartAgg->>Container: UpdateConfiguredLineItemPrice
        CartAgg->>CartAgg: SaveAsync → RecalculateAsync
        xAPI-->>CartUI: Updated cart
        CartUI->>User: All sections selected; line item price reflects all placements
    end

    alt Unselect all sections for a line item
        User->>CartUI: Click "Unselect all" in section header
        CartUI->>xAPI: unSelectAllCartConfigurationItems(lineItemId)
        xAPI->>CartAgg: ChangeAllCartConfigurationItemsSelectedAsync (hardcoded false)
        CartAgg->>CartAgg: Flip ALL configItems.selectedForCheckout = false
        CartAgg->>Container: UpdateConfiguredLineItemPrice (all deselected → listPrice shrinks)
        CartAgg->>CartAgg: SaveAsync → RecalculateAsync
        xAPI-->>CartUI: Updated cart
        CartUI->>User: All sections unchecked; line item price drops to zero or base price
    end

    alt Batch-toggle specific sections
        User->>CartUI: Multi-select checkboxes (e.g., File + Text sections)
        CartUI->>xAPI: selectCartConfigurationItems(lineItemId, configurationSections: [{sectionId:A, type:File}, {sectionId:B, type:Text}])
        xAPI->>CartAgg: ChangeCartConfigurationItemsSelectedAsync (hardcoded true)
        CartAgg->>CartAgg: For each key: FindConfigurationItem → flip selectedForCheckout
        Note over CartAgg: Unmatched keys silently no-op; matched items flip.
        CartAgg->>Container: UpdateConfiguredLineItemPrice (once, after all flips)
        CartAgg->>CartAgg: SaveAsync → RecalculateAsync
        xAPI-->>CartUI: Updated cart
        CartUI->>User: Selected sections reflect updated state; price recalculates once
    end
```

**Key invariant illustrated:** Every path that flips `selectedForCheckout` on a config item triggers `UpdateConfiguredLineItemPrice`, which re-sums only the selected placements into `lineItem.listPrice`. This is fundamentally different from toggling a lineItem's own `selectedForCheckout`, which does NOT reprice — it only affects whether that line rolls into the checkout total.

---

## 2. Storefront Placement Hypothesis

The following placement hypotheses are based on:
- The analogous `changeCartItemSelected` / `selectAllCartItems` UI pattern already present in the cart (line-item level checkboxes with "Select all" header)
- The new mutations' input shapes (one `lineItemId` scope per call; individual `configurationSection` key or batch `configurationSections[]`)
- The configurable line item expansion UI already existing in `/cart` for "Edit configuration"

This is a HYPOTHESIS. The actual vc-frontend implementation may differ.

### Placement A: Per-section checkbox (expanded configurable line item row on `/cart`)

| UI element | Mutation | Input notes |
|---|---|---|
| Individual section row checkbox (check) | `changeCartConfigurationItemSelected` | `selectedForCheckout: true`; `configurationSection: {sectionId, type, option?}` |
| Individual section row checkbox (uncheck) | `changeCartConfigurationItemSelected` | `selectedForCheckout: false` |
| Section header "Select all" button | `selectAllCartConfigurationItems` | No section list needed — operates on all |
| Section header "Unselect all" button | `unSelectAllCartConfigurationItems` | No section list needed |
| Bulk multi-select checkbox action "Include selected" | `selectCartConfigurationItems` | `configurationSections: [key1, key2, …]` — list of checked keys |
| Bulk multi-select checkbox action "Exclude selected" | `unSelectCartConfigurationItems` | `configurationSections: [key1, key2, …]` |

### Placement B: Mini-cart (cart sidebar / drawer)

The mini-cart may show configured line items in a collapsed view. It is less likely to expose per-section checkboxes due to space constraints, but may show the `lineItem.listPrice` (which will reflect selection state) and a "View cart" link to manage selections on `/cart`.

### Placement C: Checkout review step (`/checkout/review` — gated by `checkout_multistep_enabled`)

On the review step, the configured line item summary may show which sections are included/excluded. This would be read-only display (driven by the `selectedForCheckout` field on `configurationItems[]` in the cart query response) rather than a write surface.

### No placement on PDP (Customize flow)

The PDP configuration widget (`/products-with-options/configurations/…`) is a pre-cart stage. The `SelectedForCheckout` flag is a post-add-to-cart concept. The PDP widget uses `addConfigurationItems` / `updateConfigurationItems`, not the new selection mutations.

---

## 3. Pain Points Resolved (Existing)

### PP-R-001: Toggling selection required full item re-validation — Severity: High

**Today (before PR #114):** To flip `configItem.SelectedForCheckout` for a single placement, the frontend had no dedicated mutation. The only available path was `updateConfigurationItem`, which requires `productId` and `quantity` as NonNull inputs, re-runs the full item-level validation pipeline (product existence check, inventory check, pricing recalculation for the item), and sends the entire configuration item payload over the wire. This was operationally correct but semantically overloaded: a UI intent of "I want to exclude this section from the checkout price" triggered the same code path as "I want to change which product or quantity is in this section."

**After PR #114:** `changeCartConfigurationItemSelected` accepts only `(storeId, userId, lineItemId, configurationSection{sectionId, type, option?}, selectedForCheckout)`. No `productId`, no `quantity`. The selection intent is expressed precisely and the backend executes only the flag flip + reprice path without re-validating product existence or inventory for the unchanged items.

**Business value:** Reduced latency for selection toggle interactions. Reduced risk of spurious validation errors when `updateConfigurationItem` was misused for selection-only changes. Cleaner semantic contract between UI and API.

---

### PP-R-002: Bulk selection required N serial round trips — Severity: Medium

**Today:** To include or exclude multiple configuration sections in a single user interaction (e.g., a "Select all" click on a configured line item), the frontend had to enumerate each `ConfigurationItem` on the client, then fire one `updateConfigurationItem` call per section, sequentially or in a potentially race-prone parallel batch. Each call triggered its own distributed lock acquisition, cart re-hydration, persistence, and repricing. With a configured product having 4 sections (Product + Variation + Text + File), "Select all" required 4 round trips, 4 lock acquisitions, and 4 full reprice cycles.

**After PR #114:** `selectAllCartConfigurationItems` / `unSelectAllCartConfigurationItems` flip all configuration items in a single call under a single distributed lock, with a single post-flip `UpdateConfiguredLineItemPrice` call. `selectCartConfigurationItems` / `unSelectCartConfigurationItems` support a batch of specific section keys, again in a single round trip with a single reprice cycle.

**Business value:** N-to-1 round trip reduction for bulk operations. Single distributed lock reduces contention on multi-section configured products. Single reprice execution means intermediate pricing states never reach the client.

---

### PP-R-003: Client enumeration required for "Select all" / "Unselect all" — Severity: Medium

**Today:** Without `selectAllCartConfigurationItems`, the storefront had to first query the cart to obtain the full list of `configurationItems[]` on the target line item, extract each `(sectionId, type, option?)` key, and then drive the bulk toggle loop described in PP-R-002. This creates a temporal coupling: if the configuration item list changes between the query and the mutation calls (concurrent edit, TTL expiry), the client-held list can be stale.

**After PR #114:** `selectAllCartConfigurationItems` and `unSelectAllCartConfigurationItems` operate server-side on the authoritative list of configuration items at execution time. No client enumeration required. The `lineItemId` scope boundary means "all" is unambiguous: every configuration item belonging to that one configurable lineItem.

**Business value:** Eliminates the stale-list race condition. Simpler client implementation (no enumeration loop). Correct "select all" behavior even if configuration items are added or removed concurrently.

---

## 4. Pain Points / Risks Introduced (New)

### PP-N-001: Asymmetric repricing between lineItem selection and configItem selection — Severity: High

**Description:** The new mutations create a two-tier selection model in the cart that behaves asymmetrically:
- Toggling `lineItem.selectedForCheckout` (existing `changeCartItemSelected` family) does NOT reprice the lineItem's own `listPrice`. It only includes/excludes the line from the checkout total calculation. The line's `listPrice` stays the same regardless.
- Toggling `configItem.selectedForCheckout` (new PR #114 mutations) DOES change the parent lineItem's `listPrice` via `UpdateConfiguredLineItemPrice`, because the listPrice is dynamically computed as the sum of selected placements.

**Risk:** Any vc-frontend or downstream consumer that assumes "selection mutations only affect totals, not line prices" will render incorrect prices when a config-item selection is flipped. A storefront that reads `lineItem.listPrice` once (e.g., in a cached store state) and does not re-read after a config-item selection toggle will show a stale price.

**Recommendation:** The vc-frontend integration PR must always refresh `lineItem.listPrice` (and cart totals) from the mutation response, not from a cached pre-mutation snapshot. Document the asymmetry explicitly in the xAPI and vc-frontend integration comments. QA must include assertions that verify `listPrice` changes after config-item toggle but does NOT change after lineItem-level toggle.

---

### PP-N-002: Unmatched section key in batch silently no-ops — Severity: Medium

**Description:** Per the PR validation error contract: if `configurationSections[]` contains a `(sectionId, type, option?)` key that does not match any `ConfigurationItem` on the target lineItem, that key is silently skipped. Other matched items in the same batch call still flip. The entire mutation returns HTTP 200 with `errors[]` empty.

**Risk:** If the storefront sends a stale section key (e.g., after an admin removes a section from the product configuration, or after a section key changes between UI renders), the silent no-op masks the divergence. The UI will show the section as if its toggle succeeded, but the server never processed it. The frontend has no error signal to display. This is a deliberate design trade-off (batch operations should not abort entirely due to one unmatched item), but it creates a subtle correctness hazard.

**Specific scenarios where this surfaces:**
- Admin modifies the configured product's sections (adds/removes a section) while the user has the cart open in another tab. The cart page still renders the old section list. Toggling an old section key sends a no-op to the API.
- `sectionId` is case-sensitive or whitespace-sensitive in lookup. A client-side normalization discrepancy produces a permanently failing no-op with no observable error.

**Recommendation:** The vc-frontend should cross-reference the mutation response's `configurationItems[].selectedForCheckout` state against the pre-mutation intent to detect silent no-ops (i.e., did the flag actually flip for the section I intended?). Consider adding a verbose `warnings[]` or `noOpSections[]` field to the response in a future PR for observability.

---

### PP-N-003: Three mutation names for one conceptual intent creates awkward DX — Severity: Low

**Description:** The PR exposes three distinct mutation names for the "set selection state" concept:
- `changeCartConfigurationItemSelected` — takes explicit `Boolean selectedForCheckout`
- `selectCartConfigurationItems` — hardcodes `true` (via `GetRequest` override in the builder)
- `unSelectCartConfigurationItems` — hardcodes `false`

A vc-frontend component that needs to programmatically choose between select/unselect based on a computed boolean condition cannot use a single mutation with a variable. It must branch on the boolean and choose between two different mutation names. This is unlike `changeCartConfigurationItemSelected`, which accepts an explicit value, but `changeCartConfigurationItemSelected` only handles a single section at a time (not a batch).

There is no "batch with explicit boolean" mutation. The matrix is: single-item (explicit boolean) vs. batch-list (name-encoded boolean) vs. all-items (name-encoded boolean).

**Risk:** Minor friction in vc-frontend implementation. A developer writing a generic "toggle selection for these sections" helper must handle three code paths instead of one. Incorrect branch selection (calling `selectCartConfigurationItems` when the intent is `unSelectCartConfigurationItems`) produces incorrect results with no error signal.

**Observation (not blocking):** This design mirrors the existing lineItem selection family (`changeCartItemSelected` for single, `selectCartItems`/`unSelectCartItems` for multi-item, `selectAllCartItems`/`unSelectAllCartItems` for all). The asymmetry is a deliberate API consistency choice, not an error. Document it in the vc-frontend integration PR as a known gotcha.

---

## 5. Business Invariant Proposals (Drafts)

These are PROPOSED entries for the `BL-CART` domain. They must be reviewed and explicitly approved before promotion into `.claude/agents/knowledge/business-logic.md`. The analyst MUST NOT directly edit that file.

### PROPOSED-BL-CART-010: Configuration-item selection reprices the parent configurable lineItem `[P0-revenue]`

- **Rule:** When `selectedForCheckout` is flipped on a `ConfigurationItem` belonging to a configurable lineItem, the parent lineItem's `listPrice` MUST be recalculated immediately as the sum of all placements whose `selectedForCheckout = true`. The updated `listPrice` propagates into the cart subtotal, taxes (tax base recalculates), and shipping rates (if rate depends on declared value) via `SaveAsync → RecalculateAsync`. Deselecting a config item reduces the lineItem's `listPrice`; reselecting restores it.
- **Verify:**
  1. Obtain cart with a configurable lineItem that has N sections, all selected. Record `lineItem.listPrice` as `price_all_selected`.
  2. Call `changeCartConfigurationItemSelected` to deselect one section (e.g., the highest-priced placement). Read back `cart.items[id].listPrice`. Assert it is strictly less than `price_all_selected`.
  3. Assert `cart.subTotal.amount` decreases by the same delta.
  4. Assert `cart.taxTotal.amount` recalculates proportionally (not stale).
  5. Call `changeCartItemSelected` (lineItem-level toggle) on an unrelated simple lineItem. Assert its own `listPrice` is unchanged before and after.
- **Violation signal:** `lineItem.listPrice` remains equal to `price_all_selected` after deselecting a placement; cart subtotal does not change; tax total does not update; pricing appears frozen at pre-toggle value.
- **Agents:** `qa-backend-expert` (xAPI cart mutation response), `qa-frontend-expert` (UI totals on /cart after toggle)
- **Source:** PR #114 context briefing §Repricing semantics: "toggling `SelectedForCheckout` on a configuration item **changes the parent lineItem's `listPrice`**"; `ConfiguredLineItemContainer.UpdatePrice` filters on `selectedForCheckout` when summing placements.
- **Triggered by:** ba-analyze PR #114

---

### PROPOSED-BL-CART-011: Unmatched section key in batch selection is a silent no-op, not a hard error `[P1-data]`

- **Rule:** When `selectCartConfigurationItems` or `unSelectCartConfigurationItems` receives a `configurationSections[]` list where one or more keys do not match any `ConfigurationItem` on the target lineItem, those unmatched keys MUST be silently skipped. The mutation MUST still process all matched keys in the same call, MUST return HTTP 200, and MUST return `errors[]` as empty. The cart response reflects the state of matched items; unmatched keys leave no trace in the response. This is intentional: batch operations should not abort entirely due to a single stale or invalid section key.
- **Verify:**
  1. Obtain a configurable lineItem with 2 known sections (key A and key B).
  2. Call `selectCartConfigurationItems` with `configurationSections: [keyA, {sectionId: "does-not-exist", type: "Product"}]`.
  3. Assert response HTTP status is 200 and `errors[]` is empty.
  4. Assert `configurationItems[keyA].selectedForCheckout = true` (matched item flipped).
  5. Assert no extra error entry or warning appears in the response for the unmatched key.
- **Violation signal:** HTTP 4xx or `errors[]` non-empty due to unmatched section key; entire batch aborted and no items flipped; response contains a hard error for the unmatched key alone.
- **Agents:** `qa-backend-expert` (GraphQL mutation response; xAPI error contract)
- **Source:** PR #114 context briefing §Validation errors: "Section key (sectionId+type+option) does not match any config item on the lineItem → silent no-op (other matched items still flip; **unmatched section in batch list does NOT abort the whole batch**)"; unit tests in `CartAggregateTests` — "unmatched section no-op" test case.
- **Triggered by:** ba-analyze PR #114

---

### PROPOSED-BL-CART-012: All 5 selection mutations are scoped to exactly one lineItemId; "all" never crosses lineItem boundaries `[P1-data]`

- **Rule:** All five new selection mutations accept exactly one `lineItemId` in their input. `selectAllCartConfigurationItems` and `unSelectAllCartConfigurationItems` operate only on configuration items belonging to that one specified lineItem. No mutation may flip `selectedForCheckout` on configuration items belonging to other lineItems in the same cart — including other configurable lineItems. A cart with two configurable lineItems (L1 and L2) requires two separate mutation calls to affect both.
- **Verify:**
  1. Build a cart with two configurable lineItems (L1 and L2), each with at least one configuration item.
  2. Call `unSelectAllCartConfigurationItems` with `lineItemId = L1.id`.
  3. Assert all config items on L1 have `selectedForCheckout = false`.
  4. Assert all config items on L2 retain their original `selectedForCheckout` state (unchanged).
  5. Confirm `L2.listPrice` is unchanged.
- **Violation signal:** Config items on L2 are toggled when only L1's `lineItemId` was specified; `listPrice` of L2 changes after calling the mutation scoped to L1; "select all" crosses lineItem boundaries.
- **Agents:** `qa-backend-expert` (xAPI mutation response; multi-item cart scenarios)
- **Source:** PR #114 context briefing §Scoping: "All five mutations are scoped to one `LineItemId`"; "Gives the handler an exact reprice target — the parent configurable lineItem."
- **Triggered by:** ba-analyze PR #114

---

### PROPOSED-BL-CART-013: Repricing MUST NOT execute when no selectedForCheckout flag actually changes (no-change short-circuit) `[P1-data]`

- **Rule:** When a selection mutation is called but the resulting `selectedForCheckout` state for every affected configuration item is identical to the pre-mutation state (i.e., no flag actually changes), the `UpdateConfiguredLineItemPrice` pipeline MUST NOT be executed. The cart aggregate must detect the no-change condition before invoking the reprice path and short-circuit. This applies to idempotent re-sends of the same selection state and to `selectAllCartConfigurationItems` when all items are already selected (or `unSelectAllCartConfigurationItems` when already all unselected).
- **Verify:**
  1. Obtain a cart with a configurable lineItem where all config items already have `selectedForCheckout = true`.
  2. Call `selectAllCartConfigurationItems` for that lineItem.
  3. Observe no repricing side effects (cart totals unchanged, response time consistent with no-reprice path).
  4. Instrument (or inspect unit test coverage): confirm `UpdateConfiguredLineItemPrice` was not called in the no-change case.
  5. Call `changeCartConfigurationItemSelected` with the same `selectedForCheckout` value already set on the target item. Assert same short-circuit behavior.
- **Violation signal:** Repricing executes on no-change call (observable as unnecessary `RecalculateAsync` invocation in platform logs; performance regression in batch UIs that resend full state on every interaction).
- **Agents:** `qa-backend-expert` (platform logs, GraphQL response timing; unit test coverage in `CartAggregateTests`)
- **Source:** PR #114 context briefing §Key business behavior: "A no-change short-circuit prevents the heavy reprice path from running when no flag actually flips — relevant for batch UIs that resend the entire selection state on every interaction"; confirmed by unit tests: "no-change short-circuit" and "idempotency" test cases in `CartAggregateTests` (+300 lines, 13 new tests).
- **Triggered by:** ba-analyze PR #114

---

### PROPOSED-BL-CART-014: ConfigurationSectionKeyInput — (sectionId, type) is sufficient for Text/File; Variation requires option.productId `[P1-data]`

- **Rule:** When identifying a `ConfigurationItem` for selection mutations, the `(sectionId, type)` pair alone is sufficient to uniquely locate a Text or File section within a lineItem's configuration. For Product sections, `(sectionId, type)` is also sufficient (one product option per section). For Variation sections, `option.productId` is mandatory because multiple variation options of the same section can coexist on a lineItem (each with a different `productId`). Omitting `option` for a Variation-type section MUST result in a lookup failure (the item is not found; the key is treated as unmatched per BL-CART-011).
- **Verify:**
  1. For a configurable lineItem with a Variation section: call `changeCartConfigurationItemSelected` with `{sectionId: varSectionId, type: "Variation"}` and NO `option` field. Assert the item is NOT found (silent no-op, per BL-CART-011) — the flag does NOT flip.
  2. Repeat with `{sectionId: varSectionId, type: "Variation", option: {productId: "valid-variation-id"}}`. Assert the flag flips correctly.
  3. For a Text section: call with `{sectionId: textSectionId, type: "Text"}` and NO `option`. Assert the flag flips (lookup succeeds without `option`).
  4. For a File section: same as Text — `option` absent, lookup succeeds.
- **Violation signal:** Text or File section selection fails without `option` field (overly strict validation); Variation section selection succeeds with missing `option` (ambiguous lookup); wrong config item toggled when `option` is absent on a Variation section.
- **Agents:** `qa-backend-expert` (GraphQL mutation; lookup contract for each section type)
- **Source:** PR #114 context briefing §Identification: "For `Text` and `File` sections, the `(sectionId, type)` pair alone is unique within a line item. For `Product`, `productId` resolves the option. For `Variation`, `option.productId` is mandatory because multiple variations of the same configurable section can coexist."; `ConfigurationSectionKeyInput.cs` (new file); `ConfigurableProductOptionKeyInput.cs` (new file).
- **Triggered by:** ba-analyze PR #114

---

### Stale Candidates

No existing `BL-CART-001` through `BL-CART-009` entries are invalidated by PR #114. The new mutations introduce a new behavioral dimension (config-item-level selection and repricing) that has no overlap with the existing invariants, which address: max quantity, out-of-stock, coupons, currency switching, org isolation, pack size, deduplication, persistence, and coupon sequencing. None of those rules become inaccurate as a result of this PR.

---

## 6. Suite Mapping

| Suite ID | Name | Rationale | New Cases Needed | Priority |
|---|---|---|---|---|
| `050i` | GraphQL Configurable Products | This is the canonical runner-native GraphQL suite for xAPI configuration mutations (gold-standard format). All 5 new mutations must be covered here with happy-path, no-change short-circuit, unmatched-key no-op, lineItem scoping, and error-path cases. Runner-native execution means no browser pool slot consumed. | Yes — high volume: ~12-15 new runner-native cases | P0 |
| `072b` | Configurable Products E2E | Once vc-frontend lands, the E2E suite covers the full add-to-cart → configure → cart → selection toggle → checkout flow. New cases: verify price drops on section deselect in cart; verify "Select all" / "Unselect all" header toggles; verify section checkboxes reflect correct `selectedForCheckout` state from cart query response. | Yes — after vc-frontend PR lands | P1 |
| `072` | Configurable Products UI | Cart page UI for configurable line item section checkboxes — rendering, interaction, disabled states. Covers the per-section checkbox placement hypothesis. | Yes — after vc-frontend PR lands | P1 |
| `028` | Cart Core | Cart-level repricing regressions: verify existing cart repricing flows are not broken by the new `UpdateConfiguredLineItemPrice` call pathway. Smoke-level check: add a configurable product to cart, verify its `listPrice` is non-zero, verify deselecting all config items reduces it. | Yes — 2-3 smoke cases | P1 |
| `052` | Configurable Products Admin | Admin-side: verify configured products with sections that have been toggled in the storefront still display correctly in Admin order detail (correct placements, correct prices for what was actually selected). | Conditional — after order placement with selected/deselected items | P2 |
| `072c` | Configurable Products Cross-Cutting | GraphQL response cross-layer checks: verify `configurationItems[].selectedForCheckout` field is returned in the `cart` query response (schema coverage), verify the field is correctly serialized. | Yes — 1-2 schema field presence checks | P2 |

---

## 7. Open Questions for Engineering

The following are genuine ambiguities not resolved by the PR context briefing or the PR diff description. Questions about behavior that is clearly specified in the PR are intentionally excluded.

### Q1: What is the initial value of `selectedForCheckout` when a configuration item is first added to the cart?

The PR covers toggling existing configuration items but does not document what `selectedForCheckout` defaults to when `addConfigurationItems` / `createConfiguredLineItem` creates a new config item. If the default is `true` (all sections included by default), the first selection mutation is an opt-out. If the default is `false`, the UX requires an explicit opt-in per section before checkout. This determines the initial state the frontend renders and whether "Select all" is needed on first cart view.

**Why it matters for QA:** Test preconditions in 050i cases depend on the initial state. If default is `false`, a test verifying "deselect reduces price" must first call `selectAllCartConfigurationItems` as a setup step.

---

### Q2: Does the `cart` query response already return `configurationItems[].selectedForCheckout` as a queryable field?

The PR adds the server-side logic to flip the flag, but the 050i gold-standard suite (existing cases CFG-GQL-001 through CFG-GQL-032) was authored before this PR. The context briefing shows the mutation response includes `configurationItems { id selectedForCheckout }` in the reviewer integration test. However, it is not confirmed whether the `cart` query's `LineItemType.configurationItems[]` return type already exposes `selectedForCheckout` as a readable field in the existing GraphQL schema, or whether that field was added in this PR.

**Why it matters for QA:** If `selectedForCheckout` is not yet readable via the `cart` query, assertion steps in runner-native cases (GQL-CAPTURE of the pre-mutation state, and DATA assertions post-mutation) cannot use `data.cart.items[...].configurationItems[...].selectedForCheckout`.

---

### Q3: Is there a store-level or product-level feature flag controlling whether section-level selection is exposed in the cart?

The `$cfg.*` feature flag inventory in `storefront-config-flags.md` covers the existing `changeCartItemSelected` family (lineItem-level). It is unclear whether the new config-item selection feature will be gated by a separate `$cfg.configurable_item_selection_enabled` flag or will be always-on for configurable products. If a flag governs it, the vc-frontend integration must handle the disabled state (sections shown as non-interactive).

---

### Q4: How does `UpdateConfiguredLineItemPrice` behave when ALL configuration items are deselected?

The briefing states that `listPrice` is the sum of selected placements. If all placements are deselected, the sum is zero. Does the lineItem's `listPrice` become $0.00, or does a base product price (the configurable product itself, before any placements) act as a floor? If the price goes to $0, the user could proceed to checkout with a $0 configured product, which may be an unintended revenue leak.

---

### Q5: Are the 5 new mutations registered under the same authorization policy as `updateConfigurationItem`?

The briefing confirms all five inherit `CartCommandBuilder` and use the cart-policy authorization service. However, it does not specify whether the cart policy allows guest (anonymous) callers or requires an authenticated user. The existing `addConfigurationItems` / `updateConfigurationItems` may have different auth requirements. If guest users can add configured products to cart (which the sitemap confirms is the case — guest carts exist and merge on sign-in), they should also be able to toggle section selection. This must be confirmed with Engineering.
