---
description: "[QA Method] ISTQB test process lifecycle: Plan, Analyze, Design, Implement, Execute, Report, Close with entry/exit criteria."
argument-hint: "[phase name | analyze VCST-XXXX | close sprint-XX | gates]"
disable-model-invocation: true
---

# /qa-process — ISTQB Test Process Lifecycle

Navigate and apply the ISTQB Foundation-level test process: 7 phases with formal entry/exit criteria, phase-to-skill mapping, and VC-specific lifecycle adaptations. Use as the master reference for how all QA methodology skills, commands, and agents connect into a coherent testing workflow.

## Usage
```
/qa-process                    # Full lifecycle overview + phase-to-skill navigation map
/qa-process analyze VCST-1234  # Derive test conditions from a JIRA ticket
/qa-process implement          # Pre-execution readiness checklist (12 items)
/qa-process close sprint-42    # Sprint close checklist + retrospective template
/qa-process gates              # Show all 7 phase entry/exit criteria
/qa-process plan               # Phase 1 guidance — scope, approach, risk, schedule
```

## Execution

1. **Read the lifecycle reference:** Load `test-process-lifecycle.md` from this skill folder for the full 7-phase process, entry/exit criteria, and VC adaptations.

2. **Determine context:**
   - No argument → show full lifecycle overview with phase-to-asset mapping table
   - Phase name (`plan`, `analyze`, `design`, `implement`, `execute`, `report`, `close`) → show that phase's details + entry/exit criteria
   - `analyze VCST-XXXX` → fetch ticket via Atlassian MCP, derive numbered test conditions from ACs
   - `implement` → run the 12-item pre-execution readiness checklist, flag blockers
   - `close sprint-XX` → run the 15-item close checklist, generate retrospective from latest run data
   - `gates` → show the phase transition gate table (7 transitions with criteria)

3. **For Analyze phase:**
   - Identify the test basis (JIRA ACs, Figma specs, API contracts, user stories)
   - Decompose each requirement into atomic, numbered test conditions
   - Output: Test Condition ID, Condition text, Source reference, Priority, Technique hint
   - Feed conditions into `/qa-test-design` for formal test case derivation

4. **For Implement phase:**
   - Walk through the 12-item readiness checklist
   - Flag any items that are not ready (blockers)
   - Recommend `/qa-env-check` for environment validation

5. **For Close phase:**
   - Walk through the 15-item close checklist
   - Generate retrospective notes (what worked / what didn't / action items)
   - Identify loop-back items that feed into the next cycle's Plan phase
   - Update risk register with lessons from escaped defects

6. **For lifecycle variant selection:**
   - Daily Smoke → abbreviated (Plan→Execute→Report)
   - Sprint Cycle → all 7 phases, 2-week cadence
   - Major Release → all 7 phases with extended Close + full retrospective

## Integration with Other Skills

| Phase | Primary Skill / Command |
|-------|------------------------|
| Plan | `/qa-plan`, `/qa-risk` |
| Analyze | This skill (deep section) → feeds `/qa-test-design` |
| Design | `/qa-test-design`, `/qa-exploratory-method` (charters) |
| Implement | `/qa-env-check` |
| Execute | `/qa-test`, `/qa-smoke`, `/qa-regression`, `/qa-investigate`, `/qa-evidence` |
| Report | `/qa-metrics` (gates + catalog) |
| Close | This skill (deep section) → feeds back into Plan |

## Rules
- Every testing effort — no matter how small — has at least Plan, Execute, Report phases
- Analyze phase produces a **named, numbered list of test conditions** before any test cases are written
- Never skip Close for sprint and release cycles — retrospectives prevent repeat mistakes
- Entry criteria must be met before starting a phase; exit criteria before leaving it
- The phase-to-asset mapping table is the single source of truth for "which tool do I use when"
- Lifecycle variant (smoke/sprint/release) determines which phases are mandatory vs optional
