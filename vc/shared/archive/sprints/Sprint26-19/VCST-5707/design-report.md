# VCST-5707 - visual lane (4v) design report

Env vcptcore-qa, theme 2.59.0-pr-2476-0604, 2026-09-29. Lane: playwright-edge (retry of a BLOCKED Chrome DevTools attempt).
Auth: real sign-in form as SR_REP_PRIMARY, `SR_REP_PASSWORD` typed as a bare --secrets key; /connect/token -> 200 (key name not sent literally). Viewports 1920 / 768 / 375.
Fixture: list `AGENT-TEST-5707-v1`, shared to AcmeCorp/AcmeWest/BuildRight/TechFlow, then DELETED (verified gone). No `-f*` list touched. Stop sharing / Change access were opened and cancelled, never confirmed.

## Verdicts

| Axis | Verdict |
|---|---|
| vs. DESIGN (token / geometry / icon) | SKIPPED - no Claude Design prototype link on the ticket |
| Figma-export advisory compare | KNOWN_DIVERGENCE (advisory) - see below |
| BL-UI-001 CLS | not measured (no observer installed) - SKIPPED, not PASS |
| BL-UI-002 spacing | PASS - 0 off-grid in the Share dialog at 375; 2 nodes at 3.008px padding on the list-details page (sub-pixel, ignore) |
| BL-UI-003/005 shift / alignment | PASS by eye across tab switch, Show all/less, Clear all/Undo (no neighbour jump seen; not rect-measured) |
| BL-UI-004 overflow | PASS - no horizontal doc scroll at 1920/768/375; recipient names ellipsised at 375 |
| BL-UI-006 touch targets (375) | FAIL (Medium, design-system-wide) - see F4 |
| WCAG 2.2 AA (axe 4.10 + keyboard walk) | FAIL - F1, F2, F3 |
| Screen-reader output | NOT VERIFIABLE (no SR in toolkit) - manual |
| WCAG 2.4.11 / 2.5.7 / 3.2.6 / 3.3.7 / 3.3.8 | not covered by axe - manual |
| State-stress / 375 layout | PASS with F5 |

## Findings (proposed severity; ticket is functional, so a11y ones file separately per triage 7a)

- **F1 Unlabeled textareas (WCAG 1.3.1, 3.3.2, 4.1.2) - High.** Rename dialog Description: axe `label` violation (serious); `aria-labelledby` points at the textarea's own id, no `<label for>`, no placeholder -> empty accessible name. Share "Message (optional)" has the same visual-label-only pattern (passes axe only via placeholder). Also in the Create-list dialog.
- **F2 Contrast (1.4.3) - High (theme-wide, not PR-specific).** axe color-contrast: white on #f99e24 (Share/Save primary) = 2.11:1; ghost-primary text ("Show all N/Show less") #f99e24 on white = 2.11:1; secondary Cancel #688198 on white = 4.05:1 (needs 4.5). Small red "Clear all" and 10px helper/counter text landed in axe `incomplete` (manual). Pre-existing theme/kit token, gated presets Coffee/Red were NOT re-run.
- **F3 Focus management (2.4.3) - Medium.** Trap works (Tab wraps in Share dialog and in both nested confirmations; page behind is aria-hidden; Escape closes only the top layer; confirmations default-focus Cancel). But return focus is lost: after Save/Close of the Share dialog and after Cancel of a nested confirmation, `document.activeElement` is the app root, not the Actions trigger / Save button. Contrast: the Remove-list confirm focuses destructive "Delete" by default (inconsistent).
- **Tab switcher semantics (4.1.2 / 2.1.1) - Medium.** "Who can access" is a `group` of 4 `button[aria-pressed]`, each a Tab stop; ArrowLeft/Right are inert (verified: focus stays). The Figma mobile spec uses radios (83043), the desktop/tab art uses tabs; neither pattern is implemented. Accessible name also embeds state ("Private, selected") while `aria-pressed` states it again -> double announcement (manual SR check).
- **F4 BL-UI-006 at 375 - Medium (kit-wide).** All >=24px (2.5.8 AA PASS) but <44: access buttons 153x32, Copy/Clear/Toggle 38x38, Remove 32x32, Clear all 71x31, Show all 122x37, inputs 36px; 2 interactive pairs <8px apart. Cancel/Share 154x43.
- **F5 Minor a11y/UX - Low.** "1 items selected" (plural not handled; "4 items selected" fine). Show all/Show less has no `aria-expanded`. Empty-set hint ("An empty list does not stop sharing...") and "Cleared - 4 / Undo" not confirmed as an aria-live region (focus moves to Undo, which helps). Message text from the previous share is prefilled on reopen with "New recipients get this" helper.

## Advisory vs Figma exports (83040-83044) - no FAIL
- KNOWN_DIVERGENCE (stated in PR): no "Notify via"; rows show city/region not email; no Select all / "N of M" (VCST-5923); search placeholder "Search customers by name".
- Unstated divergences, advisory: live shows **Link** (label "Link", above Customers) where Figma has **Shareable link** below the Message; live combobox reads "4 items selected" vs Figma "2 selected"; Figma mobile draws radios, live draws pill toggles at all widths; confirmation copy is "Stop sharing this list? / Everyone the list is shared with will lose access." vs ticket AC3 "Stop sharing this page? / Anyone with the link will lose access." (ticket wording, not Figma - flag to PO).
- Positives: dialog is full-width at <=768 and scrolls internally; footers stay pinned; long org names ellipsise; picker opens upward over the Link field without clipping.

## Evidence
`screenshots/4v-*.png` (lists, gear menu, Share x4 tabs, picker open/4 selected, recipients collapsed/expanded, message cap 250/250, empty hint, one recipient, Stop-sharing + Change-access confirms, Rename, details page; 1920/768/375).

## Round 2 — 2026-10-05

Theme 2.59.0-pr-2476-0abb, vcptcore-qa, playwright-edge, SR_REP_PRIMARY (real sign-in, bare `SR_REP_PASSWORD`). Screenshots `screenshots/r2-4v-*.png`. vs. DESIGN: SKIPPED (no Claude Design link on the ticket).

**Deviation:** "Create list" was disabled for the whole session (13 lists on the account, no tooltip/message; a disabled control = stop), so NO `AGENT-TEST-5707-R2-V` list was created. Dialogs were driven on existing `AGENT-TEST-5707-DELTA` (round-1/functional fixture). No list was deleted. Side effect, my error: one Save widened DELTA to "Anyone with link" with no confirmation; I restored it to Specific customers = TechFlow, message "AGENT-TEST-5707 delta" (modified date now Oct 5; recipients may have got notifications). `DELTA (5)` shows "2 customers"/Oct 5 - not touched by me.

| # | Row | Verdict | Evidence |
|---|---|---|---|
| 1 | Share dialog, 4 recipients + 172-char message, scrolled to bottom | PASS | 375: scrolled to end, last text 16.4 px above content bottom, above footer, no clipping; 768: gap 16 px; 1920: fits without scroll, ~16 px. No horizontal overflow at any width. `r2-4v-share-4rec-msg-1920`, `-scrolled-bottom-768`, `-scrolled-bottom-375` |
| 2 | Confirmations at 1920/375 | PASS (partial) | Stop sharing (1920, 375) and Change who can access? narrow (1920, 375): no overflow, both buttons in view, copy complete ("The link stays the same. Some users may lose access."). At 375 "Change access" wraps to 2 lines in the button (cosmetic, Low). WIDEN not verified: Specific customers -> Anyone with link saved immediately, no dialog - if a widen warning is specified, it did not appear (ask PO/dev). |
| 3 | Card status + menu, owner vs non-owner | PASS owner / SKIPPED non-owner | Owner menu = Rename / Share / Remove list, no gaps, 1920 + 375 (`r2-4v-lists-full-1920`, `-card-menu-owner-375`). No non-owner list on this account and no reader login on this lane. |
| 4a | VCST-6117 focus return | STILL REPRODUCES (partial) | Cancel of the nested confirm leaves focus on BODY while Share dialog is open. Closing Share via Cancel now returns focus to the card menu button. |
| 4b | VCST-6118 scope switcher | STILL REPRODUCES | Still 4 `button[aria-pressed]`, name embeds state ("Private, selected"). |
| 4c | VCST-6119 picker Tab | STILL REPRODUCES | Tab from combobox -> Clear -> options; Tab cycles the 4 options and never reaches Cancel/Share while the picker is open. |

New findings: (a) Create list disabled with no explanation (Low, UX; cause unconfirmed, likely list cap). (b) widen save has no confirmation (see row 2). Console: 0 errors.
