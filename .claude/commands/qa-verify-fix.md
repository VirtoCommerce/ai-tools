---
description: "Verify a bug fix: fetch ticket, reproduce original bug, confirm fix, run regression checks, transition JIRA."
argument-hint: "VCST-XXXX"
disable-model-invocation: true
---

# /qa-verify-fix — Bug Fix Verification

Pick up a READY FOR TEST bug ticket, verify the fix on the live environment, and transition JIRA based on the result. You run this orchestration inline — do NOT delegate to another orchestrator agent.

## Usage
```
/qa-verify-fix VCST-1234              # Verify a single bug fix
/qa-verify-fix VCST-1234 VCST-1235    # Verify multiple bug fixes sequentially
```

---

## Step 0 — Pre-Flight (per `.claude/templates/agent-dispatch.md`)

1. **Environment health** — run `/qa-env-check endpoints`. If unhealthy, warn user — fix may not be deployed or env may be stale.
2. **Duplicate check** — scan `tests/{SPRINT}/VCST-XXXX/` for a verification run in the last 4 hours. If found, warn user and show previous verdict.
3. **Context7 query** — resolve `/virtocommerce/vc-docs`, query the affected module/feature (e.g., `"order status transitions"`, `"cart price recalculation"`) with `tokens: 8000`. Understand expected post-fix behavior to set correct assertions.

## Step 1 — Fetch Ticket & Understand the Bug

**Resolve current sprint** — check if `tests/Sprint-current` exists → use it. Otherwise list `tests/` and pick the latest `SprintXX-XX` folder. This becomes `{SPRINT}` for all output paths.

**Fetch the ticket** via Atlassian MCP (`getJiraIssue`). If Atlassian MCP is not configured, ask the user to paste:
- Summary, Severity, Priority, Component, Affected Domain
- Steps to Reproduce (STR)
- Expected vs Actual behavior
- Fix description (from dev comment or linked PR)
- Linked PR number

**Validate ticket status:**
- Expected: `READY FOR TEST` or `TESTING`
- If not in a testable status, warn the user and ask whether to proceed anyway

**Extract key information:**
- Original STR (numbered steps)
- Affected domain(s) — map to domain checklists (#1-22 in `domain-checklists.md`)
- Linked PR: run `gh pr view <number>` and `gh pr diff <number> --name-only` to see what changed
- Root cause (from dev comment or PR description)

**Output before proceeding:**
```
Ticket: VCST-XXXX | Severity: High | Priority: P1 | Component: Cart
Status: READY FOR TEST
Domain: Cart/Checkout (#8)
STR: 5 steps identified
Linked PR: #789 (3 files changed: frontend)
Fix: [brief description of what the dev fixed]
```

---

## Step 2 — Transition to TESTING

Transition the JIRA ticket to TESTING status via Atlassian MCP (`transitionJiraIssue`, transition name: `On QA`).

Add a JIRA comment:
```
Starting QA verification.
Platform: [PlatformVersion from packages.json]
Theme: [theme version from artifact.json]
Module: [relevant module + version from packages.json]
PR Build: [PR branch/artifact version confirmed deployed]
Environment: [FRONT_URL or BACK_URL]
Test scope: STR verification (3x) + domain regression + side effect check
```

If Atlassian MCP is unavailable, skip the transition and note it in the final report.

---

## Step 3 — Confirm Fix Deployment

Before testing, verify the fix is actually deployed per `agent-dispatch.md § Build Verification`:

1. **Fetch deployed versions** — use GitHub MCP to read `backend/packages.json` and `theme/artifact.json` from `VirtoCommerce/vc-deploy-dev` (branch `vcst-qa`)
2. **Verify PR build is deployed** — PRs are deployed to QA while still open (not merged). Check:
   - `gh pr view <number> --json title,state,headRefName` to get PR details and expected build artifact version
   - Cross-reference: the module/theme version in the deploy repo should match the PR's build artifact (e.g., alpha version like `2.44.0-alpha.2262`)
3. If the fix touches frontend: navigate to the affected page and check for expected UI changes
4. If the fix touches backend API: make a quick API call to verify the endpoint responds as expected
5. If environment uses cache: note potential cache staleness — if STR still fails, ask user about cache invalidation before reopening
6. **Record** platform version, theme version, and relevant module versions — include in verification report and JIRA comments

If the fix is NOT deployed, warn user and ask whether to wait. Do NOT proceed with verification against old code.

---

## Step 4 — Generate Verification Checklist

**Load knowledge files** relevant to the affected domain(s) from `.claude/agents/knowledge/`:
- **business-logic.md** — find `BL-*` invariants for the affected domain
- **e-commerce-edge-cases-library.md** — find `ECL-*` patterns relevant to the bug

**Build a 6-10 item verification checklist** combining:
1. **BF checklist** (from `domain-checklists.md` § BF) — always include all 10 items
2. **Affected domain checklist** (from `domain-checklists.md` § #1-22) — pick 2-3 adjacent items most relevant to the bug
3. **Business rules** — any `BL-*` invariants that could be affected by the fix

Output the checklist before executing:
```
Verification Checklist for VCST-XXXX:
Fix Confirmation:
  [ ] 1. Reproduce original bug (STR from ticket)
  [ ] 2. Verify fix resolves the reported issue
  [ ] 3. Root cause addressed (not just symptom)
Regression:
  [ ] 4. [Adjacent feature A] still works
  [ ] 5. [Adjacent feature B] still works
  [ ] 6. No new console errors
Cross-Layer:
  [ ] 7. Storefront reflects corrected behavior
  [ ] 8. API returns expected response
Edge Cases:
  [ ] 9. [Boundary condition from original bug]
  [ ] 10. BL-XXX-NNN: [business rule text]
```

---

## Step 5 — Execute Verification

**Determine affected area and dispatch agent:**

| Affected Area | Agent | Browser |
|---|---|---|
| Storefront UI, checkout, cart, search | `qa-frontend-expert` | `playwright-chrome` |
| Admin SPA, APIs, modules, GraphQL | `qa-backend-expert` | `playwright-edge` |
| Cross-browser or debugging needed | `qa-testing-expert` | `playwright-firefox` |
| Both frontend + backend | Two agents in parallel | Respective browsers |

**Agent prompt must include:**
- The ticket ID and bug summary
- The complete verification checklist from Step 4
- Original STR — must pass **3 consecutive times**
- Environment URLs (from `config.js`: `FRONT_URL`, `BACK_URL`)
- Browser server assignment
- Output path: `tests/{SPRINT}/VCST-XXXX/`
- Evidence requirements: screenshot at previously-failing step, console log, network errors, HAR file
- Instruction to follow `.claude/skills/qa-methodology/qa-evidence/evidence-capture-policy.md`

**Agent prompt structure:**
```
Verify bug fix for VCST-XXXX on the [backend/frontend].

Bug: [summary]
Fix: [what the dev changed]
Environment: {FRONT_URL} / {BACK_URL}
Browser: {BROWSER_SERVER}
Output: tests/{SPRINT}/VCST-XXXX/

Steps to Reproduce (run 3 consecutive times):
1. [step 1]
2. [step 2]
...

Expected Result (after fix): [what should happen now]
Previously Observed: [what was broken]

Verification Checklist:
[paste full checklist from Step 4]

For each checklist item, report: PASS / FAIL / BLOCKED with brief evidence.
Take a screenshot at the step that previously failed.
Capture console errors and network failures.
Follow .claude/skills/qa-methodology/qa-evidence/evidence-capture-policy.md

Write results to tests/{SPRINT}/VCST-XXXX/verification-report.md
```

---

## Step 6 — Decide & Transition JIRA

After the agent returns, evaluate results against the decision matrix:

| STR Result | Regression | Side Effects | Decision | JIRA Transition |
|-----------|-----------|-------------|----------|----------------|
| Pass 3/3 | All pass | None | **VERIFIED** | TESTING → TESTED → DONE |
| Pass 3/3 | All pass | Minor (P3) | **VERIFIED WITH NOTES** | TESTING → TESTED (note in comment) |
| Pass 3/3 | 1+ fail | — | **FIX OK, NEW REGRESSION** | TESTING → TESTED + file new bug via `/qa-bug` |
| Fail any | — | — | **FIX INCOMPLETE** | TESTING → REOPEN |
| Pass 2/3 | — | — | **INTERMITTENT** | TESTING → REOPEN (note intermittent) |
| Blocked | — | — | **BLOCKED** | No transition, comment with blocker |

**Ask the user before transitioning JIRA.** Skip if Atlassian MCP is not configured.

**JIRA comment for VERIFIED (TESTED → DONE):**
```
QA PASSED — Fix verified.
STR: Passed 3/3 runs
Regression: [X] adjacent checks — all passed
Console: No new errors
Side effects: None
Evidence: tests/{SPRINT}/VCST-XXXX/
Business rules verified: [BL-* list or "N/A"]
```

**JIRA comment for REOPEN:**
```
QA FAILED — Reopening.
Issue: [what still fails or what new issue was found]
STR result: [X/3 passed]
Evidence: tests/{SPRINT}/VCST-XXXX/
Build: [version/commit tested]
Environment: [URL]
```

---

## Step 7 — Deliver Summary

Write `tests/{SPRINT}/VCST-XXXX/verification-summary.json`:
```json
{
  "ticket": "VCST-XXXX",
  "verdict": "VERIFIED|VERIFIED_WITH_NOTES|FIX_INCOMPLETE|NEW_REGRESSION|INTERMITTENT|BLOCKED",
  "date": "YYYY-MM-DD",
  "environment": "{FRONT_URL}",
  "build": {
    "platform": "{PlatformVersion}",
    "theme": "{theme version}",
    "relevant_modules": {"module-name": "version"},
    "pr_build": "{PR artifact version confirmed deployed}"
  },
  "agent_used": "qa-frontend-expert",
  "str_result": "3/3",
  "checklist_total": 10,
  "checklist_passed": 10,
  "checklist_failed": 0,
  "regression_issues": [],
  "side_effects": [],
  "bugs_filed": [],
  "business_rules_verified": ["BL-CART-001"],
  "jira_transition": "TESTED → DONE",
  "artifacts": "tests/{SPRINT}/VCST-XXXX/"
}
```

Output to the user: verdict, STR result, checklist score, regressions found, JIRA transition, and artifact paths.

**Bug report lifecycle:** If verdict is VERIFIED or VERIFIED_WITH_NOTES, check `reports/bugs/open/` for a matching bug report (by ticket ID or title keywords). If found:
1. Add a `## Resolution` block to the report with fixed version, JIRA ticket, verification date, and method
2. Update the status line to `## Status: FIXED`
3. Move the file from `reports/bugs/open/` to `reports/bugs/fixed/`

---

## Rules

- Follow `.claude/skills/qa-methodology/qa-evidence/output-paths.md` for artifact output paths and naming conventions
- Follow `.claude/templates/agent-dispatch.md` for dispatch conventions, browser fallback, error handling, and JIRA transitions
- Browser fallback: chrome→firefox, edge→chrome, firefox→edge (max 1 retry)
- Never use WebKit — not supported on Windows
- Never assign two agents to the same browser server simultaneously
- Read all URLs from config.js / .env — never hardcode
- Max 3 concurrent browser agents
- Always reproduce the original bug first before confirming the fix
- STR must pass 3 consecutive times — 2/3 is not sufficient (marks as intermittent)
- Always query Context7 in Step 0 to understand expected post-fix behavior
- Ask the user before any JIRA transition
- If Atlassian MCP is unavailable, skip JIRA transitions but still execute the full verification
- If the fix is not deployed, stop immediately — do not test against the old code
- If an agent fails with an internal error, fall back to working directly rather than retrying
- For multi-ticket verification (`VCST-1234 VCST-1235`), process sequentially — each ticket gets its own full flow
- If verification reveals a NEW regression (FIX OK but adjacent feature broken), escalate via `/qa-bug` with evidence from the verification run
- Cross-reference with `/qa-defect verify` protocol (section 7 of `defect-lifecycle-workflow.md`) for the canonical verification steps
