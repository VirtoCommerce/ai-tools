# BUG: Page Builder shows a stale "Has unsaved changes" banner after a clean Publish

## Status: READY_TO_SUBMIT

## JIRA: [VCST-5515](https://virtocommerce.atlassian.net/browse/VCST-5515) (filed 2026-07-21, Bug / Low)

## Severity: Low (cosmetic — misleading status only; publish actually succeeded, no data impact)

## Env
vcptcore-qa @ Platform `3.1042.0-pr-3068` · PageBuilderModule `3.1014.0-pr-144-ca7d`

## Summary
After a successful Publish of a Page Builder page, the details blade keeps showing a yellow **"Has unsaved changes"** banner, even though the server reports no pending changes (`hasChanges:false`). The status chip itself correctly reads "Published"; only the separate alert is wrong. Confirmed against the raw REST publish-status, so it is a genuine UI/state staleness, not a reading of the designer cache.

## Steps to Reproduce
1. Admin → Stores → B2B-store → Page Builder → open a page in the details blade.
2. Make an edit (or rename) → Save → **Publish**; wait for publish to complete.
3. Observe the details blade after publish.

Reproduced on throwaway page `AGENT-TEST-5417D` (groupId `500651f3-02d8-41fe-8aed-eb72bc3958a3`).

## Expected vs Actual
- **Expected:** after a clean Publish with no pending draft, the "Has unsaved changes" banner is not shown (matches `hasChanges:false`).
- **Actual:** the "Has unsaved changes" banner is displayed while the API reports `hasChanges:false`.

## Evidence
- `../screenshots/VCST-5417/VCST-5417-F4-banner-vs-haschanges-false.png` — blade showing the banner
- Raw REST at the same moment:
  - `GET /api/page-builder-pages/grouped/{id}` → `hasChanges: false`
  - `GET /api/page-builder-pages/grouped/publish-status/{id}` → `{"published":true,"hasChanges":false}`

## Layer Validation

| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | N/A | Admin-only |
| 2. Backend Admin (SPA / shell) | **FAIL** | Banner shown while server `hasChanges:false` |
| 3. GraphQL xAPI | N/A | — |
| 4. Platform REST | PASS | `publish-status` correctly returns `hasChanges:false` |

**Owning layer:** Layer 2 — Admin SPA (Page Builder shell). REST is correct; the shell's local "has changes" state is stale (not re-derived from `publish-status` after publish, or an optimistic flag not cleared).

## Root Cause Analysis
REST is authoritative and correct: `PublishStatus` returns `HasChanges = groupedPage.HasChanges` (false once `PublishGroup` promotes the draft and deletes superseded pages, leaving no Draft). The shell's banner is driven by a **client-side "has changes" flag that is not cleared / not re-fetched from `publish-status`** after a successful publish. Same frontend state-staleness family as the designer empty-render (`BUG-PageBuilder-Designer-Empty-Render-Double-Fetch.md`).

## Fix Routing (→ /qa-fix)
- **Owning layer:** Layer 2 — Admin (Page Builder shell, in-repo frontend)
- **Suggested repo:** `VirtoCommerce/vc-module-pagebuilder` (`page-builder-shell` frontend)
- **repoKind:** module
- **Ownership hint:** platform (native)
- **Component / module:** Page Builder shell details blade — post-publish state (re-fetch / clear the "has changes" flag from `publish-status`)
- **RCA anchor:** shell "has unsaved changes" banner bound to a stale client flag not reconciled with `GET grouped/publish-status/{id}` (`hasChanges:false`) after Publish.
- **Routing confidence:** MEDIUM — repo confirmed; not in `ci/config/fix-repos.json` (add before `/qa-fix`); deterministic symptom but frontend anchor not pinned to a file:line.
