# Price-range filter chip omits the currency symbol on both bounds — P3

**Env:** vcst-qa @ Platform 3.1043.0, Theme 2.53.0-pr-2368

## Summary
Applying a price-range filter renders the active-filter chip as `price: 100 - 300` with no currency symbol on either bound. All other chip behaviors (label, remove, clear-all) work.

## STR
1. Open a category/search results page with a price facet.
2. Set a price range (e.g. 100–300) and apply.
3. Read the active-filter chip.

## Expected vs Actual
- **Expected:** Chip shows the currency symbol on both bounds, e.g. `price: $100 - $300`.
- **Actual:** Chip shows `price: 100 - 300` — no currency symbol on either bound.

## Evidence
![Price chip no currency](screenshots/CAT-032-FAIL-price-chip-no-currency.png)

## Fix Routing
- **Repo:** vc-frontend (facet chip label formatting)
- **Kind:** frontend
