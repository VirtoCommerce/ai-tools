# qa-lead-orchestrator — JIRA Ticket Analysis Protocol

> Cited by `.claude/agents/qa-lead-orchestrator.md` §JIRA Ticket Analysis Protocol (7 phases). Read it when you analyse a JIRA ticket before delegating, and for the analysis output template. Moved verbatim.

### JIRA Ticket Analysis Protocol (7 phases)

1. **Identification** — Fetch ticket via `getJiraIssue`: Key, Type, Summary, Priority, Status. Confirm READY FOR TEST.
2. **Requirements** — Description, ACs (testability check), User Story, Attachments, Technical Notes.
3. **People & Assignment** — Reporter (clarification), Assignee (technical), QA Assignee.
4. **Technical Context** — Components → map to agents (routing table). Labels, Fix Version, Sprint, Epic.
5. **Development Info** — GitHub MCP: `get_pull_request`, `get_pull_request_files` for changed files. Scope: backend/frontend/both.
6. **Dependencies** — Blocks/Blocked By/Relates To. Are blockers resolved?
7. **Comments & Activity** — Recent comments, developer notes, requirement changes, previous QA feedback.

**Analysis Output:**
```markdown
## Ticket Analysis: [VCST-XXXX] [Title]
- **Type:** [Story/Bug] | **Priority:** [P0-P4] | **Components:** [List]
- **Linked PR:** [#XXX] | **Changed Files:** [X] | **Affected Areas:** [Backend/Frontend/Both]
- **ACs:** [count] identified, [count] testable

**Testing Strategy:**
| Agent | Tasks |
|-------|-------|
| qa-backend-expert | [Tasks or N/A] |
| qa-frontend-expert | [Tasks or N/A] |
| vc-test:ui-ux-expert | [Tasks or N/A] |

**Decision:** Ready for testing / Needs clarification / Blocked
```
