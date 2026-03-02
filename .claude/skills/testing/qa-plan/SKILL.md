---
description: "[Testing] Test plans from E2E scenario catalog (105 scenarios, 18 domains). Maps to regression suites."
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

- **e2e-scenario-catalog.md** — 105 end-to-end test scenarios across 18 business domains (Authentication, Catalog, Search, Cart, Checkout, Payment, BOPIS, B2B, Orders, Inventory, Marketing, CMS, Notifications, Settings, Import/Export, SEO, Analytics, Security). Each scenario has prefix, priority, and related suite mappings.

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
   tests/SprintXX-XX/VCST-XXXX/
   ├── test-plan.md
   ├── test-cases.md (or test-cases.csv)
   └── testrail-import.csv
   ```

5. **Summary to user:**
   - Domains covered and scenario count
   - Test case count by priority (P0/P1/P2)
   - Estimated execution time
   - Related regression suites for traceability

## 18 Business Domains (from catalog)

| # | Domain | Prefix | Scenarios |
|---|--------|--------|-----------|
| 1 | Authentication & Registration | E2E-AUTH | 8 |
| 2 | Catalog & Product Discovery | E2E-CAT | 8 |
| 3 | Search | E2E-SEARCH | 5 |
| 4 | Cart | E2E-CART | 7 |
| 5 | Checkout | E2E-CHECKOUT | 6 |
| 6 | Payment | E2E-PAY | 6 |
| 7 | BOPIS | E2E-BOPIS | 5 |
| 8 | B2B Features | E2E-B2B | 7 |
| 9 | Orders & History | E2E-ORDER | 6 |
| 10 | Inventory | E2E-INV | 5 |
| 11-18 | Marketing, CMS, Notifications, Settings, Import/Export, SEO, Analytics, Security | Various | 42 |

## Rules
- Always check the catalog first — don't reinvent scenarios that already exist
- Each test case must have at least 1 negative/error scenario
- Map every test case to its parent regression suite for traceability
- Use TestRail CSV format for import compatibility
