---
description: "Generate Agile user stories with full BDD acceptance criteria — or review an existing story for weak/missing ACs and AC↔implementation drift."
argument-hint: "feature name | VCST-XXXX | --review VCST-XXXX"
disable-model-invocation: true
---

# /ba-stories — Generate or Review User Stories

Generate Agile user stories with full BDD acceptance criteria for a specific feature, flow, or JIRA epic — **or**, with `--review`, critique an *existing* story for weak ACs, missing ACs, and drift between its ACs and the implementation. Both are shortcuts to the `ba-story-writer` agent (Mode A = write, Mode B = review).

## Usage
```
/ba-stories checkout                # Stories for the checkout flow (write)
/ba-stories BOPIS                   # Stories for Buy Online Pickup In Store (write)
/ba-stories VCST-1234               # Stories from a JIRA ticket/epic (write)
/ba-stories "product configurator"  # Stories for a specific feature (write)
/ba-stories --review VCST-1234      # Review the existing story's ACs — weak sides, gaps, AC↔impl drift
```

---

## Review mode (`--review VCST-XXXX`)

Backlog-grooming / pre-test entry to `ba-story-writer` **Mode B**. Use it to harden a story's ACs before development or before `/qa-test` (which calls the same review inline at its Step 1d).

1. Fetch the ticket via Atlassian MCP (`getJiraIssue`) — summary, description, ACs, components, linked PR. If Atlassian MCP is unavailable, ask the user to paste the story + ACs.
2. Identify the affected domain(s) → pass as `domains` so the BA loads the right `BL-*`/`ECL-*` sets.
3. If a PR is linked, fetch its changed files (`get_pull_request_files`) and pass as `implementation: { pr_diff }` so the review compares each AC against what was built. (No PR → review ACs + gaps only; AC↔impl coverage is marked "no diff available".)
4. Dispatch `ba-story-writer` in review mode (`existing_story`, `jira_ref`, `domains`, `implementation`) — **analyze only, no JIRA/GitHub writes, no replacement story.**
5. Save the review to `reports/ba/{VCST-XXXX}-ac-review.md` and output the scorecard, weak sides, gap-ACs, and AC↔implementation findings to the user. Offer (don't auto-apply) to raise the gap-ACs / clarifications with the story author.

---

## Execution (write mode)

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
- Follow `skills/qa-evidence/output-paths.md` for artifact output paths and naming conventions
- Follow `.claude/templates/agent-dispatch.md` for dispatch conventions and error handling
- **Prerequisite:** Run `/ba-analyze [scope]` first for best results. If no recent analysis exists (check `reports/ba/`), warn user that stories will be based on limited context.
- Always query Context7 (`/virtocommerce/vc-docs`) for technical feasibility of the feature before generating stories
- Always include at least 1 negative/error acceptance criterion per story
- Use specific VC actors (not "a user")
- Acceptance criteria format: Given [precondition], When [action], Then [expected result]
- Check for story smells before finalizing (too big, vague actor, no error AC, etc.)
- If JIRA ticket: offer to create sub-tasks from the generated stories
