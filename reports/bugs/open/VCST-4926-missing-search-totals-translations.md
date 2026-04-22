# Bug — VCST-4926: `Search...` placeholder and `Totals: N` footer missing translations in 11 locales

## Status: OPEN

## Severity: Medium

## Summary

In the Page Builder shell list blade, two UI strings — the search input placeholder (`Search...`) and the pagination footer counter (`Totals: 28`) — are shown untranslated (English) in **11 of 13 supported locales**. The translation keys exist — German (`de.json`) provides `Suchen...` and `Gesamt: 28` correctly — but the keys are missing from the other 11 locale JSON files shipped by PR #121.

## Environment

| Field | Value |
|---|---|
| Platform | 3.1019.0 |
| Module | VirtoCommerce.PageBuilderModule `3.1007.0-pr-121-5cf7` (PR #121) |
| Admin URL | https://vcst-qa.govirto.com |
| Store | B2B-store |
| Browser | Edge (via Playwright MCP) |
| Date observed | 2026-04-20 |

## Affected Locales (11)

| Code | Language | Search placeholder | Totals footer |
|---|---|---|---|
| es | Español | ❌ `Search...` | ❌ `Totals: 28` |
| fi | Suomi | ❌ `Search...` | ❌ `Totals: 28` |
| fr | Français | ❌ `Search...` | ❌ `Totals: 28` |
| it | Italiano | ❌ `Search...` | ❌ `Totals: 28` |
| ja | 日本語 | ❌ `Search...` | ❌ `Totals: 28` |
| no | Norsk | ❌ `Search...` | ❌ `Totals: 28` |
| pl | Polski | ❌ `Search...` | ❌ `Totals: 28` |
| pt | Português | ❌ `Search...` | ❌ `Totals: 28` |
| ru | Русский | ❌ `Search...` | ❌ `Totals: 28` |
| sv | Svenska | ❌ `Search...` | ❌ `Totals: 28` |
| zh | 中文 | ❌ `Search...` | ❌ `Totals: 28` |

**Not affected:** `en` (baseline, expected English) and `de` (correctly translated to `Suchen...` and `Gesamt: 28`).

## Steps to Reproduce

1. Log in to Admin SPA as `admin`.
2. Navigate: Stores → B2B-store → Page Builder.
3. Avatar (top-right) → Settings → Language selector → pick any of the 11 affected locales (e.g., `Español`).
4. Observe:
   - The search input placeholder at the top of the list shows **"Search..."** (English).
   - The pagination footer at the bottom of the list shows **"Totals: 28"** (English).
5. Switch to `Deutsch` — both strings translate correctly (`Suchen...`, `Gesamt: 28`), proving the keys exist in the i18n infrastructure but are missing from the 11 affected locale JSON files.

## Expected

Both strings translate to the selected locale for all 13 languages.

## Actual

Both strings remain English in 11 locales. Other shell strings (header, tabs, toolbar, column headers, status badges, blade titles with `{name}` interpolation) translate correctly in all 13.

## Evidence

Located in `tests/Sprint-current/VCST-4926/evidence/`:

- `lang-01-de.png` — DE: correct (`Suchen...` / `Gesamt: 28`)
- `lang-03-es.png` — ES: leak
- `lang-04-fi.png` — FI: leak
- `lang-05-fr.png` — FR: leak
- `lang-06-it.png` — IT: leak
- `lang-07-ja.png` — JA: leak
- `lang-08-no.png` — NO: leak
- `lang-09-pl.png` — PL: leak
- `lang-10-pt.png` — PT: leak
- `lang-11-ru.png` — RU: leak
- `lang-12-sv.png` — SV: leak
- `lang-13-zh.png` — ZH: leak

## Suggested Fix

Add the two missing translation keys to the 11 locale JSON files in `page-builder-shell/src/locales/` (likely keys are for the search placeholder and the pagination "Totals" label). Reference the already-correct `de.json` for key names.

## Priority: Medium

Small visible leak but consistent across 11 locales. Low regression risk; translation-only change. Recommend fixing before marking VCST-4926 as complete.
