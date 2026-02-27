# Frontend Sign-Off & Bug Report Templates

> Extracted from qa-frontend-expert agent. Use when reporting results or filing bugs.

---

## Quick Status Report (for Teams/Comment)

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

## Full Sign-Off Table

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

### Approval Criteria
- **APPROVED:** All critical flows pass, checkout works on all browsers, no P0/P1 bugs
- **APPROVED WITH CONDITIONS:** Minor P2/P3 issues, checkout works, known issues documented
- **BLOCKED:** Checkout broken OR iOS Safari broken OR payment fails OR P0 bugs exist

### Escalation Triggers (Notify qa-lead immediately)
- Checkout flow broken (any browser)
- Payment processing fails
- iOS Safari critical bug (30% of mobile traffic)
- Cart not persisting
- Order confirmation not received
- Performance regression (LCP > 4s)
- Console errors blocking functionality

---

## Bug Report Template

```markdown
Summary: [Page/Flow] - [Specific issue]

**Page:** [page name]
**Flow:** [user flow]
**Environment:** [URL]
**Browser:** [browser + version]
**Device:** [device + viewport]

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
[Attach evidence]

**Console Errors:**
[List or "none"]

**Network Errors:**
[List or "none"]

**Impact:**
[Who is affected and how severely]

**Suggested Fix:**
[Technical suggestion if obvious]

**Reproduction Rate:**
[100% / intermittent / specific conditions]

Severity: [Critical / High / Medium / Low]
Priority: [P0 / P1 / P2 / P3]
Labels: [frontend, checkout, payment, mobile, etc.]
Component: [Checkout / Cart / Catalog / etc.]
```

---

## Critical Revenue Flows (MUST PASS before release)

1. Guest checkout end-to-end
2. Registered user checkout
3. Payment processing (all gateways)
4. Add to cart from PDP
5. Cart quantity update
6. Mobile checkout (iOS Safari + Android Chrome)
