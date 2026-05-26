# VCST-4642 — Frontend Execution Report

**Theme**: `2.50.0-pr-2293-55fc-55fc80c2` confirmed in footer. **Env**: vcst-qa | Browser: playwright-chrome | Date: 2026-05-21

| ID | Result | Evidence |
|----|--------|----------|
| FE-1 | PASS | `InitializeApplication` fires once at boot before all other ops. Req body sent: `query InitializeApplication($domain) { store { storeUrl settings { modules { moduleId version settings { name value } } } } }`. Response 200, 80 modules. → `evidence-fe1-initializeApplication-response.json` |
| FE-2 | PASS | Manifest cached at `localStorage["vc:initialStore:v1:vcst-qa-storefront.govirto.com"]` (79 modules, timestamp stable across nav Home → Catalog → Search → PDP → Cart, ~100s). No re-fire on navigation. |
| FE-3 | PASS | `GetPageContext` request body includes `whiteLabelingSettings { ...whiteLabelingFields }` selection AND `fragment whiteLabelingFields on WhiteLabelingSettingsType { logoUrl secondaryLogoUrl themePresetName ... }`. Module `VirtoCommerce.WhiteLabeling v3.1001.0` present in manifest. |
| FE-4 | PASS | After mutating manifest to remove `VirtoCommerce.WhiteLabeling`, next `GetPageContext` (permalink: contact) request body has NEITHER the `whiteLabelingSettings { ... }` selection NOR `fragment whiteLabelingFields` definition. Apollo `apply-gates-link.ts` strips client-side. Zero console errors after gate. → `evidence-fe4-gating-contact-404.png` |
| FE-5 | **FAIL** | One unrelated GraphQL HTTP 400 on `/cart`: op `GetPromotionCoupons` → `Cannot query field 'promotionCoupons' on type 'Query'` (FIELDS_ON_CORRECT_TYPE). Manifest contains `VirtoCommerce.Marketing` but NOT `VirtoCommerce.XMarketing`. Query is unprotected — missing `@needsModule(name:"VirtoCommerce.XMarketing")` directive in `GetPromotionCoupons.graphql`. This is exactly the class of bug the gating system was designed to prevent. **See exploratory-session.md F1.** |
| FE-6 | PASS | Sign-in (mutykovaelena@gmail.com) → home renders → PDP → quantity stepper +1 (B2B has no Add-to-Cart button by design) → cart badge updated to "4" → /cart page renders. → `evidence-fe6-cart-smoke.png` |

## Console/Network hygiene
- 4 pre-existing asset 404s (catalog images on vcst-qa.govirto.com/cms-content/...); unrelated to PR-2293.
- 1 GraphQL 400 (FE-5 finding) — see exploratory-session.md.
- No JS exceptions. No CSP violations. No Vue hydration warnings.

## Cross-layer verification
STOREFRONT renders ✅ | CONSOLE no new JS errors ✅ | NETWORK: 1 unrelated 400 ⚠️ (FE-5) | GraphQL `errors[]` only on the 400 above | ADMIN not in scope (FE only).

## Verdict
**PASS with 1 P2 bug** — `@needsModule` infrastructure works end-to-end (FE-1/2/3/4). Smoke path unbroken (FE-6). FE-5 surfaces a query (`GetPromotionCoupons`) missing the `@needsModule(name:"VirtoCommerce.XMarketing")` directive. PR-2293 is mergeable; the missing-gate issue is an adjacent follow-up.

## Recommendations
1. Add `@needsModule(name:"VirtoCommerce.XMarketing")` to `GetPromotionCoupons.graphql` (and any sibling marketing queries).
2. Consider adding a build-time lint that fails when a query references an XAPI extension type but has no `@needsModule` on its root selection.
