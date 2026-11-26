# BUG: Site Builder designer REST takes any first path segment as the theme folder — discard of a theme/status path silently does nothing

## Status: READY_TO_SUBMIT
**Found by:** agent — testing VCST-6963
**Severity:** Medium (P2) · **Provenance:** IN-SCOPE (VCST-6963 — the path check predates PR #5, but PR #5's discard-removes-a-new-type flow and its custom-section rules depend on it) · **To-fix row:** F-2

## Env
- vcst_dev — Platform 3.1100.0, VirtoCommerce.SiteBuilder 3.1003.0-pr-5-1129 (= vc-module-site-builder#5 head `1129a2da`), VirtoCommerce.Content 3.1008.0; compared with the deployed build: match
- Store Electronics only (admin); repro 4/4 un-prefixed discards no-op
- TRACE_ID: none — the stand sends neither header; client traceparent of the failing call in `investigations/X6/network/X6-requests.json`
- App Insights: N/A for this env (not configured); fallback log `investigations/X6/console/server-request-log.txt`

## Summary
`POST /api/site-builder/designer/discard` treats the text before the first `/` of each `themeFiles` path as the theme folder and only checks that the path contains a `/`. The path form `GET theme/status` returns for drafts (`custom-sections/<t>.json`, the path *inside* the theme) is therefore looked up in a theme named `custom-sections`, no draft is found, and the call still answers **200 `{saveId}`** — the draft stays, with no error. Only the `default/…` form discards. The same parse lets `designer/save` write an **unchecked** file outside the theme (second symptom below).

## Steps to reproduce
1. As admin, MCP `create_section_type {store_id: Electronics, type: custom-agent-test-x6<hex>, …}` (a new draft type).
2. `GET /api/site-builder/theme/status?storeId=Electronics` → `drafts` lists `custom-sections/custom-agent-test-x6<hex>.json`.
3. `POST /api/site-builder/designer/discard?storeId=Electronics` `{"themeFiles":["custom-sections/custom-agent-test-x6<hex>.json"]}` (the exact string from step 2) → **200 `{"saveId":"…"}`**.
4. `GET theme/status` again → the draft is **still listed**.
5. Same call with `default/custom-sections/custom-agent-test-x6<hex>.json` → 200, draft gone.
6. A built-in published file behaves the same (`config/settings_data.json` no-op, `default/config/settings_data.json` discards); `no-such-theme/sections/nothing.json` also answers 200.

## Actual
200 `{saveId}` with the draft kept — `investigations/X6/network/failing-designer-discard-unpref.json`; status after it `investigations/X6/screenshots/X6-01-status-after-unprefixed-discard-draft-remains.png`.

## Expected
`docs/contracts/history-api.md:182/187` (module docs at PR head): designer/discard takes the path **with the theme folder**, and "the paths (400) are checked before anything is deleted" — a path that is not the store's theme answers 400; accepting the theme/status form (or answering 400 for it) instead of a silent 200.

## Second symptom — designer/save writes outside the theme, unchecked (X13)
`POST designer/save` with `custom-sections/<t>.json` (no theme folder) and a template holding `<script>` / `onclick` / CSS `position: fixed` → **200, warnings []**, stored at `Themes/<store>/custom-sections/<t>.json-draft`; the same content under `default/` → 400 naming the rule (3/3). Not served to the storefront (absent from theme/status, schemas, publish dry run; `/cms-content` 404; traversal refused 400) — storage pollution and a bypass of the custom-section rules, not storefront XSS. Package: `investigations/X13/` (API-only repro; its screenshot/DOM/console rows are N/A, so it is cited here, not filed on its own).

## Layer Validation
| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | N/A — not probed by the investigation | |
| 2. Backend Admin | N/A — not probed by the investigation | |
| 3. GraphQL xAPI | N/A — not probed by the investigation | |
| 4. Platform REST / module | FAIL | `investigations/X6/network/failing-designer-discard-unpref.json` vs `failing-designer-discard-pref.json`; X13: `investigations/X13/network/failing-designer-save-unprefixed.json` |

**Owning layer:** REST / module (Site Builder designer API)

## Root Cause Analysis
- `SiteBuilderContentPaths.cs:93` — `IsInsideAThemeFolder(path) => path.TrimStart('/').Contains('/')`, the only path check (`SiteBuilderContentFileValidator.cs:39`); `GetThemeName` (`:106-119`) = the first segment, never compared with `GetThemeNameAsync(storeId)`.
- Discard: `ThemeDraftService.cs:182-183` opens storage for that segment → no draft → `NoDraft` (`:226-228`); only `Discarded` is removed (`:157`); `DesignerContentService.cs:484-487` returns `{saveId}` with no per-file outcome.
- Save: the custom-section rules run only for path-in-theme `custom-sections/*` (`DesignerContentService.cs:153`, `ThemeCustomSections.cs:96-100`), so the stray path skips them.
- `ThemeStatus.cs:7` lists drafts by their path in the theme — the form a client naturally echoes back. MCP is not affected (`ThemeFiles.cs:21` adds the theme folder).
- Chains: `investigations/X6/root-cause.md`, `investigations/X13/root-cause.md`; source lines in each `source/findings.md`. kb: KB-F9FA689C, KB-32BF9D08 (captured), KB-F9937AFE (confirmed).

## Regression
The parse and validator are older than PR #5 (from vc-module-site-builder#1, VCST-6571, 49cffa9); PR #5 makes it reachable: discard is now how a never-published custom type is removed, and the new custom-section rules key on the path inside the theme.

## Fix Routing (→ /qa-fix)
- **Owning layer:** REST / module — Site Builder designer API
- **Suggested repo:** VirtoCommerce/vc-module-site-builder
- **repoKind:** module
- **Ownership hint:** platform
- **Component / module:** VirtoCommerce.SiteBuilder.Data — content path validation (designer save/discard)
- **RCA anchor:** `src/VirtoCommerce.SiteBuilder.Data/Validation/SiteBuilderContentPaths.cs:93` (+ `SiteBuilderContentFileValidator.cs:39`, `Theme/ThemeDraftService.cs:182`)
- **Routing confidence:** HIGH — 200/400 pair on the path alone, storage listing and the source line agree
