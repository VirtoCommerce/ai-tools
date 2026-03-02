---
description: "Generate Agile user stories with full BDD acceptance criteria, DoD, and test scenarios for a feature or JIRA epic."
argument-hint: "feature name | VCST-XXXX"
disable-model-invocation: true
---

# /ba-stories — Generate User Stories

Generate Agile user stories with full BDD acceptance criteria for a specific feature, flow, or JIRA epic. This is a shortcut to the ba-story-writer agent.

## Usage
```
/ba-stories checkout              # Stories for the checkout flow
/ba-stories BOPIS                 # Stories for Buy Online Pickup In Store
/ba-stories VCST-1234             # Stories from a JIRA ticket/epic
/ba-stories "product configurator" # Stories for a specific feature
```

---

## Execution

### Step 1 — Understand the Scope

**If a flow/feature name provided:**
1. Search `tests/` and `regression/suites/` for existing test coverage
2. Search the codebase (if available) for related components
3. Use Context7 to check VC docs for the feature (`/virtocommerce/vc-docs`)

**If a JIRA ticket provided:**
1. Fetch ticket details via Atlassian MCP
2. Read description, acceptance criteria, linked issues
3. Identify the epic and related stories

### Step 2 — Generate Stories

Use the Task tool with `subagent_type: general-purpose`, passing the ba-story-writer.md agent prompt along with:
- The feature/flow scope
- Any pain points or requirements gathered in Step 1
- Actor type (guest shopper, registered customer, B2B purchasing agent, catalog manager, etc.)

The ba-story-writer produces stories with:
- Story header (epic, type, module, priority, effort)
- 3-part statement (As a / I want to / So that)
- Background context
- BDD acceptance criteria (Given/When/Then, 3-8 per story)
- Out of scope
- Dependencies
- Definition of Done
- UI/UX notes
- Technical notes
- Test scenario matrix

### Step 3 — Save and Report

Save output to `reports/ba/{feature}-stories.md`

Output a summary to user:
- Number of epics and stories generated
- Story list with IDs and effort estimates
- Path to the full output file

---

## Rules
- Always include at least 1 negative/error acceptance criterion per story
- Use specific VC actors (not "a user")
- Check for story smells before finalizing (too big, vague actor, no error AC, etc.)
- If JIRA ticket: offer to create sub-tasks from the generated stories
