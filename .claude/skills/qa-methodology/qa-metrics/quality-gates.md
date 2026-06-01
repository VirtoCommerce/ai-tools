# Quality Gates

> Quality gates define the minimum quality thresholds required before deployment.
> Gates are non-negotiable: BLOCKED means no deployment, regardless of schedule pressure.

---

## 1. Pre-Deployment Smoke Gate

The minimum bar before any deployment. Evaluated against Suite 01 (Smoke Tests, 12 P0 test cases).

| Criterion | Threshold | Measurement |
|-----------|-----------|-------------|
| P0 test pass rate | 100% | All 12 smoke tests must pass |
| Open P0 bugs | 0 | No unresolved critical bugs |
| Smoke suite execution | Complete | No skipped or blocked tests |
| Environment health | All endpoints responding | Frontend (`FRONT_URL`) + Backend (`BACK_URL`) + Search |

**Verdict:**
- **PASS** — All criteria met. Proceed with deployment.
- **FAIL** — Any criterion not met. Block deployment until resolved.

**Notes:**
- Smoke gate is binary — there is no "APPROVED WITH CONDITIONS" for smoke.
- If a smoke test fails due to environment instability (not a code bug), the environment must be stabilized and the smoke re-run. Environment failures do not grant a pass.
- Smoke gate applies to every deployment: QA, staging, and production.

---

## 2. Sprint Release Gate

Evaluated before sprint release to staging or production. Covers sprint-scoped test suites plus affected regression suites.

| Criterion | Threshold | Measurement |
|-----------|-----------|-------------|
| Critical path pass rate (P0+P1 tests) | >=95% | Combined pass rate across all P0 and P1 test cases executed |
| Open P0 bugs | 0 | No unresolved critical bugs in sprint scope |
| Open P1 bugs | 0 | All P1 bugs resolved or deferred with documented risk acceptance |
| Sprint ticket acceptance criteria | 100% verified | Every sprint ticket has all acceptance criteria tested and passing |
| Regression suite pass rate | >=90% | For all regression suites affected by sprint changes |
| New security vulnerabilities | 0 | No high/critical findings from security suite (Suite 08) |

**Verdict:**
- **APPROVED** — All criteria met or exceeded.
- **APPROVED WITH CONDITIONS** — Pass rate within 2% of threshold (93-94%) AND no P0 bugs AND P1 bugs have documented workarounds AND risk acceptance signed by product owner.
- **BLOCKED** — Pass rate below 93% OR any P0 bug open OR 3+ P1 bugs without workarounds OR security finding.

**Notes:**
- Deferred P1 bugs must have: documented workaround, risk acceptance from product owner, target fix sprint, and monitoring plan.
- "Affected regression suites" means any suite covering modules changed in the sprint. Use `config/test-suites.json` tags to identify affected suites.

---

## 3. Full Release Gate

Evaluated before production release. Covers all 36 regression suites (15 frontend + 21 backend).

| Criterion | Threshold | Measurement |
|-----------|-----------|-------------|
| Overall pass rate | >=98% | Combined pass rate across all 99 suites |
| Open P0 bugs | 0 | No unresolved critical bugs across entire platform |
| Open P1 bugs | <3 | Each with documented workaround and target fix date |
| Performance baselines | Within 10% of baseline | Core Web Vitals (LCP, FID, CLS) measured via Suite 11 |
| Security scan | Clean | 0 high/critical findings from Suite 08 |
| Cross-browser | All passing | Chrome + Edge + Firefox results from Suite 12 |
| Accessibility | No new violations | No new WCAG 2.1 AA violations from Suite 09 |
| Exploratory testing | Completed | Minimum 2 exploratory sessions covering critical flows |

**Verdict:**
- **APPROVED** — All criteria met or exceeded.
- **APPROVED WITH CONDITIONS** — Pass rate 96-97% AND no P0 bugs AND P1 bugs <3 with workarounds AND risk acceptance signed AND monitoring plan in place.
- **BLOCKED** — Pass rate below 96% OR any P0 bug open OR 3+ P1 bugs without workarounds OR any critical security finding OR data integrity issue.

**Notes:**
- Full release gate requires execution of all 99 suites. Partial execution does not satisfy the gate.
- Cross-browser failures in a single browser may qualify for CONDITIONS if the other two browsers pass and the failing browser has a known platform issue.
- Exploratory testing sessions must cover at least: checkout flow, payment processing, and catalog search.

---

## 4. Hotfix Gate

Evaluated before emergency hotfix deployments. Scoped to the hotfix area only.

| Criterion | Threshold | Measurement |
|-----------|-----------|-------------|
| Hotfix area pass rate | >=95% | All tests in the affected suite(s) |
| Open P0 bugs in hotfix area | 0 | No unresolved critical bugs in the area being fixed |
| Smoke suite | 100% pass | Full Suite 01 re-run after hotfix applied |
| Regression on affected module | Pass | Targeted regression on changed module only |

**Verdict:**
- **APPROVED** — All criteria met. Deploy hotfix.
- **BLOCKED** — Any criterion not met. Hotfix must be revised.

**Notes:**
- Hotfix gate does not require full regression (99 suites). Only the affected area plus smoke.
- If the hotfix touches payment (Suites 04, 06), checkout, or security (Suite 08), those suites must also pass.
- Hotfix deployments still require smoke gate (Section 1) to pass after the fix is applied.

---

## 5. Rollback Criteria

Conditions that trigger an automatic rollback of a deployment.

| Trigger | Threshold | Action | Timeline |
|---------|-----------|--------|----------|
| P0 bugs post-deployment | 3+ reported within 24 hours | Immediate rollback | <1 hour from decision |
| Revenue flow broken | Checkout or payment non-functional | Immediate rollback | <30 minutes from detection |
| Data corruption | Any data integrity issue detected | Immediate rollback + data recovery | <30 minutes from detection |
| Performance degradation | >50% slower than baseline | Rollback | <2 hours from detection |
| Security vulnerability | Actively exploited | Immediate rollback + incident response | <15 minutes from detection |
| Authentication failure | Users cannot sign in | Immediate rollback | <30 minutes from detection |

### Rollback Decision Flow

1. Incident detected (monitoring alert, user report, or post-deploy testing)
2. Assess severity against triggers above
3. If trigger matched: initiate rollback immediately, notify escalation contacts
4. If trigger not matched but quality degraded: evaluate against gate thresholds, make case-by-case decision
5. Post-rollback: re-run smoke gate (Suite 01) to verify rolled-back state is stable
6. Document incident in `reports/bugs/` with rollback evidence

---

## 6. Escalation Matrix

| Condition | Notify | Response Time |
|-----------|--------|---------------|
| Gate BLOCKED (any type) | QA Lead + Dev Lead | Immediate |
| P0 bug found during testing | QA Lead + Product Owner | <1 hour |
| Rollback triggered | QA Lead + Dev Lead + Product Owner + Engineering Manager | <30 minutes |
| 3+ P1 bugs in single sprint | QA Lead + Dev Lead | Same day |
| DRE drops below 90% | QA Lead + Engineering Manager | Next standup |
| Flakiness rate exceeds 10% | QA Lead + Dev Lead | This sprint |
| Escape rate >5% for a release | QA Lead + Engineering Manager + Product Owner | Next retrospective |
| Environment instability blocking testing >4 hours | QA Lead + DevOps Lead | <1 hour |

### Escalation Rules

- Escalation notifications are sent via Microsoft Teams (project communication tool).
- P0 bugs always escalate regardless of sprint phase.
- BLOCKED gates escalate immediately — do not wait for standup or scheduled meetings.
- Multiple escalation conditions can be active simultaneously; each follows its own response timeline.
- Escalation does not imply blame — it ensures the right people are informed to make decisions.

---

## 7. Gate Enforcement Checklist

12-step verification process to be completed before rendering a gate verdict.

| Step | Action | Verified |
|------|--------|----------|
| 1 | Confirm all planned test suites have been executed | Yes / No |
| 2 | Verify no test cases were skipped without documented reason | Yes / No |
| 3 | Review all failed test cases — confirmed bugs vs. environment issues vs. flaky tests | Yes / No |
| 4 | Check P0 bug count = 0 | Yes / No |
| 5 | Check P1 bug count within threshold for gate level | Yes / No |
| 6 | Validate acceptance criteria coverage for sprint tickets (sprint/release gates) | Yes / No |
| 7 | Review regression suite results for affected modules | Yes / No |
| 8 | Verify cross-browser testing completed (if required by gate level) | Yes / No |
| 9 | Check performance baseline comparison (if required by gate level) | Yes / No |
| 10 | Verify security scan results (if required by gate level) | Yes / No |
| 11 | Calculate overall pass rate against gate threshold | Yes / No |
| 12 | Document verdict with evidence links (report paths, screenshot references) | Yes / No |

### Checklist Rules

- All 12 steps must be completed before issuing a verdict.
- Steps marked "No" must have a documented explanation.
- Steps that are not applicable to the gate level (e.g., cross-browser for smoke) should be marked "N/A" with justification.
- The completed checklist must be included in or referenced from the quality report.

---

## 8. Gate Comparison Table

| Criterion | Smoke | Sprint Release | Full Release | Hotfix |
|-----------|-------|----------------|--------------|--------|
| P0 Pass Rate | 100% | 100% | 100% | 100% |
| Overall Pass Rate | N/A (12 tests only) | >=95% | >=98% | >=95% (affected suites) |
| Open P0 Bugs | 0 | 0 | 0 | 0 |
| Open P1 Bugs | N/A | 0 (or deferred with risk acceptance) | <3 with documented workaround | 0 for hotfix area |
| Cross-Browser Testing | No | Smoke suite only | Full (Chrome + Edge + Firefox) | Smoke suite only |
| Performance Check | No | Spot check | Full baseline comparison | Spot check |
| Security Scan | No | Changed areas only | Full scan (Suite 08) | Changed areas only |
| Exploratory Testing | No | Optional | Required (2+ sessions) | No |
| Accessibility Check | No | No | Required (Suite 09) | No |
| Scope | Suite 01 (12 P0 tests) | Sprint tickets + affected suites | All 99 suites | Hotfix area + smoke |
| Typical Duration | ~15 minutes | 4-8 hours | Full day or more | 1-2 hours |
| Verdict Options | PASS / FAIL | APPROVED / CONDITIONS / BLOCKED | APPROVED / CONDITIONS / BLOCKED | APPROVED / BLOCKED |

---

## 9. Verdict Definitions

Formal definitions with numeric thresholds for programmatic evaluation.

### APPROVED

All gate criteria met or exceeded. Deployment is cleared.

| Condition | Requirement |
|-----------|-------------|
| Pass rate | At or above gate threshold (>=95% sprint, >=98% release) |
| P0 bugs | 0 open |
| P1 bugs | 0 open (sprint) or <3 with workarounds (release) |
| Security findings | 0 high/critical |
| Performance | Within 10% of baseline |
| All checklist steps | Verified "Yes" or "N/A" with justification |

### APPROVED WITH CONDITIONS

Gate criteria narrowly missed but risk is documented and accepted. Deployment proceeds with monitoring.

| Condition | Requirement |
|-----------|-------------|
| Pass rate | Within 2% below threshold (93-94% for sprint, 96-97% for release) |
| P0 bugs | 0 open (non-negotiable) |
| P1 bugs | 1-2 open with documented workaround for each |
| Risk acceptance | Signed by product owner (documented in quality report) |
| Monitoring plan | In place for all known issues |
| Conditions timeline | All conditions must be resolved within 5 business days (sprint) or 10 business days (release) |
| Follow-up | Re-test required after conditions are resolved; results appended to quality report |

### BLOCKED

Gate criteria not met. Deployment is prohibited until issues are resolved.

| Condition | Any of the following triggers BLOCKED |
|-----------|---------------------------------------|
| Pass rate | Below threshold by >2% (<93% for sprint, <96% for release) |
| P0 bugs | Any P0 bug open (1 or more) |
| P1 bugs | 3+ P1 bugs without documented workarounds |
| Security | Any high/critical security finding unresolved |
| Data integrity | Any data corruption or integrity issue detected |
| Performance | Degraded beyond 50% of baseline |
| Checklist | Any mandatory step unverifiable |

**BLOCKED resolution process:**
1. Identify all blocking conditions from the gate evaluation
2. Assign owners and target resolution dates for each blocker
3. Resolve all blockers
4. Re-run affected test suites
5. Re-evaluate gate from Step 1 of the enforcement checklist
6. Issue new verdict based on updated results
