# BUG: [Storefront][i18n] Switching language twice on a product whose URL exists in one language only ends on "404 Page not found" — Medium

## Status: READY_TO_SUBMIT — filed as VCST-6501 (related to VCST-6454)
**Found by:** agent — testing VCST-6454

**Env:** vcst · storefront https://vcst-qa-storefront.govirto.com · theme `vc-theme-b2b-vue-2.61.0-pr-2570-2fc9` · store B2B-store · guest · Chromium 1920×1080 · 2026-10-22. Also seen on a local PR #2599 build (that PR does not touch language code).
**Evidence package:** `reports/tickets/Sprint26-21/VCST-6454/localhost/evidence-20261022T122722Z/` (`evidence-index.md`, `root-cause.md`)

## Summary
On a product page whose readable URL is defined in only one language, switching the language twice (each time to a language without that URL) lands the shopper on "404 Page not found". One switch works; the second loses the language the URL belongs to.

## Preconditions
- Multi-language store (B2B-store: en-US default, en-GB, de-DE, …).
- A product whose SEO URL exists in one non-default language only. On vcst: Vintage Wedding cake, URL `products-with-options/dreamy-cakes/vintage-wedding-cake` in de-DE only (`slugInfo` returns an entity for de-DE and `null` for en-US and en-GB).

## Steps to reproduce
1. Open `/product/c94d730a-a1e3-41d3-bba6-8e9eb9fe45e8` in English (United States).
2. Language → **Deutsch**. The URL becomes `/de/products-with-options/dreamy-cakes/vintage-wedding-cake` and the product shows.
3. Language → the first **English** (en-GB). The URL becomes `/en-GB/products-with-options/…` and the product still shows.
4. Language → the second **English** (en-US).

## Expected
The product page stays open in the new language, as it does after one switch (Deutsch → English (United States) shows the product).

## Actual
"404 Page not found" at `/products-with-options/dreamy-cakes/vintage-wedding-cake`. Reproduced 2/2 on vcst and 1/1 on localhost.

![404 after the second switch](../screenshots/Language-Switch-Second-Fallback-404/vcst-qa-run1-enGB-to-enUS-404.png)

## Layer Validation

| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | FAIL | the screenshot; on the en-US page `GetSlugInfo` is sent with `cultureName: "en-GB"` (`network/run1-GetSlugInfo-726.txt`) while every other call uses en-US |
| 2. Backend Admin | N/A | routing is client-side; the product's SEO data is confirmed through xAPI below |
| 3. GraphQL xAPI | PASS | `slugInfo` answers correctly for the culture it is asked about: an entity for de-DE, `null` for en-US and en-GB (`network/slugInfo-*.json`); every call returns 200 |
| 4. Platform REST API | N/A | not used by storefront routing |

**Owning layer:** Layer 1 — Storefront.

## Module Versions
Theme `2.61.0-pr-2570-2fc9` (vcst-qa, `vc-deploy-dev@vcst-qa theme/artifact.json`). Source read on vc-frontend `dev`, unchanged by PR #2599.

## Root Cause Analysis
- `client-app/shared/layout/components/language-selector/language-selector.vue`, `select()`: when the target language has no entity for the current slug, it stores `previousCultureSlug = { cultureName: currentLanguage, slug }` in sessionStorage and reloads.
- `client-app/shared/common/composables/useSlugInfo.ts`: the route is then resolved in `previousCultureSlug.cultureName`. First hop (de-DE → en-GB): the record is `{ de-DE }`, so the page resolves.
- Second hop (en-GB → en-US): the current language is en-GB, so the record is **overwritten** with `{ en-GB }`, although the slug belongs to de-DE and en-GB was itself only showing it through the fallback. `slugInfo(en-GB)` is `null`, which gives 404.
- Ruled out: by-design (the storefront itself navigates there and already has a fallback for this case), data drift (the API answers correctly), and VCST-6454 / PR #2599 (reproduced on a theme without it). Details: `root-cause.md`.

**Related, Low (not filed):** the language menu strips the region from `nativeName` (`language-selector.vue`, `.replace(/ *\([^)]*\) */g, "")`), so en-GB and en-US both read "English" and cannot be told apart.

## Fix Routing (→ /qa-fix)

- **Owning layer:** Layer 1 — Storefront
- **Suggested repo:** VirtoCommerce/vc-frontend
- **repoKind:** frontend
- **Ownership hint:** platform
- **Component / module:** vc-frontend language selector + slug resolution
- **RCA anchor:** `client-app/shared/layout/components/language-selector/language-selector.vue` `select()`, the `previousCultureSlug.value = { cultureName: currentLanguage.value?.cultureName, … }` branch
- **Routing confidence:** HIGH — one file; keep `previousCultureSlug.cultureName` when the current page was itself resolved through it (or store the resolved entity's `languageCode`)
