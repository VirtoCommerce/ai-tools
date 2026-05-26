# VCST-4642 — Exploratory Session (SBTM)

**Charter**: Explore application initialization + `@needsModule` gating boundary
**Heuristic**: SFDPOT | **Time-box**: 20 min | **Theme**: 2.50.0-pr-2293-55fc

## Findings

### F1 — BUG (P2): `GetPromotionCoupons` is not gated [Structure / Data]
**Severity**: P2 (recoverable HTTP 400, no user-visible breakage on /cart, but BL-GQL-001 violation)
**STR**: Sign-in as customer → /cart → DevTools Network filter graphql → observe POST returning 400.
**Response**: `{"errors":[{"message":"Cannot query field 'promotionCoupons' on type 'Query'","extensions":{"code":"FIELDS_ON_CORRECT_TYPE"}}]}`
**Root cause**: Manifest lists `VirtoCommerce.Marketing` (admin module) but NOT `VirtoCommerce.XMarketing` (xAPI extension). Query `GetPromotionCoupons.graphql` lacks `@needsModule(name:"VirtoCommerce.XMarketing")`.
**Why this matters**: The new gating system was built specifically to prevent this error. Missing directive = first crack in the wall.

### F2 — RISK (Function/Time): Manifest does not invalidate on sign-in
**Observation**: Cleared cache, hit /sign-in → manifest fetched. Signed in → manifest timestamp unchanged. Tested cross-session same-tab; sign-out flow not tested but cache key is per-domain (not per-user), so a former admin's manifest would persist for next anonymous session.
**Risk**: If org-switch toggles availability of a module (theoretical, unlikely on this env), stale manifest survives. Recommend doc-level guarantee that modules are domain-scoped, not user-scoped.

### F3 — OBSERVATION (Structure): Empty manifest is non-fatal [resilience]
Forced `modules: []` in localStorage → reload → home renders fully → 4 pre-existing image 404s only → no GraphQL errors. App degrades to "no optional features" rather than crashing. Good defensive design.

### F4 — OBSERVATION (Data): Module versions are NOT surfaced in UI
HTML body scan: only theme version (`2.50.0-pr-2293...`) is exposed. Module versions live in localStorage but not rendered. Anonymous-readable via GraphQL when `XAPI.Security.ReturnModuleVersion=true` (BE-side test). No additional UI surface created by PR-2293.

### F5 — OBSERVATION (Platform/Operations): Single-fire confirmed
Across 6 navigations (Home, Catalog, Search, PDP, Cart, sign-in→home), `InitializeApplication` fired exactly 3 times total — each one corresponds to a fresh localStorage state (initial + after manual clear + after sign-in cache clear). Zero re-fires while cache populated.

### F6 — QUESTION: Cache version bump strategy?
Cache key includes `:v1:` suffix. What happens when the manifest schema evolves and clients are on different theme builds? Currently no migration path visible; old `:v1:` keys would coexist with new `:v2:` if devs bump. Probably fine — wasn't asked to validate but worth a story.

### F7 — OBSERVATION (UX/Sidebar): Pre-existing PDP sidebar
On `/product/fa1c0921-...`, the "Price and delivery" sidebar shows empty price + missing Add-to-Cart UI in the snapshot tree. B2B store uses quantity stepper as add-to-cart entry (per memory `feedback_qty_stepper_as_add_to_cart`). Increase-quantity button worked and incremented cart badge. Not a regression.

## Coverage map
| SFDPOT | Tested | Notes |
|--------|--------|-------|
| Structure | ✅ | empty manifest resilient (F3) |
| Function | ✅ | gating works (FE-4), manifest scope (F2) |
| Data | ✅ | version exposure (F4) |
| Platform | ⚠️ partial | Chrome only; Firefox not tested |
| Operations | ⚠️ partial | Slow-network throttling skipped (no DevTools throttle via MCP without Chrome DevTools MCP server) |
| Time | ✅ | refresh-during-init implicitly covered via manual cache clears |

## Verdict
PR-2293 ships the gating infrastructure correctly. One bug (F1) and one risk (F2) found. Recommend filing F1 as a follow-up ticket.
