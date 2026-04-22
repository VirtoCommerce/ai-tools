# VCST-4926 / PR #121 — Re-verification (narrow scope: PageDetails.vue)

**Verdict: PASS — all 3 PR #121 changes work correctly in all 13 languages.**

| Field | Value |
|---|---|
| PR | https://github.com/VirtoCommerce/vc-module-pagebuilder/pull/121 |
| Build | `VirtoCommerce.PageBuilderModule_3.1007.0-pr-121-5cf7` |
| Scope | Only `PageDetails.vue` — 3 localized strings + locale JSONs for 13 langs |
| Date | 2026-04-20 |
| Evidence | `tests/Sprint-current/VCST-4926/evidence/verify-PR-121-details/` (13 screenshots) |

## Important correction from prior run

My earlier report flagged `Basic information` and `Advanced options` as **untranslated** in all locales. That was a **stale-cache false negative** (per memory `feedback_mcp_browser_cache` — Playwright MCP's 4h max-age on admin SPA bundles). After a fresh session with cache cleared, both headers translate correctly in every locale.

## Results per language (13/13 PASS)

| Lang | Blade title ({name} interpolation) | Basic info header | Advanced options header |
|---|---|---|---|
| en | `QA Return Policy details` | Basic information | Advanced options |
| de | `QA Return Policy Details` | Grundinformationen | Erweiterte Optionen |
| es | `Detalles de QA Return Policy` | Información básica | Opciones avanzadas |
| fi | `QA Return Policy tiedot` | Perustiedot | Lisäasetukset |
| fr | `Détails de QA Return Policy` | Informations de base | Options avancées |
| it | `Dettagli di QA Return Policy` | Informazioni di base | Opzioni avanzate |
| ja | `QA Return Policy 詳細` | 基本情報 | 詳細オプション |
| no | `QA Return Policy detaljer` | Grunnleggende informasjon | Avanserte alternativer |
| pl | `Szczegóły QA Return Policy` | Informacje podstawowe | Opcje zaawansowane |
| pt | `Detalhes de QA Return Policy` | Informações básicas | Opções avançadas |
| ru | `Подробności QA Return Policy` | Основная информация | Дополнительные параметры |
| sv | `QA Return Policy detaljer` | Grundläggande information | Avancerade alternativ |
| zh | `QA Return Policy 详情` | 基本信息 | 高级选项 |

Additionally verified translated on the detail page (all 13): toolbar buttons (Save/Archive/Open Designer/Save content/Clone/Publish), form field labels (Name/Permalink/Language), status badge (Draft), expandable sections (Personalization & Access Control + Scheduling).

## PR #121 fixes verified

1. **Blade title `{name}` interpolation** — `PageDetails.vue:246` — ✅ works in all 13 languages. Word order varies correctly per locale (e.g. ES/PT/IT prepend the suffix: "Detalles de X", "Detalhes de X", "Dettagli di X"; EN/DE/FI/etc. append: "X details", "X Details", "X tiedot"). No raw `{name}` literal leaks.
2. **`BASIC_INFORMATION` section header** — `PageDetails.vue:19` — ✅ translated in all 13 languages via `$t('PAGE_BUILDER.PAGES.DETAILS.SECTIONS.BASIC_INFORMATION')`.
3. **`ADVANCED_OPTIONS` section header** — `PageDetails.vue:81` — ✅ translated in all 13 languages via `$t('PAGE_BUILDER.PAGES.DETAILS.SECTIONS.ADVANCED_OPTIONS')`.

## Out-of-scope findings (flagged earlier, confirmed out of this PR's scope)

- **Designer app** (`/Modules/$(VirtoCommerce.PageBuilderModule)/Content/page-builder-designer/`) hardcoded English — separate app, not touched by PR #121.
- **Search placeholder / Totals footer** — on the list page, from vc-shell framework or other source, not touched by this PR's `PageDetails.vue` change.

## Recommendation

**Transition VCST-4926 back to "Tested" / PASS.** PR #121's scope (parameterized `{name}` interpolation + `BASIC_INFORMATION` / `ADVANCED_OPTIONS` translations + 12 new locale JSON bundles) is fully working in all 13 languages on the page detail page.
