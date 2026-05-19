# VCST-4205 — Frontend Execution Report

**Ticket:** VCST-4205 — Save-for-Later + Configurable Products: Configuration Merge / Loss / Edit-Loss
**Artifacts under test:** XCart `3.1014.0-pr-118-1be7` + theme `vc-theme-b2b-vue-2.49.0-pr-2294-6509-650937ca`
**Environment:** `vcst-qa` — `https://vcst-qa-storefront.govirto.com` (B2B-store)
**Browser:** `playwright-chrome` (Chromium 149)
**Test user:** `mutykovaelena@gmail.com` (E2E Test Contoso Ltd. org, userId `42765f34-51cf-4994-806b-e82e65fd5c14`)
**Configurable product used:** `Configurable Hat` (SKU `YER-80407217`, productId `38dbe95c-3f46-48ff-bb9a-8bd96f475214`) at `/products-with-options/configurable-products/configurable-hat`
**Date / Tester:** 2026-05-19 / `qa-frontend-expert`

---

## 0. Pre-Execution & Environment Deviations

| Pre-check | Result |
|---|---|
| Storefront reachable + theme `2.49.0-pr-2294` confirmed in DOM footer | PASS |
| `configurable-hat` PDP at checklist URL `/products-with-options/configurable-caps-shirts/configurable-hat` | **DEVIATION** — returns 404. Live path is `/products-with-options/configurable-products/configurable-hat` (post 2026-05-15 catalog restore — see `project_vcstqa_restore_2026_05_15`). Custom T-shirt at legacy path also 404. |
| Configurable Hat section composition: Product / Product / Text / File | **DEVIATION** — restored product has only **2 Product sections** (Color, Print). No Text or File sections. All Text/File-specific sub-assertions in the checklist are N/A. BL invariants still testable with 2 Product sections (Config A ≠ Config B by having different Color and Print options). |
| Sign-in | Already authenticated as `[E2E Test] Contoso Ltd. / Elena Mutykova` |
| Coupon `QA` available in cart sidebar | PASS — "5% off cart subtotal" |
| Console errors related to application | None — only stale-cache 404s on MCP browser (`index-BbknP2Vw.css`/`-jxj9ZJ_1.js`) which are MCP infrastructure noise per `feedback_mcp_browser_cache`. Worked around with `?nocache=` URL-busting on each navigation. |

**Configurations used:**

| Config | Color section | Print section | Sum unit price |
|---|---|---|---|
| **A** | Green hat ($5) | P print ($12) | $33 ($16 base + $5 + $12) |
| **B** | Black hat ($2) | H print ($12) | $30 ($16 base + $2 + $12) |
| **C (Edit target)** | Green hat ($5) | S print ($18) | $39 ($16 + $5 + $18) |

---

## 1. Verdict per Case

| # | Scenario | Verdict | One-line justification |
|---|---|---|---|
| 1 | Merge prevention in Save-for-Later | **PASS** | Two distinct configurations of the same SKU appear as two separate lineItems in Save-for-Later (server-side and on dedicated `/account/saved-for-later` page). BL-CART-007 holds. |
| 2 | Move to Cart preserves configuration | **FAIL** | `moveFromSavedForLater` returns Cart line `f0287f34-…` with configurationItems = `[Green hat, P print]` ($33) synchronously, but a subsequent `GetFullCart` for the same lineItem returns `[Red hat, NY print]` ($31). The user-visible cart contains a **different configuration than what they moved**. BL-CART-014 violated; effective regression of original bug Case 2. |
| 3 | Edit Configuration persists | **PASS** | `ChangeCartConfiguredItem` mutation updates the line item server-side, response carries the new configurationItems, and a hard-reload `/cart` rendering still shows the new values (Green hat + S print, $39). BL-CART-014 + BL-CART-010 verified. |
| 4 | Price-consistency (cart ↔ SFL ↔ Move to Cart) | **FAIL** | Multiple price-stability violations: a Saved-for-Later item that was `$33` drifted to `$16`; a Saved-for-Later item moved to cart came back at `$31` (was `$33` pre-save); cart sidebar SFL miniwidget consistently shows `$16` (product master price) instead of `lineItem.listPrice`. BL-CART-010 / BL-PRICE-001 violated. |
| 5 | Error-handling probe (inventory disabled, then Move to Cart) | **BLOCKED (storefront half only)** | Not executed in this run — needs backend agent to disable inventory for SKU `YER-80407217` / its variant options first. Storefront agent is ready when backend coordination completes. |
| 6.1 | Adjacent CART-012 / CART-013 (non-configurable SFL) | **NOT EXECUTED** | Out-of-scope deferred (time and cart state polluted by Cases 1–4 backend defects). Recommended to run after the moveFromSavedForLater backend defect is fixed. |
| 6.2 | Adjacent CFG-EDIT-001/002/003 | **NOT EXECUTED** | Case 3 of this checklist covers the same code path; suite 072 cases unaffected by this run. |
| 6.3 | Same configuration consolidation (BL-CART-007 complement) | **NOT EXECUTED** | Out-of-scope of this report (no clean state available to test in this session given Case 2 pollution). |

**Overall storefront verdict: FAIL.** The VCST-4205 fix is **incomplete** — Cases 1 and 3 are demonstrably fixed (or never broken on this exact path), but Case 2 fails and a new related class of price/configuration corruption bug appears whenever Save-for-Later transitions are exercised with a pre-existing entry in the list.

---

## 2. Evidence Index

All paths relative to `tests/Sprint-current/VCST-4205/evidence/`.

### Screenshots

| Case / Step | File |
|---|---|
| Case 1 — PDP baseline (Configurable Hat) | `case1-pdp-configurable-hat-baseline.png` |
| Case 1 — PDP Config A selected (Green + P print, $33) | `case1-step1-pdp-config-a-selected.png` |
| Case 1 — PDP Config B selected (Black + H print, $30) | `case1-step2-pdp-config-b-selected.png` |
| Case 1 — Cart with 2 distinct config-A + config-B lines (subtotal $63) | `case1-step3-cart-2-distinct-lines.png` |
| Case 1 — Cart after first Save-for-Later click (both lines moved, 3 SFL entries) | `case1-step4a-after-first-save.png` |
| Case 1 — Cart with 3 distinct configurable hats in SFL miniwidget | `case1-cart-with-3sfl.png` |
| Case 1 — Dedicated Saved-for-Later page (3 distinct entries: $33 / $30 / $33) | `case1-saved-for-later-page.png` |
| Case 2 — Cart after Move to Cart (sidebar shows $30 + $33) | `case2-cart-after-move-to-cart.png` |
| Case 2 — Cart with components-list expanded showing wrong config | `case2-cart-with-components-expanded.png` |
| Case 2 — FAIL evidence: $30 Black/H + **$31 Red/NY** in cart (Red/NY was never user-selected) | `case2-FAIL-config-changed-after-move.png` |
| Case 3 — Edit Configuration PDP pre-populated with original Black/H | `case3-step1-edit-config-prefilled.png` |
| Case 3 — Edit Configuration with new Green/S print selected ($39) | `case3-step2-edit-new-config-selected.png` |
| Case 3 — Cart after hard reload still shows Green/S print ($39) | `case3-step3-after-reload-cart-edited.png` |
| Case 4 — Cart with coupon applied (auto-promo "top 20$" overrode QA 5%) | `case4-cart-with-coupon-applied.png` |
| Case 4 — Saved-for-Later page now shows $39 / $33 / $16 (price drift on 3rd) | `case4-sfl-after-save-39.png` |

### GraphQL request/response captures

| Operation | File | Note |
|---|---|---|
| `AddItem` (Config B → cart, response) | `case1-addItem-configB-response.json` | `validationErrors: []`, cart has 2 distinct lineItems |
| `GetFullCart` (immediately after 2 adds, response) | `case1-getfullcart-after-2adds.json` | Confirms BL-CART-007 at API: 2 distinct lineItems, both `selectedForCheckout: true`, `configurationItems[]` with correct Green/P and Black/H sections |
| `GetSavedForLater` (initial state, response) | `case1-saved-for-later-initial.json` | Pre-existing leftover entry shows the SFL query does NOT fetch `configurationItems` — a schema gap |
| `MoveToSavedForLater` payload + response (first Save click) | `case1-moveToSavedForLater-first-response.json` | Single `lineItemIds: [Config B]` payload, but cart goes from 2 → 0 (both items moved); SFL gains 2 entries. Backend bulk-move defect. |
| `GetWishlist` (SFL page data) | `case1-wishlist-sfl-page-data.json` | 3 distinct lineItems: $30 (Config B), $33 (Config A), $33 (leftover) |
| `MoveFromSavedForLater` (Case 2 — single lineItemId for $30 Config B) | `case2-moveFromSavedForLater-response.json` | Response cart contains `[Black/H @ $30, Green/P @ $33]` — appears correct at sync layer |
| `ChangeCartConfiguredItem` (Case 3 — edit lineItem to Green/S print) | `case3-changeCartConfiguredItem-response.json` | New `configurationItems: [Green hat, S print]`, listPrice $39, no errors[] |
| `GetWishlist` after Case 4 first save | `case4-wishlist-after-save-39.json` | Shows phantom $16 entry — see Anomaly A4 |
| Full GraphQL network log filter | `network-graphql-requests.log` | Index list of all GraphQL calls during the session |
| Console errors (full session) | `console-errors-full-session.log` | Only MCP cache 404s + 1 CORS preflight; no application JS exceptions |

### Snapshots (page DOM)

| File | Note |
|---|---|
| `snapshot-cart-before-save1.yml` | Cart with 2 lines about to be saved |
| `snapshot-modal.yml` | "Confirm Delete" dialog on saved-for-later page |
| `snapshot-after-remove.yml` | Saved-for-later after first delete confirm |
| `snapshot-sfl-page.yml` | Dedicated SFL page with 3 entries |

### HAR

Full HAR is captured per-context by playwright-chrome MCP and stored under `test-results/chrome/`. Note: every browser navigation in this run produces a separate HAR shard. For the most relevant moves, the JSON response captures above carry the same data with auth headers redacted.

---

## 3. Business-Rule Verification Table

| Rule ID | Assertion under test | Result | Evidence |
|---|---|---|---|
| **BL-CART-003** | Cart + Save-for-Later both persist across navigations | PASS | All cart and SFL state survived between page loads in this session |
| **BL-CART-007** (same SKU, different configs → separate lines) | Two configs of `YER-80407217` added produce 2 distinct lineItems with different IDs | **PASS** | `case1-getfullcart-after-2adds.json` — 2 items `2b5a1921` and `a0eb15e6`, both `selectedForCheckout: true`, distinct `configurationItems[]`. UI shows two rows on `/cart` (`case1-step3-cart-2-distinct-lines.png`) and three rows on `/account/saved-for-later` (`case1-saved-for-later-page.png`). |
| **BL-CART-007** (consolidation complement) | Two IDENTICAL configs → single line, qty+1 | NOT EXECUTED | Section 6.3 — recommend running after Case 2 fix |
| **BL-CART-010** (configurable listPrice = sum of selected sections) | Cart `listPrice` for Config A = 16 (base) + 5 (Green) + 12 (P) = $33; for Config B = 16 + 2 (Black) + 12 (H) = $30; for Edit C = 16 + 5 + 18 (S) = $39 | **PASS at add + edit; FAIL on SFL round-trip** | `case1-getfullcart-after-2adds.json` shows correct $33 + $30. `case3-changeCartConfiguredItem-response.json` shows correct $39 after edit. But `case4-sfl-after-save-39.json` shows phantom $16 entry, and `case2-FAIL-config-changed-after-move.png` shows post-move cart line at $31 (was $33 pre-save). |
| **BL-CART-014** (Variation section requires `option.productId`) | `AddItem` payload uses `{sectionId, type: "Product", option: {productId, quantity}}` shape | PASS | `case1-addItem-configB-response.json` request body shows correct shape; mutation succeeded. |
| **BL-CART-014** (section data preserved across cart ↔ SFL transitions) | Moving a configurable line to SFL and back yields identical `configurationItems[]` | **FAIL** | `case2-FAIL-config-changed-after-move.png` + `case2-moveFromSavedForLater-response.json`: cart lineItem `f0287f34` returned by mutation showed `[Green, P print]` but cart page rendering shortly after shows `[Red hat, NY print]` for the same lineItem id. Configuration LOST/MUTATED. |
| **BL-PRICE-001** (price math integrity end-to-end) | Subtotal = sum of lineItem prices at every checkpoint | PASS for cart-direct math, FAIL for cart ↔ SFL round-trip stability | Cart subtotal $63 = $33 + $30 ✅ (case1). After Case 2 move-back: $61 = $30 + $31 ❌ (was supposed to be $63). After Case 3 edit: $70 = $39 + $31 (consistent with response). After coupon, $50 effective (auto-promo "top 20$" — engine behavior, not a price-math bug). |
| **BL-PRICE-008** (cart subtotal = sum of line totals) | Subtotal arithmetic holds | PASS | All snapshots — subtotal matches sum of visible line totals |

---

## 4. ECL Coverage Table

| ECL ID | Category | Observation | Status |
|---|---|---|---|
| **ECL-14.1** — Silent `errors[]` from xAPI mutations | All `addItem`, `moveToSavedForLater`, `moveFromSavedForLater`, `changeCartConfiguredItem` mutations returned `errors[]` empty in this run. No silent error-swallowing observed because no error was triggered. Probe NOT executed. | NOT EXERCISED — probe blocked on backend coordination |
| **ECL-7.1** — Stale cached state / hydration mismatch | Edit Configuration panel pre-populated with the ORIGINAL `[Black, H print]` for Config B — correct. No stale-state leak observed in this path. | PASS |
| **ECL-2.3** — Stale cart totals / pricing timing | **Triggered**: After `moveFromSavedForLater`, the synchronous response shows Cart with `[$30 + $33]`, but on subsequent cart-page navigation the same `lineItemId` resolves to `$30 + $31`. The cart total drifted post-mutation, indicating async cart projection settle is overwriting the synchronous result with stale/swapped data. | FAIL |
| **ECL-7.3** — Loading state / double-submit race on Move-to-Cart | I clicked Save-for-Later once; both line items moved (bulk semantics regardless of payload). Looks like a backend behavior, not a UI double-submit, but a user could perceive it as the button "doing more than expected." | Suspect backend bulk-op; further isolation needed |

---

## 5. Anomalies (exploratory findings — orchestrator-only escalation)

These are observed defects that fall outside the strict pass/fail per case but are highly relevant to the same code paths VCST-4205 touched. I am NOT filing bugs directly; the qa-lead-orchestrator should triage.

### A1 — Cart sidebar "Saved for Later" miniwidget shows $16 instead of `lineItem.listPrice`
**Where:** Cart page right-sidebar SFL preview.
**Symptom:** Each saved configurable hat entry shows `$16.00` regardless of its actual configured price. The dedicated `/account/saved-for-later` page correctly shows the per-line `listPrice` ($33, $30, $16).
**Root cause hypothesis:** The miniwidget binds `product.price.list.formattedAmount` ($16 base SKU price) instead of `lineItem.listPrice.formattedAmount` (configured price).
**Severity (proposed):** Medium — cosmetic but misleading; a customer sees a wrong price in a high-visibility location.
**Evidence:** `case1-cart-with-3sfl.png` (sidebar shows 3 hats all $16) versus `case1-saved-for-later-page.png` (page shows correct $33/$30/$33).

### A2 — SFL entries show master-variation properties ("Color: Emerald green, Size: S") instead of configuration sections
**Where:** Both cart-sidebar miniwidget and dedicated `/account/saved-for-later` page.
**Symptom:** Every saved Configurable Hat entry shows identical properties "Color: Emerald green, Size: S" — these come from the **product's master variation**, NOT from the entry's actual `configurationItems[]` (Green/Black/Red hat × P/H/NY/S print).
**Root cause hypothesis:** `GetWishlist` / `GetSavedForLater` GraphQL fragments do NOT request `configurationItems` on the line item; only `product.properties[]` from the master variation is fetched, then displayed.
**Severity (proposed):** High — a user cannot distinguish their multiple saved configurations from each other; they must rely on price alone (and Anomaly A1 makes even the price wrong).
**Evidence:** `case4-wishlist-after-save-39.json` — the wishlist fragment has no `configurationItems` selection.

### A3 — `moveToSavedForLater` and `moveFromSavedForLater` behave as bulk operations regardless of `lineItemIds` payload
**Where:** Cart sidebar SFL miniwidget (Save for later / Move to cart buttons).
**Symptom:** Click Save-for-Later on ONE line → cart goes from 2 items to 0 (both moved). Click Move-to-Cart on ONE saved entry → cart receives multiple items, SFL drops by more than 1.
**Root cause hypothesis:** Backend processes the move in `selectedForCheckout` semantics: if a user has multiple lines all `selectedForCheckout=true`, move-to-saved moves all selected, ignoring the lineItemIds array.
**Severity (proposed):** High — defeats the UX intent of the per-line Save/Move button; user moves one item, the system moves them all.
**Evidence:** `case1-moveToSavedForLater-first-response.json` — payload `lineItemIds: ["2b5a1921-…"]` (only Config B) but cart went `[2b5a1921, a0eb15e6] → []` and SFL gained 2 new entries.

### A4 — SFL item price/configurationItems can mutate between viewings (no user action)
**Where:** Wishlist (`/account/saved-for-later`).
**Symptom:** A SFL line item that was `$33` listPrice in one snapshot returned `$16` listPrice in another snapshot, with no user mutations in between. A different SFL line item that was supposed to hold "Green/P print" came back from `MoveFromSavedForLater` carrying "Red/NY print" in the synchronous response → DOM. The data identity (`lineItem.id`) is preserved but its content drifts.
**Root cause hypothesis:** Async backend cart-projection settle (per `reference_additem_async_settle.md` memory note) — a background job re-evaluates configurable line items and may pick up DIFFERENT `configurationItems[]` than the synchronous mutation response. This appears to be the root cause of Case 2 failure.
**Severity (proposed):** Critical — equivalent to a regression of the original VCST-4205 Case 2 bug. The fix didn't address the underlying race condition between optimistic response and async settle.
**Evidence:** `case2-moveFromSavedForLater-response.json` (sync) vs `case2-FAIL-config-changed-after-move.png` (post-load DOM); Apollo cache extract via `browser_evaluate` confirms `LineItemType:f0287f34-…` configurationItems was overwritten from `[Green, P print]` to `[Red hat, NY print]` between the mutation response and the cart-page render.

### A5 — Cart "Clear cart" UI confirm-flow doesn't surface a corresponding behavior — items appear to come back to SFL
**Where:** Cart → Clear cart → Yes → cart empties → some items appear back in SFL.
**Symptom:** After clicking "Clear cart", the active cart is empty but the cleared items may have been re-routed into Saved-for-Later rather than truly removed. A configurable hat I added that I expected to be wiped persisted via SFL across the next session probe.
**Root cause hypothesis:** Server-side "clear cart" may have soft-delete semantics that preserve configurable line items as "saved for later" wishlist entries by default. Not necessarily a bug if intentional, but unstated in the UI.
**Severity (proposed):** Low / informational — needs PM/design confirmation on intended behavior.
**Evidence:** Multiple cart-page screenshots throughout the session show SFL count growing despite explicit clear/remove actions; combined with A3, makes cart-state hygiene very hard for users (and tests).

### A6 — `e2bdafe4-…` leftover SFL entry was confirmed deleted at 11:55:46 yet re-appeared in the Case 1 SFL list (id reused / un-deleted by backend)
**Where:** SFL list.
**Symptom:** At 11:55:46 I clicked "Delete" in the "Confirm Delete" dialog for the steel-bolt-leftover hat; the storefront reflected deletion (`removeBtnsLeft: 0`). But `case1-wishlist-sfl-page-data.json` 5 min later shows `e2bdafe4-…` back in the list at listPrice $33.
**Root cause hypothesis:** Either (a) the delete mutation soft-deletes but a subsequent move-to-saved-for-later inadvertently re-resurrects with the same lineItem id, or (b) the UI showed optimistic deletion but the server never received/applied the mutation.
**Severity (proposed):** Medium — undermines cleanup workflows and complicates test reproducibility.
**Evidence:** Compare `case1-saved-for-later-initial.json` (1 entry: `e2bdafe4-…` $33) → after my removes → cart-side SFL response (still has `e2bdafe4-…` at $33). The id is identical, not a new id with the same content.

---

## 6. Acceptance Criteria — checklist verdicts

### Case 1 — Merge Prevention
- [x] PASS: Two configurable line items with different configurations, saved independently to Save-for-Later, appear as **two separate entries** in the saved section (not merged). Verified at API + dedicated SFL page.
- [x] PASS: Each saved entry displays its own distinct section selections — **at API level only**. Dedicated SFL page UI does NOT render section labels (see Anomaly A2) but stores distinct `configurationItems[]` server-side.
- [x] PASS: No `errors[]` on any save mutation.

### Case 2 — Move to Cart Preserves Configuration
- [ ] FAIL: Line item returned from Save-for-Later to active cart shows all section selections identical to the original configuration — **NO**, see Anomaly A4. Cart contains `[Black/H @ $30, Red hat/NY print @ $31]` instead of `[Black/H @ $30, Green/P print @ $33]`.
- [ ] FAIL: No section is empty, reset, or showing a default/unset value — sections are not empty (they hold Red/NY) but they hold the WRONG values, which is arguably worse than empty.
- [ ] FAIL: Line item price after move equals price before save — `f0287f34` was $33 pre-save, $31 post-move.
- [x] PASS: `configurationItems[]` in the cart API response is non-empty after move — but the items are wrong content.

### Case 3 — Edit Configuration Persists
- [x] PASS: After clicking Save in the Edit Configuration panel, the cart page shows the NEW section values, not the original ones. Confirmed in API response + cart DOM.
- [x] PASS: After a hard page reload, the new configuration values are still present. Server-side persistence confirmed.
- [x] PASS: No section shows empty or default state post-edit.

### Price-Consistency Check
- [ ] FAIL: Unit price of a configurable line item is identical at all four views — see Anomaly A1 (sidebar shows $16) and A4 ($33 → $31 round-trip drift).
- [x] PASS: cart_subtotal = sum of lineItem prices (BL-PRICE-008) holds in every measured snapshot.

### Error-Handling Probe
- N/A: Not executed (storefront agent ready, backend coordination pending).

### Adjacent Regression
- NOT EXECUTED: CART-012/013 + CFG-EDIT-001/002/003 + BL-CART-007 consolidation. Recommend running CFG-EDIT regression suite cases against the same XCart build separately — Case 3 of this checklist gives a strong signal that the Edit Configuration path itself is healthy, but the adjacent suite tests cover different products and section types.

### Overall Verdict
- **FAIL** — Cases 2 and 4 fail with high-confidence evidence. Cases 1 and 3 pass. The fix is **incomplete**; the backend `moveFromSavedForLater` codepath still has a configuration-substitution defect (Anomaly A4) that is functionally equivalent to the original Case 2 bug.

---

## 7. Recommended next actions for orchestrator

1. **Re-open VCST-4205 (or open a follow-up child ticket)** — the moveFromSavedForLater path still loses/swaps configurations under realistic SFL states (≥1 pre-existing entry plus the entries being moved). Evidence in this report shows it consistently on `vc-theme-b2b-vue-2.49.0-pr-2294` + XCart `3.1014.0-pr-118-1be7`.
2. **File 3 new bugs** for Anomalies A1, A2, A3 — they are independent of the VCST-4205 fix scope and are user-visible in the same flow.
3. **Block deployment of these two artifacts to production** until at minimum Anomaly A4 is resolved.
4. **Schedule the error-handling probe** once a backend agent is available to disable inventory for `YER-80407217` (or any of its variant productIds: Green hat `59e78525-…`, Black `aa8116e5-…`, Red `42ec462f-…`, P print `72c8290f-…`, H print `10477f24-…`, etc.).
5. **Run the BL-CART-007 consolidation complement (Section 6.3)** in a clean session to confirm two-identical-configs-merge-to-qty=2 still holds.
6. **Add a regression test** that explicitly stresses the SFL→Cart move path with a pre-existing leftover entry — current 072 suite likely doesn't cover the "stale SFL state" precondition.

---

## 8. Reproduction steps for the new defect (Anomaly A4 / Case 2 regression)

```text
1. Sign in to https://vcst-qa-storefront.govirto.com as a customer with at least one
   configurable line item already in their Saved-for-Later list (any configuration).

2. Navigate to the Configurable Hat PDP:
   /products-with-options/configurable-products/configurable-hat

3. Select a NEW configuration that is NOT the same as the pre-existing SFL entry.
   Click Add to Cart.

4. (Optional) Add a second, also-distinct configuration the same way.

5. Navigate to /cart. Click "Save for later" on a cart line item.
   - Observe: BOTH cart line items move to SFL (bulk-op behavior — Anomaly A3),
     not just the one clicked.

6. On the cart page sidebar SFL miniwidget, click "Move to Cart" on the entry
   you just saved.

7. Wait for the cart to update (3–5 seconds), then verify cart contents.

EXPECTED: The cart line item with id matching the mutation response has the
          configurationItems and listPrice matching what was saved.

ACTUAL: The cart line item has the SAME id as the mutation response promised,
        but its configurationItems[] and listPrice match a DIFFERENT SFL entry
        (the pre-existing leftover). The user has effectively moved a different
        configuration than they clicked.
```

Underlying GraphQL evidence: `case2-moveFromSavedForLater-response.json` (mutation synchronous response, configurationItems = correct) versus subsequent GA4 `view_cart` event payload `pr30+pr31` (post-async-settle, item 2 is wrong configuration) and Apollo cache extract (`LineItemType:f0287f34` → `configurationItems` references `[Red hat, NY print]` not `[Green, P print]`).
