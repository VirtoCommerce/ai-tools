# Business Logic Proposals — TLC-2026-06-23-1329

These are **drafts**. They are NOT applied to `.claude/agents/knowledge/business-logic.md`.
Review, edit (incl. severity), assign the final `BL-*` ID, and fold in manually per the
never-auto-edit-BL rule (`feedback_business_logic_promotion`). Until then, CAT-040/CAT-041 carry the
`PROPOSED-` prefix in their Business_Rule column.

## New Invariants Proposed

### PROPOSED-BL-CAT-008: Unit-of-measure CRUD integrity `[P2-ux]` — ✅ APPROVED & PROMOTED 2026-06-23
> Approved by user; folded into `.claude/agents/knowledge/business-logic.md` as **BL-CAT-008** (body entry only; Invariant Coverage Summary table left untouched per promotion rule). CAT-040/CAT-041 now cite `BL-CAT-008`.
- **Rule:** Creating, renaming, or deleting a unit-of-measure *group* or *unit* in the Catalog module must persist atomically and leave no orphaned data. Deleting a group removes its units; a deleted group/unit no longer appears in the list or in product UoM dropdowns; group integrity is preserved after a unit delete.
- **Verify:** Create UoM group → appears in list; rename → list reflects new name; delete group → group and its units absent (`GET /api/catalog/measureunits`). Create unit in group → appears with name / short-name / conversion-factor; edit → persists; delete unit → removed, group intact (`GET /api/catalog/measureunits/{groupId}`).
- **Violation signal:** Group/unit not created; edit not persisted; delete leaves orphaned units or stale API data; group integrity broken after a unit deletion.
- **Agents:** qa-backend-expert (Admin SPA + REST `/api/catalog/measureunits`)
- **Source:** Catalog admin coverage gap surfaced by the TLC-2026-06-23-1329 quality review — CAT-040/CAT-041 (UoM CRUD) had no fitting `BL-CAT-*` invariant (`BL-CAT-001..007` cover stock / virtual-catalog / search-lag / visibility / vc-assignment, none UoM). No originating JIRA ticket — coverage-driven.
- **Triggered by case(s):** CAT-040, CAT-041
- **Note:** Severity drafted as `[P2-ux]` (admin-only config metadata, no direct storefront/revenue impact). Bump to `[P1-data]` if UoM corruption is judged to affect customer-facing product data.

## Stale BL-* Flagged
- None this run. (CAT-038's wrong `BL-CAT-001`→`BL-CAT-004` was a case-level mis-reference, already corrected in the auto-fix pass — not a stale invariant.)
