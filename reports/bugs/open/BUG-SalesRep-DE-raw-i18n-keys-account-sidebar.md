# BUG: Account sidebar renders raw i18n keys instead of German labels

## Status: CONFIRMED — filed as [VCST-5681](https://virtocommerce.atlassian.net/browse/VCST-5681)

**Severity: Medium** (visible to end users on every localized page; fails silently — no console warning, so it is invisible to monitoring).

**Env:** vcptcore-qa @ Theme 2.55.0-pr-2408-0cc5 · store `B2B-store`

## Summary
On a German storefront the account/Sales-Rep sidebar renders three untranslated i18n **keys** in place of labels. This is not an in-page-locale-switch race: it persists on a clean full load of `/de/…`, so the German locale file is genuinely missing the keys. Nothing is logged — no missing-translation-key warning — so the gap is silent.

## Steps to Reproduce
1. Sign in as a Sales Rep (`@td(SR_REP_PRIMARY)`) on the B2B storefront.
2. Navigate by **full page load** to `{{FRONT_URL}}/de/company/my-customers` (do not use the in-page language switcher — that is a different, wider symptom).
3. Read the left sidebar.

**Expected:** every sidebar entry shows a German label (the surrounding chrome already does — `Meine Kunden`, `Vertriebsmitarbeiter-Hub`, `Schnellaktionen`).
**Actual:** three entries render their raw keys:
- `Purchase_requests.menu.link.title`
- `Back_in_stock.navigation.route_name`
- `Sales_rep.navigation.link`

The in-page EN→DE switch leaks a wider set (also `Quotes.navigation.route_name`, `Push_messages.menu_item_name`, `Loyalty.navigation.route_name`), which suggests a lazy-load race **on top of** the missing-key gap.

Evidence: `reports/tickets/Sprint26-15/VCST-5586/screenshots/SR-CP-056-de-localized-error-vs-raw-sidebar-keys.png` (one frame showing correctly-localized statistics copy next to the raw sidebar keys), `BUG-de-raw-i18n-keys-sidebar.png`.

## Business rule
**BL-SR-013** `[P2-ux]` — rep-facing vocabulary localizes by `cultureName`; the storefront renders the localized label, **never a raw i18n key**. One of the three leaked keys (`Sales_rep.navigation.link`) is in the sales-rep namespace.

## Provenance
**Pre-existing — NOT introduced by PR #2408 (VCST-5586).** Found incidentally while verifying that ticket's own new `*_load_failed` strings, which localize correctly (`"Laden fehlgeschlagen"`). These are account/loyalty/navigation keys that PR #2408 does not own. Filed separately so the finding is not lost with the run that surfaced it.

## Fix Routing
`vc-frontend` — locale files for the affected modules (`purchase-requests`, `back-in-stock`, `sales-rep` navigation entries) in `de.json`, plus a check of the other 12 locales for the same gap. Worth adding a CI guard: a key present in `en.json` but absent from a sibling locale should fail rather than fall through to the raw key.
