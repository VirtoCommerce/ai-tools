# SBTM — Orders Domain Exploratory Session

- **Date:** 2026-06-01 · **Duration:** ~30 min · **Tester:** qa-testing-expert (Firefox MCP)
- **Env:** vcst-qa @ Platform 3.1032.0, Theme vc-theme-b2b-vue 2.50.0-alpha.2359
- **Session type:** [EXP+VAL] — net-new discovery + secure-baseline validation
- **Discovery technique:** Boundary-of-features (feature-pair seams): Orders × Configurable Products, Orders × Authorization, Orders × B2B org visibility, Orders × Promotions.
- **Charter:** Find order scenarios uncovered by suites 014 (orders-frontend) / 015 (quotes). Hunt seams, not happy paths.
- **Account:** B2B org buyer/manager `{{ORG_USER_EMAIL}}` (Emily Johnson, org AGENT-TEST-Org-TechFlow).

## Net-New Scenarios Discovered

| # | Scenario | Why uncovered | What we found | Suggested next charter |
|---|----------|---------------|---------------|------------------------|
| 1 | **Order detail × Configurable product** — does order detail render chosen config (`configurationItems[]`)? | Suite 014 only asserts simple line items + properties; no CFG order in coverage | **UNVERIFIED.** No existing order in the org contains a CFG line (order search "laptop" = no results; search matches order#/buyer/invoice only, NOT line-item product names). Could not create a fresh CFG order — checkout blocked by tooling (see Obs-1). Cart-layer DOES surface CFG config via a "Components list" toggle on the line item; the open question is whether order detail does the same. | Place a CFG_LAPTOP order via `playwright-edge` (Firefox-blocked), then assert RAM/Storage selection renders on `/account/orders/{id}`. |
| 2 | **Reorder × Configurable product** — does "Reorder all" preserve the chosen configuration? | Suite 014 reorder cases use simple products only | **UNVERIFIED** (same blocker as #1 — needs a CFG order to exist first). Confirmed precondition: "Reorder all" appears only on **Completed** orders, not on New/Payment-required. | After #1, click "Reorder all" on the CFG order; assert re-added cart line keeps config + price, not base SKU. |
| 3 | **Reorder × cross-member (B2B)** — org manager reorders another member's order | Untested interaction; suites treat reorder as same-user | **PARTIALLY OBSERVED.** Manager (Emily) can open another member's (John Mitchell) completed order from "All orders" and the "Reorder all" button is present. Whether reorder adds another member's items to the manager's own cart, and how org pricing re-resolves, is untested. | Dedicated session: as manager, Reorder all on a sub-user's order; assert items land in manager's cart at manager's current prices. |
| 4 | **Order# format inconsistency** | No suite asserts order-number format consistency | Two coexisting formats: New/Payment orders = `CO260529-00019` (dashed `CO`+YYMMDD+`-`+seq); Completed orders = `CO26050800121` (un-dashed). Likely two creation/seed paths producing different customer-facing IDs. | Confirm whether real checkout vs admin/seed produces different masks; decide if customer-facing inconsistency is acceptable. |
| 5 | **Order search does not index line-item contents** | Suite 014 search cases search by order number only | Searching a product name ("laptop") returns "no results"; search is scoped to order#/buyer/invoice. Reasonable, but a discoverability gap worth a documented expectation. | Add a 014 case asserting search scope (order#/buyer/invoice match; product-name does NOT). |

## Bugs Found

| # | Severity | Title | Evidence | Net-new? |
|---|----------|-------|----------|----------|
| 1 | Low | Untranslated i18n key + typo on Orders search button: accessible name renders raw key `commmon.buttons.search_orders` (note triple-m "commmon"). Icon-only button, so sighted users unaffected, but exposed to screen readers (A11y label gap) and indicates a missing translation string. | `reports/exploratory/screenshots/SBTM-orders-i18n-search-key.png` + a11y tree (`/account/orders`, search button) | Yes |

## Risk Areas
- **CFG-in-orders is a true coverage hole** (scenarios 1–2). The whole CFG×checkout→order→reorder tail is unverified end-to-end at the order layer. Highest-value follow-up.
- **B2B PII exposure (by-design, flag for product):** an org manager sees other members' full billing/shipping PII (name, address, phone, email) on their orders. Expected for B2B managers, but confirm this matches the intended org-role permission model.

## Observations (not bugs)
- **Obs-1 (tooling, not product):** On `/cart`, the Payment-method `<select>` trigger and dialog confirm buttons time out on Playwright's "stable" check (5+ retries) under **playwright-firefox**. Verified via read-only `PerformanceObserver('layout-shift')`: **CLS = 0, 0 shift events, trigger Y fixed at 826px** — the element is NOT moving. This is an MCP/Firefox pointer-stability quirk; keyboard (`ArrowDown`+`Enter`) works as a fallback. NOT filed (would be a false positive, per VCST-5100 discipline). It did, however, block a full CFG checkout this session — use `playwright-edge` for checkout-completion flows.
- **Secure baseline (VAL):** Deep-linking a foreign/nonexistent order GUID (`00000000-…`) as an authenticated user → blank page, no data leak, no console error. The `order` xAPI query is server-scoped to the user; IDOR deny-path works. Minor UX gap: blank page instead of a friendly "Order not found" message.
- Order totals validated on a Completed order (BL-CHK-006): line totals $499.95 + $899.91 + $899.91 = subtotal $2,299.77 + $10 shipping = total $2,309.77. ✓
- "+ Add a gift" promo widget (SHOT product) renders on both cart and order detail — order × promotion-gift seam exists and renders consistently.
- Sidebar status chips give org-wide counts: New 32 / Payment required 14 / Completed 9 / Processing 5 / Pending 4 / Cancelled 1.
- Console clean across the entire session (0 errors; warnings only).

## Questions
- Is the order-number mask difference (#4) intentional (two creation paths) or a defect?
- Is full cross-member PII visibility for org managers the intended permission boundary?
- Should order search ever match line-item product names (#5)?

## Charter-from-Gap (next sessions)
1. **CFG → order → reorder (edge browser):** scenarios 1+2 end-to-end with a freshly placed CFG_LAPTOP order. *(highest priority)*
2. **Cross-member reorder & pricing (B2B):** scenario 3.
3. **Order-number format + search-scope:** scenarios 4+5 as 014 assertions.
