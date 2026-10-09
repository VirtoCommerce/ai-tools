# Test strategy — <TICKET>

<!-- Shape for /qa-test-strategy. ONE file per ticket (D7), one "## Round N" section per round, newest last.
     Each round section: target 40–90 lines, hard cap 120 (D9, reports-policy §2). Method, floors, rounds:
     .claude/skills/qa-test-strategy/. Delete every comment line. -->

## Round <N> of 3 — <YYYY-MM-DD>

Status: DRAFT | APPROVED (<who>, <date>) | AUTO (--yes) · Depth label: <light | standard | deep> (computed)
Build: <PR#n @ sha per repo> · Stand: <env> · Deployed: <yes | NO → F6 | UNKNOWN> · Previous: <Round N−1 verdict, build | none>
Floors fired: <F1 (signal) · F3 (signal) · …> · not fired: <F2, F4, …>

**Mission.** <one sentence: the question this round answers, and for whom. Round 3: say it is the last.>

### Inputs
| Input | What we have | Gap → project risk |
|---|---|---|
| Project environment | <stand, build, PRs deployed?, roles/accounts, free lanes, time box> | <P-n or —> |
| Product elements | <change surface by layer, from the diff (round ≥ 2: since the last tested commit)> | |
| Quality criteria | <AC-1…n · BL-/ECL- ids · docs · kb ids · design link> | |

### Risks
| R | What a customer would see if this is wrong | Source | L×I | Level |
|---|---|---|---|---|
| R1 | <…> | <AC-n · file:line · VC-n · bug key · carried from Round N−1 R-n> | <n> | <Critical/High/Medium/Low> |

Project risks: P1 <risk> → <mitigation | accepted>.

### Strategy mix
Analytical ✔ · Methodical ✔ · Consultative ✔ · Model-based <✔/—: why> · Reactive <✔/—: why> ·
Regression-averse <✔/—: why> · Process-compliant <✔/—: why>

### Approach per risk
| R | Technique / approach | Oracle {authority} | Layer · tool | Lane · agent | Effort |
|---|---|---|---|---|---|
| R1 | FLOW, DT | AC-2 {SPEC} | storefront · Playwright | chrome · qa-frontend-expert | high |

### Artifacts
| Artifact | Decision |
|---|---|
| Test model | RUN (new \| amend <path>) \| SKIP — <observable reason> |
| Mind map | RUN \| SKIP — <reason> |
| Checklist | RUN (always) |
| Exploratory | RUN <box> min, FIRST \| ALONGSIDE — charter: <R-ids> \| SKIP — <reason> |
| Visual lane | RUN (F3/F8) \| SKIP — <reason> |
| Contract refresh | RUN \| SKIP — <reason> |
| Coverage triage + regression | RUN — <n> cases; stale → lifecycle: <ids + reason> \| SKIP — <reason> |
| Verifier | RUN (Critical R-n) \| SKIP — no Critical risk |
| Case authoring | never in the run (D2) — candidate cases are listed at close-out |

### Data
<per risk or global: existing @td() alias · live-discover · create in the case (FIFTH RULE) · seeder named by a Data cell>
Must differ: <which values must differ for R-n to be decidable> · Before redeploy: <records to create on the old build, or none>

### Out of scope
- <what> — <why> — residual risk <level>

### Criteria
Entry: <build carries the PRs · env:check green · data reachable> · Suspend (BLOCKED): <condition>
Exit: every in-scope R has a result or a named deviation · exploratory box spent · <other>

### Amendments
<!-- appended during the run: a risk discovered, an approach changed — one line each, with its reason -->

### Reconciliation (filled at close-out)
| R | Planned | Ran (item ids · charter · lane · case ids) | Result | Deviation — reason |
|---|---|---|---|---|

Candidate cases (→ /qa-test-lifecycle): <ids or none> · Carried to Round N+1 / escalation: <R-ids or none>
