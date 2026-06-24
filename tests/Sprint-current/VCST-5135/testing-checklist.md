# VCST-5135 — Testing Checklist

Scope: ProductPoints earning (single-winner model). BL: BL-LOY-001, PROPOSED-BL-LOY-WINNER. Oracle: `cart.items[].loyaltyPoints` (PTS). Coverage: suite **075c-loyalty-product-points-earning.csv** (8 cases) + a new **UI display** check (user-requested).

## Backend / GraphQL (qa-backend-expert · canonical `scripts/graphql-runner.ts`)
Run all 8 cases of `regression/suites/Backend/loyalty/075c-loyalty-product-points-earning.csv`:
- [ ] **LOY-029** — VIP override on WH-001 for VIP user; ORG_USER earns default on same SKU (AC1/AC4)
- [ ] **LOY-031** — ORG_USER: ALL-program wins; override SKU earns factor×price; gate-blocked programs (group/window/active) yield default (AC1/AC3/AC5/AC6)
- [ ] **LOY-032** — VIP user: VIP wins; VIP-only SKU override; non-covered SKU default (AC4/AC6)
- [ ] **LOY-033** — Wholesaler: WHOLESALE wins; Wholesaler-only SKU override; other SKUs default (AC4/AC6)
- [ ] **LOY-034** — Priority / no-stacking: ALL(80) beats PRIORITY(70); QA-LOY-PRIO-001 earns ALL's factor. **Manually compute the cross-multiplication** `AMT_PRIO001 × PRICE_LT001 ≈ AMT_LT001 × PRICE_PRIO001` from the evidence JSON (runner can't assert it) (AC3)
- [ ] **LOY-035** — Zero-factor: structural pass only (SKU in catalog); earning DEFERRED. **Flag AC9 as a coverage gap.**
- [ ] **LOY-036** — Multi-product: per-item + cart-total aggregation; non-winner factors don't apply (AC6/AC7)
- [ ] **LOY-037** — Localized/lowest-priority program doesn't win; stable with 5+ programs (AC8)
- Report per-case PASS/FAIL + the captured amounts; confirm the single-winner/no-stacking math holds.

## Frontend / UI (qa-frontend-expert · playwright-chrome · live storefront) — AC10
Goal: confirm the customer can **see** the earned ProductPoints points, consistent with the backend oracle. This is discovery-driven (the story doesn't say where points render).
- [ ] Sign in as `@td(ORG_USER)`. On the **LT-001 PDP** (ALL override 500× for ORG_USER): is an "earn N points" indicator shown? Capture it.
- [ ] Add LT-001 to cart → on **/cart**: does the line item show earned loyalty points, and the cart summary a total earned-points figure? Compare to the backend oracle magnitude (LT-001 override ≫ a default SKU).
- [ ] Add a default-factor SKU (e.g. WH-001 for ORG_USER) → confirm its displayed earned points are much lower than LT-001 (override vs default visible to the user).
- [ ] Sign in as `@td(LOYALTY_VIP_USER)` → WH-001 PDP/cart shows the VIP override earned points (higher than ORG_USER sees on WH-001).
- [ ] If the storefront does NOT render earned points anywhere → record as **AC10 NOT-FOUND** (customer earns but can't see), with evidence; reconcile against design before calling it a defect.
- [ ] Distinguish earned-points display from the loyalty point-PRICE / "Products in PTS" redemption grouping (different feature).

## Notes for executors
- Read creds from `.env`; resolve SKUs/users/catalog via `@td()`. Oracle is the **cart**, not `products()` (loyaltyPoints null there in Mixed Cart).
- Assert override-vs-default **relative** magnitude, never exact point totals (env-resilience).
- READ-ONLY on JIRA/GitHub. Evidence: `.claude/skills/qa-methodology/qa-evidence/evidence-capture-policy.md` (failures + the earned-points display screenshots).
