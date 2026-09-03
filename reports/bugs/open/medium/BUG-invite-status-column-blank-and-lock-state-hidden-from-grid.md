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

## Re-check 2026-08-05 — part 2 is FIXED; part 1 stands

**Env:** vcst-qa @ Platform 3.1055.0 · Customer `3.1021.0-pr-312-**3aa7**` (this report was filed against
`pr-312-2257`) · Theme `2.55.0-pr-2407-81dd`. Evidence: suite `027` `CUST-121`, executed live.

- **§2 (no lock-state column) — FIXED.** Suggested fix (2) landed. The memberships grid now exposes a
  **`Locked state`** column, plus `Is Currently Locked` and `Locked until`, via the column chooser. It is
  **not visible by default** (default set is Organization / Roles / Invite status) and must be enabled;
  once enabled it renders `Unlocked`/`Locked` and tracks the persisted `isLocked` flag across a
  lock→unlock cycle without reopening the blade. If "must enable a column" is considered to satisfy the
  original ask, §2 can be closed; if the ask was *visible by default*, it is narrowed rather than fixed.
  `CUST-121` now asserts the current behaviour, so a change here needs that case updated too.
- **§1 (blank Invite-status cell) — STILL OPEN, and worth stating precisely** because a nearby
  observation is by design and the two are easy to conflate. On the **detail blade** the Status *control*
  renders the `status-inherited` placeholder ("Inherit from member") for a null override — that is
  correct by design, since `labels.status` names the per-org **override**, which is genuinely null. What
  this report describes is the **grid column**, which renders **empty** rather than either the placeholder
  or the resolved effective status. The storefront does fall back — `getDisplayStatus = isLocked ?
  "Locked" : (statusInOrganization ?? status)` (VCST-5281 comment 104736) — so the inconsistency with the
  storefront that this report identifies is real.

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
