# Quality Gates

> Quality gates define the minimum quality thresholds required before deployment.
> Gates are non-negotiable: BLOCKED means no deployment, regardless of schedule pressure.

---

## 0. Completeness — a gate needs a run that can support a verdict

**Every gate below §1 checks completeness BEFORE it looks at the pass rate**, because the pass
rate alone cannot detect the failure it is most often broken by.

`Pass rate = passed / (passed + failed)` — **BLOCKED and SKIPPED are outside the denominator**
(`quality-metrics-catalog.md`, and `compute-metrics.ts` `aggregate()`). That is the right formula:
a case that never ran is not evidence of a defect. But it means **the pass rate RISES as blockers
accumulate**, so a badly-blocked run reads *cleaner* than a fully-executed one. Measured on this
repo's own history:

| Run | Execution | Pass rate | Of planned |
|---|---|---|---|
| `REG-2026-07-13-1247` | 26P / 0F / **32B** / 12S of 71 | **100%** | 36.6% |
| `REG-2026-08-27-0952` | 21P / 0F / 4B / 19S of 44 | **100%** | 47.7% |
| `REG-2026-07-14-0018` | 777P / 170F / **371B** / 167S of 1485 | 82.1% | 52.3% |

The third one satisfied every numeric criterion in this file, because until 2026-09-02 no gate
below §1 read the blocked count at all. Corpus blocked rate is **19.9%** (28.6% on suites of 81+
cases), so this was not a corner case.

| Criterion | Threshold | Applies to |
|-----------|-----------|------------|
| Cases producing a verdict | ≥1 | every gate |
| Untriaged **BLOCKED** as a share of planned | **≤10%** (`MAX_UNTRIAGED_BLOCKED_PCT`) | §1a, §2, §3, §4 |
| BLOCKED / SKIPPED | 0 | §1 smoke only — stricter, and keeps its own rule |

**Verdict: `CANNOT EVALUATE`** (exit **2**, never 1). It is not a failure and must never be
reported as a regression failure — the run did not *support* a verdict. Two ways out, and both are
cheap:

- **Triage the blockers.** `/qa-triage-results <RUN_ID>` classifies each BLOCKED into env /
  precondition / data / real bug. Pass the count attributed to a documented **non-product** cause
  as `--blocked-triaged N`; it is discounted from the share. An *untriaged* BLOCKED stays counted,
  because it may well be the product failing.
- **Re-run the blocked cases** (`suites:filter --ids`) once the cause is fixed.

**Two things this criterion deliberately does NOT do:**

- **It does not count SKIPPED.** An explicit `Manual` / `Deprecated` lane is materialised as
  SKIPPED with its reason (`.claude/rules/regression.md` §Per-Case Lane Routing) — an *intentional*
  non-execution, not a blocker. Gating on it would leave the gate permanently unevaluable on
  account of the corpus's 838 Manual + 35 Deprecated cases, for reasons that are by design.
- **It does not replace the pass rate with a planned-basis one.** `passed / planned` would make a
  suite with legitimate Manual cases un-passable. Instead **both bases are always reported**
  (`plannedPassRate` beside `passRate`, printed side by side), so the "100% on 37% of the suite"
  reading is visible without being thresholded.

**An open P0/Critical outranks this check** — it needs no complete run to be decided.

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
npx tsx scripts/regression/compute-metrics.ts --gate feature --run-id <RUN_ID> \
  --p0-bugs N --p1-bugs N [--p1-deferred N] [--blocked-triaged N]
```

It returns **GO / CONDITIONAL GO / NO-GO / CANNOT EVALUATE**: a single pass floor of **80%**, and
**NO-GO** on any open P0, any open *undeferred* P1, or a rate below the floor. §0 completeness is
checked first and returns CANNOT EVALUATE (exit 2).

**The floor came down from 95% to 80% on 2026-09-02, and the pass-rate conditional band went with
it.** The number is `GATE_PASS_FLOOR` in `compute-metrics.ts` — cite the constant, not a figure
copied into another document (`.claude/rules/test-data.md` §GOLDEN RULE). With one floor instead of
a 93–95 band, **CONDITIONAL GO now means exactly one thing: a declared P1 deferral**, never "the
rate nearly cleared the bar".

The counter-argument is recorded on the constant and is worth reading before moving it again:
BLOCKED and SKIPPED are already outside this denominator, so the artefactual failures do not
depress it — what an 80% floor admits is 1 in 5 **executed** cases failing for product reasons. It
was adopted alongside two tightenings that did not previously exist (§0 completeness, and an
undeferred P1 now blocking), so this gate is not uniformly looser than the one it replaced.

**An open P1/High blocks; it no longer downgrades by itself.** Before 2026-09-02 an open High bought
an automatic CONDITIONAL GO, so "no Critical/High bugs" was in practice enforced for Critical only.
A High must now be **fixed**, or **explicitly deferred** — `--p1-deferred N` asserts that N of them
carry a documented workaround + risk acceptance signed by the product owner + a monitoring plan. A
declared deferral **caps the verdict at CONDITIONAL GO** and never yields a clean GO: the risk was
accepted, not removed. The deferral has to be *declared* precisely so it appears in the run record
instead of being inferred from a count.

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
| Open P0 bugs in the feature | 0 — non-negotiable, outranks every other criterion | `reports/bugs/` |
| Open P1/High bugs in the feature | **0 undeferred.** Fixed, or declared via `--p1-deferred N` with workaround + signed risk acceptance + monitoring plan (caps the verdict at CONDITIONAL GO) | `reports/bugs/` |
| **Run completeness (§0)** | **≤10% of planned cases BLOCKED and untriaged**; ≥1 case produced a verdict | `suite-*-results.json` + `/qa-triage-results` |
| Change-scoped regression | **≥80%** pass (executed basis, `GATE_PASS_FLOOR.feature`) on the Artifact-C suites for the touched surface (this run also executes the ticket's newly authored cases) | `/qa-regression` result |
| NFRs on the touched surface (as applicable) | No new a11y / performance / security violations introduced | `/qa-accessibility`, perf, security suites |
| Smoke gate (§1) | PASS — the feature doesn't break a P0 flow | Suite 042/078 |

**Verdict:**
- **GO** — all criteria met, **no deferrals**. The feature is releasable.
- **CONDITIONAL GO** — `/qa-test` is PASS WITH NOTES **and** the only misses are P1s **declared**
  deferred (`--p1-deferred`) with a documented workaround + risk acceptance signed by the product
  owner + a monitoring plan. There is no pass-rate route into this verdict any more: the rate is
  either at the floor or it is a NO-GO. Resolve conditions within 5 business days and re-check.
- **NO-GO** — any open P0 bug, **any open undeferred P1/High**, any AC unmet or confirmed
  DRIFT/CONTRADICTS live, any `BL-*` violated, change-scoped regression **below the 80% floor**, a new security finding,
  or a `/qa-test` FAIL/BLOCKED.
- **CANNOT EVALUATE** — §0 completeness not met (nothing executed, or >10% of planned cases BLOCKED
  and untriaged). **Not a NO-GO**: triage the blockers or re-run them, then re-evaluate. Reporting it
  as a NO-GO would attribute a measurement gap to the feature.

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
| Critical path pass rate (P0+P1 tests) | **>=80%** (`GATE_PASS_FLOOR.sprint`) | Combined pass rate across all P0 and P1 test cases executed |
| Open P0 bugs | 0 | No unresolved critical bugs in sprint scope |
| Open P1/High bugs | 0 undeferred | Resolved, or declared via `--p1-deferred N` with documented workaround + risk acceptance |
| **Run completeness (§0)** | ≤10% of planned BLOCKED and untriaged | `/qa-triage-results`; else CANNOT EVALUATE |
| Sprint ticket acceptance criteria | 100% verified | Every sprint ticket has all acceptance criteria tested and passing |
| Regression suite pass rate | **>=80%** | For all regression suites affected by sprint changes. Lowered from 90% with the critical-path floor — a secondary criterion sitting ABOVE the primary one would have made the headline 80% unreachable in practice |
| New security vulnerabilities | 0 | No high/critical findings from security suite (Suite 08) |

**Verdict:**
- **APPROVED** — All criteria met or exceeded, and no deferrals.
- **APPROVED WITH CONDITIONS** — Pass rate at or above the 80% floor AND no P0 bugs AND every open P1 **declared** deferred with a documented workaround AND risk acceptance signed by product owner. (A deferral is now the only route here; there is no sub-floor band.)
- **BLOCKED** — Pass rate below **80%** OR any P0 bug open OR **any open undeferred P1** OR security finding.
- **CANNOT EVALUATE** — §0 completeness not met. Not a BLOCKED; triage or re-run the blocked cases.

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
| Open P1/High bugs | ≤2, each **declared** deferred (`--p1-deferred`) | Each with documented workaround and target fix date; 3+ ⇒ BLOCKED. A release bundles many already-gated features, so unlike §1a/§2 this gate keeps a tolerance — but 1-2 makes it CONDITIONS, never APPROVED |
| **Run completeness (§0)** | ≤10% of planned BLOCKED and untriaged | `/qa-triage-results`; else CANNOT EVALUATE |
| Performance baselines | Within 10% of baseline | Core Web Vitals (LCP, FID, CLS) measured via Suite 11 |
| Security scan | Clean | 0 high/critical findings from Suite 08 |
| Cross-browser | All passing | Chrome + Edge + Firefox results from Suite 12 |
| Accessibility | No new violations | No new WCAG 2.1 AA violations from Suite 09 |
| Exploratory testing | Completed | Minimum 2 exploratory sessions covering critical flows |

**Verdict:**
- **APPROVED** — All criteria met or exceeded, 0 open P1, no deferrals.
- **APPROVED WITH CONDITIONS** — Pass rate 96-97% **or** 1-2 open P1 (never 0 conditions on an open High) AND no P0 bugs AND each P1 has a documented workaround AND risk acceptance signed AND monitoring plan in place.
- **BLOCKED** — Pass rate below 96% OR any P0 bug open OR 3+ P1 bugs OR any critical security finding OR data integrity issue.
- **CANNOT EVALUATE** — §0 completeness not met. A partial full-release run is not a failing one; note that a `full` selection must be *executed*, not merely dispatched (see the §3 note below).

**Notes:**
- Full release gate requires execution of all 126 suites. Partial execution does not satisfy the gate.
- Cross-browser failures in a single browser may qualify for CONDITIONS if the other two browsers pass and the failing browser has a known platform issue.
- Exploratory testing sessions must cover at least: checkout flow, payment processing, and catalog search.

---

## 4. Hotfix Gate

Evaluated before emergency hotfix deployments. Scoped to the hotfix area only.

| Criterion | Threshold | Measurement |
|-----------|-----------|-------------|
| Hotfix area pass rate | **>=80%** (`GATE_PASS_FLOOR.hotfix`) | All tests in the affected suite(s) |
| Open P0 bugs in hotfix area | 0 | No unresolved critical bugs in the area being fixed |
| Open P1/High bugs in hotfix area | 0 | §8 always required this; the deterministic core ignored the P1 count on this branch until 2026-09-02, so a hotfix with open Highs read as APPROVED |
| **Run completeness (§0)** | ≤10% of planned BLOCKED and untriaged | `/qa-triage-results`; else CANNOT EVALUATE |
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
| Overall Pass Rate | N/A (12 tests only) | **>=80%** (change-scoped suites) | **>=80%** | >=98% | **>=80%** (affected suites) |
| Open P0 Bugs | 0 | 0 | 0 | 0 | 0 |
| Open P1 Bugs | N/A | 0 undeferred (deferral ⇒ CONDITIONAL) | 0 undeferred (deferral ⇒ CONDITIONS) | ≤2 declared-deferred ⇒ CONDITIONS; 3+ BLOCKED | 0 for hotfix area |
| Run completeness (§0) | blocked + skipped = 0 | ≤10% planned BLOCKED untriaged | ≤10% | ≤10% | ≤10% |
| Cross-Browser Testing | No | If UI-facing | Smoke suite only | Full (Chrome + Edge + Firefox) | Smoke suite only |
| Performance Check | No | If touched | Spot check | Full baseline comparison | Spot check |
| Security Scan | No | If touched | Changed areas only | Full scan (Suite 08) | Changed areas only |
| Exploratory Testing | No | No (run `/qa-exploratory` separately) | Optional | Required (2+ sessions) | No |
| Accessibility Check | No | If UI-facing | No | Required (Suite 09) | No |
| Scope | Suite 01 (12 P0 tests) | One story/feature + its change-scoped suites | Sprint tickets + affected suites | All regression suites | Hotfix area + smoke |
| Typical Duration | ~15 minutes | 30 min - 2 hours | 4-8 hours | Full day or more | 1-2 hours |
| Verdict Options | PASS / FAIL | GO / CONDITIONAL GO / NO-GO | APPROVED / CONDITIONS / BLOCKED | APPROVED / CONDITIONS / BLOCKED | APPROVED / BLOCKED |
| … plus, at every gate below §1 | — | CANNOT EVALUATE (§0, exit 2) | CANNOT EVALUATE | CANNOT EVALUATE | CANNOT EVALUATE |

---

## 9. Verdict Definitions

Formal definitions with numeric thresholds for programmatic evaluation.

### APPROVED

All gate criteria met or exceeded. Deployment is cleared.

| Condition | Requirement |
|-----------|-------------|
| Pass rate (executed basis) | At or above the gate floor (`GATE_PASS_FLOOR`: >=80% feature/sprint/hotfix, >=98% release, 100% smoke) |
| Run completeness (§0) | >=1 case executed AND <=10% of planned BLOCKED-and-untriaged |
| P0 bugs | 0 open |
| P1 bugs | **0 open, none deferred** — a declared deferral downgrades to CONDITIONS at every gate |
| Security findings | 0 high/critical |
| Performance | Within 10% of baseline |
| All checklist steps | Verified "Yes" or "N/A" with justification |

### APPROVED WITH CONDITIONS

Gate criteria narrowly missed but risk is documented and accepted. Deployment proceeds with monitoring.

| Condition | Requirement |
|-----------|-------------|
| Pass rate | At or above the floor. **Release only** keeps a 2-point band beneath its own (96-97%); the 80% gates are a single floor, so a sub-floor rate is BLOCKED rather than conditional |
| Run completeness (§0) | Met — CONDITIONS is a judgment about quality, and an incomplete run supports no judgment (that is CANNOT EVALUATE) |
| P0 bugs | 0 open (non-negotiable) |
| P1 bugs | **Declared** deferred (`--p1-deferred N`) with a documented workaround for each — 1-2 at release, any number at sprint/feature provided every one is declared |
| Risk acceptance | Signed by product owner (documented in quality report) |
| Monitoring plan | In place for all known issues |
| Conditions timeline | All conditions must be resolved within 5 business days (sprint) or 10 business days (release) |
| Follow-up | Re-test required after conditions are resolved; results appended to quality report |

### BLOCKED

Gate criteria not met. Deployment is prohibited until issues are resolved.

| Condition | Any of the following triggers BLOCKED |
|-----------|---------------------------------------|
| Pass rate | Below the gate floor (<80% feature/sprint/hotfix, <96% release) |
| P0 bugs | Any P0 bug open (1 or more) |
| P1 bugs | **Any open undeferred P1** (sprint/feature/hotfix); 3+ at release |
| Security | Any high/critical security finding unresolved |
| Data integrity | Any data corruption or integrity issue detected |
| Performance | Degraded beyond 50% of baseline |
| Checklist | Any mandatory step unverifiable |

### CANNOT EVALUATE

The run does not support a verdict (§0). **Exit code 2, never 1** — distinct from BLOCKED, because an
unmeasured run and a catastrophic regression demand opposite responses. Never reported as a
regression failure.

| Condition | Any of the following triggers CANNOT EVALUATE |
|-----------|-----------------------------------------------|
| Nothing executed | 0 cases produced a pass/fail verdict (all blocked/skipped) |
| No run in scope | No history entry matched `--run-id` / `--suites` — deferred, skipped, or never recorded |
| Blockers | >10% of planned cases BLOCKED with no documented non-product cause |

**Resolution:** triage the blockers (`/qa-triage-results <RUN_ID>`) and re-evaluate with
`--blocked-triaged N`, or re-run the blocked cases (`suites:filter --ids`) once their cause is fixed.
Record the gate as **NOT EVALUATED** in the report until then — not as a pass and not as a failure.

---

**BLOCKED resolution process:**
1. Identify all blocking conditions from the gate evaluation
2. Assign owners and target resolution dates for each blocker
3. Resolve all blockers
4. Re-run affected test suites
5. Re-evaluate gate from Step 1 of the enforcement checklist
6. Issue new verdict based on updated results
