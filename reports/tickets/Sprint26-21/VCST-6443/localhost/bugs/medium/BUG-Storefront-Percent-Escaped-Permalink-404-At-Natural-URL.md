# [Medium] A page whose permalink contains a percent escape (%20, %2F, %3F) returns 404 at its natural storefront URL

**Env:** localhost (start-local) · storefront vc-frontend 2.60.0 · Platform 3.1089.0 · PageBuilderModule 3.1036.0-pr-178-e4ff · Chrome + Firefox
**Provenance:** PRE-EXISTING in vc-frontend (same code on tags 2.40.0 / 2.50.0 / 2.55.0, by source). Exposed by VCST-6443, whose decision explicitly allows `%` in permalinks · Related: VCST-6443

## Summary
VCST-6443 allows `%` in Page Builder permalinks, and the API stores `/x%20y` verbatim. Opening `{FRONT_URL}/x%20y` shows the storefront 404 page; the page renders only at the double-encoded `/x%2520y`. So the ticket's own stated impact ("the page's URL cannot be opened as written") remains for every stored percent escape.

## Steps to reproduce
1. `POST /api/page-builder-pages/create-group-page` with permalink `/agent-test-6443-inv%20pct` and `visibility: true`; publish with `POST /api/page-builder-pages/grouped/publishing/{id}?publish=true`. Store setting `VirtoPages.Enable=true`.
2. Open `{FRONT_URL}/agent-test-6443-inv%20pct` anonymously.
3. Open `{FRONT_URL}/agent-test-6443-inv%2520pct`.

## Expected vs actual
- **Expected ({SPEC} VCST-6443 decision + ticket impact):** a permalink the rule accepts opens at its natural URL.
- **Actual:** step 2 shows "404 Page not found"; step 3 renders the page. `%2F` and `%3F` also give 404. A bare `/x-100%` gets HTTP 400 from nginx before the SPA loads, and renders at `/x-100%25`. A Unicode `/страница` renders, because there the decoded path happens to equal the stored value.

![%20 permalink: 404 at its natural URL](../../screenshots/inv-231-pct20-natural-url-404.png)

## Root cause
Two lookups use two encodings.
- `client-app/app-runner.ts:135-164` sends the raw `location.pathname` to GetPageContext. Its slugInfo **matches** (`objectType: Pages`) and is seeded into the Apollo cache under the raw key (`seedSlugInfoCache`, lines 409-432).
- The lookup that decides, `client-app/pages/matcher/slug-content.vue:72-79` → `useSlugInfo` (`shared/common/composables/useSlugInfo.ts:50-63`), uses the vue-router-decoded `pathMatch` (`agent-test-6443-inv pct`). GetSlugInfo returns `entityInfo: null`, so the 404 renders.
- xAPI `slugInfo` matches only the raw stored string.

**Decision needed:** does a stored `%20` mean a space or the literal characters "%20"? Fix either in vc-frontend (look up the raw segment, or reuse the GetPageContext result) or in the Page Builder rule (reject or decode `%XX` on save).

Refs: C1 REG-2026-10-22-1819 CMS-231 · checklist CL-18 · KB-C301933A, KB-599B0720, KB-B617E312
