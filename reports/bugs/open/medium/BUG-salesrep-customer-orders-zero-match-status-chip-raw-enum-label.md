# Sales Rep customer-orders: a zero-match result relabels the active status chip with the raw English enum — Medium

**Env:** vcst-qa @ SalesRep 3.1008.0-pr-19-5e0f, XOrder 3.1011.0, Xapi 3.1020.0, Orders 3.1014.0,
Theme 2.57.0-alpha.2490

**Found by:** suite `097` case `SR-CO-032` in run `REG-2026-09-07-2050`
**Case:** SR-CO-032

## Summary
On the Sales Rep customer-orders list under a non-English culture, the active status-filter chip
renders its correctly localized label while the result set is non-empty and **silently relabels itself
to the raw English machine term the instant the result set becomes empty**. Under `de-DE` the chip
reads **"In Bearbeitung"** with rows present and **"Processing"** with zero rows. Restoring rows
restores the German label, so the label tracks `totalCount` rather than the applied term.

BL-SR-013 requires the localized status label and names a raw enum key surfacing in the UI as its
violation signal.

Root cause is the same facet-lookup mechanism as the already-open
`BUG-salesrep-customer-orders-zero-match-hides-active-status-filter.md`: the chip's display label is
resolved through the response's facet-derived status options, and a zero-match response's
`term_facets` either is empty or omits the applied term, so the lookup misses and the UI falls back
to the raw `term`. **That report documents only the vanishing drawer group and does not mention
localization or the raw enum** — this is a separate, separately user-visible symptom.

## STR
1. Sign in to the storefront as a sales rep (`@td(SR_REP_PRIMARY.email)`).
2. Switch the language to **Deutsch** via the header language switcher.
3. Go to `/de/company/my-customers/@td(ORG_TECHFLOW.platform_id)/orders`
   (observed: `/de/company/my-customers/96f109a7-9010-4691-b6a1-bef25cca3d04/orders`).
4. Open **Filter**, check **In Bearbeitung (1)**, click **Anwenden**.
   → 1 row; the chip reads **`In Bearbeitung`**.
5. Type a no-match term into the order-search box (e.g. `ZZZ-NO-MATCH-97531`) and submit.
   → 0 rows; the chip now reads **`Processing`**.
6. Clear the search and submit.
   → rows return; the chip reads **`In Bearbeitung`** again.
7. Reach zero-match the other way instead: open **Filter**, set **Erstellungsdatum** =
   `01.01.2030` – `31.12.2030`, **Anwenden**.
   → 0 rows; the chip again reads **`Processing`**.

## Expected vs Actual
**Expected:** the chip keeps its `de-DE` label (`In Bearbeitung`) regardless of how many rows the
query returns. The label describes the *applied filter term*, which has not changed, so it cannot
depend on `totalCount`.

**Actual:** the label is `In Bearbeitung` at `totalCount > 0` and the raw English `Processing` at
`totalCount = 0`, via both the search route and the created-date route. The date chips localize
correctly in the same state (`Beginn: 1.1.2030`, `Ende: 31.12.2030`), so only the status label
regresses.

## Evidence
Non-empty state, `de-DE` — chip `In Bearbeitung`:
`reports/regression/REG-2026-09-07-2050/screenshots/SR-CO-032-de-drawer.png`

Zero-match via search, `de-DE` — chip `Processing`:
`reports/regression/REG-2026-09-07-2050/screenshots/SR-CO-032-zeromatch-search-de.png`

Zero-match via created-date range, `de-DE` — chip `Processing`, date chips correctly German:
`reports/regression/REG-2026-09-07-2050/screenshots/SR-CO-032-FAIL-raw-enum-chip-daterange-zeromatch.png`

Wire evidence for the mechanism (`en-US` request, status + zero-match date window). The applied
`status:"Processing"` term is present in the request but absent from the response's facet terms, so
the label lookup has nothing to resolve against:
```
request  filter: status:"Processing" createddate:["2026-09-06T22:00:00.000Z" TO "2026-09-07T21:59:59.999Z"]
response {"totalCount":0,"items":[],
          "term_facets":[{"name":"status","terms":[{"term":"Cancelled","label":"Cancelled","count":2}]}]}
```
A window holding no orders at all returns `term_facets: []`, which produces the same miss.

HTTP 200 throughout; **zero console errors** for the whole session.

## Notes
- **Independent of VCST-5905** in cause but only *observable* since it was fixed: while
  `salesRepCustomerOrders` was throwing `TYPE_LOAD` no chip rendered at all, which is why
  `REG-2026-09-07-1342` recorded SR-CO-032 as BLOCKED rather than failing it.
- **Related, not duplicate:** `BUG-salesrep-customer-orders-zero-match-hides-active-status-filter.md`
  (Medium, open) shares the root cause. A fix that gives the chip a non-facet label source — the
  applied term's own localized label, or an unfiltered facet set — would very likely close both.
- Severity **Medium**: a raw machine term leaks into a localized B2B UI and contradicts a declared
  invariant, but no data is wrong, nothing is blocked, and the state self-corrects as soon as rows
  return.
- Only the **status** chip is affected. Date chips localize correctly in the identical zero-match
  state, which rules out a page-wide i18n failure.
