# News admin: "Has unsaved changes" banner sticks after Reset or a language switch — Medium

## Status: READY_TO_SUBMIT
**Found by:** agent — regression REG-2026-11-09-0950-W7U
**Tracker:** [VCST-6757](https://virtocommerce.atlassian.net/browse/VCST-6757) — Medium, labels vc-fix + qa-autofix, Need hotfixes not set (News is in neither stable bundle v15/v16)
**Case:** NEWS-026 (suite 084) · Stable 16 W7 (VCST-6411 / VCST-6042)

**Env:** vcptcore_regression, store B2B-store · Platform 3.1076.8 · VirtoCommerce.News 3.1005.0 · Admin SPA (vc-shell embedded app), Chrome/Firefox via Playwright · deterministic under the condition below. Earlier W7 runs classed NEWS-026 FLAKY: the re-check used articles that had both entries for the language, which is the one clean cell.

## Summary
The article blade stays dirty after **Reset**, or after switching the language with no edit, whenever the article has no content entry or no SEO entry for the shown language. The banner and dirty dot stay, Save and Reset are disabled, and closing the blade asks to discard changes.

## Steps to reproduce
1. Admin SPA as administrator → **News** → **Add**: Name `AGENT-TEST-<timestamp>`, Store `B2B-store`, en-US Title, no SEO entry. Save; keep the blade open.
2. Change the Name, click **Reset**. Look at the banner and the toolbar, then close the blade.
3. Variant: open an article with en-US content and SEO, switch the language flag to `pt-PT` (no entries), change nothing.

## Actual
- Reset restores the Name; "Has unsaved changes" and the dirty dot stay; Save/Reset disabled; close shows the discard prompt.
- The `pt-PT` switch with no edit turns the banner on.
- Matrix: no SEO entry — sticks · no content entry — sticks · language with no entries — sticks · both entries present — clean.
- ![after reset](../../screenshots/News-Admin-Unsaved-Banner-Sticks-After-Reset/NEWS026-B-noSEO-afterReset-banner.png)
- ![pt-PT switch](../../screenshots/News-Admin-Unsaved-Banner-Sticks-After-Reset/NEWS026-F-withSEO-switch-to-ptPT-no-edit.png)

## Expected
- After Reset, and after a language switch with no edit, the form is clean: no banner, no dirty dot, no close prompt.

## Layer Validation
| Layer | Result | Evidence |
|---|---|---|
| 1. Storefront Frontend | N/A | admin-only feature |
| 2. Backend Admin | FAIL | screenshots above; no PUT is sent on Reset |
| 3. GraphQL xAPI | N/A | not involved |
| 4. Platform REST API | PASS | `GET /api/news/{id}` returns the stored article unchanged |

**Owning layer:** Layer 2 — Admin (vc-shell embedded app in vc-module-news)

## Root Cause Analysis
`src/VirtoCommerce.News.Web/App/src/modules/vc-news/pages/news-article-details.vue` @ `3.1005.0` (same code 3.1004.0 → `dev`):
- Reset handler L508-511 calls `resetNewsArticle()` then `setBaseline()` in the same tick.
- Watcher L464 (`ensureLocalizedEntries`) then adds empty content/SEO placeholders for the locale, so the form no longer equals the baseline.
- `setLocale` L380-383 never re-takes the baseline.
- The load path L628-632 already waits `await nextTick()` before `setBaseline()` for exactly this reason. Fix: the same in Reset and `setLocale`.

## Fix Routing (→ /qa-fix)
- **Owning layer:** Layer 2 — Admin
- **Suggested repo:** VirtoCommerce/vc-module-news
- **repoKind:** module (embedded Vue 3 sub-app `src/VirtoCommerce.News.Web/App`)
- **Ownership hint:** platform
- **Component / module:** News admin app, article details blade
- **RCA anchor:** `news-article-details.vue:508-511` (`setBaseline()` after `resetNewsArticle()`), `:380-383` (`setLocale`)
- **Routing confidence:** HIGH
