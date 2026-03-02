---
description: "[QA Method] Risk-based test prioritization: risk matrix, severity classification, dynamic reprioritization, test depth allocation."
argument-hint: "feature | sprint | release | VCST-XXXX"
disable-model-invocation: true
---

# /qa-risk — Risk-Based Test Prioritization

Apply risk-based testing strategy to prioritize test effort where it matters most. Use when planning test coverage for a sprint, release, or individual feature to allocate time based on likelihood and business impact.

## Usage
```
/qa-risk Checkout payment flow
/qa-risk sprint 42 release
/qa-risk VCST-5678 — assess risk for configurable products
/qa-risk release 3.8 — full release risk assessment
```

## Execution

1. **Read the risk framework:** Load `risk-prioritization-framework.md` from this skill folder for the full 5x5 matrix, severity/priority definitions, and allocation tables.

2. **Identify the scope:**
   - If a JIRA ticket: fetch details, identify affected module(s) and user flows
   - If a sprint: list all tickets/features in scope
   - If a release: identify all changed modules, new features, and dependency updates

3. **Assess risk for each item:**
   - Score Likelihood (1-5) based on: change complexity, code maturity, historical defect rate
   - Score Impact (1-5) based on: revenue effect, user base size, data integrity, security exposure
   - Calculate Risk Score = Likelihood x Impact
   - Classify: Low (1-4), Medium (5-9), High (10-15), Critical (16-25)

4. **Map to product risk categories:**
   - Revenue: checkout, payment, cart, pricing
   - Data Integrity: orders, inventory, customer data, import/export
   - Security: authentication, authorization, PCI, input validation
   - User Experience: navigation, search, catalog, responsive
   - Platform Stability: APIs, background jobs, integrations, infrastructure

5. **Allocate test depth:**
   - Critical (16-25): Full regression + exploratory, 40% of time budget
   - High (10-15): Critical paths + key scenarios, 30% of time budget
   - Medium (5-9): Smoke + targeted checks, 20% of time budget
   - Low (1-4): Visual check or skip, 10% of time budget

6. **Output risk register:**
   - Table: Feature | Risk Category | Likelihood | Impact | Score | Level | Test Depth | Assigned Suite
   - Highlight any items above the risk appetite threshold
   - Recommend test suite selection (smoke/critical/sprint/full)

7. **Check for dynamic triggers:**
   - Production bug in same area → escalate risk level
   - Hotfix deployed → re-assess affected modules
   - Module dependency update → check downstream impact
   - Infrastructure change → platform stability risk increase

## Integration with Other Skills
- Use `/qa-test-design` to apply appropriate techniques based on risk level
- Critical risk items should get decision tables + state transitions
- Use `/qa-metrics` to validate that risk coverage targets are met
- Use `/qa-exploratory-method` for exploratory sessions on high-risk areas

## Rules
- Revenue-critical flows (checkout, payment) start at minimum Medium risk regardless of change size
- Never skip testing a Critical risk item — escalate if time is insufficient
- Risk assessment must be documented before test execution begins
- Re-assess risk when scope changes mid-sprint
- A "no changes" module still has residual risk from platform updates — minimum Low
