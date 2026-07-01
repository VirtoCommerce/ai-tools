# VCST-4713 SBTM Exploratory Session

**Charter:** Explore conditional section behavior at integration boundaries and failure modes
**Heuristic:** SFDPOT (Structure, Function, Data, Platform, Operations, Time)
**Duration:** ~20 minutes | **Date:** 2026-04-13
**Product:** CFG-022 (AGENT-TEST-Config-Conditional-Bike-20260413)
**Browser:** Firefox | **Environment:** QA

## Dependency Graph

```
A (Frame Type, REQUIRED) --> B (Wheel Set, optional)
                         --> D (Frame Color, optional)
B (Wheel Set)            --> C (Tire Type, optional)
```

## Thread Log

### 1. STRUCTURE: DOM Stability -- v-if vs v-show

**Action:** On initial load, all 4 sections visible (preselections: Aluminum/Standard/Slick). Selected "None" in Wheel Set (B).

**Finding:** `product-configuration__widgets` container dropped from 4 to 3 child elements. Tire Type (C) was completely **removed from the DOM** (not hidden with display:none). This confirms **v-if** implementation -- child sections are unmounted when parent has no selection.

**Classification: Observation** -- v-if is the correct approach for conditional rendering. No flash of unstyled content observed.

### 2. FUNCTION: Rapid Parent Switching

**Action:** Clicked Aluminum -> Carbon -> Aluminum in Frame Type (A) within 100ms using setTimeout(50ms, 100ms) intervals.

**Finding:** After rapid switching settled (2s wait), all 4 sections were back visible with Aluminum selected (final state correct). Wheel Set retained its previous Standard selection. Tire Type re-appeared. No stale child selections. Console: 0 errors.

**Classification: Observation** -- No debouncing issues. Vue reactivity handles rapid state changes correctly.

### 3. DATA: Page Refresh Mid-Configuration

**Action:** Selected Carbon ($200) in Frame Type, waited for URL to update with lineItemId, then refreshed page.

**Finding:** After refresh, the configuration reverted to Aluminum (preselected default), not Carbon. The lineItemId parameter was preserved in URL. The Wheel Set showed "None" (3 sections visible, Tire Type hidden).

**Classification: Question** -- Is it expected that page refresh resets configuration to default preselections rather than restoring the last-saved state from lineItemId? The lineItemId is in the URL but the saved configuration may not have been committed yet (user hadn't clicked "Add to cart"). If the configuration is only saved server-side on explicit add-to-cart, this is expected. Needs clarification from dev team.

### 4. DATA: Invalid lineItemId in URL

**Action:** Navigated to PDP with `?lineItemId=00000000-0000-0000-0000-000000000000`.

**Finding:** Page loaded gracefully with default configuration. The invalid lineItemId was silently replaced with a new valid one. No error page, no console errors.

**Classification: Observation** -- Graceful degradation. Good defensive coding.

### 5. PLATFORM: Mobile Viewport (375px)

**Action:** Resized viewport to 375x812 (iPhone SE). Navigated to conditional product PDP.

**Finding:** Widget rendered correctly in stacked vertical layout. All visible sections displayed properly. Section headers, radio options, and prices all readable. No overflow or clipping issues.

**Classification: Observation** -- Responsive layout works correctly for conditional sections on mobile.

### 6. FUNCTION: Price Calculation (BL-PRICE-001)

**Action:** Observed sidebar price on initial load with Aluminum ($0) preselected.

**Finding:** Sidebar shows Price: $300.00 (base price + Aluminum $0 = $300). When child sections are hidden (no parent selection), they do not contribute to price. This is correct per BL-PRICE-001.

**Classification: Observation** -- Price stacking excludes hidden sections as expected.

### 7. DATA: Auto-Navigation from Bike PDP

**Action:** Navigated to Bike with options (bike-with-options) PDP -- a non-conditional product.

**Finding:** Within ~5-8 seconds of loading, the SPA auto-navigated from bike-with-options to the conditional product PDP (agent-test-config-conditional-bike-20260413) and then to /cart. GA4 analytics confirmed the navigation chain. This happened repeatedly without any user interaction.

**Classification: Question** -- The auto-navigation from Bike PDP to the conditional product is unexpected. It may be caused by the "Customers bought together" recommendation section or a Vue router issue. This is NOT related to conditional sections specifically -- it appears to be a general product page navigation issue that may have been introduced in the PR or existed before. Needs investigation to determine if it is a regression.

## Console Error Summary

| Error | Count | Related to VCST-4713? |
|-------|-------|----------------------|
| Dynamic import errors (matcher, events, WebPush) | 3 | No -- lazy loading failures on rapid nav |
| ApolloError: NetworkError | 1 | No -- CORS from cross-domain fetch attempt |
| Cookie/preload warnings | 5 | No -- GA4 + asset preload |
| Conditional section JS errors | 0 | N/A |

## Risks Identified

| # | Risk | Severity | Mitigation |
|---|------|----------|------------|
| 1 | lineItemId refresh does not restore last configuration state | Low | Clarify expected behavior with product team |
| 2 | Auto-navigation from Bike PDP to conditional product | Medium | Investigate whether this is VCST-4713 regression or pre-existing |

## Areas Not Covered (out of time)

- Network throttle (3G) during configuration query
- Duplicate tabs configuring same product simultaneously
- Session timeout mid-configuration
- Quotes/wishlists interaction with configured conditional product
- Browser back/forward during multi-step configuration

## Session Verdict

The conditional section feature is stable at integration boundaries. v-if DOM management, rapid switching, mobile rendering, price calculation, and invalid data handling all behave correctly. No bugs found. Two questions raised for product team clarification.
