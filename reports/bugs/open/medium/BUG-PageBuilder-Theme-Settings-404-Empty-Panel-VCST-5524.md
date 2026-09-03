# BUG: Page Builder Theme settings/Presets panel empty on B2B-store — theme config 404 + Content themes 500

## Status: READY_TO_SUBMIT

## JIRA: [VCST-5524](https://virtocommerce.atlassian.net/browse/VCST-5524) (filed 2026-07-21, Bug / Medium)

## Severity: Medium (admin-only; no storefront/customer impact; blocks CMS-046–049, 073)

## Env
vcst-qa @ PageBuilderModule `3.1017.0-pr-156-59d4`, Content `3.1003.0`, Pages `3.1007.0` · Store `B2B-store`

## Summary
Page Builder designer → **Theme settings → Presets** shows an empty panel (Save disabled) with **no error**. Theme-config files 404 and `GET /api/content/themes/B2B-store` returns **500** (`blobUrl` null) — the store has no Content-module theme provisioned (vc-frontend store; theme not in Content blob storage).

## STR
1. Admin → `{BACK_URL}/apps/page-builder-shell/?storeId=B2B-store` → open page → Open designer.
2. Theme settings → Presets.
3. Panel empty; Network shows the two 404s; `/api/content/themes/B2B-store` → 500.

## Two defects (real regardless of the provisioning question)
1. Designer swallows the 404s → empty panel, no error/empty-state message.
2. `GET /api/content/themes/{store}` → 500 (unguarded null `blobUrl`) instead of graceful 404/empty.

## Open question (product)
Should a vc-frontend store carry a Content-module theme? Yes → provision `config/settings_data.json` + `settings_schema.json` (env). No → hide/N/A the theme-settings feature on such stores + mark CMS-046–049/073 N/A.

## Fix Routing (→ /qa-fix)
- **Owning layer:** Layer 2 (PB designer theme-settings UX) + Layer 4 (Content themes 500)
- **Suggested repo:** `vc-module-pagebuilder` (designer) + `vc-module-content` (themes 500 null-guard)
- **repoKind:** module · **Ownership hint:** platform (native)
- **Routing confidence:** MEDIUM — two verified defects; provisioning-vs-N/A needs product input.

## Provenance
Found by `/qa-triage-results` on REG-2026-07-21-1438. Full evidence in VCST-5524. The same run's "published pages 404" signature was test-data drift (Archived/renamed pages on vcst-qa), NOT a product bug.
