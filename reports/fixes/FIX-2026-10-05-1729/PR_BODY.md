## Description
On the account Orders page, the **Created date** filter presets returned wrong ranges:
- **Last week** selected a week in the future, and showed an empty list, whenever the current week had started in the previous month. For example, on Oct 2, 2026 it applied Oct 20 – Oct 27 instead of Sep 21 – Sep 28. It now always selects the previous calendar week (Monday to Monday).
- **Last month** collapsed to an empty range on the 29th–31st whenever the previous month is shorter. For example, on Oct 31, 2026 it applied Oct 1 – Oct 1 instead of Sep 1 – Oct 1. It now always selects the previous calendar month.
- **All presets** were applied one day early in any browser east of UTC. For example, at UTC+3 "Last week" ran Sunday to Sunday and "Last month" started on the last day of the month before. They now use the user's local calendar days, as the custom date range already did.

Root cause, both in `getDateFilterRanges()`: the Last week bounds kept today's month and year and took only the day number from the week start; the Last month start moved the month back before resetting the day to the 1st, so a day number missing from the previous month rolled forward into the current one; and the presets were emitted as UTC timestamps of local midnight and then cut to the UTC date, which east of UTC is the previous day.

No new props / events / slots · no new GraphQL fields · no new settings · no new dependencies.

## Breaking changes
- Component contract (props / events / slots): None.
- GraphQL operations the client sends (fields, variables): None.
- Settings (`$cfg` keys, theme settings): None.
- Runtime behaviour: on the days when the current week began in the previous month (up to 6 days each month, including the first days of January), "Last week" returned a future range; it now returns the previous calendar week. On the 29th–31st after a shorter month, "Last month" returned an empty range; it now returns the previous calendar month. Both ranges are unchanged on every other day. East of UTC, every preset (Last day, Last week, Last month, Last year) now starts and ends one day later than before, on the user's local calendar days; west of UTC and in UTC nothing changes. The preset values handed to the date-filter control are now date-only strings (YYYY-MM-DD), the same format the custom range uses.

## New dependencies
None.

> **Note** — Three commits. Last week: both bounds are now copied from the start of the current week, so month and year roll over correctly. Last month: `setDate(1)` now runs before `setMonth(...)`, so the month never overflows. Time zone: the presets are emitted with the existing `toLocalDateOnly()` instead of `toISOString()` — the pattern the returns and sales-rep filters already use — so the rest of the pipeline, which reads date-only values as local midnight, gets the intended days.

<details><summary>Auto-fix evidence (red → green)</summary>

- Reproduction: `client-app/shared/account/composables/useUserOrdersFilter.test.ts` (vitest), with the system time fixed:
  - Last week: a cross-month date (Oct 2, 2026 → Sep 21 – Sep 28), a cross-year date (Jan 2, 2027 → Dec 21 – Dec 28, 2026), and a same-month control date.
  - Last month: Mar 31, 2027 → Feb 1 – Mar 1; Oct 31, 2026 → Sep 1 – Oct 1; plus control dates (Oct 5, 2026 and Jan 31, 2027 → Dec 1, 2026 – Jan 1, 2027).
  - Time zone: with `TZ=Europe/Kyiv`, applying Last week (Oct 2, 2026) and Last month (Oct 31, 2026) stores Sep 21 – Sep 28 and Sep 1 – Oct 1; before the fix, Sep 20 – Sep 27 and Aug 31 – Sep 30.
  - The boundary and time-zone cases fail on the base commit and pass with this fix; the spec passes in UTC+3, UTC, America/New_York and Pacific/Auckland. The existing date-utility, date-filter-select and orders-filter specs (45 tests) pass unmodified in four time zones.
  - Checked live on a QA environment with the second commit's build: Last week and Last month fixed (3/3 each); the one-day shift east of UTC found there is what the third commit fixes.
- Local checks:
  - vue-tsc --build --force — pass
  - lint — 0 errors on the changed files (one pre-existing warning on an untouched line)
  - vitest (new + affected) — 9/9 new, 45/45 existing
  - build — not run (one composable; no types or shared code changed)

</details>

## References
### Jira-link:
https://virtocommerce.atlassian.net/browse/VCST-6173
### Artifact URL:
https://vc3prerelease.blob.core.windows.net/packages/vc-theme-b2b-vue-2.59.0-pr-2540-710a-710ab0fa.zip
> 🤖 Opened by `/vc-fix:qa-fix`. **Human review required before merge — do not auto-merge.**

🤖 Generated with [Claude Code](https://claude.com/claude-code)
