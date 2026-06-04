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

**Layer → repo-kind → repo mapping** — this is the **load-bearing handoff to `/qa-fix`**. The owning
layer fixes the `repoKind`; Step 3 then resolves the *exact* repo. The vocabulary below is the same one
`ci/lib/repo-router.ts` (`repoKind` / `isAllowedRepo`) and `ci/config/fix-repos.json` use — keep them in
sync, never invent a different one.

| Lowest FAIL layer | `repoKind` | Owning repo | Notes |
|---|---|---|---|
| **Layer 4** REST | `module` (or `platform`) | `vc-module-<name>`; `vc-platform` if security/RBAC/users/dynamic-properties/platform-settings | Lowest layer wins — REST wrong = the whole stack inherits it. |
| **Layer 3** xAPI only | `module` | `vc-module-x-<name>` (xCart/xCatalog/xOrder/xProfile/xCMS) | REST correct + GraphQL wrong = resolver/aggregation bug in the **x-** module. |
| **Layer 2** Admin only | `module` | `vc-module-<name>` (**same repo as Layer 4** — the Admin SPA Angular UI ships *inside* the module repo) | Admin-UI-only bug → the module's `*.Web`/Angular SPA, not a separate repo. |
| **Layer 1** Storefront only | `frontend` | `vc-frontend` | REST + GraphQL + Admin all correct, only the storefront UI is wrong = theme/component/client-state bug. |

> **Heuristic, not authority.** This table fixes the *kind*; the *exact* repo is confirmed in Step 3 via
> `module-suite-map.md` + the `fix-repos.json` routing hints + `search_code`. `/qa-fix` Gate 1 re-validates
> your choice with `isAllowedRepo()` — so a wrong guess is caught, but a **named, evidence-backed repo**
> lets Gate 1 confirm instead of re-deriving.

---

## Step 3 — Research Source Code & Logs + Resolve the Exact Repo

> **Tools:** GitHub MCP (`search_code`, `get_file_contents`), Azure MCP (`applicationinsights`), `/qa-investigate` isolation phase.

After reproducing the bug, research the root cause before writing the report:

### Step 3a — Resolve the exact owning repo (drives `/qa-fix` Gate 1)

Step 2 gave you the `repoKind` and a layer. Now name the **one** concrete repo so the bug report carries a
ready-to-route target. Resolve it deterministically (do **not** free-guess):

1. **Map the domain → module** via [`.claude/agents/knowledge/module-suite-map.md`](../agents/knowledge/module-suite-map.md)
   (the *Module → REST API Path → xAPI Module* table). The failing REST path (`/api/pricing/…` → `vc-module-pricing`)
   or the xAPI module name (xCatalog → `vc-module-x-catalog`) from your Layer 3/4 capture is the strongest signal.
2. **Cross-check against the routing hints** in [`ci/config/fix-repos.json`](../../ci/config/fix-repos.json)
   `routing[]` — these are the exact `text → repo` rules `/qa-fix`'s `suggestRepo()` applies. If your domain
   matches a rule, use that repo name verbatim (e.g. CyberSource → `vc-module-CyberSource`, promotion/coupon →
   `vc-module-marketing`, xAPI+promotion → `vc-module-marketing-experience-api`).
3. **Confirm with `search_code`** on the RCA method/error string in the candidate repo (`repo:VirtoCommerce/<name> "<symbol>"`).
   A hit confirms the repo *and* gives you the file:line anchor for the Root Cause Analysis. No hit → widen the
   search or downgrade routing confidence to LOW.
4. **Note the repo class** — one allowed repo (`vc-module-*` / `vc-module-x-*` / `vc-platform` / `vc-frontend`),
   or, if the root cause clearly spans **multiple** repos, name them all and set routing confidence LOW with a
   one-line note. Either way the bug is still filed — picking up / declining the fix is `/qa-fix` Gate 0's call,
   not yours.

Record the result as the **Fix Routing** block (template below). When the layer/RCA is ambiguous, set
routing confidence LOW and say why — `/qa-fix` will still re-validate, but an honest LOW prevents a bad route.

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
- `READY_TO_SUBMIT` — ready to file in JIRA (Fix Routing block filled → eligible for `/qa-fix VCST-XXXX`)
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

> **Scope: local markdown report only** (`reports/bugs/open/BUG-*.md`). For the JIRA ticket payload (Severity / Priority / Labels / Component / Affects Version / Assignee / Linked Issues), use the Frontend + Backend templates in [`.claude/skills/qa-methodology/qa-defect/defect-report-templates.md`](../skills/qa-methodology/qa-defect/defect-report-templates.md) — invoked via `/qa-defect classify` in Step 5. The two templates intentionally diverge: this one adds VC-specific **Status lifecycle**, **4-Layer Validation**, **Module Versions**, **Root Cause Analysis**, and the **Fix Routing** block below; the `/qa-defect` templates carry the JIRA fields.

### Fix Routing block (REQUIRED — the `/qa-fix` handoff contract)

Every report MUST end with this block. It is the **strongest signal** the `/qa-fix` triage agent reads
(per `ci/agents/fix-triage-agent.md`) — naming the layer + exact repo lets Gate 1 *confirm* your finding
instead of re-deriving it. Fill it from Step 2 (owning layer) + Step 3a (exact repo).

```markdown
## Fix Routing (→ /qa-fix)

- **Owning layer:** Layer N — <Storefront | Admin | xAPI | REST>
- **Suggested repo:** VirtoCommerce/<vc-module-… | vc-module-x-… | vc-platform | vc-frontend>
- **repoKind:** module | platform | frontend
- **Component / module:** <e.g. Pricing, xCatalog resolver, vc-frontend PDP>
- **RCA anchor:** <file:line or method/error string for search_code validation>
- **Routing confidence:** HIGH | MEDIUM | LOW  (LOW = ambiguous layer/RCA; say why)
```

> **Scope boundary — report every bug, route honestly.** `/qa-bug` files **all** confirmed defects and
> determines routing for each; it does **not** decide auto-fix eligibility or filter bugs out. Whether a
> bug is auto-fixable (by-design / config-gated / breaking / multi-repo, etc.) is decided downstream by
> `/qa-fix` **Gate 0** (`.claude/rules/quality-gates.md`). If routing genuinely spans multiple repos, just
> say so in **Routing confidence: LOW** + a one-line note — still file the bug.

---

## Step 5 — Create JIRA Ticket (optional)

> **Skills:** Use `/qa-defect triage VCST-XXXX` for triage routing (duplicate check, classification, assignment). Use `/qa-risk` to assess severity if unclear.

Ask the user: "Create a JIRA ticket for this bug?"

If yes, use Atlassian MCP (`createJiraIssue`):
- Project: read from `env.JIRA_PROJECT_KEY` (defaults to `VCST` for backwards compatibility; customer sets their own in `.env` or `.env.${TEST_ENV}`)
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
- **File every confirmed bug — never filter.** `/qa-bug` reports all defects and routes each one; auto-fix
  eligibility (Gate 0) is `/qa-fix`'s decision, not `/qa-bug`'s.
- **Always fill the Fix Routing block** (Step 4) — owning layer + exact repo + `repoKind`. This is the
  `/qa-bug` → `/qa-fix` handoff contract; a named, evidence-backed repo lets `/qa-fix` Gate 1 confirm
  rather than re-derive routing.
- **Keep the routing vocabulary in sync with one source of truth:** `repoKind` and the allowed-repo set
  come from [`ci/lib/repo-router.ts`](../../ci/lib/repo-router.ts) + [`ci/config/fix-repos.json`](../../ci/config/fix-repos.json)
  (the same files `/qa-fix` uses). Resolve the exact module via
  [`module-suite-map.md`](../agents/knowledge/module-suite-map.md). Never invent a parallel naming scheme.
