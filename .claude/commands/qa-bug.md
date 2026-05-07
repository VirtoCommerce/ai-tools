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

## Step 2 — 4-Layer Validation (Layer Isolation)

> **Purpose:** Pinpoint which layer owns the bug. Same request flow, four observation points. If the bug appears only at the UI layer but APIs return correct data, it's a presentation bug. If the REST API is wrong, the whole stack inherits it. This isolation is load-bearing for the Root Cause Analysis in the bug report.

Validate the failing scenario across all four layers. Record per-layer PASS / FAIL / N/A in the bug report. Stop early if a lower layer (REST) already fails — higher layers will inherit. Use the browsers/tools listed below and capture evidence at each layer that reproduces.

### Layer 1 — Storefront Frontend (vc-frontend)
- **Where:** `FRONT_URL` (storefront UI)
- **Browser:** qa-testing-expert via `playwright-firefox` (fallback: `playwright-edge`)
- **Verify:** reproduce the user-visible scenario; capture screenshot, console errors, and the network request(s) that back the failing action (copy request URL, payload, status code).
- **Signal:** UI-only bugs = CSS / i18n / client state / component logic.

### Layer 2 — Backend Admin (Admin SPA)
- **Where:** `{BACK_URL}` (Admin SPA — e.g., Orders, Catalog, Customers, Stores modules)
- **Browser:** qa-backend-expert via `playwright-edge` or `Chrome DevTools MCP`
- **Verify:** inspect the same entity (order, product, customer, promotion, etc.) in the admin UI. Does admin show consistent data with what the storefront displayed? Does the admin action (e.g., edit price, change status) succeed?
- **Signal:** Admin-visible mismatch points at module data/logic or stale index. Admin-OK but storefront-broken points at xAPI/frontend.

### Layer 3 — GraphQL xAPI
- **Where:** `{BACK_URL}/graphql` (POST runtime) — GraphiQL UI at `{BACK_URL}/ui/graphiql`. Consult `.claude/agents/knowledge/graphql-schema.md` for schema and `.claude/agents/knowledge/graphiql-interaction.md` for interaction steps
- **Tool:** qa-backend-expert via `playwright-edge` + GraphiQL, or Postman MCP
- **Verify:** re-run the query/mutation the storefront executed (copy operation name + variables from Layer 1 network capture). Compare the raw response to what the UI rendered. Introspect field names/types before writing ad-hoc queries (`feedback_graphql_introspection`).
- **Signal:** xAPI returns wrong data = xAPI resolver/aggregation bug. xAPI returns correct data but UI shows wrong = frontend rendering bug.

### Layer 4 — Platform REST API
- **Where:** `{BACK_URL}/api/...` — see `.claude/agents/knowledge/api-auth.md` for OAuth2 token flow
- **Tool:** qa-backend-expert via Postman MCP (`/qa-postman`) or direct HTTP
- **Verify:** call the underlying Platform REST endpoint (e.g., `/api/catalog/products/{id}`, `/api/order/customerOrders/{id}`, `/api/pricing/prices/search`). Compare response to GraphQL/Admin/UI.
- **Signal:** REST wrong = module/DB/seeding issue (lowest layer). REST right + GraphQL wrong = xAPI bug. REST + GraphQL right + UI wrong = frontend bug.

### Layer Result Block (copy into Step 4 bug report)

```markdown
## Layer Validation

| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | FAIL / PASS / N/A | screenshot + HAR path |
| 2. Backend Admin | FAIL / PASS / N/A | screenshot or "not admin-visible" |
| 3. GraphQL xAPI | FAIL / PASS / N/A | query + response snippet |
| 4. Platform REST API | FAIL / PASS / N/A | endpoint + response snippet |

**Owning layer:** [lowest FAIL layer — this is where the fix belongs]
```

**Layer-to-owner mapping** (informs triage in Step 5):
- Layer 4 FAIL → module team (`vc-module-*` repo)
- Layer 3 FAIL only → xAPI team (`vc-module-x-*` repo)
- Layer 2 FAIL only → Admin SPA / module admin UI
- Layer 1 FAIL only → `vc-frontend` theme / components

---

## Step 3 — Research Source Code & Logs

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

## Step 4 — Write Bug Report

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

## Layer Validation

| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | FAIL / PASS / N/A | [screenshot + HAR path] |
| 2. Backend Admin | FAIL / PASS / N/A | [screenshot or "not admin-visible"] |
| 3. GraphQL xAPI | FAIL / PASS / N/A | [query + response snippet] |
| 4. Platform REST API | FAIL / PASS / N/A | [endpoint + response snippet] |

**Owning layer:** [lowest FAIL layer]

## Root Cause Analysis
- Source file: [GitHub file path + line range, or "not identified"]
- Suspected cause: [description of the code/config issue]
- Recent changes: [relevant commit SHAs or PRs, or "none found"]
- App Insights: [exception type/message, failed request trace, or "no server-side errors"]

## References
- JIRA: [VCST-XXXX or "not filed"]
```

---

## Step 5 — Create JIRA Ticket (optional)

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
- Always complete the 4-layer validation (Step 2) before writing the report — the owning layer drives triage routing and root-cause scope. Mark layers N/A only when the scenario genuinely doesn't exercise that layer (e.g., a pure CSS bug → REST layer N/A).
- Use the qa-testing-expert agent for reproduction: `playwright-firefox` (fallback: `playwright-edge`)
- Always query Context7 in Step 0 to verify expected behavior — don't file bugs for intended behavior
- Ask before creating JIRA tickets (explicit permission required)
- If a new regression is found during investigation, escalate via `/qa-bug` (separate report)
