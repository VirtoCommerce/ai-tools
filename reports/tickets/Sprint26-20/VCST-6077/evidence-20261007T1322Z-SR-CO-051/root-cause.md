## Root-Cause Worksheet — VCST-6077 SR-CO-051

1. **Symptom:** (a) picking a day returns focus to the date input rather than to the Open calendar button. (b) Activating the chip-row Reset filters by keyboard drops focus to BODY.
2. **Layer:** vc-frontend: the sales-rep customer-orders filter chip row (`customer-orders.vue`) and the ui-kit date range picker.
3. **Evidence:** NEW and BASELINE are identical (see the table). KB-21C241D2 records the same result on the pr-2519 and pr-2536 builds.
4. **Why (b):** the Reset filters button sits inside the chip row, which unmounts when the chips are cleared, and focus is not moved to an element that survives. (a) is how the picker is designed: focus goes back to the field. That is not a defect by itself.
5. **Alternatives ruled out:** *Caused by PR 2536*: no. That PR changes only the VcCalendar padding and border tokens, this page is untouched, and the baseline gives the same result. *Flaky*: no. It is deterministic and matches two earlier KB observations.
6. **Regression:** it came in with PR #2519 (VCST-6001), which is already deployed in the baseline.
7. **Confidence:** HIGH for the behaviour. MEDIUM for the unmount mechanism, which was not traced in source.
8. **Fix routing:** vc-frontend (`frontend`), `client-app/modules/sales-rep/pages/customer-orders.vue`: after a reset, move focus to Filters or to the search box. **Provenance: PRE-EXISTING / OUT-OF-SCOPE** for 6077; it belongs to VCST-6001. For (a), the case's expectation should accept the Start date input.
