# Business Logic Proposals — BA-2026-04-29

> **These are drafts. They are NOT applied to `.claude/agents/knowledge/business-logic.md`.**
> Promotion requires **explicit user approval per proposal**. Review, edit as needed,
> approve individual entries, assign final `BL-*` IDs, then direct Claude to promote
> only the approved entries. Claude will never modify `business-logic.md` on its own.
>
> Source: `/ba-analyze bobis google map with pagination` run on 2026-04-29.
> Story content pushed to VCST-4646 — see ticket description, acceptance criteria, and BA-analysis comment.
> Live evidence: `tests/Sprint-current/VCST-4707/evidence/ba-analyze/`.

---

## New Invariants Proposed

### PROPOSED-BL-BOPIS-009: `totalCount` does not include the `IncludeLocationIds` prepend `[P1-data]`

- **Rule:** When the `cartPickupLocations` xAPI prepends a confirmed-cart pickup location at `items[0]` (per BL-BOPIS-008 / PR vc-module-x-pickup#8), the prepended item is NOT counted in `totalCount`. `totalCount` reflects the natural keyword/facet/filter match count only. Storefront pagination math must use `pageInfo.hasNextPage` rather than `loadedCount < totalCount`, otherwise the loop terminates one item early when a prepend has happened. On a no-match keyword with a confirmed location, `totalCount = 0` but `items.length = 1`.
- **Verify:**
  - Set `cart.Shipments.PickupLocationId` to a location that does not match `keyword: "xyzzy-no-match-zzzzzzz"`.
  - Query `cartPickupLocations(first: 50, keyword: "xyzzy-no-match-zzzzzzz")` — assert `totalCount = 0` (zero natural matches).
  - Assert `items.length = 1` (the prepended confirmed location only).
  - Assert `items[0].id` equals the confirmed location ID.
  - Assert `pageInfo.hasNextPage = false` despite `items.length > 0`.
  - Query `cartPickupLocations(first: 1)` with no keyword against 102 total locations — assert `totalCount = 102` AND `items.length = 2` (1 prepended + 1 natural first).
- **Violation signal:** `totalCount` includes the prepended location count (e.g., shows 1 instead of 0 on no-match keyword); storefront pagination shows wrong page count; `items.length < totalCount` on no-match queries; infinite loop in storefront pagination logic when expecting `items.length == min(first, totalCount)`.
- **Agents:** qa-backend-expert
- **Source:** GitHub `VirtoCommerce/vc-module-x-pickup` `ProductPickupLocationService.cs` — `InsertRange(0, missingLocations)` runs after `ApplyPaging`, `result.TotalCount` is not incremented. Backend verification report `tests/Sprint-current/VCST-4707/verification-report-backend.md` blocks B1/B2 confirm `totalCount = 0` and `items.length = 1` for the no-match keyword case.
- **Triggered by:** `/ba-analyze bobis google map with pagination` — `api-schema-pickup.json` `pr8_diff_summary.pagination_interaction` annotation.

---

### PROPOSED-BL-BOPIS-010: `cartPickupLocations` requires `cultureName!`; `pickupLocations` rejects it `[P1-data]`

- **Rule:** The `cartPickupLocations` query has `cultureName` as a required argument (non-nullable `String!`). The `pickupLocations` query does NOT accept `cultureName` at all — passing it produces a schema validation error. Test cases and storefront code must never conflate the two queries. `cartPickupLocations` also returns facet fields (`term_facets`, `range_facets`, `filter_facets`) and supports the `facet` and `filter` arguments; `pickupLocations` does not. The `IncludeLocationIds` prepend semantic applies exclusively to `cartPickupLocations`.
- **Verify:**
  - Introspect schema: `cartPickupLocations.args` MUST include `cultureName: String!` (non-null).
  - Introspect schema: `pickupLocations.args` MUST NOT include `cultureName`.
  - Send `cartPickupLocations` without `cultureName` — expect schema validation error (required argument missing).
  - Send `pickupLocations` with `cultureName` argument — expect schema validation error (unknown argument).
  - Confirm `cartPickupLocations` response includes `term_facets`, `range_facets`, `filter_facets` fields.
  - Confirm `pickupLocations` response does NOT include facet fields.
- **Violation signal:** `cartPickupLocations` accepts `cultureName=null` without error; `pickupLocations` silently ignores `cultureName`; facet fields absent from `cartPickupLocations`; `IncludeLocationIds` prepend observed in `pickupLocations` response.
- **Agents:** qa-backend-expert
- **Source:** Live introspection captured in `tests/Sprint-current/VCST-4707/evidence/ba-analyze/api-schema-pickup.json` — query signatures `cartPickupLocations(cultureName: String!)` vs `pickupLocations(storeId: String)`. Backend verification report B3 block confirms `IncludeLocationIds` does NOT leak into `pickupLocations`.
- **Triggered by:** `/ba-analyze bobis google map with pagination` — `api-schema-pickup.json` queries section.

---

### PROPOSED-BL-BOPIS-011: BOPIS store-selector Enter key must submit search, not activate adjacent UI elements `[P2-ux]`

- **Rule:** In the BOPIS store-selector modal (`select-address-map-modal.vue`), pressing Enter on the keyword search input MUST submit the search query. It MUST NOT activate any adjacent interactive element (e.g., facet dropdown triggers). The search result must be equivalent to clicking the magnifier icon button. This is required for keyboard accessibility (WCAG 2.1 SC 4.1.2 / 2.1.1) and consistent with standard search-input behavior.
- **Verify:**
  - Open BOPIS store-selector modal on desktop.
  - Type a keyword in the search input.
  - Press Enter — assert the list updates to show matching locations (same result as clicking the magnifier).
  - Assert that no facet dropdown opens after pressing Enter.
  - Assert that the search input retains focus after Enter submission.
- **Violation signal:** Pressing Enter on the search input opens a facet dropdown; list does not update after pressing Enter; search requires explicit mouse click on magnifier icon; facet dropdown state changes on Enter in search field.
- **Agents:** qa-frontend-expert
- **Source:** UI observation — screenshot `tests/Sprint-current/VCST-4707/evidence/ba-analyze/05-search-zacharyside.png` shows COUNTRY facet dropdown open after Enter keypress in search input. Verified reproducible during BA analysis session 2026-04-29.
- **Triggered by:** `/ba-analyze bobis google map with pagination` — pain point: keyboard search submission broken.

---

### PROPOSED-BL-BOPIS-012: Pickup-location selection persists in cart with full payload, no silent state corruption `[P0-revenue]`

- **Rule:** When a customer selects a pickup location in the BOPIS store-selector modal and clicks "Choose"/"PICK UP HERE", the selection MUST be persisted to the cart shipment via `addOrUpdateCartShipment` with the full canonical BOPIS payload: `shipmentMethodCode='BuyOnlinePickupInStore'`, `shipmentMethodOption='Pickup'`, `pickupLocationId`, `price=0`, `currency='USD'`. The cart UI MUST reflect the new confirmed location name after modal close. If the mutation fails (e.g., `JSON_READER` due to incomplete payload), the cart MUST remain in its previous state — it MUST NOT silently show an incorrect location, nor null out an existing confirmed location.
- **Verify:**
  - Open BOPIS store-selector modal — current confirmed location = Location A.
  - Select a different location (Location B) and click Choose.
  - Inspect network: `addOrUpdateCartShipment` mutation payload MUST include `shipmentMethodCode`, `shipmentMethodOption`, `price`.
  - Assert cart UI shows Location B name in the shipping details section after modal closes.
  - Query `cart.shipments[0].pickupLocation.id` via xAPI — MUST equal Location B's ID.
  - Simulate payload without `shipmentMethodCode` — assert the mutation returns an error AND the cart still shows Location A (no silent state corruption).
- **Violation signal:** Modal closes showing Location B in UI but `cart.shipments` still references Location A; `addOrUpdateCartShipment` called with `{ shipment: { pickupLocationId } }` only (missing method code) causing `JSON_READER`; cart shows success but mutation actually failed; Location A overwritten with null/empty on mutation error.
- **Agents:** qa-frontend-expert, qa-backend-expert
- **Source:** UI observation and `addOrUpdateCartShipment` schema analysis — `tests/Sprint-current/VCST-4707/evidence/ba-analyze/api-schema-pickup.json` `mutations.addOrUpdateCartShipment` `note_on_OptionalString`. Verification report `tests/Sprint-current/VCST-4707/verification-report-backend.md` Test Setup block documents `JSON_READER` failure with incomplete payload, and correct success with full payload.
- **Triggered by:** `/ba-analyze bobis google map with pagination` — pain point: `addOrUpdateCartShipment` write-side incomplete payload.

---

### PROPOSED-BL-BOPIS-013: BOPIS store-selector map remains visible at full panel width across all search/filter states on desktop `[P2-ux]`

- **Rule:** On desktop viewport (≥ 768 px), the Google Map panel in `select-address-map-desktop.vue` MUST maintain its configured width at all times: default state, keyword search (including zero-results), facet filter active, and while the info-card overlay is visible. The map panel MUST NEVER collapse, shrink, or hide based on search result count, info-card visibility, or facet selection. This generalises BL-BOPIS-007 (no-results collapse) to cover all modal states including info-card-open, facet-active, and paging transitions.
- **Verify:**
  - Measure map panel width in default modal state via `getBoundingClientRect()` — record as baseline.
  - Type a keyword matching 1 result — measure map panel width — MUST equal baseline.
  - Type a no-match keyword (e.g. `xyzabc123notastore`) — measure map panel width — MUST equal baseline (BL-BOPIS-007 covered separately).
  - Select a location to open the info-card overlay — measure map panel width — MUST equal baseline.
  - Activate a COUNTRY facet filter — measure map panel width — MUST equal baseline.
  - Assert map panel width is ≥ 40% of total modal width in all above states.
- **Violation signal:** Map panel shrinks when info card is visible; map panel width changes when facet is selected; map panel width different with 1 result vs 50 results; map collapses on keyword filter even when results exist.
- **Agents:** qa-frontend-expert, ui-ux-expert
- **Source:** UI observation — screenshots `tests/Sprint-current/VCST-4707/evidence/ba-analyze/08-search-zacharyside-result.png` (keyword match, map visible at full width), `09-search-no-match.png` (no-match keyword, map still visible). BL-BOPIS-007 already covers no-results case; this invariant generalises it.
- **Triggered by:** `/ba-analyze bobis google map with pagination` — extends BL-BOPIS-007 to cover info-card and facet states.

---

## Stale BL-* Flagged

### BL-BOPIS-008: Confirmed cart pickup location always returned at items[0] of cartPickupLocations
- **Current Rule:** Pickup locations referenced by any cart shipment must appear at `items[0]` of the `cartPickupLocations` xAPI response, regardless of paging (`first`), keyword search, facet, or filter.
- **Observed behavior:** Fully confirmed as-designed and working in PR #8 deployed build. Both backend verification (`tests/Sprint-current/VCST-4707/verification-report-backend.md` blocks B1–B4) and live UI screenshots `08-search-zacharyside-result.png`, `09-search-no-match.png` confirm the rule. However, the rule should note that `totalCount` is NOT incremented for the prepended item — this edge case is not documented in the current rule text and is now covered by `PROPOSED-BL-BOPIS-009`.
- **Source:** GitHub `VirtoCommerce/vc-module-x-pickup` `ProductPickupLocationService.cs` `InsertRange(0)` post-paging logic. Backend verification report `tests/Sprint-current/VCST-4707/verification-report-backend.md`.
- **Suggested action:** **narrow scope** — add a Note to the existing rule: "`totalCount` reflects natural match count only; the prepended item is not counted. `items.length` may exceed `min(first, totalCount)` when a confirmed location is prepended to a zero-match result set." No other change needed. The cross-reference to `PROPOSED-BL-BOPIS-009` should be added once that proposal is promoted.

---

## Application Notes

1. Assign final IDs by reading `.claude/agents/knowledge/business-logic.md` for the next available `BL-BOPIS-NNN` sequence (current next: `BL-BOPIS-009`).
2. Replace the `PROPOSED-` prefix with the final ID.
3. Paste the edited entry into the `BL-BOPIS` domain section of `business-logic.md`.
4. Update the **Invariant Coverage Summary** table at the bottom of `business-logic.md` separately, per standing user rule (do not auto-edit the summary table when promoting an entry).
5. After the entry lands, re-run `/qa-review-tests suite 036 --verify` and `/qa-review-tests suite 050k --verify` so test cases gain their `Business_Rule` mapping.
6. For BL-BOPIS-008 staleness, update only the body Domain section (per `feedback_bl_promotion_table_separately`); leave the table unchanged unless the user instructs otherwise.

---

## Cross-references

- Story pushed to JIRA: `VCST-4646` — `[Frontend] Pickup location list with pagination` (description, AC field, and BA-analysis comment)
- Linked bug: `VCST-4707` — pickup pre-selection regression (Tested; read-side fixed by PR vc-module-x-pickup#8)
- Backend PR: [VirtoCommerce/vc-module-x-pickup#8](https://github.com/VirtoCommerce/vc-module-x-pickup/pull/8)
- Test suites that should reflect these invariants once promoted:
  - `regression/suites/Frontend/bopis/036-bopis-store-selector.csv`
  - `regression/suites/Backend/graphql/050k-graphql-xpickup.csv`
- Live evidence directory: `tests/Sprint-current/VCST-4707/evidence/ba-analyze/`
