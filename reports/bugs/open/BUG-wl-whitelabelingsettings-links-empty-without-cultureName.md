# BUG: `whiteLabelingSettings` silently drops footer/main-menu links when `cultureName` is omitted — [High]

**Env:** vcst-qa @ Platform 3.1041.0 · WhiteLabeling 3.1002.0 · xFrontend 3.1003.0
**Layer:** xAPI (GraphQL) · **Refs:** FWL-013, FWL-026 · BL-WL-001, BL-WL-002 · ECL-14.1

## Summary
The standalone `whiteLabelingSettings(organizationId, storeId)` query returns empty `footerLinks: []` and `mainMenuLinks: []` for a fully-configured org when the (documented-optional) `cultureName` argument is omitted. No GraphQL error is raised (`errors[]` empty) — the link data is silently dropped. Adding `cultureName: "en-US"` returns the links correctly, and `pageContext{ whiteLabelingSettings{...} }` resolves them correctly regardless. Storefront consumers that call the standalone query without a culture get a branded site with no navigation/footer.

## Steps to Reproduce
1. POST to `https://vcst-qa.govirto.com/graphql`:
   ```graphql
   query { whiteLabelingSettings(organizationId:"5c3fcbf6-8105-4ea7-9e62-9bdfd5a20610", storeId:"B2B-store"){ mainMenuLinks{title url priority childItems{title url}} footerLinks{title url priority} } }
   ```
2. Observe `mainMenuLinks: []`, `footerLinks: []`, `errors` absent.
3. Re-run with `cultureName:"en-US"` added → both arrays populate with the configured links + hierarchy.

## Expected vs Actual
- **Expected:** `cultureName` is optional (per schema); links resolve with or without it, or a validation error is returned.
- **Actual:** links silently return empty when `cultureName` is absent; no error surfaced.

## Evidence
`reports/regression/REG-2026-07-02-1825/batch4-graphql-a11y.json` (FWL-013/026, with/without-culture comparison). Contrast: FWL-027 (`pageContext`) returns full hierarchy.

## Root cause (hypothesis)
Link-list resolution keys on culture; a null culture yields no match instead of falling back to store/default culture. Fix: default the culture (store default) when the argument is null, matching `pageContext`'s internal behavior.
