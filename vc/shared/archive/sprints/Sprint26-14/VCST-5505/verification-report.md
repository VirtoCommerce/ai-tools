# VCST-5505 — Fix Verification `[VERIFIED]`

**Verdict: VERIFIED** — STR passed **3/3**. Fix is live on vcst-qa and resolves the stale-cache defect.

**Env:** vcst-qa @ Platform 3.1046.0 · **XCart `3.1027.0-pr-135-6df4`** (fix build, live-confirmed via `/api/platform/modules`) · Cart 3.1007.0
**Fix:** vc-module-x-cart PR #135 (open, deployed-while-open via prerelease; deploy repin `vc-deploy-dev`#6188 merged) — new `CartChangedEventHandler` → `GenericCachingRegion<CartAggregate>.ExpireTokenForKey`.

## Summary
Prior run (14:40) was BLOCKED because the fix build was not yet deployed. It is now live. Re-verified the exact regression signature: a REST Cart-API quantity change on a cart is now reflected by a subsequent xAPI `cart` query — the XCart `CartAggregate` read-cache is invalidated by the platform `CartChangedEvent`, not only by xAPI-originated writes. BL-CROSS-009 satisfied.

## Method
Canonical GraphQL runner, case **CRX-GQL-101** (suite `050b4-graphql-xcart-cross-domain`), run 3 consecutive times. Same OAuth2 `ORG_USER` token across GQL + REST. No hardcoded data (`@td(BUYABLE_PRICED_PRODUCT.id)`). Self-contained (`clearCart` pre/post — no leaked data).

## STR result — 3/3 PASS (12/12 assertions each)

| Step (layer) | Pre-fix baseline | Now (fixed) |
|---|---|---|
| xAPI `addItem` qty 2 + prime `cart` read | qty 2 | qty 2 |
| REST `GET /api/carts/{id}` (seed landed) | qty 2 | qty 2 (HTTP 200) |
| REST `PUT …/items?quantity=5` | 204 | **204** |
| REST `GET` (write landed) | qty 5 | qty 5 (HTTP 200) |
| **xAPI `cart` re-query (the defect)** | **qty 2 / $119.98 — STALE ≥45s** | **qty 5 / $299.95 — FRESH ✅** |

Key post-fix assertions (all PASS, ×3): `data.cart.items[…].quantity = 5`, `data.cart.itemsQuantity = 5`, `data.cart.subTotal.amount = extendedPrice.amount` ($299.95 = $299.95). The `[WAIT until=cart_after]` resolved promptly (no 30s timeout), confirming prompt invalidation vs. the pre-fix indefinite staleness.

## Checklist
- Fix confirmation — reproduce original (pre-fix RED, documented) → fixed RED→GREEN: **PASS**
- Root cause addressed (event-driven token expiry, not symptom): **PASS**
- Regression — addItem / clearCart / REST cart write roundtrip still correct: **PASS**
- Pricing recompute consistency (subTotal = extendedPrice after change): **PASS**
- No GraphQL `errors[]` on any op; REST statuses 200/204/200: **PASS**
- BL-CROSS-009 (bounded eventual consistency across cache layers): **PASS**

## Notes / follow-ups
- Fix PR #135 is still **open** (not merged to `dev`) → verification stops at **Tested**, not Done (per policy; Done on merge+release).
- Deploy #6188 is a **temporary QA repin** ("revert after VCST-5505 is verified") — deploy owner should revert once the fix ships normally.
- CRX-GQL-101 `Automation_Status` is `Draft`; it is now live-GREEN and can be promoted.

**Evidence:** `scripts/.graphql-evidence/CRX-GQL-101-1784811388879.json` (+ …401480, …409778). Baseline repro: `test-execution-report.md`.
