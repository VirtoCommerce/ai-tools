---
description: "[QA Method] Test design techniques: equivalence partitioning, BVA, decision tables, state transitions, pairwise, error guessing."
argument-hint: "feature name | technique name | VCST-XXXX"
---

# /qa-test-design — Systematic Test Case Derivation

Apply formal test design techniques to systematically derive test cases with maximum defect detection and minimum redundancy. Use when writing new test cases, reviewing existing coverage, or designing regression suites.

## Usage
```
/qa-test-design Checkout flow
/qa-test-design BVA for cart quantity limits
/qa-test-design VCST-5678 — configurable product selection
/qa-test-design decision-table for shipping + payment combinations
```

## Execution

1. **Read the techniques reference:** Load `test-design-techniques.md` from this skill folder for full technique descriptions, selection guide, and generic VC examples. Then load relevant files from `examples/` subfolder for applied examples with real QA product mappings (9 files: `ep-configurable-sections.md`, `bva-configurable-boundaries.md`, `pairwise-product-toggles.md`, `pairwise-store-settings.md`, `decision-table-promo-configurable.md`, `decision-table-b2b-visibility.md`, `state-transition-mid-session.md`, `classification-tree-products.md`, `error-guessing-configurable.md`).

2. **Identify the feature scope:**
   - If a JIRA ticket is provided, fetch details via Atlassian MCP
   - If a feature name, identify the relevant domain (catalog, cart, checkout, B2B, admin, etc.)
   - List inputs, outputs, business rules, and state transitions

3. **Select technique(s)** using the selection guide:
   - **Many input values, few rules** → Equivalence Partitioning + BVA
   - **Complex business rules with conditions** → Decision Table
   - **Feature has lifecycle states** → State Transition Testing
   - **Many parameters, too many combos** → Pairwise / Combinatorial
   - **Mature feature, looking for edge cases** → Error Guessing
   - **New or unknown feature** → Start with EP + BVA, then Error Guessing

4. **Apply the technique(s):**
   - Derive partitions, boundaries, decision rules, states, or pairs
   - Map each derived test condition to a concrete VC scenario
   - Assign priority (P0-P3) based on risk (see `/qa-risk` for risk framework)

5. **Output structured test cases:**
   - Format: ID, Title, Precondition, Steps, Expected Result, Priority, Technique Used
   - Group by technique applied
   - Flag any gaps discovered (untested partitions, missing transitions, uncovered pairs)

6. **Coverage assessment:**
   - List which partitions / boundaries / states / pairs are covered
   - Identify remaining gaps and recommend additional test cases if needed

## Integration with Other Skills
- Use `/qa-risk` to prioritize which features need formal test design first
- Use `/qa-evidence` for output formatting and artifact paths
- Feeds into `/qa-plan` for test suite composition

## Rules
- Always apply at least EP + BVA as baseline — they catch ~60% of defects
- Decision tables are mandatory for features with 3+ business rule conditions
- State transition testing is mandatory for any feature with a lifecycle (orders, quotes, returns)
- Document which technique was applied to each test case for traceability
- Never skip negative test cases — invalid inputs and transitions are where bugs hide
