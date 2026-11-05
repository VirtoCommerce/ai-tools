# Triage — VCST-4857 (ticket mode) · 2026-11-04 · vcst + local PR #2424 front

Source: `testing-checklist.md` · non-passing 25 (FAIL 21, BLOCKED 4) · real bugs 21 rows / 9 root causes · test-defects 4 · dismissed 0 · `--min-severity P2`: 6 rows below floor (P3).
Investigated live (operator chose the top 4 root causes): 3 REPRODUCED, 1 NOT_REPRODUCED. The other Medium+ root causes are needs-review with their row evidence.
`--fix` does not apply in ticket mode: nothing was written to a suite CSV.

## 1. Confirmed real bugs (reproduced live)

| Rows | Sev | Repo | Root cause | Package |
|---|---|---|---|---|
| C-11, SC-3.3, SC-8.1 | P1 | vc-module-profile-experience-api | `updateMemberAddresses` / `deleteMemberAddresses` call `CheckAuthAsync` with no permission (`ProfileSchema.cs:298`, `:310` @3.1023.0), so an org member without `xapi:my_organization:edit` can add and delete org addresses; `updateOrganization` is gated. Not a regression. VirtoOZ is silent on it, so the PO decides | `investigations/C-11/` |
| C-15, SC-5.2 | P2 | vc-module-profile-experience-api | The duplicate skip is an in-memory check (`MemberAggregateRootBase.cs:51`) between an unlocked read and the save (`UpdateMemberAddressesCommandHandler.cs:31-33`), so concurrent saves store 2 to 10 copies | `investigations/C-15/` |
| SC-4.3 | P2 | vc-frontend | Deleting the selected address removes only the book row. The cart shipment keeps its copy, so checkout shows the deleted address as shipping and billing and Place order is enabled. Same on the old build (pr-2622), so not a regression | `investigations/SC-4.3/` |

## 2. Needs review (Medium+, not reproduced or not investigated)

| Row | Sev | Why it is here |
|---|---|---|
| SC-12.1 | P2 | NOT_REPRODUCED on Chrome (0/7). Seen 4/4 on Firefox, a lane with click stalls. The selection path is unchanged by the PR. `investigations/SC-12.1/` |
| SC-6.2 | P2 | A stale tab selects a deleted address and the server accepts it (`updateContact`, `addOrUpdateCartShipment`). Not investigated (operator scope) |
| SC-9.1 | P2 | A stale second tab adds a second cart shipment. LOW confidence, PO question. Not investigated |
| SC-12.2 | P2 | Editing the selected address does not update the cart shipment copy. LOW confidence, PO question. Not investigated |
| SC-2.3 | P2 | A multi-address `updateMemberAddresses` stores only the last address (KB-739A7741). API only. Not investigated |
| VIS-2 | P2 | Quote modal mobile row overlay buttons have no accessible name (WCAG 4.1.2). Not investigated |

## 3. Test-case fixes (checklist rows, recommended; the caller owns the checklist)

| Row | Class | Fix |
|---|---|---|
| C-6, C-13 | TEST_STEPS_DEFECT | BLOCKED on "one instance seen", but the route marker cannot tell instances apart (KB-6B6030B5). Re-grade from the clean 20/20 evidence |
| C-7 | TEST_DATA_DEFECT | No address-sensitive product (P4). Needs a region-scoped price list or stock fixture |
| C-8 | TEST_STEPS_DEFECT | A browser check filed as `ac-checks`. Needs a Playwright scenario |

## 4. Below floor (P3: not investigated, not drafted)

VIS-1 (mobile header label after a resize) · VIS-3 (pager jump, BL-UI-003) · SC-4.4, SC-5.3, SC-6.4 (multi-address save, the same cause as SC-2.3) · SC-6.1, SC-6.3 (stale tab list and feedback) · SC-9.3 (non-atomic selection race, scripted) · SC-12.3 (cart modal vs header selection).

No tracker ticket filed, no fix triggered — human decides.
