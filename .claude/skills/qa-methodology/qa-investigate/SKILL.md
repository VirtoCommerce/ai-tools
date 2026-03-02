---
description: "[QA Method] Bug investigation: reproduce, isolate root cause, gather evidence, common VC patterns."
argument-hint: "bug description | VCST-XXXX"
disable-model-invocation: true
---

# /qa-investigate — Bug Investigation Flow

Investigate a suspected bug using a structured 5-phase process: Reproduce → Isolate Layer → Gather Evidence → Identify Root Cause → Document & Hand Off.

## Usage
```
/qa-investigate Payment form not submitting on checkout
/qa-investigate VCST-1234
/qa-investigate Flaky test in Suite 04 — cart total sometimes shows $0
```

## Execution

1. **Read the investigation flow:** Load `bug-investigation-flow.md` from this skill folder for the full process, decision tree, and common VC patterns (P1–P8).

2. **Reproduce the bug:**
   - If a JIRA ticket is provided, fetch details via Atlassian MCP
   - Extract exact URL, user action, expected vs actual behavior
   - Attempt reproduction using the appropriate browser (Playwright MCP)
   - Try at least 3 reproduction attempts before declaring "cannot reproduce"

3. **Isolate the layer:**
   - Frontend (DOM/JS) → use Chrome DevTools MCP console + network
   - Backend (API) → check response codes, GraphQL errors, platform healthcheck
   - Infrastructure → check CORS, CDN, SSL, DNS
   - Data → check user account state, inventory, pricing

4. **Gather evidence** per `evidence-capture-policy.md` (in qa-evidence skill):
   - Screenshots of failure state (mandatory)
   - Console errors and network traces
   - HAR file if request-level debugging needed

5. **Identify root cause** by pattern-matching against known VC patterns:
   - P1: Cache stale after admin change
   - P2: GraphQL partial error (200 with errors array)
   - P3: Search index lag
   - P4: Payment gateway timeout
   - P5: Multi-store config bleed
   - P6: Dynamic property missing
   - P7: Permission/role mismatch
   - P8: Background job stuck

6. **Document and hand off:**
   - Write bug report using templates in `.claude/skills/qa-methodology/qa-defect/defect-report-templates.md`
   - Save to `reports/bugs/`
   - Optionally create JIRA ticket via Atlassian MCP

## Rules
- Never file a bug you cannot reproduce
- Always capture evidence before filing
- If cannot reproduce after exhausting checklist, document the failed attempt and escalate
- Distinguish flaky behavior from real bugs (see decision tree in supporting file)
