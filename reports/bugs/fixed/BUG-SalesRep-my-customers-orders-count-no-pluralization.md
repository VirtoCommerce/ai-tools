# BUG: My Customers table renders "1 orders" — the locale string has no plural forms

## Status: CONFIRMED — filed as [VCST-5683](https://virtocommerce.atlassian.net/browse/VCST-5683)

**Severity: Low** (copy/i18n polish; no functional impact).

**Env:** vcptcore-qa @ Theme 2.55.0-pr-2408-0cc5 · store `B2B-store`

## Summary
In the Sales-Rep **My Customers** table, the order-count sub-line under `YTD purchases` reads `"1 orders"` for a customer with exactly one order. The message `sales_rep.my_customers.table.orders_count` is defined as a single form, `"{count} orders"`, with no plural branch, so vue-i18n has no singular to select.

## Steps to Reproduce
1. Sign in as a Sales Rep serving a customer with exactly **one** order (`@td(SR_REP_PRIMARY)` — AcmeWest and BuildRight both qualify).
2. Open `{{FRONT_URL}}/company/my-customers`.
3. Read the sub-line under the `YTD purchases` column for those rows.

**Expected:** `"1 order"` for one, `"2 orders"` for many.
**Actual:** `"1 orders"`.

Evidence: `reports/tickets/Sprint26-15/VCST-5586/screenshots/SR-FE-052-partial-table-max-count-6.png`.

## Root cause
`client-app/modules/sales-rep/locales/en.json` — `"orders_count": "{count} orders"` carries no `|`-separated plural forms. Confirmed byte-identical on `dev` and on the `feat/VCST-5586-stat-widget-empty-values` branch (line 31 in both), so the message has never had them.

Note that the **call site is already correct**: PR #2408 changed it to pass vue-i18n's plural-choice index —
`t("sales_rep.my_customers.table.orders_count", { count: formatStatCount(item.ytdCount) }, item.ytdCount)` —
where previously no choice index was passed at all. The plumbing is in place; only the message lacks forms. Applies to all 13 locale files, several of which need more than two plural categories (e.g. `ru.json`).

## Provenance
**Pre-existing — NOT introduced by PR #2408 (VCST-5586).** Verified against the diff: that PR added the plural-choice argument and did not touch the message text. Filed separately because it is a real user-visible copy defect that would otherwise be lost with the run that surfaced it.

## Fix Routing
`vc-frontend` — `client-app/modules/sales-rep/locales/*.json`, key `sales_rep.my_customers.table.orders_count` (and a sweep for sibling `{count} …` messages with the same shape, e.g. `new_customers`, `placed_today`, `new_this_week`). No component change needed.

## Resolution
- **Fixed in:** `vc-frontend` — `client-app/modules/sales-rep/locales/*.json`, key `sales_rep.my_customers.table.orders_count`. Tracker **VCST-5683 → Done** (2026-08-20).
- **Verified:** 2026-08-26, backlog triage — **source axis** (`vc-frontend@dev`), the same axis that established the defect (the draft's root cause was "the message carries no `|`-separated plural forms", confirmed byte-identical on `dev` and the feature branch).
- **All 13 locale files now carry plural forms**, with per-language form counts that match each language's actual plural rules — not a blanket 2-form copy-paste:

  | Forms | Locales | Correct for the language? |
  |---:|---|---|
  | 1 | `ja`, `zh` | ✅ no grammatical plural |
  | 2 | `de`, `en`, `es`, `fi`, `it`, `no`, `sv` | ✅ singular/plural |
  | 3 | `fr`, `pt` | ✅ vue-i18n zero/one/many |
  | 4 | `pl`, `ru` | ✅ Slavic zero/one/few/many |

  `en` reads `"{count} order \| {count} orders"`; `ru` reads `"{count} заказов \| {count} заказ \| {count} заказа \| {count} заказов"` — the multi-category case this draft called out specifically.
- **The sibling sweep this draft asked for was done too:** `new_customers` and `items_this_week` now carry plural forms in `en.json` alongside `orders_count`.
- **Not re-checked live.** The defect was a locale-string shape, the fix is in that same string, and the call site was already passing the plural-choice index (PR #2408) — so source is the authoritative axis here. A live check would add confidence about the deployed bundle but cannot change the source verdict. The draft's env was **vcptcore-qa**, not the vcst-qa env used elsewhere in this triage pass.
