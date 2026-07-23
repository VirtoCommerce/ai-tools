# VCST-5531 — AC Analysis

**Ticket type:** Review task (no acceptance criteria). Scope derived from PR, not a governing story.
**PR:** VirtoCommerce/vc-module-customer#310 — *fix(customer): prevent false unsaved-changes prompt when switching members during load*
**Step 1b (BA story review):** SKIPPED — no ACs on the ticket. Scope is the 1-line PR diff.

## Change under test
`src/VirtoCommerce.CustomerModule.Web/Scripts/blades/member-detail.js` — `isDirty()`:

```diff
- return !angular.equals(blade.currentEntity, blade.origEntity) && !blade.isNew && blade.hasUpdatePermission();
+ return blade.origEntity && !angular.equals(blade.currentEntity, blade.origEntity) && !blade.isNew && blade.hasUpdatePermission();
```

Adds a `blade.origEntity &&` guard so the dirty-check is a no-op while the member detail is still
loading (`origEntity` unset). Suppresses the false *"This contact has been modified. Do you want to
save changes?"* prompt on close when the user fast-switches / double-clicks a member before
`members.get()` completes. Fully-loaded behaviour unchanged.

## Derived test conditions (verdict spine)

| # | Condition (from PR problem/fix) | Type | Impl verdict (reconciled live) |
|---|---------------------------------|------|--------------|
| C1 | Fast-switching between members before detail load completes shows NO false save-changes prompt | Fix | **SATISFIED** — no false dialog on A→B→C. Sub-second race couldn't be forced at tool cadence; covered by C2 (its double-click superset). |
| C2 | Double-clicking a member in the list shows NO false save-changes prompt | Fix | **SATISFIED** — 6/6 double-click trials clean; network confirms the double `GET /api/members/{id}` (the exact trigger) fired. RED→GREEN proven (RED on 3.1016.0 vcptcore, GREEN on 3.1017.0-pr-310 vcst-qa). |
| C3 | Opening a member, making a REAL edit, then closing STILL prompts to save (genuine dirty preserved) | Regression | **SATISFIED** — genuine save-changes prompt still appears after a real edit; guard does not over-suppress. |
| C4 | Opening a fully-loaded member and closing WITHOUT editing shows no prompt | Regression | **SATISFIED** — no prompt. |
| C5 | Save + Reset semantics on a member detail remain correct after an edit | Regression | **SATISFIED** — Save `PUT /api/members → 204`; Reset reverts; no data drift left. |

**Reconciliation:** all 5 conditions SATISFIED-live. RED baseline captured on the pre-fix build
(vcptcore-qa @ Customer 3.1016.0, C2 double-click); GREEN verified on the fixed build
(vcst-qa @ Customer 3.1017.0-pr-310-9165, LIVE-confirmed via `/api/platform/modules`).

**No BL-* invariant** directly governs the dirty-check UX (this is UX-correctness, not business logic).
Adjacent invariants left untouched: BL-B2B-005/008 (role visibility & org-scoped role change) — the fix
touches only the close-time dirty check, not member data/roles.

**Baseline (red) note:** C1/C2 are confirmed as a *defect* on the currently-deployed build (Customer
3.1016.0) before the fix ships — see `test-execution-report.md`.
