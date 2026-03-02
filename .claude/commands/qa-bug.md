---
description: "Reproduce a bug, capture evidence, write a structured report, and optionally create a JIRA ticket."
argument-hint: "bug description | VCST-XXXX | screenshot path"
disable-model-invocation: true
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

## Step 1 — Gather Bug Details

**If description provided:**
- Use the qa-testing-expert (Task tool, `subagent_type: qa-testing-expert`) to reproduce the bug
- Agent navigates to the storefront, follows the described scenario
- Captures: screenshot, console errors, network requests, HAR file
- Records exact steps to reproduce (STR)

**If JIRA ticket provided:**
- Fetch ticket details via Atlassian MCP
- Use qa-testing-expert to reproduce based on ticket description
- Add QA evidence to the ticket as a comment

**If screenshot provided:**
- Read the screenshot to identify the page and issue
- Use qa-testing-expert to navigate to the same page and verify

---

## Step 2 — Write Bug Report

Generate a report in `reports/bugs/` using this naming convention:
`BUG-{SEVERITY}-{SHORT-TITLE}.md`

### Report Template
```markdown
# BUG: [Short Title]

**Severity:** Critical | High | Medium | Low
**Component:** [Cart | Checkout | Catalog | Search | Payment | Admin | ...]
**Browser:** [Browser + version]
**Environment:** [URL]
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

## Impact
[Who is affected and how severely]

## References
- JIRA: [VCST-XXXX or "not filed"]
```

---

## Step 3 — Create JIRA Ticket (optional)

Ask the user: "Create a JIRA ticket for this bug?"

If yes, use Atlassian MCP (`createJiraIssue`):
- Project: VCST
- Type: Bug
- Summary: from bug title
- Description: full report content in markdown
- Priority: mapped from severity (Critical→Highest, High→High, Medium→Medium, Low→Low)

Report the ticket key back to the user.

---

## Rules
- Always reproduce the bug before filing — never file unverified bugs
- Always include evidence (screenshot + console + network)
- Use the qa-testing-expert agent for reproduction (gets a browser via playwright-firefox)
- Ask before creating JIRA tickets (explicit permission required)
