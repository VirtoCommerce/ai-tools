# BUG: News Admin — article SEO slug with spaces, uppercase and & % ! is saved verbatim (no normalization or validation)

## Status: READY_TO_SUBMIT
**Found by:** agent — regression REG-2026-11-05-1645-W7

- **Tracker:** [VCST-6726](https://virtocommerce.atlassian.net/browse/VCST-6726) (Relates VCST-6042)
- **Severity:** Low (Admin data quality; workaround = type a valid slug). Medium if storefront links to such articles break.
- **Case:** `NEWS-031` (`regression/suites/Backend/news/084-news-articles.csv`), stable-16 wave W7

## Env
- Stand `vcptcore_regression` (ENV_RISK=test), Admin SPA, playwright-firefox, 2026-11-06 10:38–10:52 UTC
- Platform `3.1076.8`, VirtoCommerce.News `3.1005.0`; matches vc-deploy-dev `vcptcore-regression` (§Build OK)
- HAR: lane HAR under `test-results/firefox/` (not committed); no server failure, so no trace ID applies
- Console: 0 errors (pre-login signalR 401 noise only)

## Summary
The News admin app accepts an SEO slug containing spaces, uppercase, `&`, `%` and `!` and stores it exactly as typed. vc-module-seo's
`invalidUrlPattern` forbids these characters for products, categories and stores; the News app applies no such rule client- or server-side.

## Steps to reproduce
Package has no `## Steps to reproduce` section; steps are from the case row `NEWS-031` plus the package's DOM/network rows.
1. Admin SPA → **News** (`#!/workspace/embedded-app/vc-news`) → **Add**
2. Name `AGENT-TEST-News-<ts>`, Store `B2B-store`, en-US Title
3. SEO: **Is active** on, slug `My  SLUG & Test% ü!`
4. Observe: no inline error, **Save** enabled → **Save**
5. `GET /api/news/{id}` → `seoInfos[].semanticUrl`

## Actual
- `PUT /api/news` 200; GET returns `semanticUrl` = `My  SLUG & Test% ü!` byte-for-byte (double space kept)
- xAPI `slugInfo` resolves it only for the exact raw string
- Evidence: `reports/regression/REG-2026-11-05-1645-W7/evidence/NEWS-031/network/put-and-get-article-C.json`
- Screenshot: `reports/bugs/screenshots/News-Admin-SEO-Slug-Not-Normalized/NEWS-031-raw-name-grid-and-blade.png` (saved article, no validation message; slug proof is the API readback). Prior run: `reports/regression/REG-2026-11-05-1645-W7/screenshots/NEWS-031-FAIL-slug-not-normalized.png`

## Expected
Slug normalized or rejected with a message and Save disabled — the platform SEO blade's rule (`url-keyword-invalid`); the server rejects it too.

## Layer Validation

| Layer | Result | Evidence |
|---|---|---|
| 1. Storefront Frontend | N/A — not probed by the investigation | — |
| 2. Backend Admin | FAIL | screenshot above; DOM row (no error, Save enabled) |
| 3. GraphQL xAPI | N/A — not probed by the investigation (slugInfo only corroborates storage) | network/put-and-get-article-C.json |
| 4. Platform REST API | FAIL | network/put-and-get-article-C.json (PUT 200, raw value persisted) |

**Owning layer:** News module — Admin app slug Field + server `NewsArticleValidator`.

## Root Cause Analysis
- `src/VirtoCommerce.News.Web/App/src/modules/vc-news/pages/news-article-details.vue` L224–236 @ `3.1005.0`: `seo-url` Field has only a conditional `required` rule
- `src/VirtoCommerce.News.Data/Validation/NewsArticleValidator.cs` L11–16 @ `3.1005.0`: no `SemanticUrl` rule
- Platform rule: vc-module-seo `src/VirtoCommerce.Seo.Web/Scripts/utils/seo-utils.js` L3 `invalidUrlPattern`
- Ruled out: by-design (no doc/code says news slugs are free-form); data drift (fresh article, same result). Docs (vc-docs) define no slug rule for news.
- Detail: `reports/regression/REG-2026-11-05-1645-W7/evidence/NEWS-031/root-cause.md`; kb `KB-0BA573B5`

## Need hotfixes
Not set — VirtoCommerce.News is not pinned in bundles v15 or v16.

## Fix Routing (→ /qa-fix)
- **Owning layer:** Layer 2 — Admin (+ Layer 4 server-side validator)
- **Suggested repo:** VirtoCommerce/vc-module-news
- **repoKind:** module
- **Ownership hint:** platform
- **Component / module:** News admin app (vc-shell embedded Vue app) + `NewsArticleValidator`
- **RCA anchor:** `news-article-details.vue` L224–236; `NewsArticleValidator.cs` L11–16
- **Routing confidence:** MEDIUM — the Vue app is not declared in `fix-repos.json` `moduleFrontendSubApps`, so auto-fix labels withheld
