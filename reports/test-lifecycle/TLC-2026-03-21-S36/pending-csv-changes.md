# Pending CSV Changes — Suite 36 Configurable Products Tests
# TLC-2026-03-21-S36 | Phase 4 Fix Output

These changes need to be applied to `regression/suites/Frontend/36-configurable-products-tests.csv`
and `config/test-suites.json`. They could not be auto-applied due to file permissions.

---

## 1. SYSTEMATIC FIND-AND-REPLACE in the CSV

Apply these in order (each is a global replace in the Business_Rule column values):

| Find | Replace | Rationale |
|------|---------|-----------|
| `BL-CFG-001; BL-CFG-002` | `BL-CAT-006; BL-PRICE-001` | Two-ID combo replacement |
| `BL-CFG-001; BL-CFG-003` | `BL-CAT-006; BL-PRICE-001` | Two-ID combo replacement |
| `BL-CFG-001; BL-CFG-004` | `BL-CAT-006; BL-CART-007` | Two-ID combo replacement |
| `BL-CFG-002; BL-CFG-003` | `BL-CAT-006; BL-PRICE-001` | Two-ID combo replacement |
| `BL-CFG-003; BL-CFG-004` | `BL-PRICE-001; BL-CART-007` | Two-ID combo replacement |
| `BL-PRICE-001; BL-CFG-004` | `BL-PRICE-001; BL-CART-007` | Mixed replacement |
| `BL-PRICE-003; BL-CFG-001` | `BL-PRICE-003; BL-CAT-006` | Mixed replacement |
| `BL-CFG-001` | `BL-CAT-006` | Single remaining |
| `BL-CFG-002` | `BL-CAT-006` | Single remaining |
| `BL-CFG-003` | `BL-PRICE-001` | Single remaining |
| `BL-CFG-004` | `BL-CART-007` | Single remaining |

## 2. TARGETED CELL UPDATES

### CFG-ADM-001 (row 92) — Column 5 Business_Rule: empty → `BL-CAT-006`
### CFG-ADM-002 (row 93) — Column 5 Business_Rule: empty → `BL-CAT-006`
### CFG-ADM-003 (row 94) — Column 5 Business_Rule: empty → `BL-CAT-006`
### CFG-MOB-001 (row 102) — Column 5 Business_Rule: empty → `BL-CAT-006`
### CFG-MOB-002 (row 103) — Column 5 Business_Rule: empty → `BL-CAT-006`
### CFG-MOB-003 (row 104) — Column 5 Business_Rule: empty → `BL-CAT-006`

### CFG-TEXT-001 — Column 6 Edge_Case_Refs: `ECL-14.1` → `ECL-14.1; ECL-14.5`
### CFG-TEXT-002 — Column 6 Edge_Case_Refs: `ECL-14.1` → `ECL-14.1; ECL-14.5`
### CFG-E2E-027 — Column 6 Edge_Case_Refs: update to include `ECL-14.5`
### CFG-E2E-034 — Column 5 Business_Rule: replace `BL-CFG-003` with `BL-PRICE-001; BL-CROSS-012`; Column 6 Edge_Case_Refs: add `ECL-14.5`

---

## 3. NEW TEST CASE ROWS TO APPEND

Append these 6 rows to the end of the CSV (after the current last row CFG-E2E-051):

```csv
CFG-E2E-052,changeCartConfiguredItem with Invalid sectionId Returns errors[] Non-Empty,Configurable Products > GraphQL xAPI > Error Handling,High,BL-CAT-006; BL-CROSS-010,ECL-14.1,"User authenticated. A configured product is in the cart. lineItemId and a valid configurationSections structure known from previous addItem.","store_id={{STORE_ID}}; back_url={{BACK_URL}}; user={{USER_EMAIL}}; password={{USER_PASSWORD}}; invalid_section_id=00000000-0000-0000-0000-000000000000","[AUTH] Obtain Bearer token via POST {{BACK_URL}}/connect/token with {{USER_EMAIL}}/{{USER_PASSWORD}}; [SETUP] Ensure a configured product is in cart — record lineItemId; [GQL] POST {{BACK_URL}}/graphql with mutation changeCartConfiguredItem(command: { storeId: {{STORE_ID}} userId: <user-id> lineItemId: <lineItemId> configurationSections: [{ sectionId: ""00000000-0000-0000-0000-000000000000"" value: { productId: ""any-id"" quantity: 1 } }] quantity: 1 }) { items { configurationItems { sectionId } } errors { code description } }; [VAR] Capture errors[] array from response","[ERRORS] errors[] is NON-EMPTY — mutation rejected invalid sectionId; [DATA] errors[].code is present and non-null; [STATE] Cart items remain unchanged (original configurationItems preserved); [DATA] HTTP status is 200 (xAPI convention) but errors[] non-empty signals rejection","[ROUNDTRIP] Follow-up cart query confirms original configurationItems unchanged; [CONSOLE] No unhandled JS errors if tested via storefront; [NETWORK] HTTP 200 with non-empty errors[]","errors[] is empty despite invalid sectionId — silent acceptance of bad data; cart configurationItems changed to reflect invalid section; HTTP 4xx/5xx instead of 200+errors[]",No cleanup needed — mutation rejected cart unchanged,GAP-S36-002; xAPI changeCartConfiguredItem docs,Automated
CFG-E2E-053,changeCartConfiguredItem Removing Required Section Selection Returns Validation Error,Configurable Products > GraphQL xAPI > Error Handling,High,BL-CAT-006; BL-CROSS-010,ECL-14.1,"User authenticated. A configured product with a required Product section is in the cart — required section has a valid option selected. lineItemId and sectionId known.","store_id={{STORE_ID}}; back_url={{BACK_URL}}; user={{USER_EMAIL}}; password={{USER_PASSWORD}}","[AUTH] Obtain Bearer token via POST {{BACK_URL}}/connect/token with {{USER_EMAIL}}/{{USER_PASSWORD}}; [SETUP] Ensure configured product with required section in cart — record lineItemId and required sectionId; [GQL] POST {{BACK_URL}}/graphql with mutation changeCartConfiguredItem(command: { storeId: {{STORE_ID}} userId: <user-id> lineItemId: <lineItemId> configurationSections: [] quantity: 1 }) — pass empty configurationSections to attempt clearing required section; [VAR] Capture errors[] and items[].configurationItems from response","[ERRORS] errors[] is NON-EMPTY OR configurationItems still contains required section — system either rejects empty config or preserves required selection; [STATE] Required section selection not cleared if isRequired=true; [DATA] Response does not indicate checkout-ready state with missing required section","[ROUNDTRIP] cart query confirms required configurationItem still present; [STOREFRONT] Cart page still shows required section as filled","errors[] is empty AND configurationItems cleared — required section silently removed enabling purchase without required config; cart proceeds to checkout with empty required section",No cleanup needed,GAP-S36-002; BL-CAT-006,Automated
CFG-GA4-001,GA4 view_item Event Fires on Configurable Product PDP,Configurable Products > GA4 Tracking > view_item,Medium,BL-CROSS-005,ECL-7.1,"Storefront accessible at {{FRONT_URL}}. GA4 / dataLayer accessible via browser console. Bike with options product at /products-with-options/configurations/build-the-bike-of-your-dreams/bike-with-options.","url={{FRONT_URL}}/products-with-options/configurations/build-the-bike-of-your-dreams/bike-with-options; expected_product_id=CVQ-54616437; expected_product_name=Bike with options","[NAV] Navigate to {{FRONT_URL}}/products-with-options/configurations/build-the-bike-of-your-dreams/bike-with-options; [WAIT] Page fully loaded and configuration widget visible; [KEY] Execute in browser console: window.dataLayer.filter(e => e.event === 'view_item'); [VAR] Capture view_item event data from dataLayer","[STATE] dataLayer contains exactly one view_item event after page load; [DATA] view_item.ecommerce.items[0].item_id matches product SKU CVQ-54616437 or product UUID; [DATA] view_item.ecommerce.items[0].item_name = 'Bike with options'; [DATA] view_item.ecommerce.value matches base product price $350.00; [DATA] view_item.ecommerce.currency = 'USD'","[NETWORK] Google Analytics collection endpoint receives view_item payload; [CONSOLE] No GA4 related JS errors","No view_item in dataLayer; view_item fires before page load completes; wrong product ID; value = 0 instead of base price; event duplicated on single page load",none,GAP-S36-003; BL-CROSS-005; Suite 07,Manual
CFG-GA4-002,GA4 add_to_cart Event Includes Configured Total Value (Base Plus Option Surcharge),Configurable Products > GA4 Tracking > add_to_cart,Medium,BL-CROSS-005; BL-PRICE-001,ECL-7.1; ECL-14.1,"Storefront accessible. User authenticated. Bike with options PDP loaded. Cart empty. dataLayer accessible.","url={{FRONT_URL}}/products-with-options/configurations/build-the-bike-of-your-dreams/bike-with-options; user={{USER_EMAIL}}; password={{USER_PASSWORD}}; seat_total=365.00","[NAV] Navigate to Bike with options PDP; [WAIT] Configure widget visible; [ACT] Select Seat option (total $365.00); [ACT] Set qty to 1; [ACT] Click 'Add to Cart'; [WAIT] Success notification; [KEY] Execute in browser console: window.dataLayer.filter(e => e.event === 'add_to_cart'); [VAR] Capture add_to_cart event from dataLayer","[STATE] dataLayer contains add_to_cart event after button click; [DATA] add_to_cart.ecommerce.value = 365.00 (base $350 + Seat option $15) — NOT $350 (base only); [DATA] add_to_cart.ecommerce.items[0].price = 365.00; [DATA] add_to_cart.ecommerce.items[0].quantity = 1; [DATA] add_to_cart.ecommerce.currency = 'USD'","[NETWORK] GA4 collection endpoint receives add_to_cart with value=365.00; [CONSOLE] No GA4 JS errors; [API] addItem mutation returns 200 with cart item price matching 365.00","add_to_cart event missing from dataLayer; value = 350.00 (base only — option surcharge missing from analytics); value = 0; event fires before add-to-cart action completes",Remove cart item after test,GAP-S36-003; BL-CROSS-005,Manual
CFG-GA4-003,GA4 purchase Event for Configured Product Reports Configured Total Correctly,Configurable Products > GA4 Tracking > purchase,Medium,BL-CROSS-005; BL-PRICE-001,ECL-7.1,"User authenticated with valid payment method. Bike with options PDP accessible. Cart empty. GA4 dataLayer accessible.","user={{USER_EMAIL}}; password={{USER_PASSWORD}}; front_url={{FRONT_URL}}; seat_total=365.00; card={{TEST_CARD_NUMBER}}; exp={{TEST_CARD_EXP}}; cvv={{TEST_CARD_CVV}}","[NAV] Navigate to Bike with options PDP; [WAIT] Configure widget; [ACT] Select Seat option (total $365.00); [ACT] Set qty 1; [ACT] Click 'Add to Cart'; [WAIT] Success notification; [NAV] Navigate to {{FRONT_URL}}/cart; [ACT] Proceed to checkout — complete shipping address and payment with {{TEST_CARD_NUMBER}}/{{TEST_CARD_EXP}}/{{TEST_CARD_CVV}}; [ACT] Click 'Place Order'; [WAIT] Order confirmation page loads; [KEY] Execute in browser console: window.dataLayer.filter(e => e.event === 'purchase'); [VAR] Capture purchase event from dataLayer","[STATE] dataLayer contains purchase event after order confirmation page loads; [DATA] purchase.ecommerce.value = 365.00 (configured total including option — NOT just base $350); [DATA] purchase.ecommerce.transaction_id matches order number on confirmation page; [DATA] purchase.ecommerce.items[0].price = 365.00; [DATA] purchase.ecommerce.items[0].quantity = 1; [DATA] purchase event fires exactly once (not on confirmation page refresh)","[NETWORK] GA4 collection endpoint receives purchase payload; [CONSOLE] No GA4 JS errors; [ADMIN] Order exists in admin with matching total; [API] Order total = 365.00 + shipping + tax","purchase event missing; value = 350.00 (base only — option surcharge lost in analytics); transaction_id null or mismatched; purchase fires twice on confirmation page refresh",Order placed — cancel via admin if needed for re-run,GAP-S36-003; BL-CROSS-005; BL-CHK-006,Manual
CFG-E2E-054,E2E: Eventual Consistency — Config Section Price Change Reflected on Storefront Within 120 Seconds,Configurable Products > E2E Concurrency,Medium,BL-CROSS-009; BL-CAT-003,ECL-14.2,"Admin logged in at {{BACK_URL}}. Configurable Hat product exists with a Product section option. Storefront PDP for Configurable Hat accessible. Initial option price known.","admin={{ADMIN_EMAIL}}; admin_pass={{ADMIN_PASSWORD}}; back_url={{BACK_URL}}; front_url={{FRONT_URL}}; product_url=/products-with-options/configurable-caps-shirts/configurable-hat","[NAV] In admin: navigate to {{BACK_URL}} > Catalog > Products > Configurable Hat > Configuration tab; [ASSERT] Record current price of the first Product section option (initial_option_price); [ACT] Edit the option price to initial_option_price + $5.00; [SAVE] Save the configuration change; [WAIT] Note exact timestamp T0 of save; [NAV] Immediately navigate to {{FRONT_URL}}/products-with-options/configurable-caps-shirts/configurable-hat in storefront; [ASSERT] Check if option price already updated — may still show old price within first 60s (acceptable per BL-CAT-003); [WAIT] 120 seconds from T0; [NAV] Hard reload the storefront PDP; [ACT] Select the edited option; [ASSERT] Observe total price","[STATE] Within first 60s: old price may still be shown on storefront (acceptable — within lag window per BL-CAT-003); [STATE] At T0+120s: storefront MUST show new updated option price — old price after 120s is a BL-CROSS-009 violation; [MATH] Total price after option selection = base price + new_option_price (initial + $5.00); [FORMAT] Price formatted to 2 decimal places","[API] productConfiguration GraphQL query at T0+120s returns updated salePrice for the edited option; [ADMIN] Configuration blade still shows new option price (admin always live); [CONSOLE] No errors on price display","Storefront still shows old option price after 120s; total price calculation uses stale price; productConfiguration GraphQL response cached beyond 120s; admin save fails silently",Restore option price to initial value after test,GAP-S36-004; BL-CROSS-009; BL-CAT-003,Manual
```

---

## 4. config/test-suites.json UPDATE

In `config/test-suites.json`, find the suite 36 entry and update `testCount` from `133` to `139`:

```json
"testCount": 139,
```

Also update `estimatedMinutes` from `200` to `210` (6 new cases × ~10 min average for mixed layer cases):

```json
"estimatedMinutes": 210,
```

---

## Summary of Changes

| Change Type | Count |
|-------------|-------|
| BL-CFG-* phantom ID replacements (find/replace) | ~145 occurrences |
| Business_Rule empty field fixes | 6 cases |
| ECL-14.5 reference additions | 4 cases |
| BL-CROSS-012 addition | 1 case |
| New test case rows appended | 6 rows |
| config/test-suites.json testCount update | 133 → 139 |
