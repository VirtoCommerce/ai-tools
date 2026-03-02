---
description: "Run a guided exploratory testing session using CRISP/SFDPOT heuristics to find bugs that scripted tests miss."
argument-hint: "[checkout|catalog|B2B|mobile|new]"
disable-model-invocation: true
---

# /qa-exploratory — Exploratory Testing Session

Run a guided exploratory testing session on a specific area of the application. Uses testing heuristics (CRISP, SFDPOT) to find bugs that scripted tests miss.

## Usage
```
/qa-exploratory checkout          # Explore the checkout flow
/qa-exploratory catalog           # Explore catalog & product pages
/qa-exploratory B2B               # Explore B2B features (quotes, org management)
/qa-exploratory mobile            # Explore at mobile viewport (375px)
/qa-exploratory new               # Explore recently changed areas (from git diff)
```

---

## Execution

Delegate to **qa-testing-expert** (Task tool, `subagent_type: qa-testing-expert`) with the target area.

### Exploration Charter

For each session, the agent should:

1. **Define a charter** — "Explore [area] to find issues with [focus]"
2. **Time-box** — ~20 minutes of active exploration
3. **Apply heuristics:**
   - **CRISP**: Compatibility, Reliability, Installability, Scalability, Performance
   - **SFDPOT**: Structure, Function, Data, Platform, Operations, Time
4. **Try edge cases:**
   - Empty states (no items, no results, cleared cart)
   - Boundary values (0, 1, max quantity, long strings)
   - Rapid actions (double-click, fast navigation, back button)
   - Invalid input (special characters, SQL injection patterns, XSS patterns)
   - State transitions (login/logout mid-flow, expired session)
   - Network conditions (slow connection simulation via DevTools)
5. **Monitor continuously:**
   - Console errors after every action
   - Network failures (4xx, 5xx responses)
   - Visual glitches (overflow, alignment, z-index)
   - Accessibility issues (keyboard navigation, focus management)
6. **Document findings** in `reports/exploratory/` with:
   - Session charter and duration
   - Areas explored (pages visited, actions taken)
   - Bugs found (with evidence)
   - Risk areas identified (things that seem fragile)
   - Questions for the team

### Area-Specific Focus

| Area | Key Things to Explore |
|------|----------------------|
| `checkout` | Guest vs registered, address validation, shipping options, payment errors, back-button behavior |
| `catalog` | Filters + sort combinations, pagination, empty categories, long product names, variant selection |
| `B2B` | Multi-org switching, quote lifecycle, approval workflow, role permissions, bulk order |
| `mobile` | Touch targets, scroll behavior, hamburger menu, form usability, viewport overflow |
| `new` | Read `git log --oneline -20` to find recent changes, focus exploration on affected areas |

---

## Output

Write a session report to `reports/exploratory/exploratory-{area}-{date}.md`:

```markdown
# Exploratory Session: [Area]
**Date:** YYYY-MM-DD
**Duration:** ~X minutes
**Charter:** [What was explored and why]

## Findings

### Bugs Found
| # | Severity | Title | Evidence |
|---|----------|-------|----------|
| 1 | Medium | [description] | [screenshot path] |

### Risk Areas
- [Areas that seem fragile or undertested]

### Observations
- [Interesting behaviors, UX friction, performance notes]

### Questions
- [Things that need clarification from dev/PM]
```

---

## Rules
- Use qa-testing-expert on playwright-firefox
- Monitor console and network throughout
- Capture screenshots for every bug found
- Don't try to fix bugs — just document them
- If a Critical bug is found, stop and report immediately

## Related
- `/qa-sbtm` skill — Full SBTM methodology: charter templates, CRISP/SFDPOT reference, debrief format
