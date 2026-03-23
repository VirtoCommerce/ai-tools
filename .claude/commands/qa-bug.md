---
description: "Reproduce a bug, capture evidence, write a structured report, and optionally create a JIRA ticket."
argument-hint: "bug description | VCST-XXXX | screenshot path"
---

# /qa-bug — File a Bug Report

Create a structured bug report from a description, screenshot, or observed issue. Optionally creates a JIRA ticket.

## Usage
```
/qa-bug Cart total shows $0 after adding item     # Bug from description
/qa-bug VCST-1234                                   # Bug from a JIRA ticket (adds QA evidence)
/qa-bug screenshot path/to/screenshot.png           # Bug from a screenshot
```

---

## Step 0 — Pre-Flight (per `.claude/templates/agent-dispatch.md`)

1. **Build & version verification** — fetch deployed versions per `agent-dispatch.md § Build Verification`:
   - Use GitHub MCP to read `backend/packages.json` and `theme/artifact.json` from `VirtoCommerce/vc-deploy-dev` (branch `vcst-qa`)
   - Record platform version, theme version, and modules relevant to the bug area — include in the bug report (Step 3)
2. **Context7 query** — resolve `/virtocommerce/vc-docs`, query the affected area (e.g., `"cart pricing calculations"`, `"order status workflow"`) with `tokens: 8000`. Verify expected behavior before concluding it's a bug — the observed behavior may be by design.
3. **Duplicate check** — scan `reports/bugs/open/` and `reports/bugs/fixed/` for existing bug reports with the same component/title. If found in `open/`, warn user and show existing report. If found in `fixed/`, check whether it's a regression (same bug resurfaced).

## Step 1 — Gather Bug Details

> **Skills:** Use `/qa-investigate` for structured 5-phase investigation (reproduce → isolate layer → gather evidence → root cause → hand off). Use `/qa-evidence` for capture rules and naming conventions.

**If description provided:**
- Use the qa-testing-expert (Task tool, `subagent_type: qa-testing-expert`) to reproduce the bug
- Follow the `/qa-investigate` flow: reproduce → isolate layer (frontend/backend/infra) → gather evidence
- Agent navigates to the storefront, follows the described scenario
- Captures: screenshot, console errors, network requests, HAR file (per `/qa-evidence` policy)
- Records exact steps to reproduce (STR)

**If JIRA ticket provided:**
- Fetch ticket details via Atlassian MCP
- Use qa-testing-expert to reproduce based on ticket description
- Follow `/qa-investigate` common VC patterns (P1–P8) to isolate the layer
- Add QA evidence to the ticket as a comment

**If screenshot provided:**
- Read the screenshot to identify the page and issue
- Use qa-testing-expert to navigate to the same page and verify

---

## Step 2 — Research Source Code & Logs

> **Tools:** GitHub MCP (`search_code`, `get_file_contents`), Azure MCP (`applicationinsights`), `/qa-investigate` isolation phase.

After reproducing the bug, research the root cause before writing the report:

**Source code research (GitHub MCP):**
- Search `VirtoCommerce/vc-frontend` for the affected component/page (use `search_code` with relevant keywords from error messages, URL paths, or component names)
- If the bug is backend-related, search the relevant module repo (`org:VirtoCommerce vc-module-*`) — use `/qa-investigate` layer isolation to determine which module
- Check recent commits and PRs in the affected file for recent changes that may have introduced the regression
- Look for related issues/PRs: `search_issues` with error text or feature keywords

**Application Insights logs (Azure MCP):**
- Query **vcst-qa** (platform) or **vcst-qa-storefront** (storefront) Application Insights via `applicationinsights` tool
- Search for exceptions, failed requests, or dependency failures matching the bug timeframe
- Use error messages, request URLs, or operation IDs from HAR/network captures as query filters
- Check for correlated server-side errors (e.g., 500s behind a frontend error)
- Resource group: `vcst`, Subscription: `973d0b8c-44bf-438d-a4b7-1c4162d3ccba`

**What to capture:**
- Relevant source code snippet (file path + line range) showing the suspected root cause
- Application Insights exception details or failed request traces
- Recent git commits that may have introduced the regression
- Add findings to the bug report under a **Root Cause Analysis** section

---

## Step 3 — Write Bug Report

> **Skills:** Use `/qa-evidence compact|detailed` for report verbosity tier. Use `/qa-defect classify` for defect type taxonomy and root cause categories.

Generate a report in `reports/bugs/open/` using this naming convention:
`BUG-{Short-Description}.md` or `BUG-{Short-Description}-VCST-XXXX.md` (if a JIRA ticket is known)

### Bug Report Folder Structure

```
reports/bugs/
├── open/        # Active bugs (confirmed, reproduced, ready-to-submit)
├── fixed/       # Verified fixes — kept for regression reference
├── closed/      # Won't fix, cannot reproduce, false positive, duplicate
├── templates/   # Investigation templates (not actual bugs)
├── screenshots/ # Evidence screenshots
```

**Lifecycle:** New bugs → `open/`. When verified fixed → move to `fixed/` with Resolution block. When closed without fix (false positive, cannot reproduce, won't fix, duplicate) → move to `closed/`.

### Status Convention

Every bug report MUST include a status line immediately after the title (line 3):

```markdown
## Status: OPEN | CONFIRMED | REPRODUCED | READY_TO_SUBMIT | FIXED | CLOSED
```

Valid statuses:
- `OPEN` — reported, not yet reproduced
- `CONFIRMED` — reproduced, root cause identified
- `REPRODUCED` — reproduced, root cause not yet identified
- `READY_TO_SUBMIT` — ready to file in JIRA
- `FIXED` — fix verified (move file to `fixed/`)
- `CLOSED` — won't fix / cannot reproduce / false positive / duplicate (move file to `closed/`)

When moving to `fixed/`, add a Resolution block below the status:

```markdown
## Resolution
- **Fixed in:** [version or PR reference]
- **JIRA:** [VCST-XXXX]
- **Verified:** [YYYY-MM-DD]
- **Verification method:** /qa-verify-fix VCST-XXXX
```

### Report Template
```markdown
# BUG: [Short Title]

## Status: OPEN

**Severity:** Critical | High | Medium | Low
**Component:** [Cart | Checkout | Catalog | Search | Payment | Admin | ...]
**Browser:** [Browser + version]
**Environment:** [URL]
**Platform Version:** [from packages.json]
**Theme Version:** [from artifact.json]
**Module Versions:** [relevant modules with versions from packages.json]
**USER_EMAIL**: .env
**USER_PASSWORD**: .env
**Date:** YYYY-MM-DD
**Reported By:** QA Agent

## Steps to Reproduce
1. [Navigate to ...]
2. [Click on ...]
3. [Observe ...]

## Expected Result
[What should happen]

## Actual Result
[What actually happens]

## Evidence
- Screenshot: [path]
- Console errors: [list or "none"]
- Network errors: [list or "none"]
- HAR file: [path or "not captured"]

## Root Cause Analysis
- Source file: [GitHub file path + line range, or "not identified"]
- Suspected cause: [description of the code/config issue]
- Recent changes: [relevant commit SHAs or PRs, or "none found"]
- App Insights: [exception type/message, failed request trace, or "no server-side errors"]

## Impact
[Who is affected and how severely]

## References
- JIRA: [VCST-XXXX or "not filed"]
```

---

## Step 4 — Create JIRA Ticket (optional)

> **Skills:** Use `/qa-defect triage VCST-XXXX` for triage routing (duplicate check, classification, assignment). Use `/qa-risk` to assess severity if unclear.

Ask the user: "Create a JIRA ticket for this bug?"

If yes, use Atlassian MCP (`createJiraIssue`):
- Project: VCST
- Type: Bug
- Summary: from bug title
- Description: full report content in markdown
- Priority: mapped from severity (Critical→Highest, High→High, Medium→Medium, Low→Low)
- Follow `/qa-defect workflow` for correct JIRA Bug Workflow status transitions

Report the ticket key back to the user.

---

## Rules
- Follow `.claude/skills/qa-methodology/qa-evidence/output-paths.md` for artifact output paths and naming conventions
- Follow `.claude/templates/agent-dispatch.md` for dispatch conventions, browser fallback, and error handling
- Always reproduce the bug before filing — never file unverified bugs
- Always include evidence (screenshot + console + network)
- Use the qa-testing-expert agent for reproduction: `playwright-firefox` (fallback: `playwright-edge`)
- Always query Context7 in Step 0 to verify expected behavior — don't file bugs for intended behavior
- Ask before creating JIRA tickets (explicit permission required)
- If a new regression is found during investigation, escalate via `/qa-bug` (separate report)
