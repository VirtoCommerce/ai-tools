# BUG-070-002 — Store-level whiteLabelingSettings.favicons array is empty (multi-size favicons missing)

**Status:** Preliminary (unconfirmed) — needs qa-testing-expert + qa-backend-expert verification
**Severity:** Medium
**Run:** REG-2026-05-04-1527
**Suite:** 070 Whitelabeling Storefront
**Test Case:** FWL-001 (Enable thumbnail job for favicons)
**Browser:** playwright-edge

## Summary

The `pageContext.whiteLabelingSettings.favicons` field returns an empty array `[]` for the B2B-store. The field is meant to provide multi-size favicon entries (16x16, 32x32, 180x180 apple-touch-icon, 192x192, 512x512 web manifest), but no favicons are seeded — likely because the thumbnail-generation job was never enabled or run.

## Steps to Reproduce

```bash
curl -X POST https://vcst-qa-storefront.govirto.com/graphql \
  -H 'Content-Type: application/json' \
  -d '{"query":"{ pageContext(storeId:\"B2B-store\", domain:\"vcst-qa-storefront.govirto.com\", cultureName:\"en-US\") { whiteLabelingSettings { favicons { rel type sizes href } } } }"}'
```

## Observed

```json
{
  "data": {
    "pageContext": {
      "whiteLabelingSettings": {
        "favicons": []
      }
    }
  }
}
```

## Expected

Per FWL-001 acceptance criteria:

> [DOM] whiteLabelingSettings.favicons array contains entries for 16x16, 32x32, 180x180, 192x192, 512x512

```json
{
  "favicons": [
    {"rel":"icon", "type":"image/png", "sizes":"16x16", "href":"..."},
    {"rel":"icon", "type":"image/png", "sizes":"32x32", "href":"..."},
    {"rel":"apple-touch-icon", "type":"image/png", "sizes":"180x180", "href":"..."},
    {"rel":"icon", "type":"image/png", "sizes":"192x192", "href":"..."},
    {"rel":"icon", "type":"image/png", "sizes":"512x512", "href":"..."}
  ]
}
```

## Impact

- **iOS home screen install** — no proper apple-touch-icon (180x180), iOS will use a generic screenshot.
- **Android web manifest** — no 192x192 or 512x512 PWA icons.
- **High-DPI tab strips** — browsers fall back to the inline data-URI SVG (which works visually but is non-cacheable per-icon).
- **Multi-tab session** — no proper sized icons for tab grouping in Chrome/Edge tab strips.

## Schema is functional — issue is data, not code

GraphQL introspection confirms:
- `WhiteLabelingSettingsType.favicons` field exists, returns `LIST<FaviconType>`
- `FaviconType` has fields `rel`, `type`, `sizes`, `href`

So the API contract is wired up — the underlying data has not been seeded.

## Recommended Fix

Per FWL-001 admin steps:

1. Sign in to Admin (`https://vcst-qa.govirto.com`)
2. Navigate to **Settings > Jobs**
3. Locate the favicon thumbnail-generation job
4. **Enable** it
5. Trigger a run (or wait for next scheduled run)
6. Re-query `pageContext.whiteLabelingSettings.favicons` to verify the array is populated

Alternatively, manually upload favicon at multiple sizes via Admin > Stores > B2B-store > White Labeling tab.

## Console / Network Evidence

- **Console errors:** 0
- **Network:** GraphQL pageContext request returns 200 OK with empty favicons array
- **Live storefront tab:** falls back to inline SVG data URI in `<link rel="icon">` (visible in tab but no apple-touch-icon link)

## Cross-references

- BL-WL-001 — White labeling business rule
- ECL-14.1 — GraphQL response shape edge case
- FWL-001 test case (regression/suites/Frontend/whitelabeling/070-whitelabeling-storefront.csv)
