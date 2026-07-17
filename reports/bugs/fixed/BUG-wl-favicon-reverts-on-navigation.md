# BUG: Organization favicon reverts to platform default on navigation — [Medium]

## Status: FIXED

## Resolution
- **Fixed in:** Theme 2.54.0-alpha.2424 (WhiteLabeling 3.1002.0)
- **JIRA:** — (unfiled)
- **Verified:** 2026-07-15
- **Verification method:** /qa-bug re-verification sweep (playwright-edge, real-user). Signed in as WL org-A user; after 3 full navigations (/catalog, /account/dashboard, reload) all `<link rel=icon>` still point to the org favicon `favicon_23b672d6-…webp`, org asset re-requested (GET 200), and `favicon-pwa-v1.svg` is never fetched. Evidence: `test-results/edge/verify-wl-favicon-persists-dashboard.png`. (Org favicon asset changed from the report's `favicon_5c3fcbf6…` to the current `favicon_23b672d6…`; the persistence behavior is corrected.)

**Env:** vcst-qa @ Theme 2.53.0-pr-2343 · WhiteLabeling 3.1002.0
**Layer:** vc-frontend (storefront) · **Refs:** FWL-017 · BL-WL-001

## Summary
An org with a custom favicon (WL-ORG-A `favicon_5c3fcbf6-…webp`) shows the org favicon only transiently, right after the sign-in SPA transition. On any subsequent full page load / navigation the tab reverts to the platform default `favicon-pwa-v1.svg`, and the org favicon is never re-requested. The org logo and secondary logo are unaffected — only the favicon regresses. Reproduced 3×.

## Steps to Reproduce
1. Sign in to `https://vcst-qa-storefront.govirto.com` as `wl-electronics@virtocommerce.com`.
2. Right after redirect, confirm the tab shows the org favicon.
3. Navigate to any page with a full load (or reload). Tab favicon reverts to the default Virto PWA favicon.

## Expected vs Actual
- **Expected:** org favicon persists across all pages/navigations while signed in (BL-WL-001).
- **Actual:** org favicon applies once post-sign-in, then default favicon on every full navigation.

## Evidence
`reports/regression/REG-2026-07-02-1825/batch2-display-isolation.json` (FWL-017, reproduced 3×). Matches the suite's documented FWL-017 failure signal. Related favicon caching behavior (FWL-052) is otherwise correct.

## Notes
Likely the favicon `<link>` is set during the client-side sign-in transition but the SSR/initial document head emits the default on full loads (org context not applied server-side for the favicon link).
