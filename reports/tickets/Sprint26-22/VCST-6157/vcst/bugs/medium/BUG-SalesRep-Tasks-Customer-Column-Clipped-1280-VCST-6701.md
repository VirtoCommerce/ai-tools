# BUG: Sales Rep Hub Tasks — the new Customer column clips customer names to two short lines at 1280 px

## Status: READY_TO_SUBMIT
**Found by:** agent — testing VCST-6157
**Severity:** Medium (the visual lane graded it High; graded Medium here because the full name stays reachable through a tooltip and the accessible name, and names of about 18 characters or fewer fit)
**Tracker:** VCST-6701 · **Related:** VCST-6157 (vc-module-sales-rep#33, open)

## Env
- Stand `vcst`, store B2B-store, Edge (playwright-edge), sales rep account (`SALES_REP_EMAIL`)
- Platform 3.1094.0 · Theme 2.62.0-pr-2622-caac · VirtoCommerce.SalesRep 3.1018.0-pr-33-04e4 (PR #33 head 04e4def, verified live) · VirtoCommerce.TaskManagement 3.1007.0-pr-33-14ff
- Repro rate: deterministic (4 viewports + the earlier visual-lane run)
- Trace id: none — the stand sends neither Request-Id nor traceparent. HAR: the lane records none into the package. App Insights: N/A, no server-side failure.

## Summary
On /company/tasks at a 1280 px viewport, the Customer column added by VCST-6157 gets about 64 px of text width, so a customer name is cut after two short lines with an ellipsis. Customers whose names share a prefix look identical, so a rep cannot tell which customer a task belongs to without hovering. The column has no width of its own: the fixed-layout table splits the remaining space equally between Task, Customer and Notes, and the cell is clamped to two lines.

## Steps to reproduce
1. Sign in to the storefront as a sales rep serving at least one customer with a long name (about 25+ characters); viewport 1280×900.
2. Have a task linked to that customer due today, and open /company/tasks (opens on "Due today").
3. Read the Customer column.
4. Repeat at 1366, 1440 and 1920 px.

## Actual
- 1280 px: Customer header 95.7 px, text area 63.7 px; a 32-character name needs 7 lines and shows 2, ending in "…". Both test customers read "AGENT-TEST-…".
- 1366 px: 92.3 px text, clipped. 1440 px: 117 px, clipped. 1920 px: 131.3 px, the table stops growing at about 842 px, still clipped for the longer name.
- Wrapping breaks mid-token ("AGENT- / TEST- / Org- / AcmeW…").
- The span has a `title` with the full name (mouse-only; touch users never see it); the accessible name is the full name.

![1280 px — both customers read "AGENT-TEST-…"](../screenshots/SalesRep-Tasks-Customer-Column-Clipped-1280/vis1-tasks-1280-today.png)
![1440 px — still clipped](../screenshots/SalesRep-Tasks-Customer-Column-Clipped-1280/vis1-tasks-1440.png)

## Expected
The customer a task belongs to is readable in the list at common desktop widths. The ticket's design frame shows a long customer name wrapping onto two lines in full. AC-1/AC-5 ask for a customer field "so I can find tasks for a specific customer".

## Layer Validation
| Layer | Result | Evidence |
|---|---|---|
| 1. Storefront Frontend | FAIL | `investigations/VIS-1/screenshots/vis1-tasks-1280-today.png`, `…/dom-tasks-1280-today.txt` |
| 2. Backend Admin | N/A — not probed by the investigation | — |
| 3. GraphQL xAPI | PASS — `SalesRepTasks` returns 200 with the full `customerName` | `investigations/VIS-1/network/failing-SalesRepTasks.json` |
| 4. Platform REST API | N/A — not probed by the investigation | — |

**Owning layer:** Layer 1 — the Sales Rep storefront plugin.

## Root Cause Analysis
- `sales-rep-task-list.vue`: the Customer `VcTableColumn` has no width class (only Priority, Status and Actions are sized); `.vc-table__desktop` is `table-fixed`, so Task, Customer and Notes split the remainder equally — 95.7 = (639 − 112 − 144 − 96) / 3.
- `&__customer` is `line-clamp-2` with `word-break: break-word`.
- Not by design as far as recorded: ticket comment F2 (2 Nov) accepts a narrow **Task** column at 1280 px "by decision" (full title in the tooltip and the edit popup) and does not mention the Customer column. **A product decision is open:** does F2's reasoning extend to the Customer column?
- Test org names (`AGENT-TEST-Org-…`) are long by convention; real names of about 18 characters or fewer should fit two lines at 1280 px (estimate, not measured with a real name).
- Package: `reports/tickets/Sprint26-22/VCST-6157/vcst/investigations/VIS-1/` (`root-cause.md`, `evidence-index.md`). Its `source/findings.md` is absent (the investigator's write was refused); the source facts above are from its report.

## Regression
N/A — the column is new in PR #33.

## Fix Routing (→ /qa-fix)
- **Owning layer:** Layer 1 — Storefront (module-embedded storefront plugin)
- **Suggested repo:** VirtoCommerce/vc-module-sales-rep (open PR #33, branch `feat/VCST-6157-tasks-by-customer`)
- **repoKind:** module
- **Ownership hint:** platform
- **Component / module:** Sales Rep Hub storefront plugin — Tasks list
- **RCA anchor:** `src/VirtoCommerce.SalesRep.Web/StorefrontApp/src/components/sales-rep-task-list.vue:69` (Customer cell; `__customer` line-clamp; unsized `customer` column)
- **Routing confidence:** MEDIUM — facts measured and read from source; whether it is a defect depends on the product decision about F2
