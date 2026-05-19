# Defect Report Templates

> Consolidated bug report templates for frontend and backend defects.
> **Verbosity rules:** See `evidence-capture-policy.md` in qa-evidence. Default: under 150 lines per report. Include only relevant sections — the templates below are maximum-detail; real reports should omit unused fields.

---

## Frontend Bug Report Template

```markdown
Summary: [Page/Flow] - [Specific issue]

**Page:** [page name]
**Flow:** [user flow]
**Environment:** [URL]
**Browser:** [browser + version]
**Device:** [device + viewport]
**User Credentials:** [test user email / role — e.g., buyer@test.com / B2B Buyer]

**Issue:**
[Description of the problem]

**Steps to Reproduce:**
1. [Navigate to ...]
2. [Click on ...]
3. [Observe ...]

**Expected:**
[What should happen]

**Actual:**
[What actually happens]

**Screenshots:**
[Attach evidence — 1-3 screenshots max]

**Console Errors:**
[List specific errors or "none"]

**Network Errors:**
[List failed requests or "none"]

**Impact:**
[Who is affected and how severely]

**Reproduction Rate:**
[100% / intermittent / specific conditions]

Severity: [Critical / High / Medium / Low]
Priority: [P0 / P1 / P2 / P3]
Labels: [frontend, checkout, payment, mobile, etc.]
Component: [Checkout / Cart / Catalog / etc.]
```

---

## Backend Bug Report Template

```markdown
Summary: [Module/API] - [Specific issue]

Description:
**Component:** [Module Name]
**API Endpoint:** [METHOD /api/path]
**Environment:** [Dev / QA / Staging]
**User Credentials:** [test user / role — e.g., admin@test.com / Platform Admin]

**Issue:**
[Description of the problem]

**Steps to Reproduce:**
1. [API call with method + path]
   Body: { ... }

2. Expected: [expected response field + value]
   Actual: [actual response field + value]

**Expected Behavior:**
[Expected response with JSON payload]

**Actual Behavior:**
[Actual response with JSON payload]

**Test Data:**
[List relevant test data: IDs, prices, config values]

**API Request:**
[Full request: METHOD URL, headers, body]

**API Response:**
[Status code + response body]

**Observations:**
[Key findings from response analysis — what works, what doesn't, likely root cause]


**Environment Details:**
- Environment: [QA / Stage]
- Platform Version: [e.g., 3.800.0]
- Module Version: [e.g., YourCompany.CustomPricing 1.0.0]
- Browser: [N/A for API / browser if Admin SPA]
- Logs: [Attach relevant logs if available]

**Workaround:**
[Available workaround or "None"]


Severity: [Critical / High / Medium / Low]
Priority: [P0 / P1 / P2 / P3]
Type: Bug
Labels: [backend, api, module, pricing, etc.]
Component: [Module Name]
Affects Version: [module version]
Linked Issues: [PLAT-XXX / VCST-XXX parent feature]
Assignee: [@developer-name]
```

---

## Escalation Triggers (MUST report to qa-lead immediately)

### Frontend — Critical Revenue Flows
1. Guest checkout end-to-end
2. Registered user checkout
3. Payment processing (all gateways)
4. Add to cart from PDP
5. Cart quantity update
6. Mobile checkout (iOS Safari + Android Chrome)

### Backend — Critical System Flows
1. Module installation fails
2. Database migration errors
3. API returns 500 errors
4. Authentication/Authorization bypass
5. Data corruption or integrity issues
6. Security vulnerability discovered
7. Background job failures affecting core functionality
