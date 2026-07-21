# BUG: Page Builder shows a stale "Has unsaved changes" banner after a clean Publish

## Status: CONFIRMED

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
**Superseded — see "Root Cause Analysis (updated, live /qa-fix investigation)" below.** Original hypothesis:
REST is authoritative and correct: `PublishStatus` returns `HasChanges = groupedPage.HasChanges` (false once `PublishGroup` promotes the draft and deletes superseded pages, leaving no Draft). The shell's banner is driven by a **client-side "has changes" flag that is not cleared / not re-fetched from `publish-status`** after a successful publish. Same frontend state-staleness family as the designer empty-render (`BUG-PageBuilder-Designer-Empty-Render-Double-Fetch.md`).

## Root Cause Analysis (updated, live /qa-fix investigation, 2026-07-21)
`/qa-fix` routed this correctly to `fullstack-frontend` (module-embedded Vue3 sub-app routing — see
`moduleFrontendSubApps`/`resolveOwningSubApp()`), which cloned the real repo and traced the actual code
(`src/VirtoCommerce.PageBuilderModule.Web/Apps/page-builder-shell/src/modules/page-builder/`). Findings
that overturn the original hypothesis:

1. **The client already re-fetches after publish.** `composables/usePageBuilderDetails/index.ts`
   `publishGroup()` calls `loadGroup()` post-publish, which re-fetches BOTH `getGroup` (→
   `item.hasChanges`) and `publishStatus` (→ `status.hasChanges`). This has been true since the original
   commit (`2cf5b39`, `785bf30`) — "not re-fetched" was never the defect.
2. **Not a reactivity bug either** — `useModificationTracker`'s `currentValue` is a writable `Ref`;
   reassignment propagates correctly to `pageStatus.vue`'s `v-if="item.hasChanges && item.status ==
   PageStatuses.Published"`.
3. **The real cause: a backend async draft-promotion race.** The evidence bug report shows `item.status`
   fresh ("Published") but `item.hasChanges` stale (`true`) *from the same `getGroup` response object* —
   while a REST query moments later returns `hasChanges:false`. `PublishGroup` promotes/deletes the
   superseded draft **asynchronously** server-side; the shell's immediate post-publish re-fetch races that
   promotion and captures a transient pre-settle state that is never re-read.

**This is a backend timing issue, not a client-side state-staleness bug** — cross-scope for a
shell-only auto-fix (the correct fix is either backend: make `PublishGroup` synchronously reflect the
settled state before returning, or frontend: poll `publish-status` until it settles post-publish — neither
is a minimal, locally-verifiable, shell-only change). `/qa-fix` correctly STOPped rather than pushing a
speculative fix — see the ticket comment for the full trace.

## Fix Routing (→ /qa-fix)
- **Owning layer:** Layer 2 — Admin (Page Builder shell, in-repo frontend) for the SYMPTOM; likely
  **backend** (`VirtoCommerce.PageBuilderModule.Data`, `PublishGroup`) for the actual root cause — see
  updated RCA above.
- **Suggested repo:** `VirtoCommerce/vc-module-pagebuilder` (`page-builder-shell` frontend for the
  symptom; the module's C# `Data` layer for the likely real fix)
- **repoKind:** module
- **Ownership hint:** platform (native)
- **Component / module:** Page Builder shell `usePageBuilderDetails` composable (symptom) / `PublishGroup`
  draft-promotion timing (likely root cause)
- **RCA anchor:** `src/VirtoCommerce.PageBuilderModule.Web/Apps/page-builder-shell/src/modules/page-builder/composables/usePageBuilderDetails/index.ts` (symptom); backend `PublishGroup` (likely real fix, not yet located).
- **Routing confidence:** MEDIUM — repo + sub-app routing confirmed live; the auto-fix itself correctly
  STOPped (cross-scope / not locally verifiable) rather than guessing. Human decision needed on which
  side (backend timing fix vs. frontend poll-until-settled mitigation) to pursue.
