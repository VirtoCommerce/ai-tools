# BUG: [Page Builder] Published page loses ALL content after rename → Save → Publish — VCST-5417

## Status: NOT_REPRODUCED (fix verified present on deployed build)

## Resolution
- **Fixed in:** `vc-module-pagebuilder` PR #133 (VCST-5069, merged 2026-05-15) — seeds the new draft from the current Published content on metadata edit; enforces a single Published page per group. (PR #116 / VCST-4872 added the underlying `CopyPageContentAsync`.)
- **JIRA:** VCST-5417
- **Verified:** 2026-07-08 (live, vcptcore-qa)
- **Verification method:** `/qa-bug reproduce` — safe empirical repro on a self-created throwaway page; final close-out should go through `/qa-verify-fix VCST-5417`.

## Env
vcptcore-qa @ Platform `3.1042.0-pr-3068` · **PageBuilderModule `3.1014.0-pr-144-ca7d`** (confirmed via `/api/platform/modules`). Store `B2B-store` → Page Builder.
> Reported against `PageBuilderModule 3.1014.0-pr-149-3129` — a **different build** than what is currently deployed.

## Summary
Original bug (reported): renaming a *published* Page Builder page → Save → Publish spawned a new empty inner page-version without cloning content, permanently wiping the live page. **On the currently-deployed build the defect does NOT reproduce** — content is carried into each new version across repeated rename/publish cycles. Independent live reproduction corroborates the automated `/qa-fix` analysis already on the ticket.

## Reproduction attempt (safe — throwaway page only)
Created disposable page **AGENT-TEST-5417** (groupId `78ae8bc8-f5d0-43bd-a7ea-9373b3b469c8`) in B2B-store with 2 blocks (Text "Hello, markdown!" + Image AltaredellaPatria.jpg). **No existing page was touched.** Then ran the exact STR twice.

| Step | pages[] inner-versions | GET `/grouped/{id}/content` |
|------|------------------------|------------------------------|
| First publish | `[1b83403c Published]` | **2 blocks** ✅ |
| Cycle 1: rename `-r1` → Save → Publish | `1b83403c → Archived`, `6e8a026e → Published` | **2 blocks, settings.name=-r1** ✅ |
| Cycle 2: rename `-r2` → Save → Publish | `120c98d6 → Published`, others Archived | **2 blocks, settings.name=-r2** ✅ |

Content was **copied into every newly-created version**; the published version was never left empty. Old versions are demoted to Archived (consistent with PR #133), not left as empty duplicates.

## Expected vs Actual
- **Expected (per ticket):** rename + republish changes only name/permalink; content stays attached. ✅ **This is the behavior observed.**
- **Reported Actual (not seen):** published version ends up empty (`content:[]`), loss irreversible. ❌ Did not occur on the deployed build.

## Layer Validation

| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | N/A | Content served over module REST; permalink 404 at baseline in this env |
| 2. Backend Admin (SPA) | PASS (with caveat — see Incidental) | Designer rendered both blocks at first publish + post-Cycle-1 reload |
| 3. GraphQL xAPI | N/A | Not exercised |
| 4. Platform REST | **PASS (owning layer)** | `GET /grouped/{id}/content` = 2 blocks after every publish; `PUT /grouped` 200 (Save); `POST /grouped/publishing/{id}?publish=true` 200 (Publish) |

**Owning layer:** Layer 4 — Platform REST (the same layer the original bug lived in); returns intact content, so the fix is confirmed at the source of truth.

## Root Cause Analysis (why it no longer reproduces)
The reported root cause — a new inner page-version created without cloning the source version's content — was fixed in `VirtoCommerce/vc-module-pagebuilder`:
- **PR #116** (VCST-4872, merged 2026-04-16): added `CopyPageContentAsync` + Clone/Save/Load content.
- **PR #133** (VCST-5069, merged 2026-05-15): **the direct fix** — on metadata edit, ensures a Draft exists and **seeds it from the current Published content**, writes name/permalink into the draft settings, and normalizes to a single Published page (demoting the rest to Archived).

Both merged **before** the ticket was filed. The deployed `pr-144` build (3.1014.0 base) is chronologically after both. The ticket's observed "versions accumulate as Archived (pages[] 1→4)" is incompatible with PR #133's single-Published normalization — strong evidence the *reported* `pr-149` build ran pre-#133 publishing logic despite its version label (consistent with the reporter's note that it "reproduces on older PRs / module builds").

## Incidental observation (NOT the reported bug — needs confirmation, not filed)
Post-Cycle-2, two consecutive fresh **"Open designer"** loads rendered the page as **`[no name]` with an empty body** (screenshot below) even though the REST content endpoint still returned both blocks (200, 401 bytes). This is a **designer render false-negative** — the *inverse* of the reported stale-blocks-masking-loss. Had the designer UI been trusted over REST, this would have been mis-filed as data loss. Likely an Admin SPA fetch/cache/timing glitch after rapid version churn; may relate to known browser/Apollo cache staleness. Not confirmed as a distinct defect — flagging only.

![Designer false-negative: [no name], empty body, while REST held 2 blocks](../screenshots/VCST-5417/VCST-5417-02-designer-empty-after-cycle2.png)

## Cleanup
Throwaway page AGENT-TEST-5417 unpublished → archived → deleted (scoped delete of own groupId only). Verified: `GET grouped` → 404; archived-list search "5417" → no results. Nothing else touched.

## Fix Routing (→ /qa-fix)
- **Owning layer:** Layer 4 — REST (page-builder module) — *for reference; no fix needed, already merged.*
- **Suggested repo:** `VirtoCommerce/vc-module-pagebuilder`
- **repoKind:** module
- **Ownership hint:** platform (native)
- **Component / module:** PageBuilder grouped-page versioning + publishing (`PUT /api/page-builder-pages/grouped`, `POST …/grouped/publishing/{groupId}`, `…/grouped/{groupId}/content`)
- **RCA anchor:** `GroupedPageService` draft-seed-from-Published on metadata edit (PR #133); `CopyPageContentAsync` (PR #116)
- **Routing confidence:** HIGH
- **Auto-fix disposition:** No action for `/qa-fix` — fix already merged on `dev`. Ticket needs deploy re-verification via `/qa-verify-fix VCST-5417`, not a new fix.

## Developer reference — reproduce / fix / where (JIRA comment 102409)

### How to reproduce (original data-loss)
Precondition: a *Published* page **with content**, on a module build **before PR #133** (< `3.1010`; the reported `3.1014.0-pr-149` lineage behaved as pre-#133).
1. Admin → Stores → B2B-store → Page Builder → **Active** → open a published page that has blocks.
2. Change **Name** and/or **Permalink** → **Save** ("Published · Has draft with changes").
3. **Publish**; repeat rename → Save → Publish once more.
4. `GET /api/page-builder-pages/grouped/{groupId}/content` → broken build returns empty (`content:[]`); loss irreversible via UI.
- Does NOT reproduce on `dev` / deployed `pr-144`. When re-verifying, **trust REST content, not the designer** (designer can render `[no name]`/empty via a separate double-fetch race — no data loss).

### How to fix (already fixed — PR #116 + PR #133)
- `UpdateGroup` ensures a Draft exists; when only Published exists it creates the Draft and **seeds it from Published** via `CopyPageContentAsync(publishedPageId, draftPage.Id)` before publish.
- `PublishGroup` promotes Draft → Published and deletes superseded pages.
- `NormalizePublishedPages` enforces at-most-one Published per group (extras → Archived).
- `SyncGroupSettingsToContent` writes Name/Permalink/CultureName into content `settings`; `RaisePageContentChanged` re-indexes.
- Any env still exhibiting it → upgrade PageBuilderModule to ≥ `3.1010` (PR #133) / `dev` ≥ `3.1015`.

### Where (repo `VirtoCommerce/vc-module-pagebuilder`, branch `dev`)
- `src/VirtoCommerce.PageBuilderModule.Web/Controllers/Api/PageBuilderPageController.cs` — `UpdateGroup`, `PublishGroup`, `SyncGroupSettingsToContent`, `RaisePageContentChanged`, `GetPageContent`
- `src/VirtoCommerce.PageBuilderModule.Data/Services/GroupedPageService.cs` — `CopyPageContentAsync`, `NormalizePublishedPages`
- PRs: #116 (VCST-4872), #133 (VCST-5069)
