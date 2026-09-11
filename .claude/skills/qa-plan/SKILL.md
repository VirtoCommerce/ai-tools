---
name: qa-plan
description: "[Testing] Test plans from the E2E scenario catalog. Maps scenarios to regression suites."
argument-hint: "feature name | domain | VCST-XXXX"
disable-model-invocation: true
---

# /qa-plan — Test Planning & Case Generation

Create test plans and detailed test cases using the comprehensive E2E scenario catalog. Maps features to business domains and regression suites.

## Usage
```
/qa-plan checkout                    # Test plan for checkout domain
/qa-plan VCST-1234                   # Test plan for a JIRA ticket
/qa-plan authentication              # Test plan for auth domain
/qa-plan "configurable products"     # Test plan for configurable products
```

## Supporting Files

- **e2e-scenario-catalog.md** — end-to-end scenarios grouped by business domain; each carries a prefix, a priority and its related suite mappings. **Read the catalog for the domain list and the counts** — do not restate either here.

## Execution

1. **Identify affected domains:**
   - If feature name: match to domains in the catalog (e.g., "checkout" → Cart, Checkout, Payment)
   - If JIRA ticket: fetch details via Atlassian MCP, extract feature scope, map to domains
   - A single feature often spans 2-4 domains

2. **Delegate to test-management-specialist** via Task tool (`subagent_type: test-management-specialist`):
   - Pass feature scope, affected domains, JIRA ticket details (if any)
   - Agent reads `e2e-scenario-catalog.md` for relevant scenarios
   - Agent expands scenarios into detailed test cases

3. **For each domain, generate:**
   - Test plan with scope, risks, and approach
   - Detailed test cases (ID, title, preconditions, steps, expected result)
   - Traceability to regression suites (e.g., E2E-AUTH → Suites 01, 02, 08)
   - Edge cases and negative scenarios

4. **Output format:**
   ```
   reports/tickets/SprintXX-XX/VCST-XXXX/
   ├── test-plan.md
   ├── test-cases.md (or test-cases.csv)
   └── testrail-import.csv
   ```

5. **Summary to user:**
   - Domains covered and scenario count
   - Test case count by priority (P0/P1/P2)
   - Estimated execution time
   - Related regression suites for traceability

## Business domains

**Read the catalog's own summary table — this file deliberately no longer restates it.**
[`e2e-scenario-catalog.md`](e2e-scenario-catalog.md) §Summary is the single source for the domain list,
the `E2E-*` prefixes, the per-domain counts and the related suites.

A restated copy lived here until 2026-09-11 and had drifted on **five** points against the file it claimed
to summarise: it wrote the checkout prefix as `E2E-CHECKOUT` (the catalog uses `E2E-CHK`), collapsed the
catalog's four separate B2B domains into one `E2E-B2B`, wrote orders as `E2E-ORDER` (catalog: `E2E-ORD`),
gave Cart and Checkout the wrong counts, and listed an **Inventory / `E2E-INV`** domain the catalog has
never contained. An author citing a prefix from that table produced a reference that resolves to nothing —
which is exactly the drift `.claude/rules/test-data.md` §GOLDEN RULE exists to prevent.

## Rules
- Always check the catalog first — don't reinvent scenarios that already exist
- Each test case must have at least 1 negative/error scenario
- Map every test case to its parent regression suite for traceability
- Use TestRail CSV format for import compatibility

## Reused by `/qa-test`

`/qa-test` (Steps 2–3) reuses this skill's `e2e-scenario-catalog.md` for `E2E-*` scenario coverage + regression-suite traceability, but produces only its scoped `testing-checklist.md` — **not** the full test plan / RTM / TestRail CSV this skill generates. Full case authoring + the peer-review `Draft → Reviewed` promotion gate belong to a standalone `/qa-plan` run, never to a `/qa-test` verdict pass.
