# /qa-test — Test a JIRA Ticket or Feature

Delegate ticket/feature testing to the **qa-lead-orchestrator** agent, which has the full orchestration logic for analyzing scope, dispatching specialists, and producing verdicts.

## Usage
```
/qa-test VCST-1234              # Test a specific JIRA ticket
/qa-test VCST-1234 VCST-1235    # Test multiple tickets
/qa-test checkout flow           # Test a feature area by name
/qa-test PR #789                 # Test changes in a GitHub PR
```

---

## Execution

1. Collect the user's input (ticket IDs, feature name, or PR number).
2. Use the Task tool with `subagent_type: qa-lead-orchestrator`.
3. Pass a prompt including:
   - The ticket IDs, feature names, or PR numbers provided by the user
   - Instruction to follow the qa-lead's ticket analysis protocol (8 phases)
   - Environment URLs from `config.js` (`FRONT_URL`, `BACK_URL`)
   - Output directory: `reports/`
4. The qa-lead-orchestrator handles everything:
   - Fetching JIRA ticket details via Atlassian MCP
   - Analyzing scope and mapping to affected components
   - Dispatching the right specialist agents with correct browser assignments
   - Collecting results and mapping to acceptance criteria
   - Producing a verdict (PASS / PASS WITH NOTES / FAIL / BLOCKED)
   - Transitioning JIRA status (with user confirmation)
5. When the agent returns, relay the verdict and report path to the user.

---

## Agent-to-Browser Mapping (used by qa-lead internally)

| Affected Area | Agent | Browser |
|---------------|-------|---------|
| Storefront UI, checkout, cart, search | qa-frontend-expert | playwright-chrome |
| Admin SPA, APIs, modules, GraphQL | qa-backend-expert | playwright-edge |
| Storybook, accessibility, design system | ui-ux-expert | Chrome DevTools |
| Cross-browser, exploratory, debugging | qa-testing-expert | playwright-firefox |

---

## Verdict Definitions

| Verdict | Meaning |
|---------|---------|
| **PASS** | All acceptance criteria met, no bugs found |
| **PASS WITH NOTES** | ACs met but minor issues or observations noted |
| **FAIL** | One or more ACs not met |
| **BLOCKED** | Cannot test (environment, missing data, dependency) |
