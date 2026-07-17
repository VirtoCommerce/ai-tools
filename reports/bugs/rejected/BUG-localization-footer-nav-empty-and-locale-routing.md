# Empty footer nav in es/it/pt/no + broken locale deep-links + no active switcher state — P2

## Status: Rejected

**Severity:** P2 · **Type:** Localization / Routing (BL-L10N-001)

**Env:** vcst-qa @ Platform 3.1043.0, Theme 2.53.0-pr-2368

## Summary
In Spanish, Italian, Portuguese and Norwegian the storefront footer navigation renders empty (only the brand link), while header/nav translate correctly — the footer link-list appears keyed to en/de/fr only. Additionally, explicit `/en/` locale deep-links 404 and never switch locale, and the currency/language switcher gives its active option no selected-state.

## Steps to Reproduce
1. Switch storefront language to Spanish (repeat for it / pt / no); scroll to the footer.
2. Observe the footer navigation region.
3. Navigate directly to a `/en/` deep-link URL (and a stacked `/de/en/` variant).
4. Open the currency/language switcher and inspect the accessibility tree for the active option.

## Expected vs Actual
- **Expected (footer, L10N-ES/IT/PT/NO-001):** Footer nav renders its full link list in every supported locale.
- **Actual:** Footer nav is empty (brand link only) in es/it/pt/no; header/nav translate fine.
- **Expected (ROUTE-003):** `/en/` deep-links resolve and switch locale.
- **Actual:** `/en/` deep-links 404 and do not switch locale; stacked `/de/en/` also 404s.
- **Expected (CURR-001):** The active currency/language option is marked selected (`[checked]`/`[active]`/`aria-current`).
- **Actual:** No option carries a selected state in the a11y tree.

Empty footer (es):
![Empty footer nav](screenshots/L10N-ES-001-FAIL-empty-footer-nav.png)

No active switcher state:
![No active currency indication](screenshots/L10N-CURR-001-FAIL-no-active-currency-indication.png)

## Root Cause
Footer i18n menu is keyed to a subset of locales (en/de/fr) and returns empty for the rest; locale route resolution rejects explicit `/en/` segments; the switcher omits a selected-state attribute on the active item.

## Fix Routing
- **Repo:** `vc-frontend` — resolve the footer i18n menu for all supported locales, fix locale route handling for explicit/stacked locale segments, and add an active/selected state to the currency-language switcher.
- **Kind:** frontend
