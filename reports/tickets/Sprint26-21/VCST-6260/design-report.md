# VCST-6260 — track 4v design / a11y report (Round 2 FULL)

> Screenshots referenced below (`UI-*`, `LOOK-*`) are ephemeral run evidence and are not committed; they stay with the local run folder.

Build: Platform 3.1087.0-pr-3134-a3d2 (header label read live) on vcptcore_qa1. Browser: Chrome DevTools MCP only. Look: Classic (the PR's default). Viewports 1280 and 393 (touch emulation). F7 fix efd7f75 is NOT deployed on this build.
Screenshots: `screenshots/UI-*.png`.

**vs. DESIGN axis: SKIPPED.** No Claude Design project is linked on the ticket. This is not a pass.
Precedence applied: BL-UI invariant > design spec > UX heuristic. BL-UI-005 and BL-UI-006 are SUSPECT in the oracle (storefront origin), so findings against them are flagged.

## Verdicts

| Row | Verdict | Evidence |
|---|---|---|
| V-01 phone 393 sweep | FAIL (Low) | F2 reproduced: pill 30x18 overlaps the search button by 30x8 px (`pointer-events:none`, so taps still reach the button), UI-V01-phone-dashboard-393. F7 reproduced, KPI value beside its label (known, not re-filed), same screenshot. Drawer, dialog, search, settings and the Catalog spine render without clipping: UI-V01-phone-drawer-open, -dialog, -search-open, -settings, -child-strip. No document overflow (scrollWidth = innerWidth) on dashboard, catalog, order and settings. Touch targets: all new chrome is >= 36 px (menu 40, search 36, header icons 36, drawer footer 42). The only controls under 24 px are the pre-existing ui-grid row checkboxes (17-20 px). F4 and F5 NOT re-verified (needs a long-named product blade; the blades I opened showed neither). New: F-UI-5 (drawer keyboard), F-UI-7 (settings inner scroller). |
| V-02 de + ru | FAIL (Low) | 1280: de and ru PASS. Search placeholder, license label, Purchase, collapse text, env pill, group titles and item description all fit (`scrollWidth <= clientWidth`), UI-V02-de-1280, -de-search-1280, -ru-search-1280. 393: ru PASS (labels end at x=351 of 376). de FAIL: the tile label "DURCHSCHNITTLICHER BESTELLWER(T)" is cut at the tile edge, UI-V02-de-phone-dashboard-393. Cause is the F7 side-by-side layout, so efd7f75 should clear it; re-verify on the rebuilt image. de phone drawer license card wraps cleanly, UI-V02-de-phone-drawer-393. |
| V-03 Classic colour fidelity | PASS | Derived, not eyeballed. I compiled base `dev` and PR sass with `sass`, stripped every `var(--vc-*, fallback)` to its fallback, and compared the two outputs declaration by declaration. 1842 `dev` selectors, 0 colour differences. The only 6 differences are intended non-colour changes (docs icon, license label wrap/margin, logo-version ellipsis) plus one artefact of my stripping. Live: 0 `--vc-*` custom properties are defined in Classic (all 498 declarations are scoped under `.vc-modern`), so every fallback is used. Computed values match the original hex. Login: bg rgb(245,246,249), button rgb(67,176,230) / #fff, `.vc-alert--error` rgb(152,54,54) / rgb(255,237,237) (UI-V03-login-error-1280). Grid hover #ecf7fc matches (UI-V03-orders-grid-hover-selected). Blade head and dialog header #465769, filter menu #333, settings blade incl. Sign In Log group (UI-V03-dialog, -filter-panel, -settings-signinlog). A form-validation error was sampled on the login page only; other forms rest on the compile-equality proof. |
| V-04 keyboard / a11y of new chrome | FAIL (Medium) | See F-UI-1..6. axe (WCAG 2.2 AA tags) on dashboard, drawer open and search open. |
| V-05 look dialog | PASS | Ctrl+Alt+T opens a `role=dialog` that takes focus; radios are named. Dark preview shows behind it. Apply, reload: Dark kept (UI-V05-dark-applied). Back to Classic, reload: no look keys, Classic. Dialog is not shown at sign-in unless the hotkey is pressed (first login screen: none). Notes: the hotkey also opens the dialog on the sign-in page (UI-V05-signin-no-look-dialog); Cancel/Esc still writes `VirtoCommerce.Platform.UI.Theme=classic` and `...ThemePreset=gray`. Dark at 1280: search placeholder clipped to "Search menu, ap" (demo look, Low). |
| X-2 console / network | PASS with notes | No JS errors. Console error is 404 x4 for two app-switcher logos (`/apps/algolia_search/logo.svg`, `/apps/reports/logo.svg`), not from this PR. `<html lang>` stays `en` in de/ru (pre-existing). Bundle asset hash NOT verified; only the header label `3.1087.0-pr-3134-a3d2` was read. |

## Findings (chrome this PR introduces; pre-existing listed separately)

| ID | Sev | PR-introduced | Rule | Finding |
|---|---|---|---|---|
| F-UI-1 | Medium | yes | BL-A11Y-003, WCAG 1.4.3 | Search dropdown muted text `#838d9a`: group titles and descriptions 3.36:1 on white, 3.08:1 on the active row (#ecf7fc), highlight `<mark>` 2.98:1. Needs 4.5:1. UI-V04-search-results-contrast-1280. **Operator decision 2026-10-21: not a bug.** |
| F-UI-2 | Medium | yes | BL-A11Y-004, BL-UI-007, WCAG 4.1.2 | Search combobox: `role=option` buttons have no `id` and the input never gets `aria-activedescendant` (still null after ArrowDown), so assistive tech cannot tell which result is active. The list has no accessible name. No live region reports the result count. **Operator decision 2026-10-21: not a bug.** |
| F-UI-3 | Low | yes | WCAG 2.4.3 | Esc: 1st press clears and closes the list, 2nd collapses the box and focus drops to `<body>`. It does not return to the control that opened the search. **Operator decision 2026-10-21: not a bug.** |
| F-UI-4 | Medium | yes (new control; cause pre-existing) | BL-UI-007, WCAG 2.4.7 | "Collapse menu" has no visible focus indicator. `:focus-visible` matches but outline is `none`, shadow `none`, and the background equals the unfocused one. Root cause is a pre-existing global `* { outline: none }`. The PR's Classic rules add no focus style for this button. Other new buttons were not individually measured. UI-V04-collapse-focus-1280. **Operator decision 2026-10-21: not a bug.** |
| F-UI-5 | — | — | — | WITHDRAWN — operator decision 2026-10-21: phone drawer Esc / focus behaviour is not a bug. |
| F-UI-6 | Low | yes | WCAG 4.1.2 (advisory) | Collapse button and blade spines expose no `aria-expanded`/`aria-pressed`. State is carried only by the name (Collapse/Expand menu); spines are named just "Catalog". Focus is kept after toggling and Enter works. **Operator decision 2026-10-21: not a bug.** |
| F-UI-7 | Low | unknown | BL-UI-004 | Phone settings blade: `.settings-properties-panel` scrolls horizontally (scrollWidth 503 > 378) because the CodeMirror JSON editor is 416 px wide. The document itself does not overflow. |
| F-UI-8 | Low | yes | UX | Phone drawer footer shows "Collapse menu"; its phone behaviour was not tested. **Operator decision 2026-10-21: not a bug.** |
| F-UI-9 | Low | known | BL-UI-004 | Known F2 and F7, plus the de clip noted under V-02. Not re-filed. |

Pre-existing, not this PR (a11y rule: report only chrome the PR introduces): `.links-menu-button` has no name, logo `<img>` has no alt, help link has no text and the gear/bell are non-focusable spans (dev template identical), env pill `#fc7e00`/white 2.58:1 (same colours on `dev`), KPI value `#43b0e6` 2.44:1, blade maximize/close buttons unnamed and 0 px apart, ui-grid checkboxes 17-20 px, ui-grid ARIA role errors, "Inventory" untranslated in de/ru menu (not checked on `dev`), widget titles untranslated.

axe highlights: dashboard 1280 = button-name, color-contrast (env pill, KPI), image-alt, link-name, all pre-existing. Drawer open = same set, nothing new from the drawer. Search open = the above plus F-UI-1 and ui-grid noise.

## Teardown
- Throwaway `agent-test-6260-ui@test.virtocommerce.com` created through REST (random password, not logged here), signed in through the UI, then DELETED: `DELETE ...?names=` returned 200, lookup returns `null`, search `totalCount` 0. Password file removed.
- Language: set de, then ru, then back to en in the profile before deletion; storage `VC_LANGUAGE_SETTINGS=en`.
- Look: Classic restored; `VirtoCommerce.Platform.UI.Theme`, `...ThemePreset` and `vueuse-color-scheme` removed from localStorage (checked twice, once after the sign-in-page hotkey test). Session signed out; emulation reset to 1280.
- Tooling: sass and postcss installed in the scratchpad only. No repo code changed, no tracker or PR writes.

## Modern looks pass (2026-10-21)

Env vcptcore_qa1, Platform 3.1087.0-pr-3134-a3d2, Chrome DevTools, 1440x900 (phone 393x852). Throwaway admin minted and deleted (lookup null). Screenshots: `screenshots/LOOK-*`. Only look switching; no business data saved.

**Defects**
- D1 Medium (shell/theme) Dark looks, selected pill "24 hours" (Sign-in log) white on accent: Indigo 2.36, Warm 2.99, Blue 2.33, Gray 2.22 (Green 4.63 ok). LOOK-dark-*-signin-log.png
- D2 Medium (shell/widget) Dark Warm/Gray/Green: chart legend swatch follows accent, bars stay bright blue; unselected range links stay Classic blue. Light-Gray: bars/links blue, active menu row blue-tinted.
- D3 Medium (module dashboard chart) Dark-Gray: after in-session navigation back to Home, Google charts lose Y-axis labels and legend text (fresh load OK). LOOK-dark-gray-dashboard-return.png vs LOOK-dark-gray-dashboard.png. Not compared against Classic.
- D4 Medium (shell boot) Reloading with a dark look shows a pale #f4f6fb blank screen until boot completes (flash of light). LOOK-dark-gray-dashboard-after-reload.png, LOOK-phone-dark-warm-dialog.png (first shot). Classic not compared.
- D5 Low-Med (shell, 1.4.3) muted 10px version label fails 4.5: Light-Warm 3.51, Light-Blue 2.74, Light-Gray 3.47, Light-Green 3.45, Light-Indigo 3.15, Dark-Indigo 3.88; menu-panel hint 12px Light-Warm 3.86. Light-Blue "Purchase" 4.07.
- D6 Low-Med (1.4.11) Dark-Gray input border vs field bg 1.44:1 (field bg = blade bg). Classic not compared.
- D7 Low (module/widgets) Light-Warm: widget tiles keep magenta accent bars and blue info banner (Classic colours). Dashboard KPI values stay blue.
- D8 Low (module) Phone Dark-Warm Applications panel: app names Classic light blue.
- D9 Low Notification popup not closed by Escape (stays open while search opens); QA badge straddles header top edge on phone.
- Not verified: Expand tooltip (synthetic hover showed none), phone search sheet (click opened menu), Dark-Gray confirm dialog/order blade, CodeMirror/JSON editor, date pickers, validation errors.

**Matrix** (PASS = no defect seen; screens captured)
| Mode/preset | header/menu | dashboard | search | settings/catalog/product | order | confirm | sign-in log |
|---|---|---|---|---|---|---|---|
| Light-Warm | P | P (D7) | P | P | P (D7) | P | n/a |
| Light-Blue/Gray/Green/Indigo | P | - | - | - | - | - | P (D2 Gray, D5) |
| Dark-Indigo | P | - | - | - | - | - | FAIL D1 |
| Dark-Warm | P | - | - | P (product, user menu) | - | - | FAIL D1, D2 |
| Dark-Blue | P | - | - | - | - | - | FAIL D1 |
| Dark-Gray | P | P/D3 | P | P (D6) | - | - | FAIL D1, D2 |
| Dark-Green | P | - | - | - | - | - | P D2 |
| Match system | follows prefers-color-scheme dark and light live (vc-dark toggles) PASS |
| Classic | presets disabled; computed styles identical to fresh load after Dark>Light>Classic PASS |

**Other checks**: Persistence PASS (reload keeps look; keys `VirtoCommerce.Platform.UI.Theme` and `.ThemePreset`; ThemePreset stays "warm" under Classic). No settings/v2/me request seen. Fonts: Inter+Geologica requested only after a modern look; Classic loads Roboto+FontAwesome only. Login page follows dark look (dark card, light logo); dialog also opens on login page. Phone dialog fits, buttons reachable; phone drawer/blade OK in Dark and Light. Header gear/help/bell/avatar not exposed as buttons in a11y tree (Classic not compared).
