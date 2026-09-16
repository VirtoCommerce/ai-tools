# BUG — Sales Rep nav link renders raw i18n key `sales_rep.navigation.link` under fr/es

**Severity:** Medium (P2) · cosmetic/i18n, no functional loss · **Type:** Functional / i18n copy

**Env:** vcst-qa storefront @ Theme `2.56.0-pr-2429-796d-796dc06c`, Chromium 1920×1080, user `agent-test-sr-primary@example.com` (B2B-store)

## Summary

In the account sidebar's *Company* section, the "Sales representatives" link renders the untranslated i18n key `Sales_rep.navigation.link` under French and Spanish. German renders correctly (`Vertriebsmitarbeiter`), so the key exists in `de.json` but is missing from `fr.json` / `es.json` (likely `it`/`pl`/`pt` too — not checked). Found incidentally while verifying VCST-5684.

## STR

1. Sign in as a sales rep (`@td(SR_REP_PRIMARY)`).
2. Full page load of `{{FRONT_URL}}/fr/company/my-customers` (or `/es/...`).
3. Look at the sidebar → *Informations sur l'entreprise* / *Información de la empresa* group.

**Expected:** localized label for the link to `/fr/company/sales-reps` (e.g. FR "Représentants commerciaux").
**Actual:** the raw key `Sales_rep.navigation.link` (capitalized by the CSS first-letter transform).

## Evidence

`reports/tickets/Sprint26-15/VCST-5684/screenshots/BUG-sales-rep-nav-link-raw-key-es.png`

## Notes

Same class as VCST-5684 (missing sales-rep locale entries), but a different key — `sales_rep.navigation.link` was not part of vc-frontend PR #2429. Fix = add the key to the remaining locale files in `vc-frontend`.
