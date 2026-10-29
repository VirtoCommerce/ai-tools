# VCST-4935 design/visual lane (4v) - vcptcore, Edge lane, 2026-10-23
Build: PageBuilderModule 3.1036.0-pr-175-a3bc, theme 2.61.0-pr-2576. Screenshots: screenshots/4v-*.png (admin 1920+1366, storefront 1920).
vs. DESIGN: SKIPPED (no Prototype link; PNG mockups only). No gross divergence recorded.

## Verdicts
| Axis | Admin vc-shell (B36) | Storefront (B37) |
|---|---|---|
| BL-UI-001..006 | N/A to vc-shell (bug-catalog scope note); advisory observations below | PASS (header/shell identical before/after switch; no overflow) |
| BL-UI-007 keyboard/state | FAIL: Link-existing dropdown (see D1); chooser dialog + conflict dialog PASS (focus trapped, labelled, axe clean) | n/a |
| BL-A11Y-001 | PASS dialogs (Tab wraps, Close focus); advisory: focus ring #85c6e6 on white ~1.9:1 (framework) | not exercised beyond axe |
| BL-A11Y-002 | FAIL: D3 (31 identical unnamed row buttons) ; storefront switcher D5 | FAIL D5 |
| BL-A11Y-003 | FAIL: D2 contrast | PASS (axe 0 violations) |
| BL-A11Y-004 | INCONCLUSIVE for aria-live on async messages (not exercised) | PASS axe |
axe 4.10.2 injected fine (no CSP block). meta-viewport (critical, max-scale=1) on admin shell: framework.

## Suspected defects (none filed)
- D1 (vc-shell, VcSelect inside VcPopup) Link-existing dropdown renders in .vc-app (z 9300), dialog is a separate body portal; elementFromPoint at the listbox returns vc-popup__footer/content. Option invisible; with 0 options "No options" also invisible. Keyboard: Enter opens, ArrowDown does not highlight, Enter closes without selecting, no aria-activedescendant, options have no id -> Link stays disabled. Link cannot be completed by mouse or keyboard. 4v-be-08/09/10. Not cross-checked in Chrome.
- D2 (vc-module-pagebuilder, language-pills + tag-holder; scoped data-v-fddf44ed) contrast: Multilanguage type tag #319ed4/#eff7fc 2.77; pill Missing #737373/#daedf7 3.93; pill Outdated #b46b0f/#fff6d6 3.84 (12px, need 4.5). Framework: date cell 2.09-2.52, hint 2.52.
- D3 (vc-module-pagebuilder) languages table: 10x Create, 10x Link existing, Open/Unlink etc. all with no aria-label; names not contextual per language (BL-A11Y-002).
- D4 (module) EN/EN and NL/NL pill label collision (pill = 2-letter code, title only); list type pill "Landing Page" wraps and "Multilanguage" text touches pill border when blade open; ML row Status cell empty.
- D5 (theme/store config) switcher: 13 items, two "English", two "Nederlands", flag imgs alt="" -> indistinguishable by name; menu 192px high, scroll.
- Advisory: "Has unsaved changes" banner inserts ~33px and shifts the blade (BL-UI-003 style, framework); 1366 stacks row actions vertically (en-US row ~130px).
- Pre-existing: Visibility switch fails axe `label` (critical), meta-viewport critical.
- Fixture artifact: storefront renders "undefined" for the EN page because my fixture content was empty/unknown block.

## Fixtures
Root 8d656c1f-f2cd-4c44-b5e5-8bb341edd29c; groups en 7f6ba9dd-9570-4b37-af1d-fffcb5f0971f, fr 4860fbef-5915-4c5c-80fd-dd6bfe003525, de-DE version 8ebb8c9a-..., spares 5a194806-75ed-4d4a-b3c0-c13879b37b00 (fr), 99ff7812-a037-41d8-be28-eb510b795026 (zh).
Cleanup: archive-all done, spares archived. Root NOT deleted (API 400: has language versions - archive instead); archived root + archived versions remain.
