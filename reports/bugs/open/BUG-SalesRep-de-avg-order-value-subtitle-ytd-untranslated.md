# BUG: German AOV widget subtitle leaves "YTD" untranslated

## Status: CONFIRMED — filed as [VCST-5684](https://virtocommerce.atlassian.net/browse/VCST-5684)

**Severity: Low** (copy/i18n polish; meaning is still inferable).

**Env:** vcptcore-qa @ Theme 2.55.0-pr-2408-0cc5 · store `B2B-store`

## Summary
On the Sales-Rep **Customer profile** under a German culture, the *Average order value* widget subtitle renders `"Durchschnitt pro Bestellung (YTD)"` — the sentence is translated but the acronym `YTD` is left in English. `YTD` ("year to date") is not a German abbreviation; the German convention is `seit Jahresbeginn`.

## Steps to Reproduce
1. Sign in as a Sales Rep (`@td(SR_REP_PRIMARY)`).
2. Full page load of `{{FRONT_URL}}/de/company/my-customers`, then open any customer profile.
3. Read the subtitle of the *Average order value* widget.

**Expected:** the subtitle is fully German, e.g. `"Durchschnitt pro Bestellung (seit Jahresbeginn)"`.
**Actual:** `"Durchschnitt pro Bestellung (YTD)"`.

Evidence: `reports/tickets/Sprint26-15/VCST-5586/screenshots/SR-CP-056-de-localized-load-failed-full-load.png`.

## Business rule
**BL-SR-013** `[P2-ux]` — rep-facing vocabulary localizes by `cultureName`. This is a partial-translation case rather than a raw key, so it is a weaker violation than [BUG-SalesRep-DE-raw-i18n-keys-account-sidebar](BUG-SalesRep-DE-raw-i18n-keys-account-sidebar.md) — but the same class.

## Provenance
**Pre-existing — NOT introduced by PR #2408 (VCST-5586).** That PR added only the four `*_load_failed` keys to the locale files and did not touch the AOV subtitle. Found incidentally while verifying the localized error state.

## Fix Routing
`vc-frontend` — `client-app/modules/sales-rep/locales/de.json`, the *Average order value* subtitle. Worth sweeping the other 12 locales for the same untranslated `YTD` / `MTD` acronyms, which appear in several statistics labels (`mtd_of_ytd` renders `"% of YTD"` in the same widget family).
