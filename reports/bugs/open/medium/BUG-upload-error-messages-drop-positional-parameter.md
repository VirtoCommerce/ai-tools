# File upload error messages render an empty parameter: "Unknown scope ''." and "File size exceeds the allowed" with no limit

## Status: CONFIRMED
**Tracker:** VCST-6281 (filed 2026-10-12, Medium, 2 screenshots inline; relates to VCST-6081)

**Found by:** `/qa-test VCST-6081` verify-fix, Phase B (2026-10-12), live on vcst-qa
**Severity:** Medium · **Provenance:** PRE-EXISTING, exposed by VCST-6081's fix (the pre-fix build dropped every failed file, so no upload error was ever rendered on the configurable File section)
**Env:** vcst-qa · storefront theme `2.60.0-pr-2511-81f1-81f18d01` · Platform 3.1078.0 · chromium 1920x1080 · signed-in B2B user
**Product:** @td(CFG_FILE_HOODIE) — `AGENT-TEST-Config-FileUpload`, optional File section "Design Upload"

## Summary
Upload error messages whose locale string has a positional placeholder `{0}` render that placeholder
as an empty string, so the message loses the one value that makes it useful:

| errorCode | en.json string | Server parameter | On screen |
|---|---|---|---|
| `INVALID_SCOPE` | `Unknown scope '{0}'.` | `errorParameter: "product-configuration"` | **`Unknown scope ''.`** |
| `INVALID_SIZE` (client-side, >1 MiB) | `File size exceeds the allowed {0}` | the size limit | **`File size exceeds the allowed`** (no value) |

The shopper is told a file is too large without being told the limit.

## Steps to reproduce
1. Sign in; open @td(CFG_FILE_HOODIE.url).
2. In "Design Upload", attach any file over 1 MiB → read the error under the file chip.
3. Attach @td(CFG_TEST_FILES.validPdf.path) → on vcst the server answers 200 with
   `[{"succeeded":false,"errorCode":"INVALID_SCOPE","errorParameter":"product-configuration","name":null,…}]`
   (the `product-configuration` scope is not registered there) → read the error under the chip.

**Expected:** `File size exceeds the allowed 1 MB` · `Unknown scope 'product-configuration'.`
**Actual:** `File size exceeds the allowed` · `Unknown scope ''.`

Reproduced on every attempt (INVALID_SCOPE 3/3 + 2-file pick + required section; INVALID_SIZE 3/3).
Console clean; no network error — the response carries the parameter, the UI drops it.

## Root cause (source reading, vc-frontend @ 81f18d01 — not executed)
- `client-app/shared/files/composables/useFiles.ts` `getErrorMessage()` builds positional parameters
  (`string[]`; for `INVALID_SIZE` a formatted size) and hands them to the errors translator as
  `errorParameters: [{ key: "0", value }]`.
- `client-app/core/composables/useErrorsTranslator.ts` `getErrorParameters()` reduces `errorParameters`
  into a **named** object `{ "0": value }`.
- `locales/*.json` use **list** interpolation `{0}`; given a named object instead of a list, vue-i18n
  resolves `{0}` to an empty string.
- `useErrorsTranslator.ts` last changed 2025-01-07, so this predates VCST-6081/#2511. Any other caller that
  passes `errorParameters` to a `{0}` string is likely affected too (not checked).

## Evidence
- `reports/tickets/Sprint26-20/VCST-6081/screenshots/green-3-i1-run1-after3s.png` (INVALID_SCOPE)
- `reports/tickets/Sprint26-20/VCST-6081/screenshots/green-10-i2-run1-oversize.png` (INVALID_SIZE)
- `reports/tickets/Sprint26-20/VCST-6081/verification-report.md` (full run)
