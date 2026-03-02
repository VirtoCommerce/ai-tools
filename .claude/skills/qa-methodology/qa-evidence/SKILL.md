---
description: "[QA Method] Evidence capture & report formatting: screenshot rules, 3-tier verbosity, output paths."
argument-hint: "[compact|detailed|signoff]"
disable-model-invocation: true
---

# /qa-evidence — Evidence Capture & Output Standards

Apply the project's evidence capture policy and output path conventions. Use before any test execution session to ensure consistent artifact collection.

## Usage
```
/qa-evidence                # Full policy review (capture rules + output paths)
/qa-evidence compact        # Compact reporting tier rules
/qa-evidence detailed       # Detailed reporting tier rules
/qa-evidence signoff        # Sign-off reporting tier rules
```

## Supporting Files

- **evidence-capture-policy.md** — When/how to capture screenshots, console logs, HAR files; 3-tier report verbosity (Compact/Detailed/Sign-Off); bug report size guide; naming conventions
- **output-paths.md** — Where to save every artifact type (test docs → `tests/`, bugs → `reports/bugs/`, regression → `reports/regression/`, raw browser output → `test-results/`)
- **sign-off-templates.md** — Consolidated frontend + backend sign-off tables, quick status reports (Teams format), approval criteria, escalation triggers

## Quick Reference

### Mandatory Captures
| When | What | Naming |
|------|------|--------|
| Test FAILS | Failure state screenshot | `{TC-ID}-FAIL-{description}.png` |
| Bug found | Bug evidence (annotated) | `BUG-{name}-evidence.png` |
| Visual regression | Before/after comparison | `{component}-{state}-{viewport}.png` |
| Critical flow final state | Confirmation/success page | `{flow}-final-state.png` |
| Error state | Console panel, network 500, error toast | `{TC-ID}-error-{type}.png` |

### Skip Capturing
- Every step of a passing test (noise)
- Loading spinners, login page (unless testing auth)
- Same page in multiple browsers if all pass
- Redundant screenshots of the same bug

### Report Verbosity Tiers
| Tier | Use When | Content |
|------|----------|---------|
| **Compact** | Regression suite pass, smoke run | Pass/fail table + bug list only |
| **Detailed** | Sprint testing, JIRA ticket testing | Full test case results + evidence |
| **Sign-Off** | Pre-release, stakeholder review | Detailed + summary + risk assessment |

### Output Paths
| Artifact | Directory |
|----------|-----------|
| Test docs (plans, cases, reports) | `tests/SprintXX-XX/VCST-XXXX/` |
| Screenshots (test evidence) | `tests/SprintXX-XX/VCST-XXXX/screenshots/` |
| Bug reports | `reports/bugs/` |
| Bug evidence | `reports/bugs/screenshots/`, `reports/bugs/api-traces/` |
| Regression reports | `reports/regression/` |
| Raw browser artifacts (gitignored) | `test-results/{browser}/` |

## Rules
- Read supporting files for full details before any test session
- Never save test documentation into `test-results/` (gitignored)
- Never save raw browser dumps into `tests/` or `reports/` (tracked)
- 1-2 screenshots per bug is enough, not 5
