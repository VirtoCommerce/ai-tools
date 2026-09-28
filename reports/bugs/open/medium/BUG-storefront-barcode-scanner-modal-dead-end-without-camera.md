# Barcode scanner modal is a dead end without a camera: Browse stays disabled, no message `[Medium]`

## Status: READY_TO_SUBMIT

**Severity:** Medium (P2) · **Type:** Functional / error handling · **Archetype:** `STATE` (stuck loading)
**Found by:** /qa-test VCST-2945 (2026-09-28) · **OUT OF SCOPE** for VCST-2945 — pre-existing (see Provenance)
**Env:** vcst-qa · theme `2.59.0-pr-2501-7e0c` (vc-frontend PR #2501, open) · store `B2B-store` · Chromium (Playwright, no camera device) · 1920 px and 390 px · anonymous and signed-in behave the same

## Summary

When the browser cannot give the page a camera stream (permission denied, no webcam, camera busy, insecure
context), the **Barcode scan** modal never leaves its loading state. The video skeleton stays up, the
**Browse** button (the upload-a-photo fallback) stays disabled with a spinner, and nothing tells the shopper
what went wrong. The only way out is **Cancel**. The upload fallback works in code, but the shopper can't reach it.

## Steps to Reproduce

1. Use a browser with no camera, or deny the camera permission for `{{FRONT_URL}}`.
2. Open `{{FRONT_URL}}` (1920 px), or open it at 390 px and tap **Toggle search bar**.
3. Click **Barcode scan** in the search bar.
4. Wait 10 s or longer.

## Expected vs Actual

- **Expected:** if the camera is unavailable, the modal says so ("Camera unavailable — upload a photo of the
  barcode instead"), and **Browse** becomes enabled so the shopper can use the upload fallback.
- **Actual:** the grey skeleton and the Browse spinner stay up indefinitely. Browse is exposed as
  `button [disabled]` with no accessible name. There is no error text, no notification and no console message
  (warning level and above: 0 entries). The description still reads "To proceed, enable your camera…" with no
  instructions for what to do once the camera has been refused.

## Layer Validation

| Layer | Result | Evidence |
|---|---|---|
| 1. Storefront | **FAIL** | screenshots below; accessibility snapshot of the dialog: `button "Cancel"`, `button [disabled]` (Browse) |
| 2. Admin | N/A | no back-office data involved |
| 3. xAPI | N/A | no request is issued; the modal fails before it scans anything |
| 4. REST | N/A | — |

**Owning layer:** Layer 1 — Storefront.

## Root Cause Analysis

`client-app/shared/layout/components/header/_internal/search-bar/barcode-scanner-modal.vue`:

- `const loading = ref(true)` (l.71) is set to `false` in exactly one place: the video's
  `@canplaythrough="loading = false"` (l.24). The event never fires when there is no stream.
- `startCamera()` catches the `getUserMedia` rejection and only calls `Logger.error(startCamera.name, error)`
  (l.145). It doesn't reset `loading`, set an error state or notify the shopper.
- **Browse** is bound to `:loading="loading"` (l.45). `VcButton` treats loading as disabled
  (`enabled = !disabled && !loading`, `ui-kit/components/molecules/button/vc-button.vue` l.150), so the
  fallback is locked behind the camera it is meant to replace.
- `onMounted` creates the `BarcodeDetector` *after* `startCamera()` returns. Because that error is swallowed,
  the detector does exist and `onFileSelected` would work if Browse were enabled.

**Suggested fix:** in the `startCamera` catch, set a `cameraError` state and `loading = false`. Show an
inline message or `notifications.warning` in the modal. Stop gating Browse on the camera `loading` flag and use
a separate `detecting` flag for the file-decode step.

VirtoOZ (`storefront/user-guide/shopping/searching-for-products` §Barcode scanner) describes only the camera
path. The no-camera and upload behaviour isn't documented anywhere, so no documented expectation covers it.

## Provenance

**PRE-EXISTING.** `barcode-scanner-modal.vue` is not in PR #2501's file list. Its last change on `dev` was
`0f5db04` (VCST-3361, 2025-12-09). The defect doesn't fail VCST-2945, but the ticket makes the scanner a
configured entry point, which is why it is filed separately.

## Evidence

- Desktop 1920 px, modal stuck: ![desktop](reports/bugs/screenshots/barcode-scanner-modal-dead-end-without-camera/desktop-1920-modal-spinner.png)
- Mobile 390 px, after 10 s or more: ![mobile](reports/bugs/screenshots/barcode-scanner-modal-dead-end-without-camera/mobile-390-modal-spinner.png)
- HAR: `test-results/chrome/har/VCST-2945-4a-frontend-2026-09-28.har` (no scan request follows the modal open)
- Exploratory session: `reports/exploratory/SBTM-VCST-2945-2026-09-28.md` (mission 1a/1b)

**Related:** `reports/bugs/open/medium/BUG-vc-button-loading-state-no-accessible-name.md`. The disabled Browse
button is also unnamed. That is a separate UI-kit defect, and this bug keeps it visible indefinitely.

## Fix Routing (→ /qa-fix)

- **Owning layer:** Layer 1 — Storefront
- **Suggested repo:** VirtoCommerce/vc-frontend
- **repoKind:** frontend
- **Ownership hint:** platform
- **Component / module:** header search bar — `BarcodeScannerModal`
- **RCA anchor:** `client-app/shared/layout/components/header/_internal/search-bar/barcode-scanner-modal.vue` `startCamera` catch (l.145), `@canplaythrough` (l.24), Browse `:loading` (l.45)
- **Routing confidence:** HIGH

Found by: /qa-test VCST-2945 (2026-09-28)
