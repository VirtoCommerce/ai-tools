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
/qa-sbtm tours             # Exploration tour patterns (basic + Whittaker)
/qa-sbtm debrief           # Debrief process and templates
/qa-sbtm discovery         # Scenario discovery — techniques for finding scenarios we don't cover (PRIMARY purpose of exploratory)
/qa-sbtm adversarial       # Adversarial heuristics — Whittaker tours, FAILURE, Soap Opera, HICCUPPS-F (use as filters, not checklists)
/qa-sbtm personas          # Persona-driven exploration (Impatient Buyer, Screen-Reader User, Malicious User, etc.)
/qa-sbtm attack-surface    # Modern web attack surface — DevTools, multi-tab, cache, history, browser features
/qa-sbtm charters          # Ready-to-use charter library (11 charters) — starting points to be galumphed/hostile-interviewed
```

## Supporting Files

- **scenario-discovery.md** — **PRIMARY lens for exploratory sessions.** 10 techniques for finding scenarios our coverage misses: coverage-diff hunting (suite vs codebase / spec / prod logs / JIRA), feature-pair matrix, user-flow edge enumeration, surprise-seeking time, boundary-of-features hunting, galumphing, hostile interview, production-error mining, charter-from-gap protocol, debrief net-new-scenario rule. Every session must end with at least one net-new scenario or be logged as re-validation, not exploration.
- **session-based-testing.md** — Core SBTM framework: charter creation, CRISP/SFDPOT heuristics, basic exploration tours, session notes template, debrief process, coverage tracking, learning loops
- **adversarial-heuristics.md** — Heuristics for breaking the app: Whittaker's 10 tours (Garbage Collector, Bad Neighborhood, Couch Potato, Antagonistic, Saboteur, Obsessive-Compulsive, Supermodel, Lonely Businessman, All-Nighter, Tourist), FAILURE mnemonic, Soap Opera Testing template + 2 VC examples, HICCUPPS-F oracles, combination guide
- **personas.md** — Persona-driven exploration: 6 personas (Impatient Buyer, Screen-Reader User, Malicious User, Slow-Network User, B2B Procurement Officer, Session-Corrupted User) with mindset, test ideas, what they typically find, and recommended heuristic pairings
- **modern-web-attack-surface.md** — Browser-specific probes: DevTools-as-attack-tool, multi-tab state collisions, storage/cache drift (incl. ServiceWorker), history/router races, browser-feature attack surface (autofill, dark mode, zoom, print, reduced-motion), network-layer probes, performance/memory probes. Each probe linked to Chrome DevTools MCP or Playwright MCP execution
- **charter-library.md** — 11 ready-to-use charters: Checkout Edge Cases, B2B Procurement, Admin Resilience, API Edge Cases, Feature Flag Lifecycle, Performance & Resource Stress, Accessibility Exploratory, i18n/Localization, Mobile Gesture-Specific, Search Relevance, Cache & State Drift

## Execution

1. **Read the methodology references:** Load `scenario-discovery.md` FIRST — it defines the primary lens (finding scenarios we don't cover). Then `session-based-testing.md` for the core SBTM framework. Consult `../../agents/knowledge/vc-bug-catalog.md` BEFORE the session to learn what NOT to re-discover. For Risk and Edge-Case charters, also load `adversarial-heuristics.md` (apply as filters / familiar-problems oracle, not as a checklist). Pick a persona from `personas.md` when the session benefits from a specific user lens. Reach for `modern-web-attack-surface.md` when probing cache, multi-tab, or browser-feature surfaces.

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
- `/qa-coverage-gap` provides programmatic coverage analysis complementary to manual scenario discovery
- Findings feed into `/qa-metrics` (defect density, escape rate)

## Test Data
Discovery sessions hit live data that drifts. Resolve at runtime via the decision tree in [`../../agents/knowledge/live-discovery.md`](../../agents/knowledge/live-discovery.md): `live-discover` for any-entity navigation, `random-data` for unique throwaway inputs, `@td(ALIAS.field)` for specific assertion targets. Never hardcode GUIDs/SKUs/prices encountered during a session — when a discovered gap becomes a follow-up test case, the new case must use this decision tree.

## Rules
- **Discovery first**: every exploratory session must end with at least one net-new scenario (not covered by any CSV suite or the VC bug catalog). If it doesn't, log it as `[VAL]` re-validation, not `[EXP]` exploration (see `scenario-discovery.md` § 10).
- Every exploratory session must have a written charter — no aimless clicking (except for the 10-min surprise-seeking time at the start, which IS the discipline)
- Time-box is mandatory: 30 minutes per session, extendable to 45 min max
- Log findings in real-time, not from memory after the session
- Debrief is not optional — every session ends with a findings review AND a net-new-scenario answer
- Coverage tracking matrix must be updated after each session, with `[EXP]/[VAL]` marker
- At least 2 exploratory sessions required before any full release (per quality-gates.md)
