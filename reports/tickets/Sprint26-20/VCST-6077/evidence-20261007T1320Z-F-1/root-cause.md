# F-1 — root-cause worksheet

**Verdict:** REPRODUCED on NEW and on BASELINE → **PRE-EXISTING**. PR #2536 did not cause it; it adds one more consumer (the `sm` Tasks rail) where the same defect shows.

1. **Symptom:** in pt (pt-PT) every VcCalendar weekday header overflows its fixed cell and runs into its neighbour ("DOMINGOSEGUNDATERÇA…").
2. **Lowest failing layer (proven):** storefront UI kit, `client-app/ui-kit/components/molecules/calendar/vc-calendar.vue` (vc-frontend). The labels are reka-ui `weekDays`, formatted with `weekdayFormat: "short"` (default, L212) → `Intl.DateTimeFormat(locale, {weekday: "short"})`. CLDR pt-PT "short" weekdays are full words (Node check in the index). `.vc-calendar__weekday` is bold + uppercase + `tracking-wider` inside a fixed `--cell-size` (2.5rem md / 2rem sm) with no overflow handling.
3. **Why not PR #2536:** its vc-calendar.vue hunk only tokenises padding / border-width and adds `justify-content: center` on the grid; `--cell-size` and `--weekday-text` are unchanged, and the 2.59.0 baseline gives identical numbers (md: domingo 53/40 …) on the old Calendar page, the dashboard widget and the customer-orders picker.
4. **Alternatives ruled out:** by-design — no, labels visibly collide (screenshots); data drift — n/a (static CLDR/Intl data); environment — same on two builds against one backend.
5. **Fix direction (not prescribed):** `weekdayFormat: "narrow"` (at least for sm/xs), a 2–3 char abbreviation, or clipping/truncation for the weekday cell.
6. **Owning layer / repo:** vc-frontend (`repoKind: frontend`), ui-kit VcCalendar. **Confidence:** HIGH.
