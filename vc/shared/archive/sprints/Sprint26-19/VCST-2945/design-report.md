# Design / a11y report — VCST-2945 (Step 4v)

> **Reconstructed 2026-09-28** from the `ui-ux-expert` lane's returned results. The original file and its
> ten `4v-*.png` screenshots were deleted from the working tree by an unknown actor at ~17:21 (never
> committed). Findings and measurements below are as the lane returned them; screenshot references are gone.

**Lane:** `ui-ux-expert` · Chrome DevTools MCP · anonymous (role-agnostic targets) · 1920 px + mobile
**Build:** theme `2.59.0-pr-2501-7e0c` (vc-frontend #2501) · B2B-store was in EXACT mode during the pass
(the storefront track's serialised window).
**`vs. DESIGN`:** SKIPPED — the ticket carries no Prototype link.
**Admin blade a11y:** covered on `playwright-edge` by the backend track (this lane cannot sign in).

## Verdicts

| Target | a11y | design-system (BL-UI) | vs. DESIGN |
|---|---|---|---|
| Header search + Barcode scan button (desktop) | PASS | PASS | SKIPPED |
| Mobile search overlay (scan / submit / close / Cancel) | FAIL ×3 | FAIL (BL-UI-006 target) | SKIPPED |
| Scanner modal, camera unavailable (desktop + mobile) | FAIL ×1 · keyboard/focus PASS | PASS | SKIPPED |
| `/search?barcode=` hit + empty states | PASS (axe clean) | FAIL (BL-UI-001 CLS) | SKIPPED |

## Findings

| # | Criterion | Finding | Provenance (5-triage) |
|---|---|---|---|
| 1 | WCAG 4.1.2 · BL-A11Y-002 | Scanner modal Browse button has no accessible name while `loading` (content `visibility:hidden`, spinner unlabelled) — likely every `VcButton` in loading state | pre-existing (`barcode-scanner-modal.vue`, UI kit not in PR diff) |
| 2 | WCAG 4.1.2 · BL-A11Y-002 | Mobile overlay submit icon button (`.mobile-search-bar__button`, 38×38) unnamed; desktop equivalent is "Search" | pre-existing |
| 3 | WCAG 4.1.2 · BL-A11Y-002 | Mobile overlay dismiss control announced as raw key `common.labels.close` | pre-existing |
| 4 | WCAG 2.5.8 · BL-UI-006 | Mobile overlay "Cancel" 42×18 px (< 24 px) | pre-existing |
| 5 | BL-UI-001 | CLS 0.2567 on `/search?barcode=<hit>` (3 shifts, grid resolves after heading) | pre-existing — orchestrator baseline: `?q=<3-hit>` 0.2532, `?q=<none>` 0.6469 vs `?barcode=<none>` 0.7267, same footer-shift mechanism |

**Advisory:** heading reads "…the following3results" to a screen reader (no whitespace before the count
`<sup>`; also on `?q=`) · homepage carousel `image-alt` ×6 (CMS content, out of scope) · axe
`color-contrast` *incomplete* on 1–3 nodes (manual check not done — never reported as PASS).

**PASS worth keeping:** modal focus trap + Escape returns focus to the trigger (desktop + mobile, live key
presses); scan buttons named "Barcode scan"; modal Close 68×68 / Cancel 128×44; mobile overlay closes before
the modal opens; shared-GTIN → 3-product list, no auto-open, no chips; empty state axe-clean, Reset 159×44.

**Verdict handling:** no finding is IN-SCOPE of the PR diff. The a11y items file standalone (triage §7a) and
the CLS files as an out-of-scope incidental; none fails VCST-2945.
