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

## Root cause — HIGH confidence (investigated 2026-10-12, `/vc-fix:qa-investigate`)
`useFiles.getErrorMessage()` re-keys its positional parameters as `{ "0": value }`. The errors translator is
named-only by design (`useErrorsTranslator.locales.test.ts` proves it for x-cart's named keys). vue-i18n
reads `{0}` from a LIST, so it renders `''`.
- **Storefront-only, proven twice.** The response carries `errorParameter` while the DOM shows `''`, and
  `INVALID_SIZE` reproduces with **no server request**.
- **Mechanism executed.** A probe on vue-i18n 9.13.1 · 9.14.1 · 10.0.5 · 11.0.1 · 11.4.6 gives the same
  result on every version: a named `{"0"}` renders empty and a list `[v]` renders the value.
- **Reach = `useFiles` only.** Identity errors (`parameter` → list) and cart/loyalty (real named keys)
  render correctly. Every `file_error.*` string with `{0}` is affected, on every upload scope.
- **Known in code, not ticketed.** #2511's `useFiles.test.ts` asserts `/^Unknown scope '.*'\.$/`, with a
  comment calling this pre-existing.

## Regression
- **Introduced:** vc-frontend `8c911bc7` (**#1262** "refactor: error translator", VCST-1669, merged
  2024-09-06, theme 2.5.0). Before it, `t(key, [v])` passed a list, which renders on 9.13.1 (probe).
- **Why:** #1262 made the translator named-only and adapted `useFiles` with index keys, but the `{0}` strings
  were never migrated. The vue-i18n upgrades are not the cause.
- **Masked until VCST-6081:** before #2511, a failed configurable upload vanished, so the text never showed.
- **Fix-forward, not revert** (a revert would undo the translator refactor).

## Fix Routing
| Owning layer | repoKind | Repo | Where |
|---|---|---|---|
| storefront | `frontend` | `VirtoCommerce/vc-frontend` | `client-app/shared/files/composables/useFiles.ts` `getErrorMessage()` (L328–350 @ 81f18d01) |

Two minimal shapes: (1) named placeholders (`{scope}`, `{size}`) in every `locales/*.json` `file_error`
string, with named keys from `getErrorMessage`; or (2) pass a list for file errors. **Suggested: (2) via the
translator's existing single-`parameter` path** (`translate({ errorCode, errorMessage, parameter })`), which is
one file, no locale changes, and the same path identity errors already render through.
**Auto-fix:** eligible under `/qa-fix` G0, but **declined by the operator 2026-10-12**; left for a developer.
The suggested change is in the ticket description. Tighten the
`useFiles.test.ts` regex to `'product-configuration'` and add an `INVALID_SIZE` case that asserts the limit.

## Evidence
- Package: `reports/tickets/Sprint26-20/VCST-6281/evidence-20261012T1500Z/`, containing `evidence-index.md`,
  `root-cause.md`, `source/findings.md`, the screenshots, the DOM snapshots, and the failing request and response.
- First sighting: `reports/tickets/Sprint26-20/VCST-6081/screenshots/green-3-…`, `green-10-…`
