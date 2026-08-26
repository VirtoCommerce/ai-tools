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

## Resolution
- **Fixed in:** `vc-frontend` — `client-app/modules/sales-rep/locales/de.json`, `sales_rep.customer_profile.stats.per_order`. Tracker **VCST-5684 → Done** (2026-08-18).
- **Verified:** 2026-08-26, backlog triage — **source axis** (`vc-frontend@dev`). The German subtitle now reads exactly the wording this draft proposed:

  ```
  was:  "Durchschnitt pro Bestellung (YTD)"
  now:  "Durchschnitt pro Bestellung (seit Jahresbeginn)"
  ```

- **The 12-locale sweep this draft recommended was done.** A scan for a bare `YTD`/`MTD` token across all 13 locale files returns a hit in **`en.json` only** — which is correct, since those are English acronyms:

  | Locale | `per_order` subtitle |
  |---|---|
  | de | Durchschnitt pro Bestellung (seit Jahresbeginn) |
  | fr | Moyenne par commande (année en cours) |
  | es | Promedio por pedido (año en curso) |
  | it | Media per ordine (anno in corso) |
  | pt | Média por pedido (ano atual) |
  | pl | Średnio na zamówienie (od początku roku) |
  | ru | Среднее за заказ (за год) |
  | fi | Keskim. per tilaus (tänä vuonna) |
  | no | Gjennomsnitt per ordre (hittil i år) |
  | sv | Genomsnitt per order (hittills) |
  | ja | 平均注文単価 (今年度) |
  | zh | 平均每笔订单 (今年迄今) |

- **`mtd_of_ytd` was fixed too** — the sibling this draft named as rendering `"% of YTD"` in the same widget family now reads `"{percent}% des Jahres"` in German, and the dashboard widget labels lost their acronyms as well (`orders_placed_ytd` → `"Bestellungen seit Jahresbeginn"`, `purchased_mtd` → `"Umsatz seit Monatsbeginn"`).
- **Not re-checked live** — same reasoning as the sibling pluralization draft: the defect and the fix are both the locale string itself. Draft env was **vcptcore-qa**.
