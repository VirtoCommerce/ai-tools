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

1. **Read the investigation flow:** Load `bug-investigation-flow.md` from this skill folder for the full process, decision tree, and common VC patterns (P1–P8).

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

5. **Gather ALL logs & evidence** (`bug-investigation-flow.md` §4 + §9; `evidence-capture-policy.md`):
   - Screenshots of failure state (mandatory)
   - Browser console + network/HAR — capture the **operation/trace ID** from the failed request
   - Hangfire (failed/scheduled jobs), platform systeminfo
   - **Application Insights** — mandatory whenever any REST/xAPI/Admin/job layer is involved: correlate the trace ID, read the exception chain + dependency failures

6. **Identify root cause** by pattern-matching against the known VC patterns in `bug-investigation-flow.md` §7:
   - P1: Module version incompatibility
   - P2: Stale Elasticsearch index
   - P3: Authorization scope — orphaned organization
   - P4: SDK/integration serialization
   - P5: Pre-authentication API call
   - P6: External resource URL assumption
   - P7: Duplicate GraphQL queries
   - P8: Hangfire job failure

7. **Document and hand off:**
   - Write bug report using templates in `.claude/skills/qa-methodology/qa-defect/defect-report-templates.md`
   - Include the **env header** (§1) and the **Fix Routing block** (owning layer + repo + `repoKind`, per `qa-bug.md` Step 4) so `/qa-fix` Gate 1 can confirm rather than re-derive
   - Save to `reports/bugs/`
   - Optionally create JIRA ticket via Atlassian MCP

## Rules
- **Resolve `TEST_ENV` first** — every URL/credential/App Insights resource is per-env; discover the App Insights resource by matching the active URLs, never hardcode an env name
- Never file a bug you cannot reproduce
- Always capture evidence **and all logs** (browser + Hangfire + App Insights) before filing
- Determine layer/module/frontend/platform precisely; carry it into the Fix Routing block
- If cannot reproduce after exhausting checklist, document the failed attempt and escalate
- Distinguish flaky behavior from real bugs (see decision tree in supporting file)
