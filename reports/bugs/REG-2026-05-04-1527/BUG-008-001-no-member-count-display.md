# BUG-008-001: Company Members page lacks member count display

**Severity:** Low (UX feature gap)
**Priority:** Medium
**Test Case:** B2C-MBR-018 — Company Members Count Display
**Suite:** 008 (B2C Members)
**Run:** REG-2026-05-04-1527
**Confirmed:** false (preliminary)
**Business Rule:** BL-B2C-004
**Browser:** playwright-chrome (Chromium)
**Environment:** https://vcst-qa-storefront.govirto.com (QA)
**Date:** 2026-05-05
**Reporter:** qa-frontend-expert (test-runner)
**Login:** test-john.mitchell-20260310@test-agent.com (TechFlow Org maintainer)

## Summary
The Company Members page (`/company/members`) does not display a member count anywhere on the page. Users cannot see at a glance how many members belong to their organization without manually counting visible rows.

## Steps to Reproduce
1. Sign in as an Org admin (Organization maintainer) — e.g., `test-john.mitchell-20260310@test-agent.com`
2. Navigate to `/company/members`
3. Inspect the page header, body, and footer for a member count indicator

## Expected
- A member count is displayed (e.g., "Members (5)" in heading or "Showing 5 of 5 members" near table)
- Per assertion `[DOM] Member count shown on page (header or footer)`
- Per assertion `[MATH] Displayed count matches number of members in list`

## Actual
- Page heading shows only "Company members" without any count
- No count indicator in header, table caption, footer, or near search/filter controls
- Member count is only inferable by manually counting visible rows (5 rows: Emily Johnson, David Kim, John Mitchell, 1 invited member, 1 invite-sent)
- Table caption is just "Company members"

## Evidence
- Screenshot: `reports/regression/REG-2026-05-04-1527/008-evidence/B2C-MBR-018-no-member-count.png`
- DOM check: `document.body.textContent.match(/(\d+)\s*members?/i)` returns `null`
- Heading regions: `["Company members"]` — no count substring

## Console Errors
None.

## Network Errors
None — page loads cleanly.

## Impact
Low — functional behavior is correct. Affects discoverability/UX. Org admins managing growing teams cannot quickly verify total membership count, especially relevant when pagination is involved (>10 members).

## Recommendation
Add member count to:
- Page heading: "Company members (5)" or
- Subtitle/banner near top of table: "Showing X of Y members" (also useful when pagination is added)
- This pairs naturally with the missing pagination feature noted in B2C-MBR-003

## Related
- B2C-MBR-003 (pagination) — both share need for total-count visibility
- BL-B2C-004 (member management UX)
