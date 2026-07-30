# BUG — Admin "Organization memberships" widget: Invite-status column blank on null status, and grid has no lock-state column · Medium

**Env:** vcst-qa @ Platform 3.1051.0 · Customer 3.1021.0-pr-312-2257 · ProfileExperienceApi 3.1015.0-pr-141-d7d8
**Found by:** `/qa-regression` REG-2026-07-30-1040, suite 027 (CUST-085) + suite 011b (COMP-E2E-023) · triaged `REAL_BUG`
**BL:** BL-B2B-005, BL-B2B-009

Two defects on the same Admin SPA contact-blade "Organization memberships" widget/blade, filed together
because both are missing-column presentation gaps on the same grid.

## 1. Invite-status column renders blank instead of falling back through `contact.Status` (CUST-085)

**Steps:** open a contact blade for a member with two org memberships whose `OrganizationMembership.Status`
is `null` (contact-level status is `Approved`); open the "Organization memberships" widget.

**Expected:** the third column (labelled "Invite status") shows `Approved`, resolved via
`ResolveEffectiveStatus(membership.Status, contact.Status)` the same way the storefront does.

**Actual:** both status cells render **no text at all**. A control contact whose membership *has* an
explicit status (`Invited`) renders it correctly — proving the column reads `membership.Status` verbatim
and blanks on `null` instead of falling back to `contact.Status`.

![Invite-status cells blank](../../regression/REG-2026-07-30-1040/screenshots/CUST-085-FAIL-invite-status-column-blank.png)

## 2. Lock state is invisible on the memberships grid, only in the detail blade (COMP-E2E-023)

**Steps:** open the "Organization memberships" blade (list of an account's org memberships), lock one
membership via the detail blade, return to the list.

**Expected:** a Status/lock-state column on the list updates to reflect the lock.

**Actual:** the list's third column is "Invite status" (same defect as above — blank both before and after
locking), and there is **no separate lock-state column** at all. Lock/unlock mechanics themselves work
correctly (`isLocked`/`isCurrentlyLocked` flip via API, cross-org isolation holds, global account untouched
— BL-AUTH-012) — only the list-level visibility is missing; an operator scanning the grid cannot see which
membership is locked without opening each row's detail blade.

## Impact

Cosmetic/discoverability only — no data or authorization impact. An operator cannot tell invite or lock
state from the grid at a glance and must open each row.

## Fix Routing

- **Layer:** L2 Backend Admin (AngularJS blade/widget)
- **Repo:** `vc-module-customer` (Admin SPA "Organization memberships" widget + blade)
- **Suggested fix:** (1) have the Invite-status column apply the same `ResolveEffectiveStatus` fallback the
  storefront uses instead of rendering `membership.Status` verbatim; (2) add a lock-state indicator to the
  list column set, sourced from `isCurrentlyLocked`.
- Do NOT auto-merge — human review required.
