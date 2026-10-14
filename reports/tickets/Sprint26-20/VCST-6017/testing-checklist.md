# Testing checklist — VCST-6017 (Artifact B)

Beacon (markup) analytics for product lists and Page Builder blocks · vc-frontend#2543 · FULL · vcst-qa theme `2.60.0-pr-2543-0127-01276486`
Model: `reports/ba/test-models/VCST-6017-2026-10-13.md` (26 scenarios) · Discovery: `reports/exploratory/SBTM-VCST-6017-2026-10-13.md`
Observe `window.dataLayer` (gtag arrays: `e[0]==='event'`, `e[1]` = event name) + `/g/collect` (`en=`). Roles: `data-vc-track` (not `data-name`).
Count per action = entries after the action minus entries before it. Pre-PR baseline: vcptcore-qa (theme pr-2485, no markup).
Case column: `043/GA-nnn` — GA-034..GA-058 authored by this run (Draft, executed in C1); GA-001..GA-033 pre-existing. Verdict filled at Step 5.

## A. Page Builder pages (operator priority)

| # | Condition | Where | Expected | Model # / case | Verdict |
|---|---|---|---|---|---|
| A1 | Home products block (guest) sends one impression on load | `/` guest, "Daily Deals" | 1 `view_item_list` `item_list_id=products_block`, `item_list_name`=block title, `items[]` = rendered cards, BL-GA4-001 item schema | #1, #2 / 043/GA-034, GA-035 | PASS — 1 `products_block` "Daily Deals", 17 items = 17 cards, schema OK, `/g/collect` 204 (4a-1) |
| A2 | Home products block (signed-in content) | `/` signed in | 1 `view_item_list products_block` with this user's block items and prices | #2 / 043/GA-035 | PASS — 4 items, prices = displayed; name keeps CMS trailing space (Low, content) |
| A3 | Title click in a Page Builder block | `/` guest (signed-in click: see Uncovered) | exactly 1 `select_item` with `item_list_id=products_block` + the clicked product | #1, #7 / 043/GA-034 | PASS (guest) — 1 `select_item products_block` |
| A4 | Action buttons in a block send no `select_item` | `/`: Add to cart, qty +/-, Add to list, Compare, carousel arrows | business event only (`add_to_cart`/`add_to_wishlist`) or nothing; 0 `select_item` | #8 / 043/GA-041 | PASS — qty+/− → add_to_cart/update_cart_item only; compare, arrows → 0 `select_item` |
| A5 | Seeded Page Builder page — every marked block type sends its own impression | `@td(PB_GA4_PRODUCT_LISTS.url)` = `/agent-test-ga4-product-lists` | one `view_item_list` per block: `products`, `predefined-product-list` (both `products_block`, separate events, own items), `products-carousel` titled + untitled (`products_carousel`; untitled omits `item_list_name`), `favorite-products` | #23, #16 / 043/GA-055 | PASS — 5 `view_item_list`, one per marked block, disjoint items; untitled omits name; 1920 + 390 |
| A6 | Unmarked block types send nothing | same page: `demo-product-list`, `product-info` | 0 events from these blocks (by design of the PR) — `product-info` absence recorded as a question for AC6 | #23 / 043/GA-055 | PASS — 0 events (unmarked by PR); `product-info` = question for AC6 |
| A7 | Below-the-fold blocks send on load without scrolling | same page: `predefined-product-list` + untitled carousel below a 2600 px spacer | `view_item_list` present before any scroll | #23 (C-4.b) / 043/GA-055 | PASS — blocks at 6345/7185 px sent at scrollY 0 |
| A8 | Favorite products block (a product QUERY block) | product-lists page (matching) + `/agent-test-ga4-html-product-lists` (filter matches nothing) | 1 `favorite_products` with the block's items; no event for the empty block | #17 / 043/GA-050 | PASS — 1 `favorite_products` (4) + 1 `select_item`; empty block → 0 |
| A10 | Plain-HTML product markup (`data-product-*`) | `@td(PB_GA4_HTML_LISTS.url)`: `agent_test_html_full` (id/sku/name/price) + `agent_test_html_partial` (name+price) | full: `view_item_list` + `select_item` with partial items, no console error; partial: NOT re-sent on unrelated DOM changes (toast, cart badge) | #18, #19 / 043/GA-051, GA-052 | **FAIL** — full list OK; partial (name+price) list re-sent on every DOM change: 1 → 13 events, each a `/g/collect` hit (IN-SCOPE bug, Medium) |
| A9 | Products carousel titled + untitled | product-lists page, 1920 and 390 | each product at most once in `items[]`; untitled carousel omits `item_list_name`; a title click/tap → 1 `select_item` | #15 / 043/GA-048, GA-049 | PASS — each product once (5 in items, 4 visible); arrows → 0; title → 1 |

## B. Product page and product lists

| # | Condition | Where | Expected | Model # / case | Verdict |
|---|---|---|---|---|---|
| B1 | PDP sends one `view_item` after `config` | Epson / Canon PDP cold load + reload | `config` before `view_item`; exactly 1 `view_item`, `value` = product price, `currency` set | #9 / 043/GA-042, GA-003 | PASS — config before view_item; 1 per load; value 190 / 189 |
| B2 | Recommended list impression + click | Epson / Canon PDP | 1 `view_item_list recommended_products_<model>`, `related_id` = PDP product id, `related_type=product`; card title click → 1 `select_item` with same params | #1 / 043/GA-034 | PASS — `recommended_products_bought-together`, related_id = PDP id, 5 = API count; click → 1 |
| B3 | Related products widget (grid <lg, carousel ≥lg) | `@td(PROD_GA4_RELATED_ANCHOR.url)` (10 associations) | 1 `view_item_list related_products` + `select_item` on click | #4 / 043/GA-037 | PASS (mechanics) — 10 items at 1920, click → 1; width issue under B6/B7 |
| B4 | SPA A → B → Back keeps list params consistent | PDP A → recommended card → B → Back | no event pairs B's items with A's `related_id`/name; Back re-sends A's view | #11 / 043/GA-044 | PASS — no mixed params; Back re-sends A |
| B5 | Same-id refetch does not re-send | PDP: add to cart (refetch) | 0 extra `view_item` / `view_item_list` | #10 / 043/GA-043 | PASS — add to cart sent no re-send (no refetch observed; dedup unexercised here) |
| B6 | **Resize does not re-send a list** (3x: re-sent ×3) | Canon PDP 1920 → 800 → 1920 | 1 `view_item_list` per list per page view | #24 / 043/GA-056 | **FAIL** — Canon 1920→800→1920 ×2 cycles: 6,5,6,5,6 events; related 4/10/4; RB 6/4/6; pre-PR no re-send (Chrome + Edge) — IN-SCOPE bug, Medium |
| B7 | Cold-load impression = the cards rendered at that width (ASSERTION_DEFECT fixed: the PR README defines items as rendered `product-card` descendants) | PDP at 390 / 800 / 1920 | `items.length` = rendered cards; every item_id in the API result; 1 event per cold load. Whole-array parity vs pre-PR = open author question on the B6 bug | #25 / 043/GA-057 | PASS vs fixed expectation — 4/5/6 = rendered cards at 390/800/1920; parity question → B6 bug |
| B8 | Variations widget sends `view_item_list` only | `@td(PROD_GA4_VARIATION_PARENT.url)` (60 variations), default + table view | 1 `view_item_list variations` (`related_id` = parent); no `select_item`; items vs pre-PR whole set | #6 / 043/GA-039 | PASS — 1 `variations` (50 items, related_id = parent); no `select_item` |
| B9 | Variations table pagination | same PDP, page 2 / full view | no cumulative re-send; record what is sent per page | #12 / 043/GA-045 | PASS — page 2 → 11 items, not cumulative; view toggles no re-send |
| B10 | Recently browsed in cart | `/cart` signed-in | 1 `view_item_list recently_browsed_products`; no re-send on a qty change | #5 / 043/GA-038 | PASS — 6 seeded RB; qty change no re-send |
| B11 | Saved-for-later beside recently browsed | `/cart` after `npm run seed:ga4-lists:cart` (8 SFL, 6 RB, disjoint) — no PDP visit before | RB `items[]` has no SFL product; SFL "Show more" sends no `view_item_list`; SFL card click → 1 `select_item` | #14 / 043/GA-047 | PASS — RB∩SFL = 0; Show more → 0 events; SFL click → 1 (manual, shared id per C3) |
| B12 | Card click targets | home block + recommended | title → 1 `select_item`; carousel image/arrows → 0; Customize → 1 (new tab) | #7, #26 / 043/GA-040, GA-046, GA-058 | PASS — title 1, Customize 1 (new tab), image/arrows 0 |
| B13 | Keyboard Enter / ctrl-click on a card link | recommended list | Enter → 1 `select_item`; ctrl-click → 1 | #13 / 043/GA-046 | PASS — Enter 1, ctrl-click 1 |
| B14 | Payload parity vs pre-PR | same product on vcptcore vs vcst: PDP, recommended | `item_list_id/name`, `related_*`, `items[]` fields identical; no `items_skus` | #3 / 043/GA-036 | PASS (data caveat) — top-level keys identical vs vcptcore pre-PR; no shared product between stands |

## C. Must-not-fire (lists kept on manual calls)

| # | Condition | Where | Expected | Model # / case | Verdict |
|---|---|---|---|---|---|
| C1 | Category page: one manual impression, one click | `/products-with-options`, `/snacks` | 1 `view_item_list category_*`, 1 `select_item` per click — no second event | #20 / 043/GA-053, GA-002 (RE-BASE), GA-004 | PASS — category 1 + 1 per click; 0 containers |
| C2 | Search dropdown | header search | 1 `search_bar` per open, 1 `select_item` per click | #20 / 043/GA-053, KB-8A1B3406 | PASS — 1 `search_bar` + 1 `select_item` (KB-8A1B3406 confirmed) |
| C3 | Compare, wishlist, cart line | `/compare`, `/account/lists/…`, `/cart` | 1 event per action (`compare_products`, `wishlist`, `cart`) | #20 / 043/GA-053 | PASS — compare, wishlist (view), cart line: 1 event each, 0 containers |
| C4 | Barcode single-hit redirect — **needs operator OK** (shared B2B-store setting `BarcodeSearchFields=["gtin"]`, then restore `[]`) | `/search?barcode=@td(BARCODE_GTIN_UNIQUE.gtin)` | no `view_item_list` before landing on the PDP; 1 `view_item` there | #21 / 043/GA-054 (Manual — BLOCKED, operator declined the shared setting change) | BLOCKED — TEST_DATA_DEFECT: needs a store with barcode fields configured (shared B2B-store has `[]`, KB-16859F54); operator declined the setting change. Unverified on this build |

## D. Existing suite 043 at risk (2a) and guards

| # | Condition | Expected | Case | Verdict |
|---|---|---|---|---|
| D1 | GA-002 asserts legacy `items_skus` | RE-BASE — run as written; live sends `items[]` (BL-GA4-001) | 043/GA-002 | FAIL as written → STALE_TEST (VCST-5109 replaced `items_skus` with `items[]`); GA-002 rewritten via `/qa-review-tests --fix` |
| D2 | GA-028 / GA-029 filter `e.event` and assert `brand` | REPAIR mechanics only (`e[0]`/`e[1]`/`e[2]`); `brand` kept per BL-GA4-001 — RE-BASE as well: live sends `item_brand`, the run decides | 043/GA-028, GA-029 | FAIL as written → ASSERTION_DEFECT: product follows GA4 `item_brand` (VirtoOZ docs table wrong — docs finding); GA-028/029 re-based to `item_brand`; GA-030..032 same stale filter repaired |
| D3 | GA config unchanged (BL-GA4-004) | currency + language; `user_id` only signed in | 043/GA-019..021 | PASS — guest no user_id; signed-in user_id = account id |
| D4 | Business events untouched (BL-GA4-002/003) | add_to_cart / view_cart unchanged | 043/GA-005, GA-006 | FAIL — GA-005 PASS; GA-006 `view_cart` value 30 (incl. tax) vs case 25 — pre-existing case/live diff, not PR |
| D5 | No new console errors on PDP / home / cart | no error attributable to `dom-analytics` | — | PASS — no JS error from dom-analytics; image 404s/DNS pre-existing |

## E. Docs (AC7) and design

| # | Condition | Expected | Verdict |
|---|---|---|---|
| E1 | README describes roles, `addRules`, trackers, partial product | present (`core/plugins/dom-analytics/README.md`) — role attr is `data-vc-track` (PR body says `data-name`: drift in PR text only) | PASS — README covers roles, rules, addRules, partial products (uses `data-vc-track`; PR body's `data-name` is drift in PR text) |
| E2 | New list ids documented | `products_block`, `products_carousel`, `favorite_products` — NOT in README (C-7.b) | **FAIL** — `products_block`, `products_carousel`, `favorite_products` not in README; README example `recommended_products` vs live `recommended_products_<model>` (Low) |
| E3 | Visual: marked blocks render unchanged (4v) | home, PDP, AGENT-TEST page at 1920 / 390 — BL-UI-*, BL-A11Y-001..004; `vs. DESIGN` SKIPPED (no design link) | PASS (no PR regression) — 7 pre-existing invariant FAILs: F1 CLS (BL-UI-001), F2 carousel arrows not operable (BL-A11Y-001/002, High), F3 arrow overlaps title, F4 contrast 2.11:1 (BL-A11Y-003), F5 variations expand button no name, F6 home images no alt, F7 16 px title links; attribution vs pre-PR INCONCLUSIVE — see design-report.md |

## F. Incidental findings (3x / 4a / 4v — triaged at 5-triage)

| # | Finding | Where | Observed | Source | Verdict |
|---|---|---|---|---|---|
| F1 | Single-image grid card image not clickable | product-card grid | `.vc-product-image__slot` covers `<a class="contents">`; click lands on span, no navigation | 3x, 4v | FAIL — candidate PRE-EXISTING (ui-kit) |
| F2 | `update_cart_item` payload lacks `items[]`/`value` | card stepper, cart | `{item_id,new_quantity,previous_quantity}` only (BL-GA4-002 wording) | 3x, 4a-1 | FAIL — candidate PRE-EXISTING (not in PR) |
| F3 | `add_shipping_info` / `begin_checkout` fire on /cart load | `/cart` | shipping_info (Air, 250) before begin_checkout, again per qty change; empty cart: view_cart + begin_checkout | 3x, 4a-2, 1c | FAIL — candidate PRE-EXISTING (BL-GA4-003 order) |
| F4 | `select_item` items lack `currency`/`index`/list fields | all lists | both markup and manual paths; docs Item fields list currency | 1c, 4a-1, 4a-2 | FAIL — candidate PRE-EXISTING / docs overreach |
| F5 | Docs list `brand`; live sends `item_brand` | ga-events docs | VirtoOZ Item fields vs live dataLayer | 4a-1 | DRIFT — docs vs live (advisory) |
| F6 | Carousel prev/next arrows are bare divs | VcCarousel | no role/tabindex/label (WCAG 2.1.1, 4.1.2) | 4v | FAIL — BL-A11Y, candidate PRE-EXISTING, High |
| F7 | Primary orange contrast 2.11:1 | Filters, View cart | WCAG 1.4.3 | 4v | FAIL — BL-A11Y-003, candidate PRE-EXISTING |
| F8 | Variations expand button has no name | variations widget (table) | axe button-name critical | 4v, 4a-2 | FAIL — BL-A11Y-002, candidate PRE-EXISTING |
| F9 | Home images without alt | `/` slider, benefits | axe image-alt ×6 | 4v | FAIL — BL-A11Y-002, candidate PRE-EXISTING |
| F10 | CLS ≥ 0.25 on Page Builder pages | `/`, product-lists page | 0.49 / 0.64 from features-block, demo-product-list, footer | 4v | FAIL — BL-UI-001, candidate PRE-EXISTING |
| F11 | Carousel prev arrow overlaps first title | related carousel ≥lg | 24×12 px overlap ("Birra" → "Sirra") | 4v | FAIL — proposed BL-UI-007, Medium |
| F12 | `/demo-landing` grid untracked | `/demo-landing` | ProductCard grid, no container, no analytics() before or after the PR | 3x | UNSPEC — not Page Builder; tracking intent unspecified (ask team) |
| F13 | Recently-browsed window counts rows, not products | xAPI `recentlyBrowsed(maxProducts)` | a product with rows in 2 sessions shows N−1 products | 3a | FAIL — candidate backend defect (vc-module-x-recommend) |

**2a dispositions (tc:scope, 34 hits):** GA-002 RE-BASE · GA-028, GA-029 REPAIR + RE-BASE · GA-001, GA-003..GA-027, GA-030..GA-033 and 042/SMK-015 CONFIRMED — unaffected by PR #2543 (login, config, cart, checkout, purchase, search results and wishlist events stay on manual calls); GA-030..GA-032 carry the same stale `e.event` mechanic, outside the PR surface → `/qa-review-tests --fix` follow-up. 7 pre-existing Critical lint findings (GA-004/009/012/014/015/030) are outside this run's scope.
**C1 exact set (27):** GA-002, GA-028, GA-029, GA-034..GA-053, GA-055..GA-058 (GA-054 Manual, BLOCKED). Guard cases GA-003..GA-006 and GA-019..GA-021 are not in C1 by design (C1 = what this run wrote or changed); they ran in 4a as B1/C1/D3/D4.
**Uncovered conditions (stated, not omitted):** A3 signed-in title click — no case (the engine has no user branch; signed-in impression covered by GA-035); 1d G-17 observer performance / event-storm bound — no budget defined, observed only incidentally via A10 and D5; 1d G-18 language/currency switch re-send — not planned (GA tracker untouched, BL-GA4-004 guarded by D3); V12 `addRules` / custom tracker — no live caller (unit tests only); barcode redirect C4 — BLOCKED until the operator approves the shared store-setting change; #20 kept-manual legs left out of GA-053 — saved-for-later page (no verified route on this build) and shared list (needs a second account that shares a list); both are VcLineItem lists with no markup roles, so the category, search dropdown, compare, cart and wishlist legs stand in.
**Not filed (below severity floor):** 8 Low — F1, F2, F4, F11, F13, D4, E2, docs brand/item_brand (see triage-report.md). In-scope A10 + B6 reported as a steps/actual/expected table in comment 111980 instead of filed tickets (operator choice); pre-existing F3/F6/F8/F9/F10 listed, not filed; F7 = VCST-6304.
**Verdict:** FAIL (A10, B6 — IN-SCOPE, Medium). Release gate NO-GO.
