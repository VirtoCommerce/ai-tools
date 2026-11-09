# News: PUT /api/news with publishScope null returns 500 and the raw SQL error — Low

## Status: READY_TO_SUBMIT
**Found by:** agent — regression REG-2026-11-09-0950-W7U
**Tracker:** [VCST-6760](https://virtocommerce.atlassian.net/browse/VCST-6760) — Low, auto-fix labels withheld (API-only repro), Need hotfixes not set (News is in neither stable bundle v15/v16)
**Case:** side finding of the W7 News deep checks (suite 084) · Stable 16 W7 (VCST-6411 / VCST-6042)

**Env:** vcptcore_regression, store B2B-store · Platform 3.1076.8 · VirtoCommerce.News 3.1005.0 · REST with an admin bearer token · deterministic. Non-visual defect: the evidence is the HTTP response.

## Summary
`publishScope` is required by the database but not validated by the API. On create a null becomes the column default `Anonymous`; on update the null reaches the database and the request fails with 500 and the SQL message naming the database and table `NewsArticle`.

## Steps to reproduce
1. Admin bearer token (`POST /connect/token`, password grant).
2. `POST /api/news` `{"name":"AGENT-TEST-scope","storeId":"B2B-store","publishScope":"Anonymous"}` → 200.
3. `GET /api/news/{id}`, set `publishScope: null`, send it with `PUT /api/news`.

## Actual
- `PUT` → **500** `Cannot insert the value NULL into column 'PublishScope', table '<database>.dbo.NewsArticle'; column does not allow nulls. UPDATE fails.`
- `POST` with null → 200, stored as `Anonymous`. (Probe article deleted afterwards: 204, then GET → null.)

## Expected
- Create and update treat a null scope the same way (both 400, or both apply `Anonymous`); no SQL text in any response.

## Layer Validation
| Layer | Result | Evidence |
|---|---|---|
| 1. Storefront Frontend | N/A | not exposed |
| 2. Backend Admin | N/A | the Admin form requires a scope |
| 3. GraphQL xAPI | N/A | read-only for news |
| 4. Platform REST API | FAIL | responses above |

**Owning layer:** Layer 4 — REST

## Root Cause Analysis
- `NewsDbContext` L27: `Property(x => x.PublishScope).HasDefaultValueSql("'Anonymous'")` — applies on INSERT only; UPDATE writes the null.
- The FluentValidation validator run by `NewsArticleService.ValidateAsync` has no rule for `PublishScope`.

## Fix Routing (→ /qa-fix)
- **Owning layer:** Layer 4 — REST
- **Suggested repo:** VirtoCommerce/vc-module-news
- **repoKind:** module
- **Ownership hint:** platform
- **Component / module:** News article validator / NewsDbContext
- **RCA anchor:** `NewsDbContext.cs:27` `HasDefaultValueSql`; `NewsArticleService.ValidateAsync`
- **Routing confidence:** HIGH
