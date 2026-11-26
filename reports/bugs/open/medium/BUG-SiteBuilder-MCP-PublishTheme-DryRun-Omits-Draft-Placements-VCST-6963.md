# BUG: Site Builder MCP publish_theme dry run lists no pages for a custom section type that page drafts place

## Status: READY_TO_SUBMIT
**Found by:** agent — testing VCST-6963
**Severity:** Medium (P2) · **Provenance:** IN-SCOPE (VCST-6963, introduced by vc-module-site-builder#5) · **To-fix row:** F-1

## Env
- vcst_dev — Platform 3.1100.0, VirtoCommerce.SiteBuilder 3.1003.0-pr-5-1129 (= vc-module-site-builder#5 head `1129a2da`), compared with the deployed build: match
- Store Electronics (dry run only; nothing published or approved) · Repro rate: deterministic, 2/2 (+ the exploratory observation on B2B-store)
- TRACE_ID: none — the stand sends neither header (no Request-Id / traceparent on POST /admin/mcp)
- App Insights: N/A for this env (not configured); fallback log `investigations/X5/console/server-none.txt`
- HAR: none — the calls are MCP JSON-RPC from a script; no browser lane carried them

## Summary
For a custom section type, `publish_theme` with `dryRun: true` is meant to show "the pages that place it". It reads only **published** page versions, so a page that places the type only in its draft is left out: the dry run answers `placed_sections.pages: []` while its coverage text says "Scanned all N pages". The approver is told nobody uses the type, although the publication is exactly what such a page draft is waiting for (the module's own readiness check warns `section-type-unpublished` for it).

## Steps to reproduce
1. As ADMIN, get an MCP OAuth token for `{BACK_URL}/admin/mcp` (public client, PKCE); every call is `tools/call` on POST /admin/mcp.
2. `create_section_type` on a store with a new type `custom-agent-test-<rnd>` (dry run, then save). The type exists only as a theme draft.
3. `publish_theme {store_id, dryRun: true}` — baseline: the draft is listed, `pages: []` (no placement yet).
4. `create_page` (landing page, never published).
5. `edit_page_draft` with `add_section {type: custom-agent-test-<rnd>}` on that page's draft.
6. Control: `search_site_pages {store_id, section_type: custom-agent-test-<rnd>}` finds the page and the section.
7. `publish_theme {store_id, dryRun: true}` again.

## Actual
`drafts[0].placed_sections = {pages: [], coverage: "Scanned all 2 pages (2 language versions). Templates are not scanned…"}` — `investigations/X5/network/07-publish_theme-dry-after-placement.json` (repeated in `09`).

## Expected
The page from step 4 listed in `placed_sections.pages` (tool description and PR #5 body: "the pages that place it", no "published" qualifier) — or, if published-only is the intent, the coverage text saying that unpublished pages / page drafts were not read, instead of "Scanned all".

## Layer Validation
| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | N/A — not probed by the investigation | |
| 2. Backend Admin | N/A — not probed by the investigation | |
| 3. GraphQL xAPI | N/A — not probed by the investigation | |
| 4. Platform REST / module (MCP) | FAIL | `investigations/X5/network/07-publish_theme-dry-after-placement.json` vs control `network/06-search_site_pages-section_type.json` |

**Owning layer:** module (MCP tools of vc-module-site-builder)

## Root Cause Analysis
- `ThemePublishingTools.cs:192` (`DescribeSectionTypeAsync`) calls `SectionTypePages.FindAsync(…, published: true, …)`; the scanner (`SiteBuilderSectionScanner.cs:137-141`) skips every page without a published version as `NotPublished`.
- `SectionScanRows.cs:168` leaves `NotPublished` pages out of the coverage count, so the text still reads "Scanned all".
- The sibling `change_section_type` dry run reads drafts (`SectionTypeTools.cs:228`, `published: false`).
- Full chain: `investigations/X5/root-cause.md` §3–§5, source lines `investigations/X5/source/findings.md`.
- By-design partly open (PO call): reading published pages is defensible for live pages, but the promise, the "Scanned all" text and the module's own `section-type-unpublished` warning all point at drafts being in scope.

## Regression
Not a regression — `placed_sections` on publish_theme is new in vc-module-site-builder#5.

## Fix Routing (→ /qa-fix)
- **Owning layer:** module — Site Builder MCP tools
- **Suggested repo:** VirtoCommerce/vc-module-site-builder
- **repoKind:** module
- **Ownership hint:** platform
- **Component / module:** VirtoCommerce.SiteBuilder.MCP — publish_theme dry run (`DescribeSectionTypeAsync`)
- **RCA anchor:** `src/VirtoCommerce.SiteBuilder.MCP/Tools/ThemePublishingTools.cs:192` (+ `Services/SectionScanRows.cs:168`)
- **Routing confidence:** MEDIUM — live response and source line agree; the published-page arm was proven from source only (no published page on the test store)
