# BUG: [Catalog] Leaving a category page before its data loads rewrites the URL to that category while another page stays on screen

## Status: FILED — [VCST-6253](https://virtocommerce.atlassian.net/browse/VCST-6253) (Medium, standalone, relates to VCST-5817)

**Severity: Medium** · Provenance: PRE-EXISTING (A/B control: vcst-qa-storefront 3.0.0-alpha.2685) · Found: /qa-test VCST-5817, 2026-10-09

_Found by an agent during /qa-test VCST-5817 (search-scope slot). Pre-existing — not introduced by vc-frontend PR #2522._

**Env:** local storefront = vc-frontend PR #2522 build `2.60.0-pr-2522-6f90-6f902c9e` (API vcst-qa, store B2B-store, anonymous). *Control:* vcst-qa-storefront `3.0.0-alpha.2685` (no PR #2522) — reproduces identically, so this is *pre-existing*, not caused by PR #2522.

## Summary
If the shopper leaves a category page after its slug resolves but before the `GetCategory` response returns (~0.4–0.55 s window, natural timing), the late response calls `history.replaceState` with the category URL. The browser now shows the Cart (or global search results) under the *category* URL. Reload, Back and a shared link then open a different page.

## Steps to reproduce
1. Open `/printers/multifunction-printers/laser-monochrome`.
1. Click the breadcrumb *Laser Printers*, then within ~0.5 s click the header *Cart* link.
1. Wait 3 s and look at the address bar.
1. Press F5; press Back.
Variant: instead of Cart, type `laser` in the search bar and press Enter while the category is still loading.

## Expected vs Actual
**Expected:** the URL stays `/cart` (or `/search?q=laser`); reload and Back return the page the shopper is on.
**Actual:** the URL becomes `/printers/multifunction-printers` while the Cart page stays rendered (h1 "Cart"); F5 opens *Laser Printers*; Back does not return to the previous entry. Search variant: 19 global results stay on screen under `/printers/multifunction-printers?q=laser`; F5 shows "Search for laser in Laser Printers — 9 results".

Measured (PR build, natural timing): Cart clicked at 3291 ms, GetCategory responses at 3751/3759 ms; href `/cart` at +0.4 s → `/printers/multifunction-printers` at +3 s. Control build: same outcome.

## Root cause
`client-app/shared/catalog/components/category.vue` (dev @ 1850afa6): the `categoryId` watcher awaits `fetchCategory` (L767) and then calls `updateLocalizedUrl(data?.category?.slug)` (L781) with no cancelled / unmounted / route-still-matches guard. `core/composables/useLanguages.ts` `updateLocalizedUrl` (L293–315) calls `history.replaceState` (L309), behind vue-router, carrying the current `location.search`.

## Suggested fix
Set a `cancelled` flag in the watcher's `onCleanup` (PR #2522 already adds one for `finishPreparing`) and return before `updateLocalizedUrl` / `isCategoryNotFound`. Unit-testable: unmount while `fetchCategory` is pending.

## Layer validation
||Layer||Result||
|Storefront Frontend|FAIL|
|Backend Admin|N/A|
|GraphQL xAPI|N/A — all /graphql 200, correct data|
|Platform REST API|N/A|

## Fix routing
* Owning layer: Layer 1 — Storefront · Repo: `VirtoCommerce/vc-frontend` · RCA anchor: `client-app/shared/catalog/components/category.vue:781` · Confidence: HIGH

## References
Found during VCST-5817 /qa-test (2026-10-09), checklist D1; evidence: `reports/tickets/Sprint26-20/VCST-5817/evidence/D1-stale-category-url-rewrite/`.