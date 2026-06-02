# Testing Checklist — VCST-4926: Page Builder Localization

| Field | Value |
|-------|-------|
| Ticket | VCST-4926 |
| Build | VirtoCommerce.PageBuilderModule_3.1007.0-pr-121-5cf7 |
| Platform | 3.1019.0 |
| Environment | https://vcst-qa.govirto.com |
| Languages sampled | en (baseline), de, ru, ja, zh |
| All 13 languages | en, de, es, fi, fr, it, ja, no, pl, pt, ru, sv, zh |
| Date | 2026-04-20 |
| Sprint | 26-08 |
| Priority | Medium |
| Total items | 32 |

---

## CL-LS — Language Switcher

- [ ] CL-LS-01 | Language picker | Go to Stores > B2B-store > Page Builder > Open My Profile or Settings → Click on Language selector; verify all 13 language options appear: en, de, es, fi, fr, it, ja, no, pl, pt, ru, sv, zh | Exactly 13 options listed, no duplicates

---

## CL-SH — VC-Shell UI Translation (Page Builder module navigation + list blade)

- [ ] CL-SH-01 | Module navigation label | In each sampled language (de, ru, ja, zh): verify the "Page Builder" entry in the left-side navigation menu is translated | Navigation item shows translated label, not raw key or English fallback when a translation exists
- [ ] CL-SH-02 | List blade column headers | In each sampled language: open the Pages list blade; inspect column headers (Name, Status, Created, Modified, or equivalents) | All column headers display translated text
- [ ] CL-SH-03 | Status tab labels | In each sampled language: verify tab filter labels (Draft / Published / Archived) are translated | Tabs show translated status labels; no English tab names in non-English locales
- [ ] CL-SH-04 | Toolbar buttons — primary actions | In each sampled language: verify toolbar buttons "Save", "Publish", "Archive", "Unpublish", "Load content" are translated | Button labels show correct translated text in all sampled languages
- [ ] CL-SH-05 | Confirm dialogs | In each sampled language: trigger the delete confirmation dialog and archive confirmation dialog | Dialog title, body text, and confirm/cancel button labels are all translated
- [ ] CL-SH-06 | Empty state message | In each sampled language: switch to Archived tab when no archived pages exist (or filter to an empty result set) | Empty state message is translated, not English or raw key
- [ ] CL-SH-07 | Pagination labels | In each sampled language: scroll list blade to pagination controls | "Items per page", page number indicators, and navigation arrows/labels are translated or localized
- [ ] CL-SH-08 | Notification / toast messages | In `de`: save a page; verify success toast message | Toast text is in German, not English or raw key

---

## CL-DS — Designer UI Translation

- [ ] CL-DS-01 | Designer palette section names | In each sampled language: open a page in the designer; inspect the block palette panel section names | Palette sections display translated labels, not English names or raw keys
- [ ] CL-DS-02 | Block properties panel labels | In each sampled language: select a block in the designer canvas; inspect the right-side properties panel field labels | All property labels (padding, margin, text, image, link, etc.) are translated
- [ ] CL-DS-03 | Designer toolbar buttons | In each sampled language: inspect designer toolbar (undo, redo, preview, save, publish, and any layout controls) | All toolbar button labels and tooltips are translated
- [ ] CL-DS-04 | Settings / configuration panel labels | In each sampled language: open block settings or page settings panel | Settings panel section headers and field labels are translated
- [ ] CL-DS-05 | Tooltips | In each sampled language: hover over at least one designer toolbar icon and one block action icon | Tooltip text is translated; no English-only tooltips visible in non-English locales
- [ ] CL-DS-06 | Designer confirm/discard dialogs | In `ru`: make an unsaved change; navigate away to trigger the discard-changes dialog | Dialog title, body, and button labels are in Russian

---

## CL-TI — Title Interpolation Fix

- [ ] CL-TI-01 | Blade title with page name (English baseline) | In `en`: open an existing page in the detail blade; observe the blade title bar | Blade title displays the actual page name using `{name}` substitution (e.g., "My Landing Page"), not a concatenation artifact or placeholder
- [ ] CL-TI-02 | Blade title in non-Latin language | In `ru` and `ja`: open a page in the detail blade | Blade title displays the page name correctly; no broken interpolation, no raw `{name}` literal visible, no empty title
- [ ] CL-TI-03 | Blade title in Latin non-English language | In `de`: open a page in the detail blade | Blade title displays the page name correctly; title format matches the fixed `{name}` interpolation pattern
- [ ] CL-TI-04 | New page blade title | In `en`: create a new page and observe the blade title before first save | Blade title reflects the new/unsaved state label correctly (not a raw key or broken interpolation)

---

## CL-FL — Fallback Behavior and Untranslated Leaks

- [ ] CL-FL-01 | No raw translation keys visible | In each sampled language: browse the Page Builder list blade and designer; scan visible text | No raw keys of the form `PAGE_BUILDER.*`, `PAGEBUILDER.*`, or dotted-path strings are visible in the UI
- [ ] CL-FL-02 | Fallback to English for missing keys | Switch to a language where some keys may be missing (verify with `fi` or `no` if accessible); look for any untranslated UI areas | Missing keys fall back to English text, not to the raw key string or blank
- [ ] CL-FL-03 | Untranslated English strings in non-English locale | In `ja` and `zh`: systematically scan the vc-shell Page Builder list blade for any strings that appear to be English when surrounding context is translated | Flag any English string leaks as potential missing translation entries; document the key area for follow-up
- [ ] CL-FL-04 | Console: no i18n errors | In any sampled non-English language: open browser DevTools console after loading Page Builder | No i18n-related console errors (missing key warnings, locale load failures); no 404s for locale JSON files

---

## CL-GR — Glyph Rendering (CJK)

- [ ] CL-GR-01 | Chinese (zh) character rendering in navigation | Switch to `zh`; observe the Page Builder navigation item and list blade column headers | Chinese characters render correctly; no tofu squares (empty boxes) or replacement characters
- [ ] CL-GR-02 | Japanese (ja) character rendering in navigation | Switch to `ja`; observe the Page Builder navigation item and blade labels | Japanese characters (hiragana, katakana, kanji) render correctly; no tofu or missing glyphs
- [ ] CL-GR-03 | CJK text in menus — no clipping or overflow | In `zh` and `ja`: hover over navigation items and open dropdown menus | Menu items do not clip, overlap, or overflow their containers when displaying CJK text
- [ ] CL-GR-04 | CJK text in blade title bar | In `zh` and `ja`: open a page in the detail blade | Blade title bar fully accommodates CJK characters; text is not truncated mid-character or replaced by ellipsis that cuts a glyph

---

## CL-RG — Regression — CRUD Smoke in Non-English Locale

- [ ] CL-RG-01 | Create page in German | Switch to `de`; create a new page via Page Builder | Page creation completes successfully; success toast appears in German; new page appears in list
- [ ] CL-RG-02 | Edit and save page in German | With `de` active: open the newly created page in the designer; make a content change; click Save | Save succeeds; no errors; changes persist on reload
- [ ] CL-RG-03 | Publish page in German | With `de` active: click Publish on the test page | Publish succeeds; page status changes to Published; published state reflected in the list blade
- [ ] CL-RG-04 | Archive page in German | With `de` active: archive the test page; confirm the dialog | Archive succeeds; page moves to Archived tab; no broken flow or untranslated error dialog
- [ ] CL-RG-05 | All other 12 languages load without JS errors | Switch to each remaining language (es, fi, fr, it, no, pl, pt, sv and the sampled non-Latin languages not yet checked); navigate to Page Builder | Page Builder loads without JavaScript errors or white screens in every language; locale files load with HTTP 200

---

*AC coverage: CL-LS covers AC-1 (all 13 languages in picker + persistence). CL-SH / CL-DS cover AC-1 (vc-shell and designer UI translation). CL-TI covers the PR-specific title interpolation fix. CL-FL covers fallback risk. CL-GR covers CJK glyph rendering risk. CL-RG covers no-regression requirement.*
