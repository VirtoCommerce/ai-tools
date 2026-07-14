# Configurable-product file upload — required-gate bypass + silent rejection + missing aria-expanded `[P2]`

**Env:** vcst-qa storefront @ theme 2.53.0-pr-2368, Platform 3.1043.0
**Summary:** On configurable-product file-upload sections, a 0-byte file is accepted on a **required** section and enables Add-to-cart (bypassing the required-file gate); on **optional** sections, disallowed-type and oversize files are rejected **silently** (no error text); and the section accordion never exposes `aria-expanded`. Live-confirmed 2026-07-14 (triage of REG-2026-07-14-0018).

## STR
1. Open a configurable product with a **required** file section (e.g. `agent-test-req-file-child`), sign in as any buyer.
2. Upload a **0-byte** file (`large_logo.png`, 0B) to the required section.
3. Observe the file list + the Add-to-cart button state.
4. Open a configurable product with an **optional** file section (`agent-test-config-fileupload`); upload a disallowed type (`.webp`/`.avif`) and separately a >9.5 MB file.
5. Observe whether any error/toast appears.
6. Expand/collapse the configurable section accordion; inspect the header's ARIA state.

## Expected vs Actual
- **Required 0-byte file (CFG-FILE-003, P2):** Expected — a 0-byte file rejected (or at least not satisfying the required-file gate). **Actual** — accepted into the list showing "(0B)" with a valid `/api/files/` URL; **Add-to-cart flips from disabled to ENABLED** with only the empty file → required-file gate bypassed. See `screenshots/CFG-FILE-003-VERIFY-0byte-accepted-addtocart-enabled.png`.
- **Optional-section silent rejection (CFG-FILE-007/008, P3):** Expected — a rejection message. **Actual** — disallowed `.webp` and 24 MB `.mp4` are **dropped silently** — no list entry, no inline error, no toast. **Scope:** the **required** section correctly shows inline "File format is not allowed" + a blocking "Fix file upload errors to continue" gate (`screenshots/CFG-FILE-007-008-VERIFY-reqfile-inline-errors-shown.png`), so the silent-rejection defect is specific to the **optional-section widget path**. See `screenshots/CFG-FILE-007-VERIFY-optional-silent-drop-no-error.png`.
- **Accordion ARIA (CFG-A11Y-003, P3):** Expected — `aria-expanded` reflects open/closed. **Actual** — the header (role=button) toggles the section correctly but exposes **no `[expanded]` state** in the accessibility tree in either state (WCAG 4.1.2).

## Notes
- Test-data cleanup (not part of the defect): the CFG-FILE-003 CSV row's `product_url` (`.../physical-1703`) 404s — use `@td(CFG_REQUIRED_FILE_CHILD.url)`; and the CFG-FILE-008 title's "10 MB" literal should read the real platform limit **9.5 MB**.

## Fix Routing
- **Repo:** `vc-frontend` · **Layer:** storefront (frontend) · **Component:** configurable-product file-upload widget (required-gate validation on 0-byte + empty files; surface inline errors on the optional-section variant; emit `aria-expanded` on the section accordion).
