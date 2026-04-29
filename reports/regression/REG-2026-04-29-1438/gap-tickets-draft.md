# GAP Ticket Drafts — Suite 050k Findings

**Source:** REG-2026-04-29-1438 regression run on suite `050k` (GraphQL xPickup)
**Drafted:** 2026-04-29
**Status:** **DRAFT — awaiting user review before pushing to JIRA**

These are evidence-backed gap reports identified during regression of `vc-module-x-pickup` PR #8. PR scope confirmation completed via GitHub MCP — see "Scope Verification" below.

---

## Scope Verification (PR vc-module-x-pickup#8)

- **PR title:** "VCST-4707: Include selected pickup locations"
- **PR head branch:** `VCST-4707-include-selected-locations`
- **PR base branch:** `dev`
- **PR body:** Minimal — JIRA link to VCST-4707 + artifact URL only. No scope description.
- **Author:** artem-dudarev
- **State:** open
- **Verdict:** PR scope is **specifically and exclusively** the IncludeLocationIds prepend semantic for confirmed pickup locations. Title, branch name, and JIRA ticket all corroborate this. **Facet aggregation and filter argument wiring are NOT in PR #8 scope.**

Both gaps below are therefore **separate enhancement tickets** (or pre-existing product bugs), NOT regressions caused by PR #8.

---

## GAP-XPICKUP-001 — `cartPickupLocations.term_facets` aggregation unwired

### Suggested JIRA ticket

**Type:** Bug or Task (depending on whether facet was ever expected)
**Priority:** Medium (P2) — feature gap, no data corruption
**Component:** vc-module-x-pickup
**Affects version:** 3.1001.0-pr-8-3380 (and likely all prior versions of XPickup)

### Title

`cartPickupLocations: term_facets returns empty array regardless of facet input`

### Description

The GraphQL `cartPickupLocations` query schema declares a `facet: String` argument and returns a `term_facets { name terms { term label count } }` selection per the production schema. However, on QA build `VirtoCommerce.XPickup 3.1001.0-pr-8-3380` (PR vc-module-x-pickup#8), the facet aggregation does not produce any output — `term_facets` is always empty `[]` regardless of the input.

### Steps to reproduce

1. Auth as ORG_USER
2. Add any cart item via `addItem` mutation
3. Execute the following GraphQL query against `https://vcst-qa.govirto.com/xapi/graphql`:

```graphql
query {
  cartPickupLocations(
    cartId: "<cart-id>"
    storeId: "B2B-store"
    cultureName: "en-US"
    first: 5
    facet: "address.countryCode address.regionName address.city"
  ) {
    totalCount
    items { id name address { city regionName countryCode } }
    term_facets { name terms { term label count } }
  }
}
```

### Expected result

Given 102 known pickup locations spanning multiple countries (USA, AUS observed in `address.countryCode` of returned items), the `term_facets` array should contain at least one bucket — typically one per requested facet field with terms aggregated by occurrence count.

### Actual result

`term_facets: []` — empty array. The GraphQL response is otherwise structurally valid (no errors, `totalCount=102`, `items[].address.countryCode` populated with valid values like "USA" / "AUS"), but no aggregation is produced.

### Evidence

- `reports/regression/REG-2026-04-29-1438/graphql-evidence/GQL-130-1777466440355.json` — full request/response JSON
- Affecting test case: `GQL-130` in `regression/suites/Backend/graphql/050k-graphql-xpickup.csv`

### Suggested investigation path

1. Determine whether facet aggregation was ever implemented for `cartPickupLocations` in `vc-module-x-pickup`. The schema declares it; the resolver may not implement it.
2. Compare against `pickupLocations` and `productPickupLocations` queries — do they support facet aggregation? If yes, why does `cartPickupLocations` not?
3. Check the underlying `SearchCartPickupLocationsQueryHandler` / `MultipleProductsPickupLocationSearchCriteria` for facet pipeline.

### Acceptance criteria

- `cartPickupLocations(facet: "address.countryCode")` against a store with locations in multiple countries returns `term_facets[0].terms` with at least one entry per distinct country
- `term_facets[].terms[].count` is a positive integer ≤ totalCount
- `term_facets[].terms[].term` and `.label` are non-empty strings

### Related

- `BL-BOPIS-008` (confirmed pickup prepend — orthogonal, working)
- `VCST-4618` (cartPickupLocations duplicate-key bug — fixed, evidence in archive)
- `VCST-4650` (BOPIS pickup search indexing — facet test was archived)
- Existing fixture asserts the field exists: `test-data/graphql/queries/cartPickupLocations.graphql`

---

## GAP-XPICKUP-002 — `cartPickupLocations.filter` argument non-functional

### Suggested JIRA ticket

**Type:** Bug
**Priority:** High (P1) — filter argument advertised in schema but does not function; affects narrow-search use cases on the storefront
**Component:** vc-module-x-pickup
**Affects version:** 3.1001.0-pr-8-3380 (and likely all prior versions of XPickup)

### Title

`cartPickupLocations: filter argument is non-functional — filter:"address.countryCode:USA" returns 0 of 102 locations`

### Description

The GraphQL `cartPickupLocations` query schema declares a `filter: String` argument that accepts xAPI filter syntax. However, on QA build `VirtoCommerce.XPickup 3.1001.0-pr-8-3380`, the filter argument either is not applied or excludes all results. A filter matching the country code of the majority of locations returns 0 results.

### Steps to reproduce

1. Auth as ORG_USER, set up cart with one item
2. Execute baseline query:

```graphql
query {
  cartPickupLocations(cartId: "<cart-id>" storeId: "B2B-store" cultureName: "en-US" first: 5) {
    totalCount
    items { address { countryCode } }
  }
}
```

→ Returns `totalCount: 102` with `address.countryCode: "USA"` on multiple items.

3. Execute filter query:

```graphql
query {
  cartPickupLocations(
    cartId: "<cart-id>"
    storeId: "B2B-store"
    cultureName: "en-US"
    first: 200
    filter: "address.countryCode:USA"
  ) {
    totalCount items { address { countryCode } }
  }
}
```

### Expected result

Given the baseline shows USA as the dominant country in the result set, `filter: "address.countryCode:USA"` should return a subset of the 102 locations matching country code USA — almost certainly > 0.

### Actual result

`totalCount: 0`, `items: []` — all locations are excluded by a filter that should match the majority.

### Evidence

- `reports/regression/REG-2026-04-29-1438/graphql-evidence/GQL-131-1777466454874.json`
- Affecting test case: `GQL-131` in `regression/suites/Backend/graphql/050k-graphql-xpickup.csv`

### Suggested investigation path

1. Verify the xAPI filter syntax expected by `cartPickupLocations` matches `"<field>:<value>"` (this is the documented format used elsewhere in xAPI — `products(filter: "category.subtree:...")`). If the field names differ (`address.countryCode` vs `address_countryname` vs something else), the filter ref docs may be outdated. Note: the archived VCST-4650 test plan used `address_countryname` (snake_case) — possibly the correct format.
2. Inspect whether the filter argument reaches `SearchCartPickupLocationsQueryHandler` and is converted into Elasticsearch / search query.
3. Check whether other variants work: `filter: "address.regionName:..."`, `filter: "address.city:..."`. If all return 0, the filter pipeline is broken; if specific fields work, it's a field-name mapping issue.

### Acceptance criteria

- `cartPickupLocations(filter: "address.countryCode:USA")` returns a non-zero subset of locations whose `address.countryCode = "USA"`
- The xAPI filter syntax for pickup locations is documented in the GraphQL schema description or VC docs

### Related

- `VCST-4650` (BOPIS pickup search indexing) — filter behavior was tested in the archived plan
- Schema confirms argument exists: `cartPickupLocations(... filter: String ...)` in `.claude/agents/knowledge/graphql-schema.md`

---

## Filing checklist (for the user)

Before pushing to JIRA:

- [ ] Verify GAP-XPICKUP-001 — was facet ever supported on `cartPickupLocations`? Quick check via Postman/GraphiQL on dev branch with a different facet value to rule out test-side error.
- [ ] Verify GAP-XPICKUP-002 — try `filter: "address_countryname:USA"` (snake_case from VCST-4650 archive). If that works, the bug is field-name documentation, not pipeline. If it also returns 0, the filter pipeline is broken.
- [ ] Decide ticket type: bug (broken feature advertised in schema) vs task/enhancement (feature never existed).
- [ ] Push to JIRA via Atlassian MCP or web UI. Do not push automatically — both tickets reference public PRs and should be authored by a human.

## Files referenced

- `reports/regression/regression-2026-04-29-1438.md` — consolidated regression report
- `reports/regression/REG-2026-04-29-1438/suite-050k-results.json` — per-case results
- `reports/regression/REG-2026-04-29-1438/triage-report.md` — per-failure triage
- `regression/suites/Backend/graphql/050k-graphql-xpickup.csv` — test cases (GQL-130, GQL-131 reference these GAP IDs)
- `archive/sprints/Sprint26-04/VCST-4650-bopis-pickup-search-indexing/test-plan.md` — archive showing facet/filter tests pre-existed
