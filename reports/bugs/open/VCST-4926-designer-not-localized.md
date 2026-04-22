# Bug — VCST-4926: Page Builder Designer not localized (hardcoded English)

## Status: OPEN

## Severity: High

## Summary

The Page Builder Designer app (`page-builder-designer`, launched via the "Open Designer" button on a page detail blade) is hardcoded to English. Its HTML has `<html lang="en">`, all UI strings are English, and there is no language picker. Selecting any language in the Page Builder shell's Settings → Language selector has no effect on the Designer.

This directly fails the acceptance criterion of VCST-4926: *"Designers should have the same localisation"*.

## Environment

| Field | Value |
|---|---|
| Platform | 3.1019.0 |
| Module | VirtoCommerce.PageBuilderModule `3.1007.0-pr-121-5cf7` (PR #121) |
| Admin URL | https://vcst-qa.govirto.com |
| Designer URL (opened in new tab) | `/Modules/$(VirtoCommerce.PageBuilderModule)/Content/page-builder-designer/index.html?storeId=B2B-store#/pages?type=pages&groupId=<id>` |
| Browser | Edge (via Playwright MCP) |
| Date observed | 2026-04-20 |

## Steps to Reproduce

1. Log in to Admin SPA as `admin`.
2. Navigate: Stores → B2B-store → Page Builder (opens `/apps/page-builder-shell/?storeId=B2B-store`).
3. Click the avatar (top-right of shell) → Settings → Language selector → pick any non-English language (e.g., `中文`).
4. Confirm the Page Builder shell re-renders in Chinese (header = "草稿页面", toolbar = "添加/刷新/归档/加载内容", etc.).
5. Open an existing draft page (e.g., "QA Return Policy") to show the detail blade.
6. Click the **打开设计器** (Open Designer) toolbar button.
7. Designer opens in a new browser tab.

## Expected

Designer UI renders in the selected language (Chinese in this example). Strings like "Theme settings", "Preview", "Save", "Add block", "Settings", "Page Header", block-type labels, etc. should be translated.

## Actual

Designer renders entirely in English. Inspection:
- `document.documentElement.lang === "en"` — hardcoded
- No `[class*="language"]` / `[class*="locale"]` elements in the DOM
- Framework stack differs from shell: Designer uses Angular Material (`mat-mdc-button-base`, `mdc-button`), unlike the Page Builder shell (Vue + vc-shell)
- No language param in the Designer URL; no language context passed from parent shell

Representative untranslated strings observed:
- Top toolbar: `Desktop`, `Pages`, `Theme settings`, `Preview`, `Unpublish`, `Publish`, `Save`
- Left sidebar: `Settings`, `Page Header`, `Title`, `Text`, `Add block`
- Page title placeholder: `[no name]` (additionally: the `{name}` interpolation from the shell does not propagate here — the Designer does not display the page's actual name)

## Evidence

- `tests/Sprint-current/VCST-4926/evidence/CL-DS-zh-designer.png` — full-page screenshot of Designer in English while shell is Chinese

## Scope / Impact

- **AC impact:** Directly fails the second bullet of AC-1 (*"Designers should have the same localisation"*).
- **User impact:** Content editors in any non-English back office cannot use the Designer in their language.
- **Workaround:** None.

## Suggested Investigation

1. Determine whether the Designer (`page-builder-designer`) was intended to be localized in PR #121 or in a follow-up story. PR #121 added locale JSON files to both `page-builder-shell/src/locales/` **and** `page-builder/locales/` — confirm whether the Designer is `page-builder` (and why its locales aren't being loaded), or whether `page-builder` refers to the shell's module-specific strings (in which case Designer localization is truly out of scope).
2. If in scope: wire up Vue-i18n (or equivalent) to the Designer app, accept a `lang` query param from the shell or read from a shared user settings API, and ensure `<html lang="">` is set dynamically.
3. Also fix: the `[no name]` placeholder — the Designer should display the actual page name passed by the shell.

## Priority: High

Blocks AC for VCST-4926. Recommend not transitioning the ticket to TESTED until resolved (or until Product confirms Designer localization is out of scope and updates the AC).
