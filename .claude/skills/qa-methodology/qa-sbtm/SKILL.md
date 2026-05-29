---
description: "[QA Method] Session-based exploratory testing: SBTM charters, heuristics (CRISP/SFDPOT), tours, session notes, debrief."
argument-hint: "domain | charter type | heuristic"
disable-model-invocation: true
---

# /qa-sbtm — Session-Based Test Management (SBTM) Methodology

Provides the structured methodology framework for exploratory testing sessions. This skill defines HOW to explore — charters, heuristics, tours, note-taking, and debriefs. Use it as a reference before and during exploratory sessions.

**Relationship to `/qa-exploratory` command:** The `/qa-exploratory` command dispatches and manages exploratory sessions. This skill (`/qa-sbtm`) provides the methodology reference that agents read during those sessions.

## Usage
```
/qa-sbtm                   # Full methodology overview
/qa-sbtm charter           # Charter creation guide + templates
/qa-sbtm CRISP             # CRISP heuristic reference
/qa-sbtm SFDPOT            # SFDPOT heuristic reference
/qa-sbtm tours             # Exploration tour patterns
/qa-sbtm debrief           # Debrief process and templates
```

## Supporting Files

- **session-based-testing.md** — Complete SBTM framework: charter creation, CRISP/SFDPOT heuristics, exploration tours, session notes template, debrief process, coverage tracking, learning loops, and VC-specific ready-to-use charters

## Execution

1. **Read the methodology reference:** Load `session-based-testing.md` from this skill folder for the full SBTM framework.

2. **Before a session — Charter creation:**
   - Define the mission (what area to explore and why)
   - Select charter type: Feature, Risk, Workflow, or Edge-Case
   - Choose applicable heuristic(s): CRISP for quality attributes, SFDPOT for system dimensions
   - Set time box: 30-minute session (5 min setup + 20 min explore + 5 min document)

3. **During a session — Guided exploration:**
   - Follow the selected heuristic's sub-questions to guide exploration
   - Apply tour patterns (Feature, Complexity, Claims, Scenario, Data) for systematic coverage
   - Log findings in real-time using the session notes template
   - Classify findings: Bug, Question, Observation, Risk

4. **After a session — Debrief:**
   - Review findings: how many bugs, questions, observations, risks
   - Assess coverage: what percentage of the charter was covered
   - Identify follow-up actions: bugs to file, questions to answer, risks to escalate
   - Update the coverage tracking matrix (area x session)

5. **Learning loops — Continuous improvement:**
   - Bug found → update risk register (see `/qa-risk`)
   - Risk identified → create new charter targeting that risk
   - Coverage gap found → schedule follow-up session
   - Pattern observed → add to error guessing heuristics (see `/qa-test-design`)

## Integration with Other Skills
- `/qa-risk` determines which areas need exploratory attention (High/Critical risk items)
- `/qa-test-design` provides error guessing heuristics that supplement exploration
- `/qa-evidence` defines how to capture and format session evidence
- `/qa-investigate` provides the investigation flow when a bug is found during exploration
- Findings feed into `/qa-metrics` (defect density, escape rate)

## Rules
- Every exploratory session must have a written charter — no aimless clicking
- Time-box is mandatory: 30 minutes per session, extendable to 45 min max
- Log findings in real-time, not from memory after the session
- Debrief is not optional — every session ends with a findings review
- Coverage tracking matrix must be updated after each session
- At least 2 exploratory sessions required before any full release (per quality-gates.md)
