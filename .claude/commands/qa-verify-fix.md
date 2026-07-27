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

1. **Resolve current sprint** — check if `reports/tickets/Sprint-current` exists → use it. Otherwise list `reports/tickets/` and pick the latest `SprintXX-XX` folder. This becomes `{SPRINT}` for all output paths below.
2. **Environment health** — run `/qa-env-check endpoints`. If unhealthy, warn user — fix may not be deployed or env may be stale.
3. **Duplicate check** — scan `reports/tickets/{SPRINT}/VCST-XXXX/` for a verification run in the last 4 hours. If found, warn user and show previous verdict.
4. **Context7 query** — resolve `/virtocommerce/vc-docs`, query the affected module/feature (e.g., `"order status transitions"`, `"cart price recalculation"`) with `tokens: 8000`. Understand expected post-fix behavior to set correct assertions.

## Step 1 — Fetch Ticket & Understand the Bug

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
- Affected domain(s) — map to the right checklist file by layer (per `feedback_checklist_layer_separation`):
  - Storefront UI / UX → `domain-checklists.md` (#1-33 + `BF`)
  - Admin SPA / modules / REST API → `backend-admin-checklists.md`
  - GraphQL xAPI → `graphql-checklist.md`
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

Add a JIRA comment (**and every JIRA comment in this command** — the verdict/reopen/blocked notes
below): follow `knowledge/execution/tracker-ops.md` §5a **Comment & body style** — Markdown (never Jira
wiki markup), clear, brief, outcome-first, evidence referenced not inlined. The blocks below are
illustrative content, not a literal wire format.
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

1. **Fetch deployed versions** — use **GitHub MCP** (for file reads in the deploy repo) to read `backend/packages.json` and `theme/artifact.json` from `VirtoCommerce/vc-deploy-dev`. Branch defaults to `vcst-qa`; switch to the branch matching `TEST_ENV` (`vcptcore`, `virtostart`, …) when running against another env.
2. **Verify PR build is deployed** — PRs are deployed to QA while still open (not merged). Use the **`gh` CLI** (for PR metadata against the source repo, e.g. `vc-frontend` / `vc-module-*`):
   - `gh pr view <number> --json title,state,headRefName` to get PR details and expected build artifact version
   - Cross-reference: the module/theme version in the deploy repo should match the PR's build artifact (e.g., alpha version like `2.44.0-alpha.2262`)
3. If the fix touches frontend: navigate to the affected page and check for expected UI changes
4. If the fix touches backend API: make a quick API call to verify the endpoint responds as expected
5. If environment uses cache: note potential cache staleness — if STR still fails, ask user about cache invalidation before reopening
6. **Record** platform version, theme version, and relevant module versions — include in verification report and JIRA comments

If the fix is NOT deployed, offer to run [`/qa-deploy-pr`](qa-deploy-pr.md) `<ticket-key>` — it gathers all the fix's fresh PR artifacts (module + platform + storefront) and prepares one gated cross-fork deploy PR onto the env branch (**ask before applying**; never auto-merges — a human merges to deploy). If the user declines, warn and ask whether to wait. Either way, do NOT proceed with the post-fix phase against old code.

> **Deployment is authoritative, not inferred.** A *merged* deploy PR is not proof the fix is live — the "Cloud platform deployment" Action must have finished. Confirm the **live** running version directly: `GET {BACK_URL}/api/platform/modules` for a module (match the exact version, e.g. `3.1027.0-pr-135`), the deployed page/asset for a frontend fix. Only then run Phase B.

---

## Step 3A — Two-Phase Reproduction: RED before deploy → GREEN after

The strongest verification proves the **same** reproduction goes **RED on the pre-fix build and GREEN on the fixed build** — not merely GREEN once. Run both phases; keep both as evidence.

**Phase A — Baseline (pre-fix, RED).** Reproduce the bug on the *un-fixed* code and capture the failing state:
- **Fix NOT yet deployed** (Step 3 shows old code live) → reproduce **now** against the live env. This is the ideal baseline — grab it *before* triggering the deploy.
- **Fix ALREADY deployed** when you pick up the ticket → you can't get RED on live. Take the baseline, in order, from: the original `/qa-bug` reproduction (`reports/tickets/.../test-execution-report.md` or `reports/bugs/`); **or** reproduce against a pinned pre-fix build — a released version via `/qa-local-env VCST-XXXX`, or a second env still on the old version. **Never fabricate a RED — always cite where the baseline came from.**
- **Backend / xAPI / REST-API / module bug:** encode the STR as a **canonical runner case** (`scripts/graphql/graphql-runner.ts --case <csv>:<ID>`, reproduce-as-test) and save the **request + response** payloads that show the defect (stale/wrong values). Never hand-roll a custom script — use the runner (`feedback_use_canonical_graphql_runner`).
- **Storefront / Admin-SPA / visual bug:** screenshot the broken state (+ console/network).

**Phase B — Post-fix (GREEN).** After the deploy gate above confirms the fixed build is **live**, re-run the *identical* STR / runner case / steps → passes **3 consecutive times**. Capture the now-correct request + response (or corrected screenshot).

Both phases write to `reports/tickets/{SPRINT}/VCST-XXXX/`. The RED→GREEN pair is what Step 6A publishes.

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
Cross-Layer (pick the row matching the dispatched agent):
  - qa-frontend-expert / qa-backend-expert / qa-testing-expert:
    [ ] 7. Storefront reflects corrected behavior
    [ ] 8. API returns expected response
  - ui-ux-expert:
    [ ] 7. Storybook isolation: component renders correctly across stories/viewports
    [ ] 8. Storefront integration: same component behaves correctly in the live page
        (catches the isolation-only vs integration-only bug class — see /qa-design)
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
| Storybook components, design system, WCAG a11y, visual regression | `ui-ux-expert` | `Chrome DevTools MCP` |
| Both frontend + backend | Two agents in parallel | Respective browsers |

**Agent prompt must include:**
- The ticket ID and bug summary
- The complete verification checklist from Step 4
- Original STR — must pass **3 consecutive times**
- Environment URLs (from `config.js` / `.env`), scoped to the dispatched agent:
  - `qa-frontend-expert` / `qa-testing-expert` → `FRONT_URL`
  - `qa-backend-expert` → `BACK_URL` (+ `FRONT_URL` if the fix has a storefront-visible side)
  - `ui-ux-expert` → `STORYBOOK_URL` / `STORYBOOK_DEV_URL` for Storybook work; `FRONT_URL` for storefront integration parity
- Browser server assignment
- Output path: `reports/tickets/{SPRINT}/VCST-XXXX/`
- Evidence requirements, scoped to the dispatched agent:
  - `qa-frontend-expert` / `qa-backend-expert` / `qa-testing-expert` → screenshot at previously-failing step, console log, network errors, HAR file
  - `ui-ux-expert` → snapshots per story/viewport, Lighthouse audit (a11y fixes), computed styles / contrast ratios, screenshots of before/after states
- Instruction to follow `skills/qa-evidence/evidence-capture-policy.md`

**Agent prompt structure:**
```
Verify bug fix for VCST-XXXX on the [backend / frontend / ui-design].

Bug: [summary]
Fix: [what the dev changed]
Environment: {FRONT_URL} / {BACK_URL} / {STORYBOOK_URL}  (use those that apply)
Browser: {BROWSER_SERVER}
Output: reports/tickets/{SPRINT}/VCST-XXXX/

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

Write results to reports/tickets/{SPRINT}/VCST-XXXX/verification-report.md
```

---

## Step 6 — Decide & Transition JIRA

After the agent returns, evaluate results against the decision matrix:

JIRA transition names below come from `defect-lifecycle-workflow.md` § 2 (Bug Workflow). Each row may be one or two transitions:

| STR Result | Regression | Side Effects | Decision | JIRA Transition(s) |
|-----------|-----------|-------------|----------|----------------|
| Pass 3/3 | All pass | None | **VERIFIED** | TESTING → TESTED (`Finish test`) → DONE (`Move to Done`) |
| Pass 3/3 | All pass | Minor (P3) | **VERIFIED WITH NOTES** | TESTING → TESTED (`Finish test`) — add note in comment |
| Pass 3/3 | 1+ fail | — | **FIX OK, NEW REGRESSION** | TESTING → TESTED (`Finish test`) + file new bug via `/qa-bug` |
| Fail any | — | — | **FIX INCOMPLETE** | TESTING → REOPEN (`Need fixes`) |
| Pass 2/3 | — | — | **INTERMITTENT** | TESTING → REOPEN (`Need fixes`, note intermittent) |
| Blocked | — | — | **BLOCKED** | No transition, comment with blocker |

**Ask the user before transitioning JIRA.** Skip if Atlassian MCP is not configured.

**JIRA comment for VERIFIED (TESTING > TESTED):**
```
QA PASSED — Fix verified.
STR: Passed 3/3 runs
Regression: [X] adjacent checks — all passed
Console: No new errors
Side effects: None
Evidence: reports/tickets/{SPRINT}/VCST-XXXX/
Business rules verified: [BL-* list or "N/A"]
```

**JIRA comment for REOPEN:**
```
QA FAILED — Reopening.
Issue: [what still fails or what new issue was found]
STR result: [X/3 passed]
Evidence: reports/tickets/{SPRINT}/VCST-XXXX/
Build: [version/commit tested]
Environment: [URL]
```

---

## Step 6A — Assemble the Evidence Page (local by default; external publish is gated)

For a **VERIFIED / VERIFIED-WITH-NOTES / NEW-REGRESSION** verdict, build ONE self-contained HTML evidence page from the Phase A/B captures. **Load the `artifact-design` skill first**; use a utilitarian/technical treatment (theme-aware light+dark, semantic PASS/stale coloring, no flashy hero).

**Always include:** verdict badge · build/env strip (platform, module/theme, PR) · the bug + root cause (2–3 lines) · a **before → after table** (Phase A RED vs Phase B GREEN) · the 3× run tally · the checklist · footer notes (any held-at-Tested reason, temporary deploy-repin to revert, test-case ref, evidence file paths).

**Layer-scoped code snippet — the core of the page:**

| Bug layer | Snippet to embed |
|---|---|
| **xAPI / REST-API / module** | The real **request & response**: the trigger call (e.g. the REST write), the GraphQL/REST **request**, the **response JSON on the fixed build** (fresh values highlighted), and the **same request's pre-fix response** for contrast (stale values). Pull the actual payloads from the runner evidence (`scripts/.graphql-evidence/<CASE>-*.json`) — **never hand-write them**. Optionally append the fix diff (PR files via GitHub MCP) as a secondary snippet. |
| **Storefront / Admin-SPA / visual** | Before/after screenshots (embed as data URIs) + the corrected computed style / DOM value. |

**Where it goes — project-type aware, containment-first (this is what matters on a client deployment):**

- **Default = a LOCAL file.** Write the page to `reports/tickets/{SPRINT}/VCST-XXXX/evidence.html` and link that path from the JIRA comment + summary. Nothing leaves the project — always safe, and the normal outcome.
- **Publishing it as a hosted Claude Artifact uploads the content to an external host**, so it is **opt-in and gated by `project-profile.json`'s `projectType`** (read once, same field `qa-fix.md`/`qa-bug.md` already key off — absent profile ⇒ native platform, unchanged behavior):
  - **Native-platform project** (`projectType` ≠ `client`, or no profile): the defect is VirtoCommerce's own on public repos → you MAY publish via the **Artifact** tool, after asking the operator. Write the HTML to the scratchpad, then publish with an emoji `favicon` + one-line `description`.
  - **Client project** (`projectType === "client"`): do **NOT** auto-publish — the reproduction carries the client's endpoints, identifiers, and data. Publish **only** if the operator explicitly asks **and** the page is scrubbed of every client host / path / identifier / datum / secret — and **NEVER** for a **client-owned-code** bug (quality-gates §2a: client code and data never leave the client's project). When unsure, keep it local.
- **Always** redact secrets (Authorization / token / password / PAN) regardless of destination.

Record the result in `verification-summary.json`: `evidence` = the local path (always); `evidence_artifact` = the hosted URL **only when actually published** (`null` otherwise). Then reference whichever was produced in the JIRA verdict comment. Artifacts are **private until the user shares** them from the page's share menu — say so in your output if you did publish.

---

## Step 7 — Deliver Summary

Write `reports/tickets/{SPRINT}/VCST-XXXX/verification-summary.json`:
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
  "baseline_reproduction": "RED (pre-fix, live) | from-qa-bug | pinned-build",
  "checklist_total": 10,
  "checklist_passed": 10,
  "checklist_failed": 0,
  "regression_issues": [],
  "side_effects": [],
  "bugs_filed": [],
  "business_rules_verified": ["BL-CART-001"],
  "jira_transition": "TESTED",
  "evidence": "reports/tickets/{SPRINT}/VCST-XXXX/evidence.html",
  "evidence_artifact": null,
  "artifacts": "reports/tickets/{SPRINT}/VCST-XXXX/"
}
```
(`evidence` is the always-written local page; `evidence_artifact` stays `null` unless a hosted Artifact
was actually published per Step 6A's `projectType` gate.)

Output to the user: verdict, STR result, checklist score, regressions found, JIRA transition, and artifact paths.

**Bug report lifecycle:** locate any matching local bug report in `reports/bugs/open/` (by ticket ID or title keywords), then route by verdict:

| Verdict | Action on the local bug report |
|---------|-------------------------------|
| VERIFIED / VERIFIED_WITH_NOTES | Add `## Resolution` block (fixed version, JIRA ticket, verification date, method) → set `## Status: FIXED` → move `open/` → `fixed/` |
| FIX_INCOMPLETE / NEW_REGRESSION / INTERMITTENT | Append a `## Verification YYYY-MM-DD` block (verdict + STR result + linked evidence) → leave file in `open/` |
| BLOCKED | Append a `## Blocked YYYY-MM-DD` note (blocker description) → leave file in `open/` |

`reports/bugs/closed/` and `reports/bugs/rejected/` are managed manually (closed by QA lead, rejected during triage) — this command does not move files into them.

---

## Rules

- Follow `skills/qa-evidence/output-paths.md` for artifact output paths and naming conventions
- Follow `.claude/templates/agent-dispatch.md` for dispatch conventions, browser fallback, error handling, and JIRA transitions
- Browser fallback: chrome→firefox, edge→chrome, firefox→edge (max 1 retry)
- Never use WebKit — not supported on Windows
- Never assign two agents to the same browser server simultaneously
- Read all URLs from config.js / .env — never hardcode
- Max 3 concurrent browser agents
- Prove the fix with a **before/after reproduction** — RED on the pre-fix build (Phase A), GREEN on the fixed build (Phase B) — not just a lone GREEN. If the fix is already deployed, cite where the pre-fix baseline came from; never fabricate a RED.
- Confirm the **live deployed version authoritatively** before Phase B (`/api/platform/modules` / the deployed page) — a merged deploy PR is not proof the deploy Action finished.
- Assemble the RED→GREEN evidence page (Step 6A) and link it from the JIRA verdict comment + `verification-summary.json`. **Default is a LOCAL file** (`reports/tickets/.../evidence.html`) — nothing leaves the project. Publishing it as a hosted Claude Artifact is **opt-in, gated by `project-profile.json`'s `projectType`**: fine for a native-platform bug after asking the operator; on a **client** project it needs operator consent **and** scrubbing of every client host/path/identifier/datum, and is **never** done for a client-owned-code bug (§2a). For xAPI / REST-API / module bugs, embed the real **request & response** payloads (pulled from the runner evidence, not hand-written); for UI bugs, before/after screenshots. Always redact secrets (Authorization/token/PAN).
- STR must pass 3 consecutive times — 2/3 is not sufficient (marks as intermittent)
- Always query Context7 in Step 0 to understand expected post-fix behavior
- Ask the user before any JIRA transition
- If Atlassian MCP is unavailable, skip JIRA transitions but still execute the full verification
- If the fix is not deployed, stop immediately — do not test against the old code
- If an agent fails with an internal error, fall back to working directly rather than retrying
- For multi-ticket verification (`VCST-1234 VCST-1235`), process sequentially — each ticket gets its own full flow
- If verification reveals a NEW regression (FIX OK but adjacent feature broken), escalate via `/qa-bug` with evidence from the verification run
- Cross-reference with `/qa-defect verify` protocol (section 7 of `defect-lifecycle-workflow.md`) for the canonical verification steps
