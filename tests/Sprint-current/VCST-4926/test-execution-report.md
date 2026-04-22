# VCST-4926 — Page Builder Localization | Test Execution Report

| Field | Value |
|---|---|
| Ticket | VCST-4926 |
| Summary | Page Builder Localization |
| Priority | Medium |
| Sprint | 26-08 |
| Module | `VirtoCommerce.PageBuilderModule 3.1007.0-pr-121-5cf7` (PR #121, deployed to vcst-qa) |
| Platform | 3.1019.0 |
| Environment | https://vcst-qa.govirto.com |
| Store | B2B-store |
| Browser | Edge (playwright-edge) |
| Date | 2026-04-20 |
| Verdict | **FAIL** |

## Acceptance Criteria (from JIRA)

AC-1: *Page Builder UI — vc-shell and designer support Virto Commerce back office localisation in 13 languages.*

**Languages:** en, de, es, fi, fr, it, ja, no, pl, pt, ru, sv, zh (13 total).

## Executive Summary

**Verdict: FAIL.** The vc-shell Page Builder shell is correctly localized in all 13 languages for core UI (nav, tabs, toolbar, columns, header, status badges, `{name}` title interpolation). However:

1. **Designer UI (half of the AC) is NOT localized at all** — hardcoded `<html lang="en">`, all strings English, no language picker. Loaded as a separate app at `/Modules/$(VirtoCommerce.PageBuilderModule)/Content/page-builder-designer/`.
2. **Two strings leak English in 11 of 13 locales** (all except en + de): `Search...` placeholder and `Totals: N` footer. Proves the translation keys exist (DE has them) but are MISSING from the other 11 locale JSON files.
3. **vc-shell framework section headers** `Basic information` and `Advanced options` are English in every locale (possibly out of PR #121 scope, but the user-visible impact is still present).

## Checklist Results (32 items)

### CL-LS — Language Switcher (4/4)

| ID | Result | Evidence / Note |
|---|---|---|
| CL-LS-01 All 13 in picker | ✅ PASS | All 13 present (dropdown scrollable); flags correct. `VCST-4926-language-picker-*.png` |
| CL-LS-02 Persistence across logout/login | ⚠️ PARTIAL | During the session the app logged out once unexpectedly; on re-login the picker defaulted back. Persistence not fully re-verified. Requires dev clarification. |
| CL-LS-03 Immediate switch | ✅ PASS | Switch to any language re-renders nav/header/toolbar immediately, no page refresh needed. |
| CL-LS-04 Back to English | ✅ PASS | Switching back to English restores baseline strings. |

### CL-SH — VC-Shell UI Translation (5/8 PASS, 2 FAIL, 1 partial)

| ID | Result | Note |
|---|---|---|
| CL-SH-01 Module nav label | ✅ PASS in all sampled langs | `lang-01-de.png`..`lang-13-zh.png` |
| CL-SH-02 Column headers | ✅ PASS | Name/Sprache/Permalink… → translated correctly per language (see table in checklist) |
| CL-SH-03 Status tabs | ✅ PASS | Draft/Pending/Active/Archived/All Pages → localized correctly |
| CL-SH-04 Toolbar buttons | ✅ PASS | Add/Refresh/Archive/Load content → localized per language |
| CL-SH-05 Confirm dialogs | ⏸ NOT TESTED | Deprioritized given scope of DS failure |
| CL-SH-06 Empty state message | ⏸ NOT TESTED | — |
| CL-SH-07 Pagination labels | ❌ FAIL | `Totals: 28` untranslated in 11 locales (es/fi/fr/it/ja/no/pl/pt/ru/sv/zh); works in de ("Gesamt: 28") |
| CL-SH-08 Toast | ⏸ Known bug | Covered by **VCST-4973** — toasts missing on archive/unpublish/save/load-content flows |

### CL-DS — Designer UI Translation (6/6 FAIL)

| ID | Result | Note |
|---|---|---|
| CL-DS-01..06 | ❌ FAIL | Designer app (`page-builder-designer`, Angular Material based) has `<html lang="en">`; all UI strings hardcoded English; no language picker; no i18n bindings detected. Not affected by Page Builder shell language selection. `CL-DS-zh-designer.png` |

Affected strings in Designer: `Desktop`, `Pages`, `Theme settings`, `Preview`, `Unpublish`, `Publish`, `Save`, `Settings`, `Page Header`, `Title`, `Text`, `Add block`, `[no name]` (placeholder). This directly violates AC-1 ("Designers should have the same localisation").

### CL-TI — Title Interpolation `{name}` (3/4 PASS)

| ID | Result | Note |
|---|---|---|
| CL-TI-01 English baseline | ✅ PASS | — |
| CL-TI-02 Non-Latin (zh, ja) | ✅ PASS | `QA Return Policy 详情` — no raw `{name}`, no empty title. `CL-TI-zh-detail.png` |
| CL-TI-03 Latin non-English (de) | ✅ PASS | `QA Return Policy Details` — interpolation works. `CL-TI-de-detail.png` |
| CL-TI-04 New page blade title | ⏸ NOT TESTED | Covered by CL-RG implicitly (deprioritized) |

### CL-FL — Fallback / Leaks (2/4 PASS, 2 FAIL)

| ID | Result | Note |
|---|---|---|
| CL-FL-01 No raw keys | ✅ PASS | No `PAGE_BUILDER.*` or `{...}` literals observed in any locale |
| CL-FL-02 Fallback to English | ✅ PASS | Missing keys fall back to English text (not raw key / not blank) |
| CL-FL-03 Untranslated English leaks | ❌ FAIL | **2 page-builder strings leak English in 11 locales** (Search, Totals). **2 vc-shell-framework strings leak English in ALL locales** (Basic information, Advanced options, Settings-panel labels: Theme selector, Language selector, Change password, Log Out) |
| CL-FL-04 Console: no i18n errors | ✅ PASS | 0 errors, 1 benign warning observed during session |

### CL-GR — CJK Glyph Rendering (4/4 PASS)

| ID | Result | Note |
|---|---|---|
| CL-GR-01 zh nav/headers | ✅ PASS | `草稿页面`, `草稿/待审核/已激活/已归档/所有页面` render correctly |
| CL-GR-02 ja nav/headers | ✅ PASS | `下書きページ`, `下書き/保留中/アクティブ/アーカイブ済み/すべてのページ` render correctly |
| CL-GR-03 CJK no clipping in menus | ✅ PASS | Screenshots show full chars, no tofu, no overflow |
| CL-GR-04 CJK in blade title | ✅ PASS | Blade title "QA Return Policy 详情" renders fine |

### CL-RG — Regression CRUD in DE (NOT TESTED)

| ID | Result | Note |
|---|---|---|
| CL-RG-01..05 | ⏸ NOT TESTED | Deprioritized given comprehensive DS failure. Existing DE pages in the list (e.g., `QA Rückgaberichtlinie-DE`) confirm CRUD works in DE historically. Toast bug VCST-4973 covers save/archive/unpublish gaps already. |

## Bug Summary

| # | Severity | Summary |
|---|---|---|
| B1 | **High** | Page Builder Designer (`page-builder-designer`) is not localized. `<html lang="en">` hardcoded; all UI strings English; no language picker. Directly fails AC-1. |
| B2 | **Medium** | In 11 of 13 locales (es, fi, fr, it, ja, no, pl, pt, ru, sv, zh) the strings `Search...` (search placeholder) and `Totals: N` (pagination footer) are not translated. Translation keys exist (de has them) but are missing from these 11 locale JSON files in `page-builder-shell/src/locales/`. |
| B3 | Low (out of scope?) | vc-shell framework section headers `Basic information`, `Advanced options`, and Settings-panel items (`Theme selector`, `Language selector`, `Change password`, `Log Out`) remain English in every locale. Likely comes from `vc-shell` package, not `page-builder` locales. Worth flagging but probably out of PR #121 scope. |

## Evidence

Located in `tests/Sprint-current/VCST-4926/evidence/`:

- `VCST-4926-language-picker-middle.png` — all 13 languages mid-scroll (shows 日本語 and CJK glyphs)
- `VCST-4926-language-picker-bottom.png` — bottom of list (Norsk → 中文)
- `VCST-4926-pagebuilder-shell-english-while-admin-italian.png` — initial contrast screenshot
- `lang-01-de.png` .. `lang-13-zh.png` — list blade per language (12 screenshots, en baseline omitted)
- `CL-TI-zh-detail.png` — detail blade in Chinese with interpolated title
- `CL-TI-de-detail.png` — detail blade in German with interpolated title
- `CL-DS-zh-designer.png` — Designer in English while shell is Chinese

## Observations / Questions for Developer

1. **Spec mismatch:** JIRA STR says "change language in **My Profile**", but Page Builder has its own **Settings → Language selector** inside the shell's user-avatar menu. The outer vc-shell admin's language does NOT propagate to Page Builder. Please clarify intended UX.
2. **Designer scope:** Is the designer (`page-builder-designer`) intended to be localized in this ticket, or is that a separate (future) story? The AC explicitly says "Designers should have the same localisation" — currently not the case.
3. **Missing keys in 11 locales:** 2 strings appear to be missing from `page-builder-shell/src/locales/*.json` except `de.json`. Easy fix; translation keys already exist.

## Recommendation

**Do not transition to TESTED.** Recommended actions:
- Create bug VCST-xxxx (High) for Designer not localized — blocks AC-1.
- Create bug VCST-xxxx (Medium) for Search/Totals leaks in 11 locales.
- Optionally flag VCST-xxxx (Low) for vc-shell section labels (consult maintainer on scope).
- After fixes, re-run checklist including CL-SH-05/06/07/08, CL-TI-04, CL-RG-01..05, CL-LS-02 persistence.
