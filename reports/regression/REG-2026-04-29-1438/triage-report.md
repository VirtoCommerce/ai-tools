# Triage Report — Suite 050k, Run REG-2026-04-29-1438

Run date: 2026-04-29 | Module: VirtoCommerce.XPickup 3.1001.0-pr-8-3380

## FAIL Cases (2)

---

### GQL-130 — cartPickupLocations term_facets

**Status:** FAIL (4/6) — previously BLOCKED (cart setup broken)
**Gap ID:** GAP-XPICKUP-001
**Failed assertions:**
- `[COUNT label=probe_facets]` data.cartPickupLocations.term_facets.length >= 1 — actual: 0
- `[DATA label=probe_facets]` runner parse error on "is non-empty" predicate (secondary — DV-019 candidate, fix in next CSV edit)

**Root cause:** cartPickupLocations does not implement facet aggregation. The `term_facets` field is present in the schema and returned as `[]` regardless of the `facet` argument value. Not a test authoring error.

**Fix status (BUG-050k-004):** VALIDATED — add_item PASS + validationErrors=0 PASS confirm cart setup is now deterministic. Only the product gap remains.

**Action required:** Confirm with XPickup team whether term_facets is in scope for PR #8. If out of scope, mark GQL-130 as KNOWN-GAP and exclude from pass-gate until implemented.

---

### GQL-131 — cartPickupLocations filter

**Status:** FAIL (8/9) — previously BLOCKED (cart setup broken)
**Gap ID:** GAP-XPICKUP-002
**Failed assertion:**
- `[COUNT label=probe_filter_match]` data.cartPickupLocations.totalCount >= 1 — actual: 0 (expected ~102 since filter=address.countryCode:USA matches all locations)

**Root cause:** The `filter` argument is accepted by the GraphQL layer (no errors[]) but is not applied — all 102 locations are countryCode=USA yet filtering for USA returns 0. Silent no-op filter behavior. Not a test authoring error.

**Fix status (BUG-050k-004):** VALIDATED — add_item PASS + validationErrors=0 PASS confirm cart setup is now deterministic. Cross-OP [COUNT] demotion to [EVIDENCE] (BUG-050k-003) is also effective (8/9 instead of deeper BLOCKED).

**Action required:** Confirm with XPickup team whether filter argument is in scope for PR #8. If out of scope, mark GQL-131 as KNOWN-GAP.

---

## Summary

| Case | Previous | Now | Delta | Root cause |
|------|----------|-----|-------|------------|
| GQL-094 | FAIL | PASS | +1 | BUG-050k-001-v3 workaround effective |
| GQL-127 | FAIL | PASS | +1 | BUG-050k-003 fix effective |
| GQL-128 | PASS | PASS | 0 | Stable |
| GQL-129 | PASS | PASS | 0 | Stable |
| GQL-130 | BLOCKED | FAIL | improvement | Cart fixed; product gap persists |
| GQL-131 | BLOCKED | FAIL | improvement | Cart fixed; product gap persists |

Both remaining failures are confirmed product gaps (not test defects). No further test fixes required this run.
