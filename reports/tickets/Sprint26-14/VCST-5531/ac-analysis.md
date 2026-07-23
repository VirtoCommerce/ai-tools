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

| # | Condition (from PR problem/fix) | Type | Impl verdict |
|---|---------------------------------|------|--------------|
| C1 | Fast-switching between members before detail load completes shows NO false save-changes prompt | Fix | *pending live (post-deploy)* |
| C2 | Double-clicking a member in the list shows NO false save-changes prompt | Fix | *pending live (post-deploy)* |
| C3 | Opening a member, making a REAL edit, then closing STILL prompts to save (genuine dirty preserved) | Regression | *pending live* |
| C4 | Opening a fully-loaded member and closing WITHOUT editing shows no prompt | Regression | *pending live* |
| C5 | Save + Reset semantics on a member detail remain correct after an edit | Regression | *pending live* |

**No BL-* invariant** directly governs the dirty-check UX (this is UX-correctness, not business logic).
Adjacent invariants left untouched: BL-B2B-005/008 (role visibility & org-scoped role change) — the fix
touches only the close-time dirty check, not member data/roles.

**Baseline (red) note:** C1/C2 are confirmed as a *defect* on the currently-deployed build (Customer
3.1016.0) before the fix ships — see `test-execution-report.md`.
