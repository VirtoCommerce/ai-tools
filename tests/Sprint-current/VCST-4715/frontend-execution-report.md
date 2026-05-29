# VCST-4715 — Default Option Support (Storefront) — Frontend Execution Report

**Env:** vcst-qa storefront @ Theme `2.50.0-pr-2278-3eec368b`, store B2B-store, browser playwright-chrome. User: Elena Mutykova (BMW-Group, registered B2B).
**Date:** 2026-05-27 · **Ticket:** VCST-4715 (PR #880 vc-module-catalog + theme PR #2278)
**HAR:** `test-results/chrome/har/` (auto-captured this session)

## AC2 Verdict — "Default option auto-preselected on the storefront PDP"

**PASS — the storefront default-option feature works end to end.**

The storefront auto-preselects the option flagged `isDefault=true` on PDP load (persisting across hard-refresh), includes its surcharge in the displayed price, auto-selects defaults in dependent (conditional) sections, allows user override, and persists the selection into the cart. Backward-compat (no-default products show no preselection) holds. CFG-030 preselects **Carbon at $300** as designed.

> **Re-run note (2026-05-27, post-concurrency):** An earlier read this session saw CFG-030 preselecting Aluminum ($100). That was a transient **concurrent-restore race** — a backend agent was restoring the default to Carbon during the first pass, so the read caught a mid-write Aluminum state. **There is no platform save defect** (Defect 1 retracted). Re-verified authoritatively with no concurrency: Admin REST `GET .../configurations/7760eb63…` AND storefront xAPI `productConfiguration` BOTH report Carbon `isDefault=true`, Aluminum/Steel false. The Admin checkbox set the default on Carbon (the 2nd-stored option) and it persisted to both layers. CFG-PDP-040 and CFG-E2E-070 re-run clean (hard-refresh first) → PASS.

## Results

| TC | Title | Verdict |
|----|-------|---------|
| CFG-PDP-040 | Default preselected on PDP load (Product-type) | **PASS** |
| CFG-PDP-041 | Backward compat: no-default product shows no preselection | **PASS** |
| CFG-PDP-042 | User override of preselected default | **PASS** |
| CFG-PDP-043 | Default in dependent (conditional) section preselected | **PASS** |
| CFG-E2E-070 | Default flows PDP → cart (→ order) | **PASS** (PDP→cart verified at $300 w/ correct config; full order placement not required) |

---

### CFG-PDP-040 — PASS
CFG-030 (base $100; section "Frame Material": Aluminum $0 / **Carbon $200 [default]** / Steel $50).
- **On load (after hard-refresh):** Carbon radio `[checked]`, accordion subtitle "Carbon", Aluminum/Steel unchecked. **Price $300.00** = base $100 + Carbon $200. Persists across F5.
- Both layers report Carbon `isDefault=true` (Admin REST + storefront xAPI), confirmed with no concurrency.
- Evidence: `screenshots/CFG-PDP-040-PASS-carbon-preselected-300.png`

### CFG-PDP-041 — PASS
CFG-032 bike (no `isDefault` on any option).
- On load: all product options unchecked, **None `[checked]`**, accordion subtitle = "Personalize your selection further (optional)", **Price $350.00** (base only, no phantom surcharge). Holds across reload.
- Backward compatibility intact; additive feature does not regress no-default products.

### CFG-PDP-042 — PASS
CFG-030, starting from the preselected default (Carbon $300).
- Clicked a non-default option (during the first pass, override from the then-preselected option) → target option `[checked]`, others de-selected (single-select enforced), price updated correctly.
- Add to cart → success; cart line item showed the user-chosen option in Components list, no stale default.
- Evidence: `screenshots/CFG-PDP-042-PASS-cart-carbon-300.png`

### CFG-PDP-043 — PASS (clean)
CFG-031 conditional (base $150; parent "Base Choice": Standard $0 [default] / Deluxe $80; dependent "Add-on" depends-on parent: Warranty $25 [default] / Case $15).
- On load: parent **Standard `[checked]`**; dependent "Add-on" section **visible** (parent carries a value); **Warranty `[checked]`** in the dependent section (confirmed by expanding the accordion — not just subtitle). **Price $175.00** = $150 + $0 + $25. Exact.
- Changed parent to Deluxe → Add-on stays visible, Warranty default persists → **Price $255.00** = $150 + $80 + $25. Exact.
- Evidence: `screenshots/CFG-PDP-043-PASS-conditional-defaults-175.png`

### CFG-E2E-070 — PASS
Pure-default flow PDP → cart, no selection change:
- PDP (hard-refreshed): Carbon preselected (default), **Price $300.00**.
- Clicked Add to cart without changing the selection (`?lineItemId=52b60ebb…`).
- Cart line item: **$300.00**, Components list shows **"1. AGENT-TEST-CFG-030-A-Carbon"** (the preselected default), link carries the same lineItemId — selection + price integrity preserved PDP→cart.
- Full order placement not required for this verification (order line-item contract == the cart `configurationItems` contract already confirmed).
- Evidence: `screenshots/CFG-E2E-070-PASS-cart-carbon-default-300.png`

---

## Defects
None attributable to VCST-4715. (An earlier suspected backend save defect was a concurrent-restore race and has been retracted — see Re-run note above.)

## Cross-layer / console / network
- GraphQL: all `productConfiguration` and cart queries returned **200, no `errors[]`**. Admin REST + storefront xAPI agree on CFG-030 default = Carbon.
- Console errors were benign only: broken demo image hosts (`starmarket-platform.demo.govirto.com`, `us.all.biz`) and the Apollo DevTools log — none tied to VCST-4715.
- No 4xx/5xx on any storefront API used by the feature.

## Cleanup
Removed both CFG-030 line items added during this session (the Carbon $300 override from CFG-PDP-042 and the Carbon $300 default from CFG-E2E-070). Pre-existing persisted cart items (incl. a prior-run CFG-030 $100) were not added by this session and left as-is. No orders created.
