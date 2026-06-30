---
description: "[QA Method] Bug investigation: reproduce, isolate root cause, gather evidence, common VC patterns."
argument-hint: "bug description | VCST-XXXX"
disable-model-invocation: true
---

# /qa-investigate — Bug Investigation Flow

Investigate a suspected bug using a structured 5-phase process: Reproduce → Isolate Layer → Gather Evidence → Identify Root Cause → Document & Hand Off.

## Usage
```
/qa-investigate Payment form not submitting on checkout
/qa-investigate VCST-1234
/qa-investigate Flaky test in Suite 04 — cart total sometimes shows $0
```

## Execution

1. **Read the investigation flow:** Load `bug-investigation-flow.md` from this skill folder for the full process, decision tree, and common VC patterns (P1–P8). For the **operational** evidence-capture pass and the root-cause worksheet, also load `evidence-and-root-cause.md` (the runnable companion) — this is where the depth lives.

   **Scaffold the evidence package up front** so every artifact has one home and nothing is missed:
   ```
   npx tsx scripts/bundle-evidence.ts VCST-XXXX [--sprint=Sprint-current] [--browser=chrome] --symptom="…"
   ```
   It resolves `TEST_ENV`, pre-fills the env header, creates `screenshots/ network/ console/ har/ source/`, and writes `evidence-index.md` (manifest with the mandatory-slot + **trace-ID** checklist) and `root-cause.md` (the worksheet).

2. **Resolve `TEST_ENV` FIRST** (`bug-investigation-flow.md` §1):
   - Determine the env (user-named → ticket field → default `vcst`); state it explicitly
   - Resolve `FRONT_URL` / `BACK_URL` / `STORE_ID` / `ENV_RISK`; run `/qa-env-check endpoints` to confirm health
   - Discover the env's App Insights resource(s) by matching the active URLs (don't assume a fixed name; some envs have none)
   - Capture platform + theme versions for the report header

3. **Reproduce the bug:**
   - If a JIRA ticket is provided, fetch details via Atlassian MCP
   - Extract exact URL, user action, expected vs actual behavior
   - Attempt reproduction using the appropriate browser (Playwright MCP) on the resolved env
   - Try at least 3 reproduction attempts before declaring "cannot reproduce"

4. **Isolate the layer, then name the fix target** (`bug-investigation-flow.md` §3):
   - Start at the network tab — the API response tells you which layer owns the bug
   - Frontend (DOM/JS) → Chrome DevTools console + network; Backend (REST/xAPI) → response codes, GraphQL errors, health; Infra → CORS/CDN/SSL/DNS; Data → account/inventory/pricing state
   - **Map the owning layer → `repoKind` → exact repo** (§3 Step 5 + §8): `vc-frontend` / `vc-module-x-*` / `vc-module-*` / `vc-platform`, resolved via `module-suite-map.md` + `fix-repos.json`. Determine layer/module/frontend/platform precisely — never hand off a vague "backend bug".

5. **Gather ALL logs & evidence — run the ordered capture pass** (`evidence-and-root-cause.md` Part A; `bug-investigation-flow.md` §4 + §9):
   - Capture **on the reproducing run**, in order, into the package subfolders — not afterward.
   - Mandatory: failure-state screenshot + DOM snapshot, network request list + the failing request's body, console messages, HAR, systeminfo versions.
   - **Capture the operation/trace ID DURING repro** (`Request-Id`/`traceparent` on the failing request) and write it into `evidence-index.md` — it's the join key for App Insights and is unrecoverable once you navigate away.
   - **Application Insights** — mandatory whenever any REST/xAPI/Admin/job layer is involved: correlate the trace ID, read the exception chain + dependency failures.
   - "GraphQL wrong" is not a layer verdict until you've cross-checked REST (`evidence-and-root-cause.md` Part A row 9).

6. **Identify root cause — fill the worksheet, don't just pattern-match** (`evidence-and-root-cause.md` Part B → `root-cause.md`). Pattern-matching P1–P8 gives a *hypothesis*; the worksheet turns it into a *conclusion*: every claim cites a captured artifact (trace ID / response body / source line), the lowest failing layer is *proven* not assumed, and **at least the two obvious alternatives (by-design, data drift) are ruled out**. Name a `repoKind`/repo only at MEDIUM+ confidence — LOW confidence hands off "symptom + layer + what's left", never a guessed repo. Pattern reference:
   - P1: Module version incompatibility
   - P2: Stale Elasticsearch index
   - P3: Authorization scope — orphaned organization
   - P4: SDK/integration serialization
   - P5: Pre-authentication API call
   - P6: External resource URL assumption
   - P7: Duplicate GraphQL queries
   - P8: Hangfire job failure

7. **Dig into the source code — answer WHERE, then WHEN & WHY** (`bug-investigation-flow.md` §8). When browser/log evidence isn't enough to explain the behavior, read the actual code via GitHub MCP (read-only):
   - **WHERE** (§8A backend `vc-module-*` / §8B frontend `vc-frontend`): `search_code` for the controller/service/resolver or page/composable/store, trace the logic chain, and decide by-design vs. defect.
   - **WHEN & WHY** (§8C — regression archaeology): for any "used to work" / post-deploy / version-skew symptom, bracket the good→bad window (§1 + §9), walk `list_commits` on the suspect path, diff the method across good/bad refs, and open the introducing PR (`get_pull_request`) to recover what the change *intended*. Confirm the diff actually explains the symptom — correlation ≠ causation.

8. **Document and hand off:**
   - **Gate first:** run `npx tsx scripts/bundle-evidence.ts VCST-XXXX [--sprint=…] --check`. A clean PASS (all mandatory slots filled + alternatives ruled out) is the bar before writing the report; an INCOMPLETE means go back and capture.
   - Write bug report using templates in `.claude/skills/qa-methodology/qa-defect/defect-report-templates.md` — reference the package artifacts, don't inline them (`reports.md` §8)
   - Include the **env header** (§1) and the **Fix Routing block** (owning layer + repo + `repoKind`, per `qa-bug.md` Step 4) so `/qa-fix` Gate 1 can confirm rather than re-derive
   - For regressions, add the **Regression block** (§8C Step 4): introducing commit/PR, first-bad & last-good versions, why it broke, revert-safe vs. fix-forward
   - Save to `reports/bugs/`
   - Optionally create JIRA ticket via Atlassian MCP

## Rules
- **Resolve `TEST_ENV` first** — every URL/credential/App Insights resource is per-env; discover the App Insights resource by matching the active URLs, never hardcode an env name
- Never file a bug you cannot reproduce
- Run the **ordered capture pass** (`evidence-and-root-cause.md` Part A) into the bundled package; the **trace/operation ID is mandatory for any server-side bug and must be grabbed during repro** — it's unrecoverable later
- **`bundle-evidence.ts --check` must PASS before filing** — all mandatory evidence present and worksheet alternatives ruled out
- Every root-cause claim cites a captured artifact; name a repo only at MEDIUM+ confidence (`evidence-and-root-cause.md` Part B)
- Determine layer/module/frontend/platform precisely; carry it into the Fix Routing block
- For any "used to work" / post-deploy / version-skew symptom, read the source (§8) to pin **where**, then do regression archaeology (§8C) to pin **when & why** — name the introducing commit/PR only when its diff actually explains the symptom (correlation ≠ causation)
- If cannot reproduce after exhausting checklist, document the failed attempt and escalate
- Distinguish flaky behavior from real bugs (see decision tree in supporting file)
