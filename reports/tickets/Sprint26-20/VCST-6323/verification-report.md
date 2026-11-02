# VCST-6323 — Admin SPA verification (Short text 512 limit)

**Env:** vcptcore-qa1 — Platform 3.1085.0-pr-3141-a644 · **Lane:** playwright-edge · **Date:** 2026-10-15
**Scope:** Admin SPA only (API side verified separately). RED baseline: KB-C804D647 (not re-run).
**Verdict:** Fix CONFIRMED for the dynamic property widget (items 1–7, 9, 10). **One gap in item 8:** in the Settings blade the
validation message appears but **Save stays enabled** with a 513-char Short text value. The PR description says it should be disabled.

## Results

| # | Check | Result | Evidence |
|---|-------|--------|----------|
| 1 | 513 chars in single-value Short text → message + OK disabled | **PASS 3/3** | 01, 04, 05 (run 3 typed key-by-key 500→512→513: message appears exactly on the 513th char) |
| 2 | Back to 512 → error clears, OK enabled, Save OK, 512 after reload | **PASS 3/3** | PUT /api/members → 204 (runs 1–2), full page reload shows len=512 each run (02, 06) |
| 3 | No "500: Internal server error" / SQL / db/table/column text in UI | **PASS** | No error toast, no 5xx, no SQL text in any snapshot |
| 3b | >1024 chars (paste) → same validation, OK disabled | **PASS 3/3** | 1195 / 1227 / 1274 chars (fill); 03 |
| 4 | Type picker description | **PASS (en)**; de checked via served bundle | 07; UI shows "Short text — Text values up to 512 characters" |
| 5 | Multilingual Short text, 513 in en-US → message, OK disabled | **PASS** | 08; Backspace to 512 → message gone, OK enabled |
| 6 | Multivalue Short text, 513-char value | **PASS** | 09/10, details below |
| 7 | Long text accepts >512 and saves | **PASS** | 1266 chars, no message, OK enabled, saved, len=1266 after reload |
| 8 | Setting with Short text input shows the 512 limit | **PARTIAL / FAIL (Save)** | 11, details below |
| 9 | No new console errors | **PASS** | Only pre-existing noise, list below |
| 10 | ≤512 unaffected: edit another contact field + Save | **PASS** | Taxpayer ID set → Save → persisted after reload |

## Exact UI strings observed
- Inline validation (single, multilingual, setting): `This field must not contain more than 512 characters` (red, under the input; input border red)
- Value-type picker: `Short text` / `Text values up to 512 characters`; `Long text` / `Unlimited text with no size restriction`
- de bundle served by the stand (`/Localizations/de.VirtoCommerce.Common.json`): `Textwerte bis zu 512 Zeichen`.
  The UI language was **not** switched, because that would change the shared admin profile. The de string is from the served file, not from the rendered UI.

## Item 6 — Multivalue (existing property `ShortTextFieldMultiValue`, Contact)
513-char value in "Add value" + Enter: **not added**. No chip is created, the text stays in the input, and **no message is shown**.
Backspace to 512 + Enter: the value is added as a chip (len 512). The value is rejected silently.
UX note (not a defect against the AC): with no message the user is not told why Enter does nothing.

## Item 8 — Settings blade (Settings → All Settings → Application Insights → "Application Insights URL", Short text)
- 513 chars → the inline message is shown and the field turns red.
- **The Settings toolbar `Save` stays ENABLED** (it has a pointer cursor and is clickable). The dynamic-property blade disables OK in the same state.
- PR #3141 description: "used by the dynamic property values blade and the settings blades … keep the form invalid, which disables OK/Save".
  The settings blade does not do this.
- **Not saved** (per brief). I did not check whether the server would reject or truncate the value. Toolbar `Reset` restored the original
  value and Save went disabled again. Nothing was persisted.
- Suggested follow-up: decide whether this is in scope for VCST-6323 or a separate bug. The settings blade's Save likely checks
  only dirty state, not form validity.

## Item 9 — Console / network
- Errors: `404 /apps/algolia_search/logo.svg`, `404 /apps/reports/logo.svg` (on every load, apps-menu logos). Before login: `401 /api/platform/settings/VirtoCommerce.Platform.UI.WidgetColorMarkers` + "Possibly unhandled rejection" (the login page loads before auth).
  None of these are related to the fix. No Angular exceptions and no 5xx during the flow.
- Log: "WARNING: Tried to load AngularJS more than once" (CustomerExportImport module), pre-existing.
- HAR: not produced by the edge lane config in this session.

## Screenshots (`screenshots/`)
01-run1-513-validation-ok-disabled · 02-run1-512-saved-after-reload · 03-run1-over1024-validation-ok-disabled ·
04-run2-513-validation-ok-disabled · 05-run3-513-typed-validation-ok-disabled · 06-run3-512-saved-after-reload ·
07-type-picker-short-text-512-en · 08-multilingual-en-US-513-validation-ok-disabled · 09-multivalue-513-enter-not-added ·
10-multivalue-512-added · 11-setting-shorttext-513-validation-save-enabled

## Method notes
- Lengths were measured from accessibility snapshots, because the real-user hook blocks `browser_evaluate`. Exact 513 was reached by
  filling 500 chars and then typing single keys or deleting with Backspace.
- The ">1024" runs used 1195/1227/1274 chars, not exactly 1025. Both are above the old 1024 claim and the 512 limit.

## Data / teardown
- Fixture contact `AGENT-TEST VCST6323-mv9h7yio`: AGENT-TEST-ShortText now = 512 chars (`…012`).
  LongTextFieldSingleValue = 1266 chars and Taxpayer ID = `AGENT-TEST-TAX-6323` are left on the fixture contact, which the orchestrator deletes.
- Created and **deleted**: Contact dynamic property `AGENT-TEST-ShortTextML-mv9h7yio` (Short text, Multilingual). It was never saved with a value.
- No multivalue or long-text property was created; the existing `ShortTextFieldMultiValue` and `LongTextFieldSingleValue` were used.
  Multivalue and multilingual changes were cancelled, not saved.
- The Settings change was reverted with Reset and not saved.
