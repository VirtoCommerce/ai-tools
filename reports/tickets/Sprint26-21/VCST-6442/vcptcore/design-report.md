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

## Round 2 — 2026-10-29

Lane: run by **qa-frontend-expert** on `playwright-chrome` (Chromium), standing in for `vc-test:ui-ux-expert`, whose plugin was not loaded in this session.
Build: PageBuilderModule 3.1041.0-pr-179-5e6c (shell sub-app), Pages 3.1013.0, XCMS 3.1010.0-pr-28-35cb. Targets: Jira comment 112508.
Data: own pages `AGENT-TEST-VCST6442-R2VIS-1..15` (6 landing pages on `/agent-test-vcst6442-r2vis-v1-1`, one with an unbroken 70-char token, one 120 chars; a 12-language Multilanguage Page on `-v1-2`; 8 standalone Published blockers de/fr/es/it/pt/pl/nl/ja on `-v1-2`). All archived at the end (API search: 0 non-archived R2VIS pages).
Screenshots: `screenshots/4v-r2-*.png`. Round-1 passing checks are not repeated.

### Verdicts
| Target | vs. DESIGN | Layout 1920 / 1280 | 1024 | WCAG 2.2 AA | Long-text stress | i18n (de-DE) |
|---|---|---|---|---|---|---|
| T1 Landing form warning under Permalink + Save without confirmation | SKIPPED - no design link on the ticket | PASS / **FAIL** (F2 unbroken name clipped) | UNVERIFIED (F3) | **FAIL** (F1 "Show more" contrast and focus ring) | 5 other pages: wraps, clamps with Show more; **F2** at 1280 and 1025 | PASS (warning translated) |
| T2 Multilanguage Save confirmation, new text | SKIPPED - same | PASS / PASS | UNVERIFIED (F3) | PASS for the PR's own parts (only the known VCST-6604 Confirm button at 4.01:1) | 6 pages including the unbroken token: wraps inside the dialog | **FAIL** (F4 dialog body English) |
| T3 Publish all "Not published: ..." message | SKIPPED - same | PASS / PASS (wraps); occludes Save (F5) | UNVERIFIED (F3) | PARTIAL - role=alert announced; **F5** auto-dismiss after 3.2 s | 8 languages: wraps in 5 lines, no overflow | **FAIL** (F4 toast English) |
| T4 Unpublish-offer dialog for one language version | SKIPPED - same | PASS (1920; same popup component as T2 at 1280) | UNVERIFIED (F3) | PASS for the PR's own parts (VCST-6604 only) | only 1 conflicting page possible per culture (not stressed) | PASS (body translated) |

### Copy observed (exact)
- T1: "Other pages use this permalink: "<name>", "<name>", ... This is fine for other visitors or dates; publishing checks for conflicts." Banner under the Permalink field, `role=alert` `aria-label="Warning"`, `data-test-id="permalink-usages"`. It lists every page with the permalink in the same culture (Draft and Published alike, without status). Saving the landing page (name edit) gave no dialog: PASS.
- T2: "<permalink> is already used by: <name> (en-US), ... This is fine for other visitors or dates; publishing checks for conflicts. Save anyway?" The "storefront shows only one page per permalink" sentence is gone: PASS. The dialog shows only when the root permalink changes. A name-only save gave no dialog.
- T3: role=alert toast "Not published: ja-JP, nl-NL, pl-PL, pt-PT, it-IT, es-ES, fr-FR, de-DE. Another page is published at this permalink for the same visitors. Publish these languages one by one to replace it." It comes together with a role=status toast "Published: en-US, en-GB, ru-RU, zh-CN. Skipped (no draft): —." Both are built client-side from `publish-all` `skipped[].reason=PermalinkConflict`.
- T4: "Already published at this permalink for the same visitors: "<name>". Unpublish them and publish this page?" ("them" for one page, as in round 1.)

### Keyboard / focus (T2, T4)
`role=dialog aria-modal=true`, labelled by the title. Focus opens on the title Close X. Tab cycles Close > Confirm > Cancel > Close. Esc closes, and focus returns to the trigger (Save / Publish). PASS, same as round 1. T1: Tab order Permalink > Show more/less > Language, and `aria-expanded` toggles. The Permalink input has no `aria-describedby` to the banner (advisory: role=alert covers announcement on appearance only).

### Findings
- **F1 (Medium, a11y, framework VcBanner, NEW vs round 1)** - The banner toggle "Show more"/"Show less" is #FFBA35 on #FAFAFA = **1.64:1** (needs 4.5:1, WCAG 1.4.3). Its focus outline is the same colour, 1.6 px (needs 3:1, WCAG 1.4.11). axe returned it as *incomplete* (pseudo-element background), which is why round 1 passed it. Measured from computed style and from screenshot pixels. Evidence: `4v-r2-landing-warning-1920.png`, `4v-r2-landing-showless-focus.png`. BL-A11Y-003, BL-UI-007.
- **F2 (Low, layout, PR text in VcBanner)** - A page name with a long unbroken token is cut off at the banner edge, with no ellipsis and no wrap (`.vc-banner__content` scrollWidth 553 > clientWidth 373, `overflow-wrap: normal`, wrapper `overflow:hidden`). At 1280 "...abcdefghijklmno" is shown and the rest is lost. At 1920 it fits. The Save dialog (T2) wraps the same name correctly (`word-break: break-word`). Evidence: `4v-r2-landing-warning-1280.png`, `4v-r2-landing-warning-1025-clipped-token.png`. BL-UI-004.
- **F3 (Medium, framework shell, carried over from round 1 and now cross-browser)** - At a viewport 1024 px wide or less the shell is an empty screen in Chromium too, after a resize and after a reload. An empty `.menu-sidebar__wrapper` (z 10) covers the full viewport, and no control is exposed. At 1025 px the shell renders. The 1024 axis therefore stays UNVERIFIED for all four targets. Evidence: `4v-r2-landing-1024-reload.png`. BL-UI-004 (1024 is a supported viewport).
- **F4 (Low-Medium, i18n, PR strings)** - With the shell in Deutsch, T1 (banner) and T4 (dialog body) are German, but the T2 Save-confirmation body and both T3 Publish-all toasts stay English. Evidence: `4v-r2-de-ml-save-confirm-english.png`; the T3 toasts are evidenced by the accessibility snapshot only, because both had auto-dismissed before the screenshot was taken (the T3 message comes from the client, since the API returns only codes). Incidental on the same form: the language-version strings ("This page is a language version...", "inherited", "Outdated", "Open", "Mark up to date", "Unlink", "Publish all", "Archive all") are English in de (`4v-r2-de-lang-version-warning.png`, `4v-r2-de-ml-strings-english.png`).
- **F5 (Low, UX/a11y, framework toast + PR usage)** - The T3 error toast, which names up to N languages, auto-dismisses after **~3.2 s** (MutationObserver timing; hover pauses it, but keyboard users get no pause, WCAG 2.2.1). The status toast is stacked behind it and is not readable. While shown, the toast stack covers the right blade's Save toolbar button at 1920 and 1280, and the mouse travelling to Save keeps it paused there. Evidence: `4v-r2-ml-publishall-notpublished-1920.png`, `4v-r2-ml-toast-covers-save.png`, `4v-r2-ml-publishall-toast-1280.png`. PROPOSED-BL-UI-007 (occlusion).
- Observations (not filed): the T1 banner appears asynchronously about 0.5-3 s after the blade opens and pushes Language and the fields below it down by about 170 px (BL-UI-003 state shift, expected for an async check). The name list format differs: the banner quotes names, the T2 dialog lists them unquoted with "(culture)", so a name that contains a comma reads ambiguously. Popup chrome (Confirmation/Confirm/Cancel/Close) stays English in de (round-1 F1).

### Not covered
ru-RU re-check (de used as the representative locale; round 1 covered ru for the banner). 5+ conflicts in T4 (only one Published page per culture can be in Certain conflict). Firefox and Edge parity. Screen-reader output (no AT available).

### Severity summary
No P0/P1. Medium: F1 (new, framework VcBanner), F3 (shell at 1024 or less). Low-Medium: F4. Low: F2, F5. Known: VCST-6604 (Confirm 4.01:1) seen again on T2 and T4.
