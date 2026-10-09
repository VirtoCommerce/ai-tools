# Test strategy — <TICKET> — <YYYY-MM-DD>

<!-- Shape for /qa-test-strategy. Target 30–60 lines, hard cap 80 (reports-policy §2).
     Method, gate and approval: .claude/skills/qa-test-strategy/SKILL.md. Delete every comment line. -->

Status: DRAFT | APPROVED (<who>, <date>) | AUTO (--yes) · Flow/path: feature-test <FAST | FULL | FAST_GROUNDED>
Build: <deployed build> · Stand: <env> · Context bundle: <path or "in-context">

**Mission.** <one sentence: the question this run answers, and for whom>

## 1. Inputs
| Input | What we have | Gap → project risk |
|---|---|---|
| Project environment | <stand, build, PRs deployed?, roles/accounts, free lanes, time box> | <P-n or —> |
| Product elements | <change surface by layer, from the diff; chain links touched> | |
| Quality criteria | <AC-1…n · BL-/ECL- ids · docs · kb ids · design link> | |

## 2. Risks
| R | What a customer would see if this is wrong | Source | L×I | Level |
|---|---|---|---|---|
| R1 | <…> | <AC-n · file:line · VC-n · bug key> | <n> | <Critical/High/Medium/Low> |

Project risks: P1 <risk> → <mitigation | accepted>.

## 3. Strategy mix
Analytical (risk) ✔ · Model-based <✔/—: why> · Methodical (checklist) ✔ · Reactive (exploratory) <✔/—: why> ·
Consultative (AC + approval) ✔ · Regression-averse <✔/—: why> · Process-compliant <✔/—: why>

## 4. Approach per risk
| R | Technique / approach | Oracle {authority} | Layer · tool | Lane · agent | Depth |
|---|---|---|---|---|---|
| R1 | FLOW, DT | AC-2 {SPEC} | storefront · Playwright | chrome · qa-frontend-expert | deep |

## 5. Artifacts
| Artifact | Decision |
|---|---|
| Test model | RUN \| SKIP — <observable reason> |
| Mind map | RUN \| SKIP — <reason> |
| Checklist | RUN (always) |
| Exploratory | RUN <box> min — charter: <R-ids> \| SKIP — <reason> |
| Visual lane | RUN (visual_surface) \| SKIP — <reason> \| RECOMMENDED (needs approval) |
| Contract refresh · coverage triage · suite authoring · C1 | per path — <RUN \| SKIP \| RECOMMENDED> |

## 6. Data
<per risk or global: existing @td() alias · live-discover · create in the case (FIFTH RULE) · seeder named by a Data cell>
Discriminating values: <which two quantities must differ for R-n to be decidable>

## 7. Out of scope
- <what> — <why> — residual risk <level>

## 8. Criteria
Entry: <build carries the PRs · env:check green · data reachable> · Suspend (BLOCKED): <condition>
Exit: every in-scope R has a result or a named deviation · exploratory box spent · <other>

## 9. Amendments
<!-- appended during the run: a risk discovered, an approach changed — one line each, with its reason -->

## 10. Reconciliation (filled at close-out)
| R | Planned | Ran (item ids · charter · lane) | Result | Deviation — reason |
|---|---|---|---|---|
