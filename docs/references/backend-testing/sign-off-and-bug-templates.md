# Backend Sign-Off & Bug Report Templates

> Reference file for qa-backend-expert agent. Read when completing testing and reporting results.

## Quick Status Report (for Teams/Comment)

```markdown
@qa-lead-orchestrator: [Module/Feature] Backend Testing Complete

**Module:** [Module Name / API Endpoint]
**Ticket:** [PLAT-XXXX / VIRC-XXXX]
**Environment:** [Dev / QA / Staging]
**Testing Scope:** [Module installation / API testing / Admin UI / Integration]

## Results Summary
| Area | Status | Issues |
|------|--------|--------|
| Module Installation | pass/warn/fail | [count] |
| API Endpoints | pass/warn/fail | [count] |
| GraphQL xAPI | pass/warn/fail | [count] |
| Admin SPA | pass/warn/fail | [count] |
| Background Jobs | pass/warn/fail | [count] |
| Data Integrity | pass/warn/fail | [count] |

## APIs Tested
| Endpoint | Method | Status | Notes |
|----------|--------|--------|-------|
| /api/xxx | GET/POST | pass/fail | |

## Bugs Created
- [BUG-XXX] - [Title] - [Severity] - [API/Module]

## Decision
[APPROVED / APPROVED WITH CONDITIONS / BLOCKED]

**Blocking Issues:** [None / List critical issues]
**Recommendation:** [Action recommendation for qa-lead]
```

## Full Sign-Off Table (for Test Reports)

```markdown
## BACKEND SIGN-OFF

| Criteria | Status | Notes |
|----------|--------|-------|
| Module installs successfully | pass/fail | [issues] |
| Module settings configurable | pass/fail | [issues] |
| All APIs return correct responses | pass/fail | [issues] |
| API error handling correct | pass/fail | [issues] |
| GraphQL queries/mutations work | pass/fail | [issues] |
| Authentication/Authorization | pass/fail | [issues] |
| Admin SPA functionality | pass/fail | [issues] |
| Background jobs execute | pass/fail | [issues] |
| Data persists correctly | pass/fail | [issues] |
| No database errors | pass/fail | [error count] |
| API response time < 500ms | pass/fail | [avg ms] |
| No security vulnerabilities | pass/fail | [issues] |

**Overall Backend Status:** [PASS / FAIL / CONDITIONAL PASS]

| Role | Agent | Decision | Date |
|------|-------|----------|------|
| **Backend Expert** | qa-backend-expert | APPROVED | [date] |
| **QA Lead** | qa-lead-orchestrator | PENDING | - |
```

## Approval Criteria

- **APPROVED:** All APIs work, module installs, no P0/P1 bugs, data integrity verified
- **APPROVED WITH CONDITIONS:** Minor API issues (P2/P3), workarounds documented
- **BLOCKED:** Module won't install OR critical API broken OR data corruption OR security issue

## Escalation Triggers (Notify qa-lead immediately)

- Module installation fails
- Database migration errors
- API returns 500 errors
- Authentication/Authorization bypass
- Data corruption or integrity issues
- Security vulnerability discovered
- Background job failures affecting core functionality

## Bug Report Template

```markdown
Summary: [Module/API] - [Specific issue]
Example: "CustomPricing API - Volume discount not applying"

Description:
**Component:** CustomPricing Module
**API Endpoint:** POST /api/custompricing/calculate
**Environment:** QA

**Issue:**
Volume discount not applied when quantity is in tier 1 range (10-49 units).

**Steps to Reproduce:**
1. POST /api/custompricing/calculate
   Body: {
     "productId": "test-product-123",
     "quantity": 15,
     "customerGroupId": "vip-customers"
   }

2. Expected: customPrice should be $85.00 (15% discount for tier 1)
   Actual: customPrice returns $100.00 (no discount applied)

**Expected Behavior:**
For quantity 15 (within tier 1: 10-49), should apply 15% discount.
Expected response:
{
  "basePrice": 100.00,
  "customPrice": 85.00,
  "discountPercentage": 15.00
}

**Actual Behavior:**
No discount applied:
{
  "basePrice": 100.00,
  "customPrice": 100.00,
  "discountPercentage": 0.00
}

**Test Data:**
- Product ID: test-product-123
- Base Price: $100.00
- Tier Pricing:
  * 10-49 units: 15% discount
  * 50-99 units: 20% discount
  * 100+ units: 25% discount

**API Request:**
POST https://qa.virtocommerce.com/api/custompricing/calculate
Authorization: Bearer eyJhbG...
Content-Type: application/json

{
  "productId": "test-product-123",
  "quantity": 15,
  "customerGroupId": "vip-customers"
}

**API Response:**
200 OK
{
  "productId": "test-product-123",
  "basePrice": 100.00,
  "customPrice": 100.00,
  "discountPercentage": 0.00,
  "tierPricing": [
    { "quantity": 10, "price": 85.00 },
    { "quantity": 50, "price": 80.00 }
  ]
}

**Observations:**
- Tier pricing IS returned in response (shows tiers exist)
- Discount calculation logic NOT executing
- Likely bug in tier matching logic

**Impact:**
- HIGH: Volume discounts not working (core module feature)
- Affects B2B customers expecting volume pricing
- Blocks module release

**Environment Details:**
- Environment: QA
- Platform Version: 3.800.0
- Module Version: YourCompany.CustomPricing 1.0.0
- Browser: N/A (API)
- Logs: [Attach relevant logs if available]

**Workaround:**
None available

**Suggested Fix:**
Check tier matching logic in CustomPricingService.CalculatePrice() method.
Likely issue with quantity range comparison.

Severity: High
Priority: P1 (Blocks module release)
Type: Bug
Labels: backend, api, module, pricing
Component: CustomPricing Module
Affects Version: 1.0.0
Linked Issues: PLAT-567 (parent feature)
Assignee: @developer-name
```
