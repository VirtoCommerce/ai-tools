# VCST-6442 - visual lane (4v), LIVE, vcptcore-qa, playwright-firefox

Surface: vc-module-pagebuilder#179 shell PageDetails.vue. Signed in as admin (ADMIN_PASSWORD), first attempt OK.
Data: own pages `AGENT-TEST-VCST6442-V-*` (L0-L6, C0/C1, P0/P1, Q0/Q1, H0/H1), all archived at the end.
Screenshots: `screenshots/4v-*.png`. Browser: Firefox only (no Chrome/Edge pass).

## Verdicts
| Axis | Verdict |
|---|---|
| vs. DESIGN | SKIPPED - no design link on the ticket (not a pass) |
| vs. RULES (BL-UI-004 overflow/clipping) | PASS at 1920 and 1280 |
| vs. WCAG 2.2 AA (new surfaces) | PASS - no axe violation attributable to the PR (see A11y) |
| vs. SYSTEM (i18n, consistency) | PASS for PR strings; 2 framework-level gaps (not PR) |

## Static findings, now confirmed or refuted live
1. Locales complete: CONFIRMED live. de and ru: all four keys render translated, {pages} substituted, no raw key (4v-i18n-de-certain, -de-haschanges, -ru-certain, -ru-possible, -ru-banner-1920, -banner-ru-1280). ja not exercised (diff-only: 13/13 locales carry all keys).
2. Warning is a VcBanner, plain names, no links: CONFIRMED. Warning variant, triangle icon, names in straight quotes, comma-joined.
3. No truncation/cap on names: PARTLY REFUTED. The PR does not cap, but VcBanner clamps long text itself. At 1280 (narrow blade) 6 usages incl. a 120-char name are cut to 5 lines with a "Show more" / "Show less" toggle (4v-banner-ru-1280, -expanded); at 1920 the full text shows (4v-warning-1920). No horizontal overflow either way (banner scrollWidth == clientWidth).
4. No aria-live in template: REFUTED as a defect. VcBanner renders `role="alert"` + `aria-label="Warning"`, so the warning is announced (assertive) when it appears. Screen-reader output itself NOT verified (no AT in toolchain).
5. Dialogs via shared usePopup: CONFIRMED (same Confirmation/Error chrome as other shell popups).

## A11y (axe 4.10.2, wcag2a/aa/21/22aa)
- Page with warning: 0 violations on the banner. Page-level hits are shell/list, not PR: table date + status-tag contrast 2.09:1, one unlabeled field `#vc-field-v-68`, `meta viewport user-scalable=no`.
- Certain-conflict dialog: `role=dialog aria-modal=true`, labelled by its title; 1 serious color-contrast hit, framework "Confirm" text button #5983a8 on white = 4.01:1 (needs 4.5). Pre-existing popup styling, not PR code. Severity Medium.
- Keyboard: focus moves into the dialog on open (lands on the title "Close" X, not on Cancel/Confirm), Tab cycles Close > Confirm > Cancel > Close (no escape out, no trap-for-good since Esc works), Esc closes, focus returns to the Publish button (verified via snapshot [active]). Cancel/Esc left the page Draft (API check: all drafts unchanged).
- Possible-conflict confirm and has-changes Error popup behave identically (focus on Close X; Error has single OK).
- Advisory: banner is role=alert and re-renders on each debounced (500 ms) permalink edit; may re-announce repeatedly while typing - confirm with a screen reader.

## States seen (all four surfaces rendered and correct)
- Certain: "Already published ... Unpublish them and publish this page?" (4v-dialog-certain). Cosmetic: "them" for a single page - fixed plural wording, all locales.
- Possible (partial date overlap): "Also published ... for some of the same visitors or dates ... Publish anyway?" (4v-dialog-possible).
- HasChanges (other page published with unpublished changes): Error popup, single OK, no way to proceed (4v-popup-haschanges).
- Banner text for Q/P/C/H pages: single-name form renders cleanly on 2 lines.

## i18n / consistency findings (none from PR strings)
- F1 (Low, framework): in de/ru the popup chrome stays English - titles "Confirmation"/"Error", buttons "Confirm"/"Cancel"/"OK"/"Close" - while the body is translated; mixed-language dialog (4v-i18n-de-haschanges, -de-certain). Same usePopup everywhere, so consistent with neighbours; not caused by #179.
- F2 (Low, framework): banner toggle "Show more/Show less" not localized in ru (4v-banner-ru-1280).
- F3 (Low, UX): Confirm is the low-emphasis text button and Cancel the filled primary in the destructive "Unpublish them and publish" dialog - safe default, but the affirmative action is the visually weaker one.
- Neighbouring warnings in the same blade: none to compare (new banner is the first VcBanner in PageDetails).

## Not covered
- 1024 px: shell rendered blank/stuck on loader at 1024x768 in Firefox (list and details, 2 attempts) - env/shell behaviour unrelated to the banner, so 1024 layout is UNVERIFIED (no valid screenshot kept).
- Confirm path (unpublish + publish) left to the functional agent; ja screenshots; Chrome/Edge parity; dark theme.
- The platform build changed mid-session (AI Assistant toolbar button appeared, counts moved) - other agents were active on the stand.
- Lane note: shell language was left on Russian in this lane's profile.

## Severity summary
No P0/P1. Medium: 4.01:1 Confirm contrast (framework). Low: F1-F3, "them" plural. 0 bugs attributable to #179.
