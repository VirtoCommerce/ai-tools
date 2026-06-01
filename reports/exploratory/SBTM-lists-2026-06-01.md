# Exploratory Session: Lists
**Date:** 2026-06-01
**Duration:** ~30 minutes
**Platform:** 3.1032.0
**Theme:** 2.50.0-alpha.2359
**Session type:** [EXP+VAL]
**Discovery technique:** Feature-pair / boundary-of-features hunting + surprise-seeking
**Charter:** Discover scenarios in Lists not covered by suite 007 and not in VC-LIST-* catalog entries
**Env/account:** vcst-qa storefront, Edge (Firefox MCP failed to launch → fell back to playwright-edge). Signed in as `SmokeTest Runner` / org `BMW-Group` (a B2B org user, not a personal account — Lists surface identical except sidebar shows Corporate section). Product seam target: `CFG_LAPTOP` (CFG-013, parent GUID `dd56d770…`, 2 REQUIRED Product sections: RAM, Storage).

## Net-New Scenarios Discovered (mandatory)
| # | Scenario | Why uncovered | What we found | Suggested next charter |
|---|----------|---------------|---------------|------------------------|
| 1 | Add a **configurable** product (non-default config) to a list, then **Add all to cart** | Suite 007 uses only a generic SKU; CFG suites never enter Lists. The Lists↔CFG seam is untested. | **BUG (High):** server rejects the add with `CONFIGURATION_SECTION_REQUIRED` (`itemsQuantity:0, items:[]`), yet the UI shows a green **"Successfully added 1"** result dialog. Cart is empty. False success on a $1,399 item. | "Lists × configurable products end-to-end: add-all-to-cart, buy-now, customize round-trip, qty" |
| 2 | **Buy now** from a list containing a configurable product | Same uncovered seam; Buy-now from Lists never exercised with CFG | **BUG (High):** Buy-now navigates to the secure-checkout cart page which is **empty** ("Your cart is empty") — silent dead-end into checkout with nothing to buy. | (covered by charter above) |
| 3 | **"Customize"** link round-trip from a saved configurable list line | Not in 007; assumed to re-open the saved config | **GAP/UX:** Customize opens the PDP at **default config ($1,099)**, NOT the saved $1,399 (32GB/1TB). Saved config is shown on the list price but cannot be viewed or re-edited. | "Configurable list line: surface chosen options + restore on Customize" |
| 4 | Configured options **not displayed** on the list line item | 007 cards only show name/price for a simple SKU | **OBS:** List line shows product name + correct configured price ($1,399) but **no RAM/Storage breakdown**. A procurement officer can't tell which config was saved. | (folds into #3 charter) |
| 5 | List **name** field accepts short HTML/markup (e.g. `<img src=x onerror=1>`) | 007 covers layout/aria, not injection/escaping | **VAL (safe):** name is escaped everywhere it renders — list card, sidebar, select-list checkbox, detail `<h1>`, delete-confirm prompt. Name field also enforces a **25-char max** (Create disabled past 25). No XSS, no layout break. | — |

## Bugs Found
| # | Severity | Title | Evidence | Net-new? |
|---|----------|-------|----------|----------|
| 1 | **High** | "Add all to cart" from a list reports **"Successfully added 1"** for a configurable product but the cart stays empty (server returns `CONFIGURATION_SECTION_REQUIRED`) — false success, silent loss of a configured $1,399 item | `screenshots/SBTM-lists-cfg-addall-silentfail.png`; GQL `AddItemsCart` resp: `itemsQuantity:0, items:[], validationErrors:[CONFIGURATION_SECTION_REQUIRED "Required sections are missing"]`; cart confirmed empty 3× (direct nav + dialog "View cart") | Yes |
| 2 | **High** | "Buy now" from a list with a configurable product dead-ends on an **empty secure-checkout cart** (`/cart/{id}` → "Your cart is empty") with no error feedback | Live repro: clicked Buy now → landed `/cart/1b03c511…` showing empty cart | Yes |

**Root cause (both):** The Lists add-to-cart path sends `AddItemsCart` with only `{productId, quantity}` and **omits `configurationItems`**. The parent CFG product has REQUIRED sections, so the line is rejected server-side. The result dialog reports success off the request intent, not the server `validationErrors`/`itemsQuantity`. (Related: `reference_configurations_post_body`, BL-CART, BL-CHK-006.)

**OK button does not remediate (re-verified on playwright-chrome):** Clicking the result dialog's primary **OK** button fires **no network request** (GraphQL request list byte-identical before/after) — no corrective `AddItemsCart` with `configurationItems`, no mutation of any kind. OK only dismisses the dialog; the configurable item never lands in the cart. In a mixed list, the simple SKUs are accepted while only the CFG line is silently dropped (dialog still claims all "Successfully added"). Evidence: `screenshots/SBTM-lists-cfg-postOK-cart.png`.

**Not bugs (confirmed by-design per 2026-05-19 user note):** List **Settings** opened from the detail page is view-only (name/description/sharing all disabled) — observed and confirmed. List **Edit** is available from the overview card's context menu instead.

## Risk Areas
- **Configurable products in Lists are a data-integrity hole.** Save preserves the configured price but the buy paths (Add-all, Buy-now) drop the configuration and silently fail. B2B reorder-from-list — a core procurement journey — is broken for any configurable SKU with required sections, and the false-success dialog hides it.
- The success/failure dialog trusts client intent over the GraphQL response `validationErrors[]` / `itemsQuantity` — likely a generic pattern that could mask other add failures (OOS, disabled inventory).

## Observations
- List line "Remove" button has aria-label **"Remove from cart"** on a list page (wrong surface label — minor a11y/copy).
- List line items have **no quantity control** on the detail page; everything is qty 1 (so "list quantity transfer" — candidate #3 in brief — is N/A for this UI).
- List **delete** has a proper "Confirm Delete" dialog (with the name escaped); reached via overview card menu (trash icon → Edit/Delete).
- Benign console noise only: `assets/presets/electro2.json 404` (theme preset) and a clean WebSocket close — neither tied to the bugs.
- The select-list dialog "Save" only enables after a list is checked (correct).

## Questions
- Should the Lists buy paths inject the saved `configurationItems` into `AddItemsCart`, or should configurable products be blocked from Lists entirely with a clear message?
- Is the "Adding products to cart result" dialog reused by Bulk order / reorder? If so the false-success pattern may be wider than Lists.

## Charter-from-Gap (next-session candidates)
1. **Lists × configurable products E2E** — add-all, buy-now, customize round-trip, configured-options display, multi-CFG list, mixed CFG+simple list partial-failure messaging. (Primary)
2. **Add-to-cart result dialog truthfulness** — drive OOS / disabled-inventory / required-config items through Lists, Bulk order, and reorder; assert dialog matches server `itemsQuantity`.
3. **List line a11y/copy** — "Remove from cart" label on list pages; keyboard path through list line actions.
