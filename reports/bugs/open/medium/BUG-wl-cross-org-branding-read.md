# BUG: `whiteLabelingSettings(organizationId)` allows cross-org branding read (no org-ownership check) — [Medium / Security]

**Env:** vcst-qa @ Platform 3.1041.0 · WhiteLabeling 3.1002.0 · xFrontend 3.1003.0
**Layer:** xAPI (GraphQL) · **Refs:** FWL-057 · BL-WL-001

## Summary
Authenticated as an org-A user (WL_ELECTRONICS), issuing `whiteLabelingSettings` with a **different** organization's id (WL_FASHION) returns org-B's full branding (logo URLs, `themePresetName: "Coffee"`, menu/footer links) with no authorization error. The resolver trusts the client-supplied `organizationId` without verifying it matches the caller's own org. In the normal app flow the server resolves org from the JWT (clean), but the explicit-argument path is unchecked — an IDOR-style read.

## Steps to Reproduce
1. Obtain a storefront bearer token for `wl-electronics@virtocommerce.com` (org WL-ORG-A) via `POST /connect/token`.
2. With that token, query:
   ```graphql
   query { whiteLabelingSettings(organizationId:"e5c8838f-9ca9-4251-905f-00dc10a53fa7", storeId:"B2B-store", cultureName:"en-US"){ logoUrl themePresetName mainMenuLinks{title} } }
   ```
   (org id above = WL_FASHION / WL-ORG-B, not the caller's org.)
3. Observe WL_FASHION's branding returned, HTTP 200, no auth error.

## Expected vs Actual
- **Expected (per FWL-057):** a query with an org id ≠ the authenticated caller's org is blocked or returns null.
- **Actual:** other org's branding is fully returned.

## Impact
Low–Medium: exposes only branding metadata (logo URLs, theme name, menu/footer link titles/URLs) — no PII, orders, or payment data. Still a broken access-control boundary and an information-disclosure of other tenants' configuration.

## Evidence
`reports/regression/REG-2026-07-02-1825/batch8-emulation-security.json` (FWL-057). Screenshot `FWL-057-cross-org-leak.png`.

## Notes
Add a server-side check that `organizationId`, when supplied, matches the caller's org membership (or restrict org-level WL reads to the JWT-resolved org). Store-level WL reads (anonymous theming) should remain allowed.
