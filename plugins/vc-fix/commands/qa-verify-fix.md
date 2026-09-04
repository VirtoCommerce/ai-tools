---
description: "Verify a bug fix: fetch ticket, reproduce original bug, confirm fix, run regression checks, transition the tracker ticket by role."
argument-hint: "VCST-XXXX"
disable-model-invocation: true
---

> **MANDATORY — screenshots go INLINE in the comment.** A UI claim posted without its image embedded is not delivered: Markdown `![](path)` and prose file paths both post `200 OK` and render nothing. Attach, then reference `!file.png|width=700!` via the **v2** comment API, then VERIFY from `?expand=renderedBody` (one `<img …/attachment/content/N>` per image, zero surviving `!….png!`, zero `<span class="error">`). Mechanism + the ADF dead ends: `knowledge/execution/tracker-ops.md` §5c. Policy + the verification gate: `.claude/rules/reports.md` §5.0. A non-visual claim says so explicitly rather than silently shipping no image.


# /qa-verify-fix — Bug Fix Verification

Pick up a READY-FOR-TEST bug ticket, verify the fix on the live environment, and transition the tracker ticket based on the result. You run this orchestration inline — do NOT delegate to another orchestrator agent. This is the **QA-side twin** of `/qa-fix`: `/qa-fix` drives a bug to an open PR and stops at the *in-review* role; `/qa-verify-fix` picks it up once the fix is deployed and moves it through the QA-side roles (`testing` → `tested`, or back to `reopen`).

> **Profile-driven, not Jira/GitHub-hardcoded.** Which **bug tracker** (Jira / Azure Boards) and
> **code host** (GitHub / Azure Repos) every step talks to comes from `project-profile.json`
> (written by `/project-init`), exactly as in `/qa-fix`. Read
> [`knowledge/execution/tracker-ops.md`](../knowledge/execution/tracker-ops.md) for the per-tracker
> resolve/comment/transition recipes, the **live transition discovery** rule (resolve a status by
> lifecycle ROLE, never a hardcoded workflow name), ticket-key formats, the host-aware PR-read
> mechanism (§3), and the platform-only build-version check (§5). `/project-init`'s tracker scan
> already leaves the QA-side role states — `roleStates["testing"]` / `["tested"]` / `["reopen"]`
> (+ `["done"]`) — in the profile **specifically for this command to consume** (`/qa-fix` only ever
> *reads* `roleStates`; it never writes to it). **With no profile ⇒ Jira / `gh` /
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
  everything — `.env`/secrets (`join(projectRoot, paths.secretsEnv)`), `paths.reports`. To invoke a
  bundled plugin script (`ado.mjs`), resolve `$pluginRoot` = the ACTIVE install path at runtime via
  `claude plugin list --json` (there is no baked plugin path in the profile; see
  [`knowledge/execution/plugin-root.md`](../knowledge/execution/plugin-root.md)). Load secrets
  ONLY from the absolute path. **Never print a PAT/token — and never inline the literal value in a
  command.** `ado.mjs` reads `ADO_PAT` from the environment; make sure it's loaded from `.env.local`
  (e.g. sourced into the shell) rather than pasted as `ADO_PAT="…"` in front of each call.
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
- **Transition policy** (`profile.tracker.azure.transitionPolicy` + `.qaRoleStatesComplete`): see
  `tracker-ops.md` §Live transition discovery point 4 for the full auto/confirm-once/ask semantics —
  **the one addition specific to this command:** `transitionPolicy` is unlocked from the fix-side
  roles alone, so a QA-side transition additionally requires `qaRoleStatesComplete === true` before
  honoring anything other than `ask`.
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

1. **Resolve current sprint** — check if `reports/tickets/Sprint-current` exists → use it. Otherwise list `reports/tickets/` and pick the latest `SprintXX-XX` folder. This becomes `{SPRINT}` for all output paths below.
2. **Environment health** — run `/qa-env-check endpoints`. If unhealthy, warn user — fix may not be deployed or env may be stale.
3. **Duplicate check** — scan `reports/tickets/{SPRINT}/VCST-XXXX/` for a verification run in the last 4 hours. If found, warn user and show previous verdict.
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

## Step 2 — Confirm Fix Deployment (hard gate — BEFORE any transition)

**Do this FIRST — before moving the ticket or dispatching any verification agent.** Testing against
undeployed code wastes a full agent run and, worse, leaves the ticket transitioned + a "deployed"
comment that isn't true in the client's tracker. **The version source branches on
`profile.buildVerify.source`** (`tracker-ops.md` §5 — the `vc-deploy-dev` manifest is
VirtoCommerce-internal; a client deployment has no access):

1. **Fetch deployed versions** — by `buildVerify.source`:
   - **`vc-deploy-dev`** (native platform; also the default when the source is `""`/absent) — use **GitHub MCP** to read `backend/packages.json` and `theme/artifact.json` from `VirtoCommerce/vc-deploy-dev`. Branch defaults to `vcst-qa`; switch to the branch matching `TEST_ENV` (`vcptcore`, `virtostart`, …) when running against another env.
   - **`modules-endpoint`** (client) — `GET {BACK_URL}/api/platform/modules` with an admin token; the deployment reports its own module/Platform versions. (Theme/storefront version comes from the storefront or the ticket.)
   - **`ticket`** (frontend-only client bug) — take the storefront version from the ticket's system info; do NOT call the admin modules endpoint (that's a backend check needing a token).
2. **Cross-check the PR build against the running version** — read the linked PR on the resolved code host (`tracker-ops.md` §3): GitHub (or no profile) → `gh pr view <number> --json title,state,headRefName`; Azure Repos → `ado.mjs list-refs` / an ADO REST `GET …/pullRequests/<id>`. The deployed-to-QA artifact of an open PR is a **branch/alpha build** (e.g. `2.49.7-alpha.NNNN`).
3. **Decide DEPLOYED vs NOT-DEPLOYED from explicit signals — never assume deployed:**
   - **NOT deployed** if ANY of: the linked PR is still **open / active (not merged)** and its branch build is not the one running; the running storefront/module version is a **plain release** (e.g. `2.49.7`) rather than the PR's **alpha/branch build** (e.g. `2.49.7-alpha.NNNN`); or the running version simply does not match the PR artifact.
   - **Deployed** only when the running version equals the PR's build artifact.
4. Corroborate (not a substitute for step 3): frontend fix → the affected page shows the change; backend fix → a quick API call returns the fixed behavior.

**STOP gate — if NOT deployed:**
- Do **NOT** transition the ticket to `testing`, do **NOT** dispatch the verification agent, do **NOT** run the STR.
- Post ONE factual comment (Jira `addCommentToJiraIssue` / Azure `ado.mjs comment --id <n> --text-file <path>`): fix **not yet deployed** — name the running version vs the expected PR build → verification **deferred**. Leave the ticket at its **current** state: **no transition**, and specifically **no `reopen`** (an undeployed fix is not a failed fix). `transitionPolicy` does not apply here — there is no role transition to make, so this is silent regardless of `auto`/`ask`. End with a **BLOCKED** verdict (§Step 6).
- Only re-poll if the operator explicitly asks to wait. Never test old code.

**Record** the confirmed platform / theme / module versions — reused verbatim in the Step 3 comment and the final report.

---

## Step 2A — Two-Phase Reproduction: RED (pre-fix) → GREEN (fixed)

The strongest verification proves the **same** reproduction goes **RED on the pre-fix build and GREEN on the fixed build** — not merely GREEN once. Establish the baseline here; the Step 5 QA agent runs the identical repro as Phase B **with its own live MCP tools** (browser / API) — this plugin ships no regression runner, so there is no repo `--case` to invoke.

**Phase A — Baseline (pre-fix, RED).** Step 2 forbids testing undeployed code live, so take the RED baseline from — in order:
- the original `/qa-bug` reproduction already on file (`reports/tickets/.../test-execution-report.md` or `reports/bugs/`); **or**
- a reproduction the QA agent runs against a **pre-fix build the deployment still has** — a prior release, or a second environment not yet updated; **or**
- if you legitimately captured the live symptom *before* a deploy you triggered, that run.

**Never fabricate a RED — always cite where the baseline came from.** Capture, by layer:
- **Backend / xAPI / REST-API / module bug:** the failing **request + response** — the QA agent issues the call through its API/GraphQL MCP tools and saves the payloads under the ticket folder. Redact secrets (Authorization / token / PAN) on capture.
- **Storefront / Admin-SPA / visual bug:** the broken-state screenshot (+ console / network).

**Phase B — Post-fix (GREEN)** runs in Step 5: the dispatched QA agent repeats the *identical* repro against the confirmed-deployed build → passes **3 consecutive times**, capturing the now-correct request + response (or corrected screenshot). The RED→GREEN pair is what Step 6A assembles.

---

## Step 3 — Transition to TESTING (only after Step 2 confirms DEPLOYED)

With the fix confirmed deployed, transition the ticket to the **`testing`** role state (`tracker-ops.md` §Live transition discovery — resolve by ROLE, never a hardcoded name):
- **Jira** (or no profile) → `getTransitionsForJiraIssue`, then `transitionJiraIssue` on the transition whose target status matches the `testing` role (the VC-internal Jira reference name for this role is `On QA`).
- **Azure Boards** → `ado.mjs transition --id <n> --state <roleStates["testing"]>` (e.g. `On QA`). If `roleStates["testing"]` is **absent** from an older profile: do NOT invent a state, and do **NOT** write it into `project-profile.json` (persisting scanned roles is `/project-init`'s job). Fall back to policy `ask`, run **`ado.mjs list-states --type Bug` live** (don't trust the profile's cached state list), confirm the state with the operator for THIS run only, and recommend running `/project-init` to persist the QA roles.

**Honor the transition policy per `tracker-ops.md` §Live transition discovery point 4** — including the
QA-side `qaRoleStatesComplete` gate: only apply `auto`/`confirm-once` when it's `true`, else `ask`.

Add a tracker comment (Jira `addCommentToJiraIssue` / Azure `ado.mjs comment --id <n> --text-file <path>`) — state only what Step 2 **confirmed**, never a presumptive "deployed". Follow `tracker-ops.md` §2 **Comment & body style**: clear, brief, outcome-first, evidence referenced not inlined. **On Jira, write Markdown** (`##`/`**`/`` ` ``/`-` lists) — never Jira wiki markup. **On Azure, write the comment as HTML** (`<b>`, `<br/>`, `<ul>/<li>`, `<code>`) per [`azure-html-format.md`](../knowledge/execution/azure-html-format.md) — a plain-text/Markdown comment collapses into one unreadable paragraph; the plain block below is illustrative content, not the literal wire format:
```
Starting QA verification.
Platform: [PlatformVersion confirmed deployed in Step 2]
Theme: [theme/storefront version confirmed in Step 2]
Module: [relevant module + version]
PR Build: [PR alpha/branch build confirmed running in Step 2]
Environment: [FRONT_URL or BACK_URL]
Test scope: STR verification (3x) + domain regression + side effect check
```

If the tracker is unavailable, skip the transition and note it in the final report.

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
- Output path: `reports/tickets/{SPRINT}/VCST-XXXX/`
- Evidence requirements: screenshot at previously-failing step, console log, network errors, HAR file
- Instruction to follow `skills/qa-evidence/evidence-capture-policy.md`

**Agent prompt structure:**
```
Verify bug fix for VCST-XXXX on the [backend / frontend].

Bug: [summary]
Fix: [what the dev changed]
Environment: {FRONT_URL} / {BACK_URL}  (use those that apply)
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

> **Fix-not-deployed is NOT a Step-6 verdict** — it's caught at the Step 2 gate *before* the `testing`
> transition, so it never triggers a rollback here. By the time you reach Step 6 the ticket is already at
> `testing` and every row above transitions forward (`tested`/`reopen`) or holds (`BLOCKED` = a blocker
> hit *during* verification, e.g. env down mid-run).

**Resolve each role → the live workflow** (`tracker-ops.md` §2, §Live transition discovery):
- **Jira** (or no profile) → `getTransitionsForJiraIssue`, pick the transition whose target status matches the role (case-insensitive contains: "test" for `tested`, "reopen"/"fix" for `reopen`, "done" for `done`). The VC-internal Jira reference names for these roles are `Finish test` → `tested`, `Move to Done` → `done`, `Need fixes` → `reopen` — use them to recognize the transition, never as a hardcoded id.
- **Azure Boards** → `ado.mjs transition --id <n> --state <roleStates[role]>` (LEO: `tested`→`Tested on QA`, `reopen`→`Reopen`, `done`→`Closed`). If a QA role is absent from an older profile, fall back to `ask` + `ado.mjs list-states --type Bug` and confirm the state with the operator — don't invent a state.

**Honor the transition policy per `tracker-ops.md` §Live transition discovery point 4** — this
replaces the old "Ask the user before transitioning", **and** requires `qaRoleStatesComplete === true`
before treating any of these QA-side transitions as `auto`/`confirm-once`. Skip entirely if the tracker
is not configured, and note it in the report.

**Tracker comment for VERIFIED (`testing` → `tested`):**
```
QA PASSED — Fix verified.
STR: Passed 3/3 runs
Regression: [X] adjacent checks — all passed
Console: No new errors
Side effects: None
Evidence: reports/tickets/{SPRINT}/VCST-XXXX/
Business rules verified: [BL-* list or "N/A"]
```

**Tracker comment for REOPEN (`testing` → `reopen`):**
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

For a **VERIFIED / VERIFIED-WITH-NOTES / NEW-REGRESSION** verdict, assemble ONE self-contained HTML evidence page from the Phase A/B captures. **Load the `artifact-design` skill first**; utilitarian/technical treatment (theme-aware light+dark, semantic PASS/stale coloring, no flashy hero).

**Always include:** verdict badge · build/env strip (platform, module/theme, PR) · the bug + root cause (2–3 lines) · a **before → after table** (Phase A RED vs Phase B GREEN) · the run tally · the checklist · footer notes (any temporary deploy-repin to revert, evidence file paths).

**Layer-scoped snippet — the core of the page:**

| Bug layer | Snippet to embed |
|---|---|
| **xAPI / REST-API / module** | The real **request & response**: the trigger call, the GraphQL/REST **request**, the **fixed-build response** (fresh values highlighted), and the **same request's pre-fix response** for contrast (stale values). Use the payloads the QA agent captured in Phase A/B — **never hand-write them**. Optionally append the fix diff (PR files via the code host) as a secondary snippet. |
| **Storefront / Admin-SPA / visual** | Before/after screenshots (embed as data URIs) + the corrected computed style / DOM value. |

**Where it goes — profile-aware, containment-first (this is what matters on a client deployment):**

- **Default = a LOCAL file.** Write the page to `reports/tickets/{SPRINT}/VCST-XXXX/evidence.html` and link that path from the tracker comment + summary. Nothing leaves the project — always safe, and the normal outcome.
- **Publishing it as a hosted Claude Artifact uploads the content to an external host**, so it is **opt-in and gated by project type** (`profile.projectType`):
  - **Native-platform project** (`projectType` ≠ `client`, or no profile): the defect is VirtoCommerce's own on public repos → you MAY publish, after asking the operator.
  - **Client project** (`projectType === "client"`): do **NOT** auto-publish — the reproduction carries the client's endpoints, identifiers, and data. Publish **only** if the operator explicitly asks **and** the page is scrubbed of every client host / path / identifier / datum / secret — and **NEVER** for a **client-owned-code** bug (quality-gates §2a: client code and data never leave the client's project). When unsure, keep it local.
- **Always** redact secrets (Authorization / token / password / PAN) regardless of destination.

Record the result in `verification-summary.json`: `evidence` = the local path (always); `evidence_artifact` = the hosted URL **only when actually published**. If you did publish, note in your output that hosted artifacts are private until the operator shares them.

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
  "tracker_transition": {"role": "tested", "state": "TESTED"},
  "evidence": "reports/tickets/{SPRINT}/VCST-XXXX/evidence.html",
  "evidence_artifact": null,
  "artifacts": "reports/tickets/{SPRINT}/VCST-XXXX/"
}
```
(`tracker_transition.role` is the lifecycle role applied; `state` is the resolved destination status —
Jira `TESTED`, Azure `roleStates["tested"]` e.g. `Tested on QA`. `evidence` is the always-written local
page; `evidence_artifact` stays `null` unless a hosted Artifact was actually published per Step 6A's gate.)

Output to the user: verdict, STR result, checklist score, regressions found, tracker transition, and artifact paths.

**Bug report lifecycle:** locate any matching local bug report in `reports/bugs/open/` (by ticket ID or title keywords), then route by verdict:

| Verdict | Action on the local bug report |
|---------|-------------------------------|
| VERIFIED / VERIFIED_WITH_NOTES | Add `## Resolution` block (fixed version, tracker ticket, verification date, method) → set `## Status: FIXED` → move `open/` → `fixed/` |
| FIX_INCOMPLETE / NEW_REGRESSION / INTERMITTENT | Append a `## Verification YYYY-MM-DD` block (verdict + STR result + linked evidence) → leave file in `open/` |
| BLOCKED | Append a `## Blocked YYYY-MM-DD` note (blocker description) → leave file in `open/` |

`reports/bugs/closed/` and `reports/bugs/rejected/` are managed manually (closed by QA lead, rejected during triage) — this command does not move files into them.

**Signal completion (self-diagnostics — the LAST action).** After the summary above — and equally
on an early **BLOCKED** exit (fix not deployed → deferred at the Step 2 gate; a correct early exit is
a completed run) — run this once (best-effort, silent, never blocks):

```bash
node "$pluginRoot/hooks/session-telemetry.mjs" complete --skill "qa-verify-fix"
```

So the vc-fix self-diagnostics collector prints its one-line clean/health status **exactly once**
after the run. `$pluginRoot` = the active install path — reuse if already resolved this run, else
`claude plugin list --json` (see [`knowledge/execution/plugin-root.md`](../knowledge/execution/plugin-root.md)).
Details: [`knowledge/diagnostics/skill-expectations.md`](../knowledge/diagnostics/skill-expectations.md)
§Signal completion.

---

## Rules

- Follow `skills/qa-evidence/output-paths.md` for artifact output paths and naming conventions
- Follow `.claude/templates/agent-dispatch.md` for dispatch conventions, browser fallback, and error handling; tracker transitions follow `knowledge/execution/tracker-ops.md` (profile-driven, by role)
- Read the deployment profile once (Orientation) and route every tracker/host/build-verify op through it; **no profile ⇒ Jira / `gh` / `vc-deploy-dev`, unchanged**
- Never print a PAT/token, and never inline the literal (`ADO_PAT="…"`) in a command — load it from `.env.local`; all externally-facing content in English
- Never write `project-profile.json` — persisting scanned tracker roles/states is `/project-init`'s job. A missing QA role ⇒ `ask` + live `ado.mjs list-states --type Bug` for THIS run only, then recommend the operator run `/project-init`
- Browser fallback: chrome→firefox, edge→chrome, firefox→edge (max 1 retry)
- Never use WebKit — not supported on Windows
- Never assign two agents to the same browser server simultaneously
- Read all URLs from config.js / .env — never hardcode
- Max 3 concurrent browser agents
- Always reproduce the original bug first before confirming the fix
- Prove the fix with a **before/after reproduction** — RED baseline (pre-fix, Phase A) → GREEN on the fixed build (Phase B) — not just a lone GREEN. Cite where the RED baseline came from; never fabricate it
- Assemble the RED→GREEN evidence page (Step 6A) and link it from the tracker comment + `verification-summary.json`. **Default is a LOCAL file** (`reports/tickets/.../evidence.html`) — nothing leaves the project. Publishing it as a hosted Claude Artifact is **opt-in**: fine for a native-platform bug after asking the operator; on a **client** project it needs operator consent **and** scrubbing of every client host/path/identifier/datum, and is **never** done for a client-owned-code bug (§2a). For backend/xAPI/API bugs embed the real request & response the QA agent captured (not hand-written); for UI bugs before/after screenshots. Always redact secrets (Authorization/token/PAN)
- STR must pass 3 consecutive times — 2/3 is not sufficient (marks as intermittent)
- Always query Context7 in Step 0 to understand expected post-fix behavior
- Tracker transitions follow `profile.tracker.azure.transitionPolicy` (`auto` ⇒ silent by role; `confirm-once`/`ask` ⇒ confirm — the Jira / unscanned default), consistent with `/qa-fix` and `/qa-bug` — **but gated additionally on `qaRoleStatesComplete === true`** for this command's QA-side roles (`tracker-ops.md` §Live transition discovery point 4)
- If the tracker is unavailable, skip transitions but still execute the full verification
- **Confirm deployment (Step 2) BEFORE transitioning to `testing` (Step 3).** If not deployed: STOP — do not transition, do not dispatch the agent, do not test old code; comment "not deployed, deferred" and leave the ticket at its current state (no `reopen`) → BLOCKED
- If an agent fails with an internal error, fall back to working directly rather than retrying
- For multi-ticket verification (`VCST-1234 VCST-1235`), process sequentially — each ticket gets its own full flow
- If verification reveals a NEW regression (FIX OK but adjacent feature broken), escalate via `/qa-bug` with evidence from the verification run
- Cross-reference with `/qa-defect verify` protocol (section 7 of `defect-lifecycle-workflow.md`) for the canonical verification steps
