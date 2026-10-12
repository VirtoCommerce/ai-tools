# Order-history "Last week" preset selects a week in the future during the first days of a month `[Medium]`

**Jira:** [VCST-6173](https://virtocommerce.atlassian.net/browse/VCST-6173) (relates to regression task VCST-6036)
**Env:** vcst-qa @ Platform 3.1076.0, Theme 2.59.0-pr-2524-3069 (first seen REG-2026-07-14-0018, Theme 2.53.0-pr-2368)
**Ref:** REG-2026-10-02-2022 / ORD-064

## Summary
On `/account/orders` → Filters → Created date, the **Last week** preset applies a week in the future (and an empty
list) whenever the current week started in the previous month. On Oct 1–4, 2026 it applied Oct 20 – Oct 27.

## Not a bug (confirmed with the product owner 2026-10-05)
The presets are **previous calendar periods**, not trailing windows ending now: Last month = the previous full month,
Last year = the previous full year, Last week = the previous week. The original July version of this draft (and cases
ORD-063/065/066) assumed a trailing window — that expectation is wrong; the cases need rewriting.

## STR
1. On a day when the current week started in the previous month (e.g. Oct 1–4), sign in and open `{{FRONT_URL}}/account/orders`.
2. Filters → Created date → **Last week** → Apply.

## Expected vs Actual
- **Expected:** the previous week (on Oct 2, 2026: Sep 21 – Sep 28).
- **Actual:** Oct 20 – Oct 27, 2026 (future) → "There are no results found". On Oct 5 the same preset is correct (Sep 27 – Oct 4).

![Last week = Oct 20–27 on Oct 2](../../../regression/REG-2026-10-02-2022/screenshots/ORD-064-FAIL-last-week-bounds-in-future.png)

## Cause
`vc-frontend` `client-app/shared/account/composables/useUserOrdersFilter.ts` `getDateFilterRanges()`:
`new Date(currentDate).setDate(firstDayOfWeek.getDate() - 7)` — month taken from today, day number from the week start.

## Same ticket — "Last month" on the 29th–31st
"Last month" after a shorter month: `setMonth(m - 1)` overflows before `setDate(1)` (Oct 31 → "Sep 31" → Oct 1 → Oct 1 – Oct 1,
empty). Reproduced by unit test, not yet observed live (next boundary day Oct 31, 2026). Added to VCST-6173's description and fixed in
the same PR (vc-frontend #2540).

## Fix Routing
- **Repo:** vc-frontend · **Kind:** frontend
