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

## 1a. Feature Release Gate — per-feature GO / NO-GO

**The global "can we release this feature?" decision.** Scoped to **one story/feature** (not a whole
sprint), this is the gate a team applies to answer *should this ship or not*. In scope order it sits
between the Smoke gate (§1) and the Sprint Release gate (§2): Smoke proves the platform still boots, this
gate proves **one feature** is done and safe, the Sprint/Full gates aggregate many such features for a
deployment.

**Inputs it consumes (does not re-run):** the `/qa-test VCST-XXXX` verdict + AC reconciliation, the open
bug list for the feature, and the change-scoped regression result (the Artifact-C suite selection from the
`/qa-test` run). **Owner:** `qa-lead-orchestrator` (this is its go/no-go call).

**Independently ratified at `/qa-test` Step 5e.** This gate is not self-certified by the run that produced
the inputs: a **fresh `qa-lead-orchestrator` verifier instance** (§Verifier Mode) re-evaluates the criteria
below from the raw inputs and may **downgrade** the GO/NO-GO. The pass-rate + bug-count math has a
deterministic core:

```bash
npx tsx scripts/regression/compute-metrics.ts --gate feature --run-id <RUN_ID> --p0-bugs N --p1-bugs N
```

It returns **GO / CONDITIONAL GO / NO-GO** (GO floor 95%, conditional 93–95%, any open P0 or <93% ⇒ NO-GO).

**The `--run-id` is required, and that is the whole point.** This criterion is the *change-scoped*
(Artifact-C) pass rate — `summary.json` `regression.run_id`. Unscoped, the script aggregates the entire
90-day rolling history and returns a number identical for every feature (e.g. 82.86% repo-wide vs 68% for
one specific run), so it now **refuses to evaluate without a scope** instead of answering the wrong
question. Use `--suites <ids>` when the run wasn't recorded under a single id.

**Exit codes carry meaning: `0` evaluated / not blocking · `1` NO-GO (or bad arguments) · `2` CANNOT
EVALUATE.** A `2` means no run entries matched the scope — the regression was deferred, skipped, or never
recorded. Report the gate as **NOT EVALUATED**; it is *not* a 0% pass rate and must never be reported as a
regression failure (§1a cannot be evaluated on a missing pass rate).

The qualitative criteria (AC coverage, `BL-*`, NFRs, smoke, `/qa-test` verdict, security) stay agent-judged
and are combined with that math by the verifier.

| Criterion | Threshold | Source |
|-----------|-----------|--------|
| `/qa-test` verdict | **PASS** or **PASS WITH NOTES** | `/qa-test` Step 5c |
| Acceptance criteria + DoD | 100% verified — every atomic condition (story ACs + gap-ACs) carries PASS evidence, all reconciled SATISFIED-live, every DoD item MET/N-A, with the quantified AC-coverage/DoD estimate | `/qa-test` Step 5b |
| `BL-*` invariants for the domain | Verified, none violated | `business-logic.md` |
| Open P0 bugs in the feature | 0 | `reports/bugs/` |
| Open P1 bugs in the feature | 0, or deferred with documented workaround + risk acceptance | `reports/bugs/` |
| Change-scoped regression | ≥95% pass on the Artifact-C suites for the touched surface (this run also executes the ticket's newly authored cases) | `/qa-regression` result |
| NFRs on the touched surface (as applicable) | No new a11y / performance / security violations introduced | `/qa-accessibility`, perf, security suites |
| Smoke gate (§1) | PASS — the feature doesn't break a P0 flow | Suite 042/078 |

**Verdict:**
- **GO** — all criteria met. The feature is releasable.
- **CONDITIONAL GO** — `/qa-test` is PASS WITH NOTES **and** the only misses are P1s with a documented
  workaround + risk acceptance signed by the product owner + a monitoring plan; regression within 2% of
  the 95% floor (≥93%). Resolve conditions within 5 business days and re-check.
- **NO-GO** — any open P0 bug, any AC unmet or confirmed DRIFT/CONTRADICTS live, any `BL-*` violated,
  change-scoped regression <93%, a new security finding, or a `/qa-test` FAIL/BLOCKED.

**Notes:**
- This gate never *lowers* the bar below the `/qa-test` verdict — a `/qa-test` FAIL/BLOCKED is an
  automatic **NO-GO**; the gate only *adds* the team-level release criteria (open-bug ledger, scoped
  regression, NFRs, smoke) on top of a green story run.
- A **NO-GO is a success, not a failure** (mirrors the story ladder / bug-fix ladder): it correctly holds
  an unfinished or unsafe feature. Record the blocking criteria + owners; do not ship on schedule
  pressure.
- The GO/NO-GO decision + evidence links are recorded in the per-ticket QA report
  (`reports/tickets/<Sprint>/<TICKET>/`, category 6 per `.claude/rules/reports.md`), not a new artifact
  type.
- **Epic roll-up (`/qa-test --epic` runs).** This gate stays **per story**; an Epic-scoped run combines the
  per-story verdicts into one Epic-level recommendation: **all** child stories GO/CONDITIONAL GO + the
  **cross-story E2E** clean + **0 open P0 across the whole Epic** → the Epic's feature is releasable. Any
  child NO-GO, a broken cross-story seam, or an open P0 anywhere in the Epic → the Epic is NO-GO (name the
  blocking story). Recommendation only; recorded in the Epic's `summary.json.epic.roll_up`.

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

Evaluated before production release. Covers all 126 regression suites (56 frontend + 70 backend).

| Criterion | Threshold | Measurement |
|-----------|-----------|-------------|
| Overall pass rate | >=98% | Combined pass rate across all 126 suites |
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
- Full release gate requires execution of all 126 suites. Partial execution does not satisfy the gate.
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
- Hotfix gate does not require full regression (126 suites). Only the affected area plus smoke.
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

| Criterion | Smoke | Feature | Sprint Release | Full Release | Hotfix |
|-----------|-------|---------|----------------|--------------|--------|
| P0 Pass Rate | 100% | 100% | 100% | 100% | 100% |
| Overall Pass Rate | N/A (12 tests only) | >=95% (change-scoped suites) | >=95% | >=98% | >=95% (affected suites) |
| Open P0 Bugs | 0 | 0 | 0 | 0 | 0 |
| Open P1 Bugs | N/A | 0 (or deferred w/ risk acceptance) | 0 (or deferred with risk acceptance) | <3 with documented workaround | 0 for hotfix area |
| Cross-Browser Testing | No | If UI-facing | Smoke suite only | Full (Chrome + Edge + Firefox) | Smoke suite only |
| Performance Check | No | If touched | Spot check | Full baseline comparison | Spot check |
| Security Scan | No | If touched | Changed areas only | Full scan (Suite 08) | Changed areas only |
| Exploratory Testing | No | No (run `/qa-exploratory` separately) | Optional | Required (2+ sessions) | No |
| Accessibility Check | No | If UI-facing | No | Required (Suite 09) | No |
| Scope | Suite 01 (12 P0 tests) | One story/feature + its change-scoped suites | Sprint tickets + affected suites | All regression suites | Hotfix area + smoke |
| Typical Duration | ~15 minutes | 30 min - 2 hours | 4-8 hours | Full day or more | 1-2 hours |
| Verdict Options | PASS / FAIL | GO / CONDITIONAL GO / NO-GO | APPROVED / CONDITIONS / BLOCKED | APPROVED / CONDITIONS / BLOCKED | APPROVED / BLOCKED |

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
