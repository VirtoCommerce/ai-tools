# `/company/members`: the members table sticks out of its card and the whole page scrolls sideways at 1024–1106 px `[Medium]`

## Status: READY_TO_SUBMIT
**Found by:** agent — testing VCST-6232
**Severity:** Medium (P2) · **Oracle:** BL-UI-004 · **Provenance:** pre-existing, NOT caused by VCST-6232 (same on base and PR)
**Tracker:** VCST-6652

**Env:** vcst · theme `2.62.0-pr-2600-a4f2-a4f29534` (classic, preset red) · platform `3.1093.0-pr-3154-4607` · also on base build `4ce61d0c` (localhost:3001, same backend: scrollWidth 1107) · Firefox (this repro), Edge (VCST-6232 visual lane)

## Summary
At a 1024 px wide window the Company members table is 854 px wide but its card is only 738 px wide. The table does not shrink and does not scroll inside the card, so it hangs out past the card's right border and the whole page gets a horizontal scrollbar (page width 1107 px in a 1024 px window). The Active column is cut in half and the row "…" actions button is off screen. BL-UI-004 ("content boundary") says content must stay inside its container at every tested width and the document must never scroll sideways, unless the scrolling element is a deliberate horizontal scroller such as a data table that scrolls inside itself.

## Steps to Reproduce
1. Sign in as an organization maintainer (`ORG_USER_EMAIL`) whose organization has at least one member with a long name (on vcst: the `AGENT-TEST-msne2e-…` members, about 288 px of text).
2. Set the window to 1024×768 and open `/company/members`.
3. Look at the right edge of the table, or scroll the page sideways.

## Expected
The table fits its card: long names are cut with "…" (the cell already has `truncate` and a `title` tooltip), or the table scrolls horizontally inside the card. The page itself never scrolls sideways.

## Actual
- `document.documentElement.scrollWidth` = **1107** at a 1024 px window.
- Overflowing element: `table.vc-table__desktop`, 854 px wide, right edge at 1107 px, inside `div.vc-scrollbar.vc-table__scrollbar` (left 253, right 991, `overflow-x: visible`).
- Column widths: Name 320 · Roles 182 · Email 208 · Active 73 · actions 72.
- The **Name** column causes it: its cell is `w-40 truncate` (160 px, `white-space: nowrap`, ellipsis). The table uses automatic layout, where a no-wrap cell can never be narrower than its whole text, so `w-40` is ignored and the column grows to the longest name (288 px text + 32 px padding = 320). The Email cell stays at 208 px only because it also has `max-w-52`.

![Members table cut at the right edge, 1024 px](../screenshots/Company-Members-Table-Overflows-At-1024/BUG-company-members-table-overflow-1024.png)

**Breakpoint range:** the desktop table is used from 1024 px up (`mobile-breakpoint="lg"`), and its left edge is fixed by the account sidebar (x = 253), so its right edge is always at 1107 px.
| Width | Result |
|---|---|
| 768, 1023 | PASS: card layout, page width = window |
| 1024, 1100 | **FAIL**: page width 1107 |
| 1120 | table still sticks out of the card (container 834 px) but not out of the window |
| 1280 | PASS: container 954 px, table fits |

So the page scrolls from 1024 to about 1106 px, and the table spills past its card up to about 1140 px. With short names only (e.g. "Emily Johnson") the table fits.

**Not the same cause on the home page.** The home page also scrolls at 1024 px (1105), but that is Builder.io page content (`builder-content-id 8e4366c6…`, the 5-card category row: 5 × 205 px + 4 × 20 px gap with `flex-wrap: nowrap` above 991 px). It is fixed in the Builder.io page, not in vc-frontend code, so it is out of this report's fix routing.

## Layer Validation
| Layer | Result | Evidence |
|---|---|---|
| 1. Storefront Frontend | **FAIL** | screenshot above; measurements in Actual |
| 2. Backend Admin | N/A | pure CSS layout; Admin does not render this page |
| 3. GraphQL xAPI | N/A | the member list data is correct; only its rendering width is wrong |
| 4. Platform REST API | N/A | no data defect; the symptom is CSS sizing |

**Owning layer:** Layer 1 — Storefront.

## Root Cause Analysis
`VirtoCommerce/vc-frontend` @ `dev` (`11a967d0`), `client-app/pages/company/members.vue`:
- **:235–246** renders `<VcTable … mobile-breakpoint="lg">` **without the `scrollable` prop**. VcTable only turns on horizontal scrolling in its wrapper (`<VcScrollbar :horizontal="scrollable">`, `client-app/ui-kit/components/organisms/table/vc-table.vue:49–57`) when `scrollable` is set, so a too-wide table spills out.
- **:249** `<td class="w-40 truncate px-4 py-2.5" :title="contact.fullName">`: the Name cell has a width but no `max-width`, so in the auto-layout table it grows to the full name. The Email cell on :257 (`w-1/4 max-w-52 truncate`) shows the pattern that works.

Likely minimal fix (developer's call): add a `max-w-*` to the Name cell (as on Email), or pass `scrollable` to this VcTable. Both are template-only changes.

## Fix Routing (→ /qa-fix)
- **Owning layer:** Layer 1 — Storefront
- **Suggested repo:** VirtoCommerce/vc-frontend
- **repoKind:** frontend
- **Ownership hint:** platform
- **Component / module:** vc-frontend, Company members page (`pages/company/members.vue`) on top of the ui-kit VcTable
- **RCA anchor:** `client-app/pages/company/members.vue:249` (Name `<td class="w-40 truncate …">` has no max-width) and `:235` (VcTable without `scrollable`)
- **Routing confidence:** HIGH
