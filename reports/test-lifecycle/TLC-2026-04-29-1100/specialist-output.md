# Test Management Specialist Output — TLC-2026-04-29-1100

**Suite:** 050k — GraphQL xPickup  
**File:** `regression/suites/Backend/graphql/050k-graphql-xpickup.csv`  
**Cases in scope:** GQL-094, GQL-127, GQL-128, GQL-129, GQL-130, GQL-131 (6 total)  
**Phase 3:** Gap analysis (lightweight)  
**Phase 4:** 7-dimension review (full pass)  
**Date:** 2026-04-29  
**Run ID:** TLC-2026-04-29-1100  

---

## Phase 3 — Gap Analysis

### Gap 1: Empty-cart edge case for `cartPickupLocations` (NOT covered)

Archive TC-BE-008 (VCST-4618) described the empty-cart scenario: "Query does not throw any exception; returns either empty items[] with totalCount:0, or returns all available pickup locations." None of the 6 current cases tests this path. The VCST-4618 fix used `.Where(x => x.SelectedForCheckout)` on the line-items before GroupBy — an empty list is the degenerate case of that filter. This is a regression-worth scenario distinct from GQL-094 (which explicitly requires at least one BOPIS-eligible item).

Recommended addition: **GQL-132** — `cartPickupLocations with Empty Cart Returns Valid Response (No Error)` — P1.

### Gap 2: Configurable-products duplicate-ProductId scenario (NOT covered)

The primary VCST-4618 bug was `cartPickupLocations` throwing `System.ArgumentException` / `ARGUMENT` error when two configurable variants sharing the same base ProductId were in the cart simultaneously. The fix deduplicates by ProductId and sums quantities. None of the 6 cases tests a cart with two variants of the same configurable product. This is the canonical regression scenario for VCST-4618 and should be re-expressed as a runner-native case in this suite.

Recommended addition: **GQL-133** — `cartPickupLocations with Two Configurable Variants Sharing ProductId Deduplicates Correctly (VCST-4618 Regression)` — P1.

### Gap 3: Pagination cursor (`first` + `after`) for `cartPickupLocations` (NOT covered)

GQL-094 exercises `first:1` and `first:5` but never uses the `after` cursor for actual cursor-based pagination (e.g., page 1 → capture endCursor → page 2 using `after`). The fixture `cartPickupLocations.graphql` includes `pageInfo { endCursor }` in the full selection and `after` as an optional var. The confirmed-location prepend behavior needs to be verified when fetching a second page (the prepended item should appear only on page 1). This is a P2 scenario — nice-to-have but not P0/P1.

Recommended addition: **GQL-134** — `cartPickupLocations Cursor Pagination — Second Page Does Not Re-Prepend Confirmed Location` — P2.

### Gap 4: `productPickupLocations` keyword/sort variant

GQL-128 is a full-field happy path with `sort:name:asc`. A keyword variant (similar to GQL-129 for cartPickupLocations) for `productPickupLocations` would be useful but `productPickupLocations` does not have the confirmed-location prepend logic (it is product-scoped, not cart-scoped), so the risk is lower. The existing GQL-128 already covers full field selection. This is a P2 optional addition.

Recommended addition: **GQL-135** — `productPickupLocations Keyword Narrows Result Set` — P2.

### Gap assessment vs. requested checklist

| Gap check | Covered? | Verdict |
|-----------|----------|---------|
| Empty-cart edge case (VCST-4618 archive TC-BE-008) | No | Gap → GQL-132 P1 |
| Configurable-product duplicate-ProductId (VCST-4618 archive TC-BE-001/TC-BE-006) | No | Gap → GQL-133 P1 |
| Cursor pagination `first`+`after` for cartPickupLocations | No | Gap → GQL-134 P2 |
| productPickupLocations keyword/sort variant | No | Gap → GQL-135 P2 |

**P1 gaps: 2. P2 gaps: 2. No P0 gaps found.**

---

## Phase 4 — 7-Dimension Review

### Dimension 1: Structure

| Finding | Severity | Cases | Detail |
|---------|----------|-------|--------|
| Header row valid (15 columns, exact match) | PASS | all | — |
| ID uniqueness | PASS | all | GQL-094, 127, 128, 129, 130, 131 — all unique |
| ID format `GQL-NNN` | PASS | all | Matches PREFIX-NNN |
| Priority values | PASS | GQL-094: Critical; rest: High | Valid |
| GQL-127 Automation_Status = `Automated` on a Draft case | **High (S-006 variant)** | GQL-127 | Case was authored as Draft and never passed peer review, yet Automation_Status = `Automated`. Likewise GQL-128, 129, 130, 131 are all `Automated`. Only GQL-094 is correctly `Draft`. Per workflow rule: all generated cases start as `Draft`; only `qa-lead-orchestrator` approval promotes to `Reviewed`, then the author assigns execution mode. Five cases are pre-emptively promoted past Draft without approval. |

**Verdict Dimension 1:** 1 High finding (pre-promoted Automation_Status on GQL-127–131).

### Dimension 2: Determinism

All 6 cases use runner-native `[GQL-OP]` / `[GQL-EXEC]` / `[GQL-CAPTURE]` / `[AUTH]` tags throughout Steps. No untagged free-text steps exist.

Label pairing audit (DV-019):

| Case | OP labels | EXEC labels | Match? |
|------|-----------|-------------|--------|
| GQL-094 | setup_me, setup_prod, pre_clear, add_item, probe_all_locations, set_shipment_pickup, query_keyword_exclude, query_paged_small, cleanup_clear | identical set | PASS |
| GQL-127 | list_locations, list_locations_keyword | identical | PASS |
| GQL-128 | setup_prod, product_locations | identical | PASS |
| GQL-129 | setup_me, setup_prod, pre_clear, add_item, probe_baseline, probe_keyword_match, probe_keyword_nomatch, cleanup_clear | identical | PASS |
| GQL-130 | setup_me, setup_prod, pre_clear, add_item, probe_facets, cleanup_clear | identical | PASS |
| GQL-131 | setup_me, setup_prod, pre_clear, add_item, probe_baseline, probe_filter_match, probe_filter_nomatch, probe_sort_desc, cleanup_clear | identical | PASS |

No `[GQL-OP]`/`[GQL-EXEC]` label mismatches. No `[GQL-CAPTURE]` references to undeclared labels.

**Verdict Dimension 2:** PASS — no findings.

### Dimension 3: Completeness

**Preconditions:** All 6 cases use "Runner-native." with schema verification notes and fixture references. Acceptable for GraphQL runner-native cases.

**errors[] checks:** Every op that can fail (mutations and non-trivial queries) has an `[ERRORS label=<op>] errors[] empty` assertion. Verified for each case:
- GQL-094: probe_all_locations, set_shipment_pickup, query_keyword_exclude, query_paged_small — all covered. PASS.
- GQL-127: list_locations, list_locations_keyword — PASS.
- GQL-128: product_locations — PASS.
- GQL-129: probe_baseline, probe_keyword_match, probe_keyword_nomatch — PASS.
- GQL-130: probe_facets — PASS. Note: cleanup_clear has no errors[] check — acceptable; cleanup ops are best-effort.
- GQL-131: probe_baseline, probe_filter_match, probe_filter_nomatch, probe_sort_desc — PASS.

**Missing errors[] for cleanup mutations (GQL-094, 129, 130, 131):** All four cases with `cleanup_clear` do not have an `[ERRORS label=cleanup_clear] errors[] empty` assertion. Per C-005 this is a mutation without errors[] check. However, cleanup ops are conventionally excluded from the assertion pass/fail verdict (they run on a best-effort basis). Flagging as **Low** (not Critical), consistent with test-runner convention.

**Cross_Layer_Checks for mutations:** GQL-094 uses `[ROUNDTRIP]` checks on the key mutation. GQL-129/130/131 use `[ROUNDTRIP]` and `[EVIDENCE]` lines. All mutation steps (addItem, addOrUpdateCartShipment, clearCart) have some cross-layer verification. Meets C-004 threshold.

**Failure_Signals:** All 6 cases have multiple failure signals. The GQL-094 failure signals are particularly detailed (5 signals). PASS.

**Cleanup column:** GQL-094, 129, 130, 131: "none — clearCart at end" (steps handle cleanup). GQL-127, 128: "none — read-only". Consistent.

**Test_Data column:** GQL-127 has `sort=name:asc; first=20; keyword_match=Main`. GQL-128 has `sort=name:asc; first=20`. GQL-094 has "—". GQL-129 has `nonexistent_keyword=xyzabc_no_such_location_999`. GQL-130 has the facet string. GQL-131 has `filter_nomatch=address.countryCode:ZZZ`.

Finding: **Medium (C-002)** — GQL-094 Test_Data = "—" yet uses `{{STORE_ID}}` and `{{USER_ID}}` (the latter captured at runtime, `{{STORE_ID}}` is an env var). Since `{{STORE_ID}}` is a known env var and `{{USER_ID}}` is runtime-captured (not a static VAR binding), this is borderline. The "—" is technically inaccurate: `{{STORE_ID}}` should be listed. Applies similarly to GQL-129, 130, 131 which also omit `{{STORE_ID}}` from Test_Data. However all four cases document this in their Preconditions. Flagging as **Medium** note, not a blocker.

**Verdict Dimension 3:** 1 Low (cleanup mutations missing errors[] — acceptable), 1 Medium (GQL-094/129/130/131 Test_Data omits `{{STORE_ID}}`).

### Dimension 4: Testability

**GQL-094 IncludeLocationIds assertion (special check):**
The assertion `data.cartPickupLocations.items.0.id = {{LAST_LOCATION_ID}} (confirmed location at index 0 despite keyword exclusion — VCST-4707 fix assertion)` is well-formed. `LAST_LOCATION_ID` is captured from `probe_all_locations.data.cartPickupLocations.items.last.id` and then re-referenced as a scalar equality check. This is falsifiable: if the module fix is not working, the confirmed location will NOT be at index 0. The assertion is unambiguous. PASS.

**GQL-127 keyword sub-probe:**
`data.pickupLocations.totalCount <= list_locations.totalCount` — cross-reference assertion. Falsifiable. PASS.

**GQL-129 keyword case-insensitivity (special check):**
The case acknowledges in Preconditions: "Per VCST-4650, xAPI keyword search is case-insensitive across address fields — covered as runner-manual EVIDENCE since CSV captures cannot transform case." The `[EVIDENCE]` step says "Re-run probe_keyword_match with SEED_CITY in upper case (e.g. via separate runner step) → totalCount must equal probe_keyword_match.totalCount — runner-manual." This is a pragmatic approach: the CSV runner cannot natively upper-case a captured string variable, so automated comparison is not feasible without a transform step. The decision to mark it runner-manual EVIDENCE is acceptable and correctly documented. **No finding.** However, suggest: if the runner supports a `[GQL-TRANSFORM SEED_CITY → SEED_CITY_UPPER = upper(SEED_CITY)]` step in the future, this should be upgraded to an automated assertion. Captured as a manual item.

**GQL-131 filter syntax (special check):**
`filter: "address.countryCode:{{SEED_COUNTRY}}"` — the fixture comment says `"address.countryCode:USA"`. The `reference_address_data_conventions` memory confirms `countryCode` is ISO-3 (USA/CAN/GBR). The captured value `SEED_COUNTRY` is taken from `probe_baseline.data.cartPickupLocations.items.0.address.countryCode` — which comes from the pickup location's address. The xAPI filter syntax `"address.countryCode:USA"` format (field:value, no quotes around value) matches the fixture. **This is correct.** PASS.

**GQL-130 facet EVIDENCE items:**
"term_facets contains entries for each requested facet (address.countryCode, address.regionName, address.city)" — the automated assertions only check `term_facets is non-null` and `term_facets.length >= 1` and `term_facets.0.name is non-empty`. The per-facet presence check is left as runner-manual EVIDENCE. This is a testability limitation (Medium, T-004 adjacent) — the automated path only verifies that at least one facet exists, not that all three requested facets are returned. Flagging as **Low** informational note.

**Vague predicates:** No "correctly", "properly", "as expected" language found in Assertions columns. PASS.

**Verdict Dimension 4:** PASS with 2 informational notes. No Blockers/Criticals/Highs.

### Dimension 5: Data Validity

**DV-001 Unknown VAR tokens:**
Tokens used across all 6 cases: `{{STORE_ID}}`, `{{USER_ID}}` (runtime-captured from me.id), `{{PRODUCT_ID}}` (runtime-captured), `{{CART_ID}}` (runtime-captured), `{{LAST_LOCATION_ID}}` (runtime-captured), `{{SEED_CITY}}` (runtime-captured), `{{SEED_COUNTRY}}` (runtime-captured).
- `{{STORE_ID}}` — known env var. PASS.
- All `{{USER_ID}}`, `{{PRODUCT_ID}}`, `{{CART_ID}}`, `{{LAST_LOCATION_ID}}`, `{{SEED_CITY}}`, `{{SEED_COUNTRY}}` — runtime-captured within the same test case Steps using `[GQL-CAPTURE]`. These are runner-native captured vars, not externally-defined `{{VAR}}` tokens. PASS.

**DV-002 Hardcoded URLs:** None. All queries use `{{STORE_ID}}` = "B2B-store" passed as env var. No `http://` literals. PASS.

**DV-003 Hardcoded credentials:** None. Auth handled by `[AUTH role=ORG_USER]` runner tag. PASS.

**DV-013 Hardcoded GUIDs (DV-013):**
- `fc596540864a41bf8ab78734ee7353a3` appears in the `products` query filter in GQL-094, 128, 129, 130, 131: `filter: "category.subtree:fc596540864a41bf8ab78734ee7353a3 price.USD:(0 TO) inStock_variations:true"`. Per DV-013 exception clause: this is a documented environment constant from `.claude/agents/knowledge/catalog.md` (B2B virtual catalog root). Additionally the `feedback_graphql_products_filter` memory explicitly states "products filter MUST include `category.subtree:fc596540...` (B2B virtual catalog root) — storefront base filter." **This is required and correct.** PASS.

**DV-006 Invalid GraphQL query/mutation names:** Cross-checking against graphql-schema.md:
- `cartPickupLocations` — listed in Queries > Cart section. PASS.
- `pickupLocations` — listed in Queries > Cart section. PASS.
- `productPickupLocations` — listed in Queries > Catalog section. PASS.
- `me` — listed in Queries > Profile section. PASS.
- `products` — listed in Queries > Catalog section. PASS.
- `clearCart` — listed in Mutations > Cart section. PASS.
- `addItem` — listed in Mutations > Cart section. PASS.
- `addOrUpdateCartShipment` — listed in Mutations > Cart section. PASS.

All query/mutation names are valid. PASS.

**DV-007 Command wrapper on mutations:**
- `clearCart(command: { storeId: ... userId: ... })` — PASS.
- `addItem(command: { storeId: ... userId: ... productId: ... quantity: 1 })` — PASS.
- `addOrUpdateCartShipment(command: { storeId: ... userId: ... shipment: { pickupLocationId: ... } })` — PASS.

All mutations use correct `command` wrapper. PASS.

**DV-008 Wrong GraphQL argument names:**
- `cartPickupLocations(cartId, storeId, cultureName, first, keyword, filter, sort, facet)` — schema: `cartPickupLocations(after: String, first: Int, keyword: String, sort: String, cartId: String!, storeId: String!, cultureName: String!, facet: String, filter: String)`. All args present and correctly named. PASS.
- `pickupLocations(storeId, first, sort, keyword)` — schema: `pickupLocations(after: String, first: Int, keyword: String, sort: String, storeId: String)`. PASS.
- `productPickupLocations(productId, storeId, cultureName, first, sort)` — schema: `productPickupLocations(after: String, first: Int, keyword: String, sort: String, productId: String!, storeId: String!, cultureName: String!)`. PASS.
- `addOrUpdateCartShipment` command fields: `storeId`, `userId`, `shipment: { pickupLocationId }` — checking InputAddOrUpdateCartShipmentType: `cartId, storeId (required), ..., userId (required), ..., shipment: InputShipmentType (required)`. InputShipmentType includes `pickupLocationId: OptionalString`. **PASS — pickupLocationId is confirmed in schema.**
- `addItem` command: `storeId`, `userId`, `productId`, `quantity` — all present in InputAddItemType. PASS.
- `clearCart` command: `storeId`, `userId` — InputClearCartType has both. PASS.

**DV-008 `me { id }` call in GQL-127 (pickupLocations case — note):**
GQL-127 does NOT call `me { id }` — it is read-only and does not need USER_ID. Correct. PASS.

**DV-009 Wrong GraphQL response field names:**
- GQL-094 `shipments { pickupLocation { id } fulfillmentCenterId }` on `addOrUpdateCartShipment` return type (CartType). CartType has `shipments` field (array of ShipmentType). The shipment type was not explicitly listed in graphql-schema.md's Key Return Types section, but the test fixture `addOrUpdateCartShipment` is in the schema. The fields `pickupLocation { id }` and `fulfillmentCenterId` on ShipmentType are used in BOPIS-related tests. Assuming these are correct per BOPIS domain knowledge. Flag as **Medium informational** — the schema.md does not explicitly enumerate ShipmentType sub-fields; reviewer should confirm `ShipmentType.pickupLocation` exists via introspection before regression run.
- GQL-127 `pageInfo { hasNextPage hasPreviousPage startCursor endCursor }` — standard pagination fields. PASS.
- GQL-127/128/130 `address { id key name organization countryCode countryName regionId regionName city postalCode line1 line2 phone email outerId description addressType }` — full address selection. PASS.
- GQL-130 `term_facets { name terms { term label count } }` — matches schema TermFacet type (`name`, `label`, `order`, `facetType`, `terms`) and FacetTermType (`term`, `count`, `isSelected`, `label`). PASS.
- `availabilityType`, `availabilityNote`, `availableQuantity` on cartPickupLocations/productPickupLocations items — these are pickup-location-specific fields confirmed in the fixture headers and the cartPickupLocations.graphql fixture. PASS.

**DV-010 Invalid input fields on mutations:**
- `addOrUpdateCartShipment.shipment` uses only `pickupLocationId`. InputShipmentType schema confirms `pickupLocationId: OptionalString` exists. The `price` field is NOT provided in GQL-094's set_shipment_pickup call. Per graphql-schema.md Critical Rule #11: "`addOrUpdateCartShipment` requires `price`: `CartShipmentValidator` rejects if price doesn't match available shipping rate." For a pickup shipment, BL-BOPIS-002 states price is $0. **High finding (DV-010 adjacent):** the `addOrUpdateCartShipment` call in GQL-094 does not include `price: 0` in the shipment object. The `CartShipmentValidator` rule from schema.md may reject this. The existing BOPIS-specific validator may waive the price check for pickup (since BL-BOPIS-002 mandates $0) — but this is unverified in the case. The test's `Failure_Signals` mentions `set_shipment_pickup errors[] non-empty (pickupLocationId field unsupported or validation error — may indicate schema mismatch)` as a known fragile point, suggesting the author anticipated this risk. **Flag as High — recommend adding `price: 0` to the shipment object in set_shipment_pickup to satisfy CartShipmentValidator.**

**DV-011 Wrong MoneyType:** No MoneyType fields used in these cases (they are location queries, not cart total queries). PASS.

**DV-012 Thin field selection on happy-path:**
- GQL-094: The `probe_all_locations` step uses `items { id name }` — this is explicitly a counter/probe step (captures `LAST_LOCATION_ID`), not the happy-path full-field verification. The `query_keyword_exclude` and `query_paged_small` steps also use `items { id name }` — these are targeted VCST-4707 fix assertions (need only id at index 0). The full-field selection is NOT present in GQL-094. **Medium (DV-012):** GQL-094 is a `Critical` case but its primary purpose is the IncludeLocationIds behavioral assertion, not full-field coverage — so the thin selection is acceptable under the "roundtrip/counter probe" exception. The full-field coverage is delegated to GQL-127/128. Should add an inline comment naming the exception role explicitly. Currently Preconditions notes say "probe" which partially satisfies the requirement.
- GQL-127: Full field selection including all address sub-fields, pageInfo, isActive, workingHours etc. PASS.
- GQL-128: Full field selection including availabilityType, availabilityNote, availableQuantity. PASS.
- GQL-129: Uses `items { id name address { city } }` in probe steps — all are counter/narrowing probes, correctly documented. PASS.
- GQL-130: Uses `items { id name address { city regionName countryCode } }` — targeted facet-coverage test. PASS.
- GQL-131: Uses `items { id name }` and `items { id address { countryCode } }` — all counter probes. PASS.

**DV-016 Exact-value assertion on env-dependent data:**
- GQL-129: SEED_CITY is captured at runtime from the response. The assertion `items[i].address.city contains SEED_CITY` is a structural invariant. PASS.
- GQL-131: SEED_COUNTRY captured at runtime. Filter assertion is structural. PASS.
- No static price, slug, or count assertions that would break on catalog changes. PASS.

**Verdict Dimension 5:** 1 High (DV-010: missing `price: 0` on pickup shipment in GQL-094), 1 Medium (DV-009 informational: ShipmentType.pickupLocation field not enumerated in schema.md — confirm via introspection), 1 Medium (C-002: Test_Data "—" on GQL-094/129/130/131 missing `{{STORE_ID}}`), 1 Medium (DV-012: GQL-094 thin field selection — justified but needs inline comment).

### Dimension 6: BL/ECL Coverage

**BL-* references:**
- All 6 cases reference `BL-BOPIS-007` (BOPIS store-selector map behavior). This is a `[P2-ux]` invariant about the map panel NOT collapsing on no-results search. **This is the WRONG BL reference for these cases.** The cases test `cartPickupLocations`, `pickupLocations`, and `productPickupLocations` xAPI queries — they are API-layer tests with no map UI concern. The applicable invariant is `BL-BOPIS-008` (confirmed pickup location always at items[0]), which is already referenced in GQL-094 as `BL-BOPIS-008-PROPOSED`. However BL-BOPIS-008 was promoted on 2026-04-28 (the note in business-logic.md confirms: "Promoted: 2026-04-28"). **Critical finding (BL-002):** GQL-127, 128, 129, 130, 131 all reference `BL-BOPIS-007` (wrong invariant for API query tests). The correct primary invariant is `BL-BOPIS-008`. GQL-094 correctly references `BL-BOPIS-008-PROPOSED` (which is now `BL-BOPIS-008` post-promotion) — but the suffix `-PROPOSED` is stale.

Specifically:
- GQL-094 Business_Rule: `BL-BOPIS-007; BL-GQL-001` — should be `BL-BOPIS-008; BL-GQL-001`. The `-PROPOSED` suffix in References is stale.
- GQL-127–131 Business_Rule: `BL-BOPIS-007; BL-GQL-001` — GQL-127 (store-level list) and GQL-128 (product-level) do not directly test the confirmed-location-at-index-0 invariant; they do relate to BL-BOPIS-005 (inactive locations excluded) indirectly. However `BL-BOPIS-007` (map panel width invariant) is definitively wrong for all of them.
- Recommended correction: GQL-094 → `BL-BOPIS-008; BL-GQL-001`; GQL-129/130/131 → `BL-BOPIS-008; BL-GQL-001` (all exercise cartPickupLocations which is the query the BL rule governs); GQL-127 → `BL-BOPIS-005; BL-GQL-001` (store-level list, most closely maps to inactive-location exclusion); GQL-128 → `BL-BOPIS-003; BL-GQL-001` (product-level, most closely maps to FFC availability label).

**BL-GQL-001 reference:** Not listed in the BOPIS domain section; appears to be a general GraphQL API invariant. Accepted as-is — not verifiable from the provided file section.

**ECL references:**
- ECL-14.2 (all 6 cases) — Section 14.2 is "Search Index Lag (Elasticsearch)". For pickup location queries this is relevant: if location data is indexed, there may be a lag between Admin changes and API results. Reasonable.
- ECL-9.1 (GQL-129, 131) — Section 9.1 is "Fake & Manipulated Reviews." This appears to be the WRONG ECL reference. There is no ECL section directly covering search/filter narrowing behavior for pickup locations. The intent was probably to reference a filter/search edge case pattern. The closest would be ECL-3 (search behavior) or the VC-specific ECL-14.1 (silent errors[]). **Medium (BL-005): ECL-9.1 is inapplicable; should reference a more relevant ECL pattern (e.g., ECL-14.1 for silent GraphQL errors, or no ECL ref if no applicable pattern exists).**

**REQ-001 Missing JIRA ticket in References for Critical/High cases:**
- GQL-094 (Critical): References includes `VCST-4707` — PASS.
- GQL-127 (High): References = `xAPI; graphql-schema.md — Query.pickupLocations; test-data/graphql/queries/pickupLocations.graphql; BL-BOPIS-007` — **no VCST-XXXX ticket.** High finding (REQ-001).
- GQL-128 (High): References = `xAPI; graphql-schema.md — Query.productPickupLocations; ...` — no VCST-XXXX. High finding (REQ-001).
- GQL-129 (High): References include `VCST-4650` — PASS.
- GQL-130 (High): References include `VCST-4618` — PASS.
- GQL-131 (High): References = `xAPI; graphql-schema.md — Query.cartPickupLocations; xAPI filter syntax; BL-BOPIS-007` — no VCST-XXXX. **High finding (REQ-001).** (VCST-4618 or VCST-4707 would be appropriate since filter behavior was validated during those tickets.)

**Verdict Dimension 6:** 1 Critical (BL-002: BL-BOPIS-007 wrong for all 6 cases; stale `-PROPOSED` suffix on GQL-094 reference), 1 Medium (ECL-9.1 inapplicable on GQL-129/131), 3 High (REQ-001: GQL-127, 128, 131 missing JIRA ticket in References).

### Dimension 7: Duplication

**Same-suite:** No two cases in 050k cover the same scenario at the same layer. GQL-094, 129, 130, 131 all exercise `cartPickupLocations` but with materially different parameters (IncludeLocationIds/VCST-4707, keyword search, facets, filter+sort respectively). PASS — no same-suite duplication.

**Cross-suite check vs. 050b1–050b4 (Backend/graphql):** The 050k cases are the only cases in the suite collection covering xPickup queries (`cartPickupLocations`, `pickupLocations`, `productPickupLocations`). No overlap with cart/catalog/order API suites.

**Cross-suite check vs. BOPIS frontend suites (036, 037, 038):** Those suites test storefront UI layer (Playwright browser). The GQL assertions in 050k test the raw xAPI GraphQL response. Per DUP-003 this is expected cross-layer coverage — informational only, not a finding.

**Cleanup-step similarity across GQL-094/129/130/131:** All four use identical `clearCart` cleanup. This is NOT duplication — shared patterns in cleanup are normal for runner-native cases. Each case has distinct Steps, Assertions, and intent. DUP-004 (repeated preconditions) does not apply because the setup steps (me → product → clear → addItem) are necessary context for each unique query scenario — the test runner does not carry state between cases.

**Verdict Dimension 7:** PASS — no meaningful duplication found.

---

## Special Checks Summary

### GQL-094 IncludeLocationIds assertion semantics

The assertion `data.cartPickupLocations.items.0.id = {{LAST_LOCATION_ID}}` appears after `query_keyword_exclude` (keyword that matches zero natural results) and `query_paged_small` (`first:1`). The setup flow: (1) probe all locations to get the last one's id, (2) call `addOrUpdateCartShipment` to confirm that location as the cart's pickup. The assertion then verifies the confirmed location appears at items[0] even when keyword/paging would exclude it naturally. This is the exact semantic of the VCST-4707 fix (IncludeLocationIds prepend). **The assertion is unambiguous and tests the right thing.** Note: the Failure_Signal `query_keyword_exclude items[0].id != LAST_LOCATION_ID (VCST-4707 regression)` matches the assertion. PASS.

### GQL-129 keyword case-insensitivity

Confirmed: runner-manual EVIDENCE is the correct handling. Cannot be auto-asserted without a string-transform step in the runner. No finding. Added to manual items list.

### GQL-131 filter syntax

`filter: "address.countryCode:{{SEED_COUNTRY}}"` — SEED_COUNTRY is captured as `items.0.address.countryCode` from the `cartPickupLocations` response, which returns ISO-3 codes per address-data-conventions memory and xAPI address schema. The fixture comment confirms `"address.countryCode:USA"` as the format. **Correct.** PASS.

### Idempotency / cleanup

GQL-094: clearCart at steps pre_clear (before addItem) and cleanup_clear (after test). Double-clear is safe and ensures clean state. GQL-129/130/131 follow the same pattern. GQL-127/128: read-only, no cart state, no cleanup needed. **Cleanup is consistent across all cart-modifying cases.** PASS.

### GQL-127 auth role note

The `pickupLocations.graphql` fixture says `# role: PUBLIC` but GQL-127 uses `[AUTH role=ORG_USER]`. This is not a bug — using an authenticated user for a PUBLIC endpoint is valid (authenticated calls to public endpoints are permitted in xAPI). The suite convention is to run as ORG_USER for consistency. Flagging as **informational note** only.

---

## Findings Register

| # | Severity | Dimension | Case(s) | Rule | Description | Fix |
|---|----------|-----------|---------|------|-------------|-----|
| F-1 | Critical | BL/ECL | GQL-094 to 131 | BL-002 | Business_Rule `BL-BOPIS-007` is wrong for all 6 cases. BL-BOPIS-007 is a UI/map invariant. Correct refs: GQL-094/129/130/131 → `BL-BOPIS-008`, GQL-127 → `BL-BOPIS-005`, GQL-128 → `BL-BOPIS-003`. Also GQL-094 References still says `BL-BOPIS-008-PROPOSED`; invariant was promoted 2026-04-28 — drop `-PROPOSED` suffix. | Update Business_Rule column per corrected mapping; update GQL-094 References to `BL-BOPIS-008` |
| F-2 | High | Data Validity | GQL-094 | DV-010 | `addOrUpdateCartShipment` in step set_shipment_pickup omits `price` field. Schema rule 11 says CartShipmentValidator rejects if price doesn't match a rate. Pickup should use `price: 0` (BL-BOPIS-002). | Add `price: 0` to `shipment: { pickupLocationId: "{{LAST_LOCATION_ID}}" price: 0 }` |
| F-3 | High | BL/ECL | GQL-127, GQL-128, GQL-131 | REQ-001 | Priority = High but References column contains no JIRA ticket. | GQL-127: add `VCST-4707` (pickup network established in that sprint); GQL-128: add `VCST-4618` (productPickupLocations regression tested in that archive); GQL-131: add `VCST-4618` or `VCST-4707` |
| F-4 | High | Structure | GQL-127, 128, 129, 130, 131 | S-006 variant | Automation_Status = `Automated` on cases that have never been through peer review. All 5 cases should be `Draft` per workflow rule (qa-lead-orchestrator approval required before status promotion). Only GQL-094 is correctly `Draft`. | Reset Automation_Status to `Draft` on GQL-127–131 |
| F-5 | Medium | BL/ECL | GQL-129, 131 | BL-005 | ECL-9.1 ("Fake & Manipulated Reviews") is inapplicable to pickup location filter/search tests. No meaningful ECL pattern maps exactly; closest is ECL-14.1 (silent errors[]) already covered by errors[] assertions. | Replace `ECL-9.1` with `ECL-14.1` or remove ECL ref entirely for these cases |
| F-6 | Medium | Data Validity | GQL-094, 129, 130, 131 | C-002 | Test_Data column lists "—" (GQL-094) or omits `{{STORE_ID}}` from the binding list. `{{STORE_ID}}` is an env var reference and should be documented. | Add `store_id={{STORE_ID}}` to Test_Data for GQL-094, 129, 130, 131 |
| F-7 | Medium | Data Validity | GQL-094 | DV-012 adjacent | `probe_all_locations` uses thin field selection `items { id name }` without an inline comment naming its exception role (counter/capture probe). The role is inferable from context but DV-012 requires explicit exception comment. | Add inline comment: `# counter probe — captures LAST_LOCATION_ID for IncludeLocationIds assertion` |
| F-8 | Medium | Data Validity | GQL-094 | DV-009 | `ShipmentType.pickupLocation { id }` field used in set_shipment_pickup response selection. ShipmentType sub-fields are not enumerated in graphql-schema.md; field existence should be confirmed via live introspection before first regression run. | Confirm `ShipmentType.pickupLocation` via `npm run graphql:schema:refresh` or GraphiQL introspection |
| F-9 | Low | Completeness | GQL-094, 129, 130, 131 | C-005 variant | `cleanup_clear` mutation has no `[ERRORS]` check in Assertions. Acceptable convention for cleanup-only mutations; flagged for awareness. | No action required — cleanup failures are caught by next test's `pre_clear` succeeding |

---

## Manual Items (Require Human Judgment — Not Auto-Fixable)

| Item | Case | Description |
|------|------|-------------|
| M-1 | GQL-129 | Case-insensitive keyword search cannot be auto-asserted in CSV runner (no string-transform primitive). When the runner gains a `[GQL-TRANSFORM]` step type, upgrade the EVIDENCE note to an automated `[COUNT]` assertion comparing upper-case keyword probe vs mixed-case probe. |
| M-2 | GQL-130 | Per-facet presence assertion (all 3 requested facets appear in term_facets) is runner-manual EVIDENCE only. Consider extending the runner assertion DSL with `term_facets[name=address.countryCode] exists` syntax in a future sprint. |
| M-3 | GQL-094 | Confirm `ShipmentType.pickupLocation { id }` field via introspection (see F-8). If field is absent, the set_shipment_pickup response selection needs to be adjusted. |
| M-4 | GQL-127 | `[AUTH role=ORG_USER]` used on a PUBLIC endpoint. Valid behavior but if test infra later needs a no-auth test, a `role=ANONYMOUS` variant would be needed (separate case). |

---

## Recommended Additions

| ID | Title | Priority | Rationale |
|----|-------|----------|-----------|
| GQL-132 | cartPickupLocations with Empty Cart Returns Valid Response (No Error) | P1 | Archive TC-BE-008 — empty list passed to GroupBy; VCST-4618 fix must handle this without ArgumentException. Not covered in current 6 cases. |
| GQL-133 | cartPickupLocations with Two Configurable Variants Sharing ProductId Deduplicates Correctly (VCST-4618 Regression) | P1 | Core VCST-4618 regression: duplicate ProductId in cart caused ToDictionary exception. The fix dedups and sums quantities. No runner-native regression case exists in suite 050k. |
| GQL-134 | cartPickupLocations Cursor Pagination — Second Page Does Not Re-Prepend Confirmed Location | P2 | Pagination edge case: confirmed location should appear only at items[0] of the first page, not injected into every cursor page. Distinct from GQL-094 which tests first:1. |
| GQL-135 | productPickupLocations Keyword Narrows Result Set | P2 | Completeness: `productPickupLocations` has a `keyword` arg not exercised in GQL-128. Low risk but provides full query coverage parity with `cartPickupLocations` (GQL-129). |

---

## Fixes Applied (Trivial / Auto-Applied)

None. Per auto-fix policy, no modifications were made to the CSV without explicit user approval. All findings above require approval before application.

---

## Verdict Summary

| Dimension | Status | Worst Severity |
|-----------|--------|----------------|
| 1. Structure | Needs Fixes | High (F-4: Automation_Status) |
| 2. Determinism | Pass | — |
| 3. Completeness | Pass with notes | Medium (F-6) |
| 4. Testability | Pass with notes | Informational |
| 5. Data Validity | Needs Fixes | High (F-2: missing price), Medium (F-7/F-8) |
| 6. BL/ECL Coverage | Needs Fixes | Critical (F-1: wrong BL refs), High (F-3: missing JIRA) |
| 7. Duplication | Pass | — |

**Overall Verdict: NEEDS FIXES**

- Blockers: 0
- Criticals: 1 (F-1 — wrong BL-BOPIS-007 reference across all 6 cases)
- Highs: 3 (F-2: missing price:0 on pickup shipment; F-3: missing JIRA tickets on 3 cases; F-4: stale Automation_Status on 5 cases)
- Mediums: 4 (F-5 through F-8)
- Lows: 1 (F-9)

**Required fixes before promotion to Reviewed:**
1. F-1 (Critical): Correct Business_Rule column for all 6 cases; remove `-PROPOSED` from GQL-094 References.
2. F-2 (High): Add `price: 0` to GQL-094 set_shipment_pickup mutation.
3. F-3 (High): Add JIRA tickets to GQL-127, GQL-128, GQL-131 References.
4. F-4 (High): Reset Automation_Status to `Draft` on GQL-127–131.

P1 gap cases GQL-132 and GQL-133 should be authored and reviewed before the suite is considered complete for the VCST-4618/VCST-4707 regression scope.
