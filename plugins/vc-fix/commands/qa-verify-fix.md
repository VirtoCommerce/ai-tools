---
description: "Verify a bug fix: fetch ticket, reproduce original bug, confirm fix, run regression checks, transition the tracker ticket by role."
argument-hint: "VCST-XXXX"
disable-model-invocation: true
---

# /qa-verify-fix — Bug Fix Verification

Pick up a READY-FOR-TEST bug ticket, verify the fix on the live environment, and transition the tracker ticket based on the result. You run this orchestration inline — do NOT delegate to another orchestrator agent. This is the **QA-side twin** of `/qa-fix`: `/qa-fix` drives a bug to an open PR and stops at the *in-review* role; `/qa-verify-fix` picks it up once the fix is deployed and moves it through the QA-side roles (`testing` → `tested`, or back to `reopen`).

> **Profile-driven, not Jira/GitHub-hardcoded.** Which **bug tracker** (Jira / Azure Boards) and
> **code host** (GitHub / Azure Repos) every step talks to comes from `project-profile.json`
> (written by `/project-init`), exactly as in `/qa-fix`. Read
> [`knowledge/execution/tracker-ops.md`](../knowledge/execution/tracker-ops.md) for the per-tracker
> resolve/comment/transition recipes, the **live transition discovery** rule (resolve a status by
> lifecycle ROLE, never a hardcoded workflow name), ticket-key formats, the host-aware PR-read
> mechanism (§3), and the platform-only build-version check (§5). `/qa-fix` already leaves the
> QA-side role states — `roleStates["testing"]` / `["tested"]` / `["reopen"]` (+ `["done"]`) — in the
> profile **specifically for this command to consume**. **With no profile ⇒ Jira / `gh` /
> `vc-deploy-dev` — the original behaviour, unchanged.**

## Usage
```
/qa-verify-fix VCST-1234              # Verify a single bug fix
/qa-verify-fix VCST-1234 VCST-1235    # Verify multiple bug fixes sequentially
```

---

## Orientation — the deployment profile is the KEY (read it once, first)

Before Step 0, read `project-profile.json` from the project root once and treat it as the
declarative source of truth (mirroring `/qa-fix`'s Orientation block). `/project-init` has **baked**
the resolved facts into it, so do **not** re-derive tracker/host behaviour and do **not** ask the
operator what the profile already answers. **Absent profile ⇒ every field below is empty ⇒ fall back
to the Jira / GitHub / `vc-deploy-dev` behaviour — this section changes nothing for the native path.**

- **Paths & cwd discipline** (`profile.paths`): use `paths.projectRoot` as the absolute base for
  everything — `.env`/secrets (`join(projectRoot, paths.secretsEnv)`), `paths.reports`. Invoke plugin
  scripts (`ado.mjs`) by the `paths.pluginRoot` (`$CLAUDE_PLUGIN_ROOT`) absolute path. Load secrets
  ONLY from the absolute path. Never print a PAT/token.
- **Execution mode** (`profile.runtime`): when `helpersRunnable` is `false` (installed plugin) read
  the baked profile fields — do not try to run/emulate the `.ts` routing helpers.
- **Tracker** (`profile.tracker.kind`): `jira` ⇒ Atlassian MCP; `azure` ⇒ the ADO helper
  `node "$pluginRoot/skills/qa-fix-routing/ado.mjs" <cmd>` (`get-workitem`, `comment`, `transition`,
  `get-file`, `list-refs`, `list-states`; org/project/apiBase default from the profile). Use the
  tracker's own **key format** (`profile.tracker.ticketKeyFormat`): Jira `ABC-123`, Azure Boards a
  **bare numeric** `12345` — never assume `VCST-`.
- **QA-side role → state** (`profile.tracker.azure.roleStates`): map the lifecycle ROLE to a real
  deployment state — `testing` (QA in progress) · `tested` (QA passed) · `reopen` (QA rejected, back
  to dev) · `done` (final). These are the deployment's REAL states (e.g. LEO's Bug: `testing`→`On QA`,
  `tested`→`Tested on QA`, `reopen`→`Reopen`, `done`→`Closed`). The QA roles are scanned best-effort;
  **if a role is absent from an older profile, fall back to `ask` + `ado.mjs list-states --type Bug`
  and confirm the state with the operator — do NOT invent a state.**
- **Transition policy** (`profile.tracker.azure.transitionPolicy`): `auto` ⇒ transition silently by
  role and just **log** it (NO operator prompt); `confirm-once` ⇒ one upfront confirmation of the
  role→state plan; `ask` ⇒ confirm each transition (the original conservative behaviour; Jira and any
  unscanned map default here). This **replaces** every "Ask the user before transitioning".
- **Build-verify source** (`profile.buildVerify.source`): `vc-deploy-dev` (native — GitHub MCP read
  of the deploy manifest), `modules-endpoint` (client — `GET {BACK_URL}/api/platform/modules`),
  `ticket` (frontend-only client — take the storefront version from the ticket). Empty/`""` ⇒ auto by
  `projectType` = the native `vc-deploy-dev` path. See `tracker-ops.md` §5.
- **Code host** (`profile.vcs.clientHost` / the routed repo's host): `github` ⇒ `gh pr view`/`gh pr
  diff`; `azure-repos` ⇒ `ado.mjs` (`list-refs` / `get-file`, or ADO REST for PR details). See
  `tracker-ops.md` §3.

Reference `tracker-ops.md` / `project-profile.mjs` — don't restate their content below.

---

## Step 0 — Pre-Flight (per `.claude/templates/agent-dispatch.md`)

1. **Resolve current sprint** — check if `tests/Sprint-current` exists → use it. Otherwise list `tests/` and pick the latest `SprintXX-XX` folder. This becomes `{SPRINT}` for all output paths below.
2. **Environment health** — run `/qa-env-check endpoints`. If unhealthy, warn user — fix may not be deployed or env may be stale.
3. **Duplicate check** — scan `tests/{SPRINT}/VCST-XXXX/` for a verification run in the last 4 hours. If found, warn user and show previous verdict.
4. **Context7 query** — resolve `/virtocommerce/vc-docs`, query the affected module/feature (e.g., `"order status transitions"`, `"cart price recalculation"`) with `tokens: 8000`. Understand expected post-fix behavior to set correct assertions.

## Step 1 — Fetch Ticket & Understand the Bug

**Fetch the ticket** via the profile's tracker (`tracker-ops.md` §2), using the tracker's own key format:
- **Jira** (`tracker.kind = jira`, or no profile) → Atlassian MCP `getJiraIssue`.
- **Azure Boards** (`tracker.kind = azure`) → `node "$pluginRoot/skills/qa-fix-routing/ado.mjs" get-workitem --id <n>` (do NOT hand-roll `curl`+`python`).

If the tracker is not configured/reachable, ask the user to paste:
- Summary, Severity, Priority, Component, Affected Domain
- Steps to Reproduce (STR)
- Expected vs Actual behavior
- Fix description (from dev comment or linked PR)
- Linked PR number

**Validate ticket status:**
- Expected: the fix has reached the **ready-for-test** role state (Jira `READY FOR TEST`, Azure `roleStates["ready-for-test"]` e.g. `Ready for QA`), or is already at the **testing** role state.
- If not in a testable status, warn the user and ask whether to proceed anyway

**Extract key information:**
- Original STR (numbered steps)
- Affected domain(s) — map to the right checklist file by layer (per `feedback_checklist_layer_separation`):
  - Storefront UI / UX → `domain-checklists.md` (#1-33 + `BF`)
  - Admin SPA / modules / REST API → `backend-admin-checklists.md`
  - GraphQL xAPI → `graphql-checklist.md`
- Linked PR — read it on the resolved **code host** (`vcs.clientHost` / the routed repo's host; `tracker-ops.md` §3):
  - **GitHub** (or no profile) → `gh pr view <number>` and `gh pr diff <number> --name-only`
  - **Azure Repos** → `ado.mjs list-refs` / `ado.mjs get-file` for the changed files/branch, or an ADO REST `GET …/pullRequests/<id>` for PR details (the ticket usually cross-links it via `AB#<n>`)
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

Transition the ticket to the **`testing`** role state (`tracker-ops.md` §Live transition discovery — resolve by ROLE, never a hardcoded name):
- **Jira** (or no profile) → `getTransitionsForJiraIssue`, then `transitionJiraIssue` on the transition whose target status matches the `testing` role (the VC-internal Jira reference name for this role is `On QA`).
- **Azure Boards** → `ado.mjs transition --id <n> --state <roleStates["testing"]>` (e.g. `On QA`). If `roleStates["testing"]` is absent from an older profile, fall back per policy `ask` + `ado.mjs list-states --type Bug` and confirm the state — don't invent one.

**Honor `tracker.azure.transitionPolicy`:** `auto` ⇒ transition silently and just log it (no prompt); `confirm-once`/`ask` ⇒ confirm (Jira / unscanned default).

Add a tracker comment (Jira `addCommentToJiraIssue` / Azure `ado.mjs comment --id <n> --text-file <path>`):
```
Starting QA verification.
Platform: [PlatformVersion — from the build-verify source, Step 3]
Theme: [theme/storefront version]
Module: [relevant module + version]
PR Build: [PR branch/artifact version confirmed deployed]
Environment: [FRONT_URL or BACK_URL]
Test scope: STR verification (3x) + domain regression + side effect check
```

If the tracker is unavailable, skip the transition and note it in the final report.

---

## Step 3 — Confirm Fix Deployment

Before testing, verify the fix is actually deployed. **The version source branches on `profile.buildVerify.source`** (`tracker-ops.md` §5 — the `vc-deploy-dev` manifest is VirtoCommerce-internal; a client deployment has no access):

1. **Fetch deployed versions** — by `buildVerify.source`:
   - **`vc-deploy-dev`** (native platform; also the default when the source is `""`/absent) — use **GitHub MCP** to read `backend/packages.json` and `theme/artifact.json` from `VirtoCommerce/vc-deploy-dev`. Branch defaults to `vcst-qa`; switch to the branch matching `TEST_ENV` (`vcptcore`, `virtostart`, …) when running against another env.
   - **`modules-endpoint`** (client) — `GET {BACK_URL}/api/platform/modules` with an admin token; the deployment reports its own module/Platform versions. (Theme/storefront version comes from the storefront or the ticket.)
   - **`ticket`** (frontend-only client bug) — take the storefront version from the ticket's system info; do NOT call the admin modules endpoint (that's a backend check needing a token).
2. **Verify PR build is deployed** — PRs are deployed to QA while still open (not merged). Read the PR on the resolved code host (`tracker-ops.md` §3):
   - **GitHub** (or no profile) → `gh pr view <number> --json title,state,headRefName` for PR details + the expected build artifact version
   - **Azure Repos** → `ado.mjs list-refs` (branch exists) / an ADO REST `GET …/pullRequests/<id>` for PR details
   - Cross-reference: the deployed module/theme version should match the PR's build artifact (e.g., alpha version like `2.44.0-alpha.2262`)
3. If the fix touches frontend: navigate to the affected page and check for expected UI changes
4. If the fix touches backend API: make a quick API call to verify the endpoint responds as expected
5. If environment uses cache: note potential cache staleness — if STR still fails, ask user about cache invalidation before reopening
6. **Record** platform version, theme version, and relevant module versions — include in verification report and tracker comments

If the fix is NOT deployed, warn user and ask whether to wait. Do NOT proceed with verification against old code.

---

## Step 4 — Generate Verification Checklist

**Load knowledge files** relevant to the affected domain(s) from `knowledge/`:
- **business-logic.md** — find `BL-*` invariants for the affected domain
- **e-commerce-edge-cases-library.md** — find `ECL-*` patterns relevant to the bug

**Build a 6-10 item verification checklist** combining:
1. **BF checklist** (from `domain-checklists.md` § BF) — always include all 10 items
2. **Affected domain checklist** — pick 2-3 adjacent items most relevant to the bug from the right layer file:
   - Storefront UI/UX → `domain-checklists.md` § #1-33
   - Admin SPA / modules / REST API → `backend-admin-checklists.md`
   - GraphQL xAPI → `graphql-checklist.md`
3. **Business rules** — any `BL-*` invariants that could be affected by the fix (`BL-UI-*` for layout/visual fixes)

Output the checklist before executing. The Cross-Layer section depends on the dispatched agent:

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
Cross-Layer (all dispatched agents in this plugin — qa-frontend-expert / qa-backend-expert / qa-testing-expert):
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

> Storybook / design-system / WCAG a11y verification (`ui-ux-expert`) — full `vc-qa` plugin only, not shipped here.

**Agent prompt must include:**
- The ticket ID and bug summary
- The complete verification checklist from Step 4
- Original STR — must pass **3 consecutive times**
- Environment URLs (from `config.js` / `.env`), scoped to the dispatched agent:
  - `qa-frontend-expert` / `qa-testing-expert` → `FRONT_URL`
  - `qa-backend-expert` → `BACK_URL` (+ `FRONT_URL` if the fix has a storefront-visible side)
- Browser server assignment
- Output path: `tests/{SPRINT}/VCST-XXXX/`
- Evidence requirements: screenshot at previously-failing step, console log, network errors, HAR file
- Instruction to follow `skills/qa-evidence/evidence-capture-policy.md`

**Agent prompt structure:**
```
Verify bug fix for VCST-XXXX on the [backend / frontend].

Bug: [summary]
Fix: [what the dev changed]
Environment: {FRONT_URL} / {BACK_URL}  (use those that apply)
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
Follow skills/qa-evidence/evidence-capture-policy.md

Write results to tests/{SPRINT}/VCST-XXXX/verification-report.md
```

---

## Step 6 — Decide & Transition the Ticket

After the agent returns, evaluate results against the decision matrix. The verdict maps to a lifecycle
**ROLE**, not a hardcoded workflow name (`tracker-ops.md` §Live transition discovery). Each row is one
or two role transitions from `testing`:

| STR Result | Regression | Side Effects | Decision | Transition(s) — by ROLE |
|-----------|-----------|-------------|----------|----------------|
| Pass 3/3 | All pass | None | **VERIFIED** | testing → `tested` → `done` |
| Pass 3/3 | All pass | Minor (P3) | **VERIFIED WITH NOTES** | testing → `tested` — add note in comment |
| Pass 3/3 | 1+ fail | — | **FIX OK, NEW REGRESSION** | testing → `tested` + file new bug via `/qa-bug` |
| Fail any | — | — | **FIX INCOMPLETE** | testing → `reopen` |
| Pass 2/3 | — | — | **INTERMITTENT** | testing → `reopen` (note intermittent) |
| Blocked | — | — | **BLOCKED** | No transition, comment with blocker |

**Resolve each role → the live workflow** (`tracker-ops.md` §2, §Live transition discovery):
- **Jira** (or no profile) → `getTransitionsForJiraIssue`, pick the transition whose target status matches the role (case-insensitive contains: "test" for `tested`, "reopen"/"fix" for `reopen`, "done" for `done`). The VC-internal Jira reference names for these roles are `Finish test` → `tested`, `Move to Done` → `done`, `Need fixes` → `reopen` — use them to recognize the transition, never as a hardcoded id.
- **Azure Boards** → `ado.mjs transition --id <n> --state <roleStates[role]>` (LEO: `tested`→`Tested on QA`, `reopen`→`Reopen`, `done`→`Closed`). If a QA role is absent from an older profile, fall back to `ask` + `ado.mjs list-states --type Bug` and confirm the state with the operator — don't invent a state.

**Honor `tracker.azure.transitionPolicy`** (this replaces the old "Ask the user before transitioning"): `auto` ⇒ transition silently by role and log it; `confirm-once` ⇒ one upfront confirmation of the plan; `ask` ⇒ confirm each (Jira / unscanned default). Skip entirely if the tracker is not configured, and note it in the report.

**Tracker comment for VERIFIED (`testing` → `tested`):**
```
QA PASSED — Fix verified.
STR: Passed 3/3 runs
Regression: [X] adjacent checks — all passed
Console: No new errors
Side effects: None
Evidence: tests/{SPRINT}/VCST-XXXX/
Business rules verified: [BL-* list or "N/A"]
```

**Tracker comment for REOPEN (`testing` → `reopen`):**
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
  "tracker_transition": {"role": "tested", "state": "TESTED"},
  "artifacts": "tests/{SPRINT}/VCST-XXXX/"
}
```
(`tracker_transition.role` is the lifecycle role applied; `state` is the resolved destination status —
Jira `TESTED`, Azure `roleStates["tested"]` e.g. `Tested on QA`.)

Output to the user: verdict, STR result, checklist score, regressions found, tracker transition, and artifact paths.

**Bug report lifecycle:** locate any matching local bug report in `reports/bugs/open/` (by ticket ID or title keywords), then route by verdict:

| Verdict | Action on the local bug report |
|---------|-------------------------------|
| VERIFIED / VERIFIED_WITH_NOTES | Add `## Resolution` block (fixed version, tracker ticket, verification date, method) → set `## Status: FIXED` → move `open/` → `fixed/` |
| FIX_INCOMPLETE / NEW_REGRESSION / INTERMITTENT | Append a `## Verification YYYY-MM-DD` block (verdict + STR result + linked evidence) → leave file in `open/` |
| BLOCKED | Append a `## Blocked YYYY-MM-DD` note (blocker description) → leave file in `open/` |

`reports/bugs/closed/` and `reports/bugs/rejected/` are managed manually (closed by QA lead, rejected during triage) — this command does not move files into them.

---

## Rules

- Follow `skills/qa-evidence/output-paths.md` for artifact output paths and naming conventions
- Follow `.claude/templates/agent-dispatch.md` for dispatch conventions, browser fallback, and error handling; tracker transitions follow `knowledge/execution/tracker-ops.md` (profile-driven, by role)
- Read the deployment profile once (Orientation) and route every tracker/host/build-verify op through it; **no profile ⇒ Jira / `gh` / `vc-deploy-dev`, unchanged**
- Never print a PAT/token; all externally-facing content in English
- Browser fallback: chrome→firefox, edge→chrome, firefox→edge (max 1 retry)
- Never use WebKit — not supported on Windows
- Never assign two agents to the same browser server simultaneously
- Read all URLs from config.js / .env — never hardcode
- Max 3 concurrent browser agents
- Always reproduce the original bug first before confirming the fix
- STR must pass 3 consecutive times — 2/3 is not sufficient (marks as intermittent)
- Always query Context7 in Step 0 to understand expected post-fix behavior
- Tracker transitions follow `profile.tracker.azure.transitionPolicy` (`auto` ⇒ silent by role; `confirm-once`/`ask` ⇒ confirm — the Jira / unscanned default), consistent with `/qa-fix` and `/qa-bug`
- If the tracker is unavailable, skip transitions but still execute the full verification
- If the fix is not deployed, stop immediately — do not test against the old code
- If an agent fails with an internal error, fall back to working directly rather than retrying
- For multi-ticket verification (`VCST-1234 VCST-1235`), process sequentially — each ticket gets its own full flow
- If verification reveals a NEW regression (FIX OK but adjacent feature broken), escalate via `/qa-bug` with evidence from the verification run
- Cross-reference with `/qa-defect verify` protocol (section 7 of `defect-lifecycle-workflow.md`) for the canonical verification steps
