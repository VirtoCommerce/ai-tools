# BUG: Page Builder shows a stale "Has unsaved changes" banner after a clean Publish

## Status: FIXED — PR [vc-module-pagebuilder#156](https://github.com/VirtoCommerce/vc-module-pagebuilder/pull/156) (open, awaiting merge); verified live on vcst-qa @ PageBuilderModule `3.1017.0-pr-156-59d4`. Regression cases CMS-135..138 (suite `Page Builder` / 059) PASS live 2026-07-21.

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
**Superseded — see "Root Cause Analysis (updated, live /qa-fix investigation)" below.** Original hypothesis:
REST is authoritative and correct: `PublishStatus` returns `HasChanges = groupedPage.HasChanges` (false once `PublishGroup` promotes the draft and deletes superseded pages, leaving no Draft). The shell's banner is driven by a **client-side "has changes" flag that is not cleared / not re-fetched from `publish-status`** after a successful publish. Same frontend state-staleness family as the designer empty-render (`BUG-PageBuilder-Designer-Empty-Render-Double-Fetch.md`).

## Root Cause Analysis (updated, live /qa-fix investigation, 2026-07-21) — SUPERSEDED
The prior /qa-fix run (module-embedded Vue3 sub-app routing → `fullstack-frontend`) hypothesized a
**backend async draft-promotion race** in `PublishGroup`. **This is refuted by the backend code trace
below** — the publish is fully synchronous. Kept for audit trail; do not action.

## Root Cause Analysis (updated 2 — code-level backend trace, 2026-07-21)
Read the actual C# on `dev` (GitHub, read-only). The publish path is **synchronous and correct**, so the
"async race" theory does not hold:

1. **Publish is synchronous.** `PageBuilderPageController.PublishGroup` (POST `grouped/publishing/{groupId}`,
   `src/VirtoCommerce.PageBuilderModule.Web/Controllers/Api/PageBuilderPageController.cs`) does:
   `pageToPublish.Status = Published` → `await groupedPageService.SaveChangesAsync([group])` (during which
   `GroupedPageService.NormalizePublishedPages` demotes the superseded Published page to `Archived`) →
   `await crudService.DeleteAsync(pagesToDelete)` → **only then** `Ok()`. No queue / Hangfire / event-driven
   deferral — the draft is gone before the 200 returns.
2. **`HasChanges` is a pure computed property** (`GroupedPageBuilderPage.cs`:
   `Pages?.Any(p => p.Status == Draft) ?? false`), read identically by `GetGroup` and `PublishStatus`. After
   a synchronous publish the group holds no `Draft` page ⇒ the server correctly returns `hasChanges:false` —
   exactly what the **original evidence** shows (both REST endpoints returned `false` while the banner said
   `true`). So the authoritative server value is correct; the banner is not.
3. **A Draft is (re)created by any save.** Both `UpdateGroup` (PUT `grouped`) and `SavePageContent`
   (POST `grouped/{id}/content`) add a fresh `Draft` page whenever none exists. So **any save/update the
   shell fires *after* publish legitimately flips `HasChanges` back to `true`** (a phantom draft).

**Corrected conclusion:** the backend is not at fault (publish synchronous, `HasChanges` correct,
DB has no draft post-publish). The defect is **shell-side**, and its most concrete mechanism is one of:
(a) a **display/state bug** — the banner renders stale `true` while the re-fetched authoritative value is
`false`; or (b) a **phantom draft** — the shell fires a content/settings save (e.g. `SyncGroupSettingsToContent`
equivalent, autosave) *after* publish, which re-creates a Draft server-side and legitimately re-raises
`HasChanges`. Both are owned by `page-builder-shell`, not the C# module.

**One decisive live capture would settle (a) vs (b)** — needs a human/live session, not static analysis:
capture the exact `GET grouped/{id}` response body the shell receives in the seconds after Publish, plus
the shell's network trace for any `PUT grouped` / `POST grouped/{id}/content` fired post-publish.
- server body `hasChanges:false` + banner `true` ⇒ **(a) display bug** (fix the binding/state in the shell).
- server body `hasChanges:true` + a post-publish save in the trace ⇒ **(b) phantom draft** (stop the shell
  saving after publish, or treat the just-published state as clean).

## Root Cause Analysis (CONFIRMED — live network capture, vcptcore-qa, 2026-07-21)
Reproduced live (deployed `PageBuilderModule 3.1016.0` / platform `3.1046.0-pr-3056` — drifted from the
filed PR build, **still reproduces**). Verdict: **(a) display/state bug — CONFIRMED; (b) phantom draft — RULED OUT.**
- Post-Publish, the shell's own `GET grouped/{id}` returned `status:"Published"`, **`hasChanges:false`**,
  `pages[]` = a single `Published` page (no Draft). `publish-status` → `{"published":true,"hasChanges":false}`.
- **No `PUT grouped` and no `POST grouped/{id}/content` fired after the publish 200** — no draft is re-created ⇒ (b) ruled out.
- Yet the banner renders `true` and a `beforeunload` guard fires — a client dirty flag stuck `true`. A genuine
  reload re-derives the clean state and the banner disappears.
- **Root cause:** the shell's Publish handler doesn't reset local `hasChanges`/dirty state after a successful
  publish (and ignores the `hasChanges:false` in the `GET grouped/{id}` it already re-fetches).
- Evidence screenshot: `test-results/edge/vcst-5515-banner-after-publish.png` (gitignored).

## Fix Routing (→ /qa-fix)
- **Owning layer:** Layer 1/2 — **Page Builder Vue 3 shell** (`page-builder-shell`). Backend REST is
  confirmed correct and is **NOT** the fix target (corrects the superseded RCA).
- **Suggested repo:** `VirtoCommerce/vc-module-pagebuilder` → sub-app
  `src/VirtoCommerce.PageBuilderModule.Web/Apps/page-builder-shell/`
- **repoKind:** module (embedded Vue3 sub-app → routes to `fullstack-frontend` + `/vc-shell-fix` via
  `moduleFrontendSubApps`)
- **Ownership hint:** platform (native)
- **Component / module:** shell `usePageBuilderDetails` composable + `pageStatus.vue` banner binding
  (`item.hasChanges && item.status == Published`); check for any post-publish save.
- **RCA anchors (confirmed):** backend (correct, not the fix) —
  `.../Web/Controllers/Api/PageBuilderPageController.cs` `PublishGroup` + `PublishStatus`;
  `.../Core/Models/GroupedPageBuilderPage.cs` `HasChanges`/`Status`;
  `.../Data/Services/GroupedPageService.cs` `NormalizePublishedPages`. Symptom (fix here) —
  `.../Apps/page-builder-shell/src/modules/page-builder/composables/usePageBuilderDetails/index.ts`.
- **Routing confidence:** HIGH — backend proven clean (code trace), defect confirmed shell-side (a)
  display/state via live capture. Fix: reset the local dirty/`hasChanges` state after a successful publish
  in `usePageBuilderDetails` so `pageStatus.vue`'s banner clears. Now a clean locally-scoped shell fix —
  candidate for `/qa-fix` → `fullstack-frontend` + `/vc-shell-fix`; the banner reset still needs live/visual
  verification post-deploy.
