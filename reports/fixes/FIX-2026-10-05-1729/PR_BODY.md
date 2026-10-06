## Description
On the account Orders page, two **Created date** filter presets returned a wrong range at the start or end of a month:
- **Last week** selected a week in the future, and showed an empty list, whenever the current week had started in the previous month. For example, on Oct 2, 2026 it applied Oct 20 – Oct 27 instead of Sep 21 – Sep 28. It now always selects the previous calendar week (Monday to Monday).
- **Last month** collapsed to an empty range on the 29th–31st whenever the previous month is shorter. For example, on Oct 31, 2026 it applied Oct 1 – Oct 1 instead of Sep 1 – Oct 1. It now always selects the previous calendar month.

Root cause, both in `getDateFilterRanges()`: the Last week bounds kept today's month and year and took only the day number from the week start; the Last month start moved the month back before resetting the day to the 1st, so a day number missing from the previous month rolled forward into the current one.

No new props / events / slots · no new GraphQL fields · no new settings · no new dependencies.

## Breaking changes
- Component contract (props / events / slots): None.
- GraphQL operations the client sends (fields, variables): None.
- Settings (`$cfg` keys, theme settings): None.
- Runtime behaviour: on the days when the current week began in the previous month (up to 6 days each month, including the first days of January), "Last week" returned a future range; it now returns the previous calendar week. On the 29th–31st after a shorter month, "Last month" returned an empty range; it now returns the previous calendar month. Both ranges are unchanged on every other day.

## New dependencies
None.

> **Note** — Two commits, one per preset. Last week: both bounds are now copied from the start of the current week, so month and year roll over correctly. Last month: `setDate(1)` now runs before `setMonth(...)`, so the month never overflows. "Last day" and "Last year" are not touched.

<details><summary>Auto-fix evidence (red → green)</summary>

- Reproduction: `client-app/shared/account/composables/useUserOrdersFilter.test.ts` (vitest), with the system time fixed:
  - Last week: a cross-month date (Oct 2, 2026 → Sep 21 – Sep 28), a cross-year date (Jan 2, 2027 → Dec 21 – Dec 28, 2026), and a same-month control date.
  - Last month: Mar 31, 2027 → Feb 1 – Mar 1; Oct 31, 2026 → Sep 1 – Oct 1; plus control dates (Oct 5, 2026 and Jan 31, 2027 → Dec 1, 2026 – Jan 1, 2027).
  - The four boundary cases fail on the base commit and pass with this fix, in the UTC, America/New_York and Pacific/Auckland time zones.
- Local checks:
  - vue-tsc --build --force — pass
  - lint — 0 errors on the changed files (one pre-existing warning on an untouched line)
  - vitest (new + affected) — 7/7 pass
  - build — not run (three lines in one composable; no types, imports or shared code changed)

</details>

## References
### Jira-link:
https://virtocommerce.atlassian.net/browse/VCST-6173
### Artifact URL:
https://vc3prerelease.blob.core.windows.net/packages/vc-theme-b2b-vue-2.59.0-pr-2540-710a-710ab0fa.zip
> 🤖 Opened by `/vc-fix:qa-fix`. **Human review required before merge — do not auto-merge.**

🤖 Generated with [Claude Code](https://claude.com/claude-code)
