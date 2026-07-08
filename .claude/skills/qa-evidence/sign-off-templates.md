# Sign-Off Templates

> Consolidated sign-off templates for frontend and backend testing.
> **Verbosity tiers:** See `evidence-capture-policy.md` for compact/detailed/sign-off tiers. Use Quick Status for Teams messages, Full Sign-Off for formal test reports.

---

## Frontend Quick Status Report (for Teams/Comment)

```markdown
@qa-lead-orchestrator: [Feature/Flow] Frontend Testing Complete

**Feature:** [Feature Name]
**Ticket:** [STORE-XXXX / VCST-XXXX]
**Environment:** [Dev / QA / Staging]
**Testing Scope:** [User flow / Full regression / Specific pages]

## Results Summary
| Area | Status | Issues |
|------|--------|--------|
| Desktop Flow (1920px) | pass/warn/fail | [count] |
| Mobile Flow (375px) | pass/warn/fail | [count] |
| Tablet Flow (768px) | pass/warn/fail | [count] |
| Cross-Browser | pass/warn/fail | [count] |
| Checkout (Critical) | pass/warn/fail | [count] |
| Performance | pass/warn/fail | [count] |

## Browsers Tested
| Browser | Status | Notes |
|---------|--------|-------|
| Chrome | pass/fail | |
| Safari/WebKit | pass/fail | |
| Firefox | pass/fail | |
| Edge | pass/fail | |
| iOS Safari | pass/fail | [CRITICAL] |

## Bugs Created
- [BUG-XXX] - [Title] - [Severity] - [Browser/Device]

## Decision
[APPROVED / APPROVED WITH CONDITIONS / BLOCKED]

**Blocking Issues:** [None / List]
**Recommendation:** [Action for qa-lead]
```

---

## Frontend Full Sign-Off Table

```markdown
## FRONTEND SIGN-OFF

| Criteria | Status | Notes |
|----------|--------|-------|
| Homepage loads correctly | pass/fail | |
| Navigation works (desktop + mobile) | pass/fail | |
| Search & Autocomplete | pass/fail | |
| Product browsing & filters | pass/fail | |
| Add to cart functionality | pass/fail | |
| Cart persistence | pass/fail | |
| Guest Checkout flow | pass/fail | [CRITICAL] |
| Registered User Checkout | pass/fail | |
| Payment form (all gateways) | pass/fail | [CRITICAL] |
| Order confirmation | pass/fail | |
| Email notifications | pass/fail | |
| Mobile responsive (375-428px) | pass/fail | |
| Tablet responsive (768-1024px) | pass/fail | |
| iOS Safari compatibility | pass/fail | [CRITICAL] |
| Performance (LCP < 2.5s) | pass/fail | [metrics] |
| No console errors | pass/fail | [count] |

**Overall Status:** [PASS / FAIL / CONDITIONAL PASS]

| Role | Agent | Decision | Date |
|------|-------|----------|------|
| Frontend Expert | qa-frontend-expert | APPROVED | [date] |
| QA Lead | qa-lead-orchestrator | PENDING | - |
```

### Frontend Approval Criteria
- **APPROVED:** All critical flows pass, checkout works on all browsers, no P0/P1 bugs
- **APPROVED WITH CONDITIONS:** Minor P2/P3 issues, checkout works, known issues documented
- **BLOCKED:** Checkout broken OR iOS Safari broken OR payment fails OR P0 bugs exist

---

## Backend Quick Status Report (for Teams/Comment)

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

---

## Backend Full Sign-Off Table

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

### Backend Approval Criteria
- **APPROVED:** All APIs work, module installs, no P0/P1 bugs, data integrity verified
- **APPROVED WITH CONDITIONS:** Minor API issues (P2/P3), workarounds documented
- **BLOCKED:** Module won't install OR critical API broken OR data corruption OR security issue

---

## Escalation Triggers (Notify qa-lead immediately)

### Frontend
- Checkout flow broken (any browser)
- Payment processing fails
- iOS Safari critical bug (30% of mobile traffic)
- Cart not persisting
- Order confirmation not received
- Performance regression (LCP > 4s)
- Console errors blocking functionality

### Backend
- Module installation fails
- Database migration errors
- API returns 500 errors
- Authentication/Authorization bypass
- Data corruption or integrity issues
- Security vulnerability discovered
- Background job failures affecting core functionality
