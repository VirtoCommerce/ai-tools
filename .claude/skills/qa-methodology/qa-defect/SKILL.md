---
description: "[QA Method] Defect management lifecycle: JIRA Bug Workflow, triage, classification, report validation, verification protocol, defect metrics."
argument-hint: "triage VCST-XXXX | verify VCST-XXXX | classify | workflow | metrics"
---

# /qa-defect — Defect Management Lifecycle

Manages the full defect lifecycle from detection through triage, classification, fix verification, and closure. Provides the JIRA Bug Workflow (16 statuses), triage routing, report validation, verification protocol, and defect process health metrics.

## Usage

```
/qa-defect                       # Full lifecycle overview + JIRA workflow map
/qa-defect triage VCST-1234      # Triage a bug: validate report, check duplicates, classify, assign
/qa-defect verify VCST-1234      # Verify a fix: re-run STR, check regression, transition JIRA
/qa-defect classify              # Show defect type taxonomy + root cause categories
/qa-defect workflow              # Show JIRA Bug Workflow (16 statuses, all transitions)
/qa-defect metrics               # Defect process health: aging, MTTR, reopen rate, escape rate
```

## Execution

1. Load `defect-lifecycle-workflow.md` from this skill folder.
2. Determine context from argument:
   - No argument → full lifecycle overview with JIRA workflow diagram
   - `triage VCST-XXXX` → triage workflow
   - `verify VCST-XXXX` → fix verification protocol
   - `classify` → defect type taxonomy + root cause categories
   - `workflow` → JIRA Bug Workflow diagram + transition table
   - `metrics` → defect process health indicators
3. **For triage:** Fetch ticket via Atlassian MCP → validate report completeness (12-item checklist) → check for duplicates (JQL: `summary ~ "keyword" AND status != Cancelled`) → classify defect type + root cause → assess severity + priority (reference `/qa-risk`) → route to owner via triage matrix → set JIRA fields + recommend transition.
4. **For verify:** Fetch ticket + linked PR via Atlassian MCP → confirm fix is deployed → execute original STR verbatim (must pass 3 consecutive times) → run 2-3 adjacent regression checks → check for side effects (console errors, network failures) → decision: all pass → transition TESTED → DONE; any fail → transition TESTED → REOPEN with new evidence.
5. **For classify:** Show defect type taxonomy (8 types) and root cause categories (6 categories) from `defect-lifecycle-workflow.md` section 6. Suggest classification for the given bug based on symptoms.
6. **For workflow:** Show JIRA Bug Workflow ASCII diagram and full transition table from `defect-lifecycle-workflow.md` sections 1-3. Highlight QA-owned transitions.
7. **For metrics:** Compute defect process health indicators from JIRA data using JQL queries. Report aging, MTTR, reopen rate, escape rate, density, and verification pass rate against targets.
8. For bug report templates, load `defect-report-templates.md` from this skill folder (frontend + backend templates).

## Integration with Other Skills

| Direction | Skill | Relationship |
|-----------|-------|-------------|
| Upstream | `/qa-investigate` | Bug investigation produces the defect that enters this lifecycle |
| Upstream | `/qa-evidence` | Evidence capture standards used in report validation |
| Upstream | `/qa-risk` | Severity/Priority classification (independent dimensions) |
| Upstream | `/qa-bug` (command) | Bug filing creates the JIRA ticket this skill manages |
| Downstream | `/qa-metrics` | Defect counts, escape rates, reopen rates feed quality gates |
| Downstream | `/qa-process` | Defect data feeds into Report phase and Close phase retrospectives |

## Rules

- Never transition a JIRA bug without documenting the reason in a comment.
- Always validate report completeness before triaging — missing STR = send back to reporter.
- Verification must re-run original STR (3x) + check at least 1 adjacent flow for regression.
- Duplicate check is mandatory before filing any new bug.
- Severity and Priority are independent dimensions — always set both explicitly.
- Escalate P0 bugs not picked up within 2 hours, P1 bugs not assigned within 1 business day.
