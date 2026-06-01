---
description: "Run P0 smoke tests (storefront suite 042 + admin suite 078) for pre-deployment validation. GO/NO-GO verdict gated by the smoke checklists."
argument-hint: "[storefront|admin]"
disable-model-invocation: true
---

# /qa-smoke — Quick Smoke Test Run

Run the storefront (042) and admin (078) smoke suites for pre-deployment validation. Executes two parallel tracks; each track ticks its smoke checklist as the GO/NO-GO gate.

**Checklists are the verdict gates** (CSV = executable steps; checklist = the human-readable gate, mapped 1:1 to SMK-/BSM- cases):
- Track A → `regression/suites/Frontend/smoke/SMOKE-CHECKLIST.md` + `SMOKE-CROSS-LAYER-CHECKLIST.md`
- Track B → `regression/suites/Backend/smoke/ADMIN-SMOKE-CHECKLIST.md`

**Time:** storefront-only (`/qa-smoke storefront`) ~15–20 min; full run ~30–45 min (admin checklist is 83 cases). Use the scoping args below to stay fast.

## Usage
```
/qa-smoke              # Run full smoke suite (both tracks)
/qa-smoke storefront   # Track A only (storefront tests)
/qa-smoke admin        # Track B only (admin SPA smoke)
```

---

## Execution

You are the smoke test orchestrator running in the main context. Spawn sub-agents directly — do NOT delegate to another orchestrator agent.

### Step 0 — Pre-Flight (per `.claude/templates/agent-dispatch.md`)

1. **Environment health** — run `/qa-env-check endpoints` (or inline: `curl -sk {BACK_URL}/health`). If unhealthy, warn user and ask whether to proceed.
2. **Build & version verification** — fetch deployed versions per `agent-dispatch.md § Build Verification`:
   - Use GitHub MCP to read `backend/packages.json` and `theme/artifact.json` from `VirtoCommerce/vc-deploy-dev` (branch `vcst-qa`)
   - Record platform version and theme version — include in the smoke report header (Step 4)
3. **Duplicate check** — scan `reports/regression/` for a `SMOKE-*` run from today. If found, warn user and show previous verdict.
4. **Context7 query** — resolve `/virtocommerce/vc-docs`, query `"storefront cart checkout smoke"` with `tokens: 8000`. Check for recent module behavior changes that could affect smoke tests.

### Step 1 — Read Suite & Prepare Run

1. Read `config/test-suites.json` to get suite 042 (storefront) and 078 (admin) details (CSV path, test count)
2. Read `config.js` to load `FRONT_URL` and `BACK_URL`
3. Generate run ID: `SMOKE-YYYY-MM-DD-HHMM`
4. Create output directory: `reports/regression/{RUN_ID}/`

### Step 2 — Dispatch Parallel Tracks

Unless the user specified `storefront` or `admin` only, launch **both tracks simultaneously** in a single message using the Agent tool:

**Track A — Storefront** (`qa-frontend-expert`, `playwright-chrome`)

Prompt:
```
You are executing Track A of a smoke test run ({RUN_ID}).

Suite: 042 — Storefront Smoke Tests
CSV (executable steps): regression/suites/Frontend/smoke/042-smoke-tests.csv
Verdict gate: regression/suites/Frontend/smoke/SMOKE-CHECKLIST.md
Cross-layer gate: regression/suites/Frontend/smoke/SMOKE-CROSS-LAYER-CHECKLIST.md
Browser: playwright-chrome
Frontend URL: {FRONT_URL}
Output: reports/regression/{RUN_ID}/suite-042-trackA-results.json

Follow the test-runner-agent protocol in .claude/agents/qa/test-runner-agent.md.
Execute all 30 smoke test cases (SMK-001 through SMK-030) as a customer journey, including the Cross_Layer_Checks column on each case.
For every case, record PASS/FAIL/SKIP against the matching item in SMOKE-CHECKLIST.md, and the matching UI-vs-backend parity item in SMOKE-CROSS-LAYER-CHECKLIST.md.
Capture evidence on failures. Write structured JSON results (per SMK-ID, plus a checklist section/item rollup) to the output file.
```

**Track B — Admin & Backend** (`qa-backend-expert`, `playwright-edge`)

Prompt:
```
You are executing Track B of a smoke test run ({RUN_ID}).

Suite: 078 — Admin/Backend Smoke Tests
CSV (executable steps): regression/suites/Backend/smoke/078-backend-smoke-tests.csv
Verdict gate: regression/suites/Backend/smoke/ADMIN-SMOKE-CHECKLIST.md
Browser: playwright-edge
Backend URL: {BACK_URL}
Frontend URL: {FRONT_URL}
Output: reports/regression/{RUN_ID}/suite-078-trackB-results.json

Follow the test-runner-agent protocol in .claude/agents/qa/test-runner-agent.md.
Execute the Admin SPA cases covered by ADMIN-SMOKE-CHECKLIST.md (83 cases across 18 areas: auth/dashboard, per-module blades, edit/delete workflows, cross-blade navigation, search/filter, grid ops).
The pure REST/GraphQL API cases in 078 (the excluded list at the top of the checklist) are covered by Suite 049/050 — skip them here unless verifying Track A cross-layer parity.
Prioritize the Critical-priority cases (checklist §1–12) first — a failure there is a NO-GO; High/Medium failures are GO-WITH-RISK per the checklist's own GO/NO-GO table.
For every executed case, record PASS/FAIL/SKIP against the matching item in ADMIN-SMOKE-CHECKLIST.md. If Track A data is available, verify created contacts/orders appear in Admin.
Capture evidence on failures. Write structured JSON results (per BSM-ID, plus a checklist section/item rollup) to the output file.
```

### Step 3 — Collect Results & Verdict

After both tracks complete, read both output files and apply verdict rules (these mirror the GO/NO-GO tables inside each checklist):

| Condition | Verdict |
|-----------|---------|
| All 30 storefront items + all admin Critical items (§1–12) PASS | **GO** — Safe to deploy |
| 1-2 non-critical items fail (not checkout/payment; admin High/Medium only) | **CONDITIONAL GO** — Deploy with monitoring |
| Any checkout item fails (SMK-012/013) | **NO-GO** — Checkout broken |
| Any payment item fails (SMK-014) | **NO-GO** — Payment broken |
| Any cross-layer parity item fails (SMOKE-CROSS-LAYER §1–11) | **NO-GO** — UI/backend mismatch |
| Admin SPA won't load (BSM-001) or any admin Critical case (§1–12) fails | **NO-GO** — Platform unhealthy |
| 3+ items fail | **NO-GO** — Too many failures |

### Step 4 — Write Report

Write `reports/regression/{RUN_ID}/smoke-report.md`:

```markdown
# Smoke Test Report — {RUN_ID}

## Verdict: GO / CONDITIONAL GO / NO-GO

| Field | Value |
|-------|-------|
| Run ID | {RUN_ID} |
| Date | YYYY-MM-DD |
| Environment | {FRONT_URL} |
| Platform | {PlatformVersion} |
| Theme | {theme version} |

## Track A — Storefront Results

Checklist gates: SMOKE-CHECKLIST.md (__/30) · SMOKE-CROSS-LAYER-CHECKLIST.md (__/28)

| # | Test Case | Status | Notes |
|---|-----------|--------|-------|
| SMK-001 | ... | PASS/FAIL | ... |

## Track B — Admin Results

Checklist gate: ADMIN-SMOKE-CHECKLIST.md (__/83 — Critical __/__)

| BSM-ID | Test Case | Status | Notes |
|--------|-----------|--------|-------|
| BSM-001 | Admin SPA login + dashboard | PASS/FAIL | ... |

## Bugs Found

(list or "None")
```

> Record the checklist as the gate: each track's agent returns a section/item rollup; transcribe the counts into the gate lines above. A NO-GO requires the failing checklist item ID (SMK-/BSM-) in the Notes column.

### Step 5 — Deliver Summary

Output verdict, pass rate, bugs found, and report path to the user.

---

## Rules

- Follow `.claude/skills/qa-methodology/qa-evidence/output-paths.md` for artifact output paths and naming conventions
- Follow `.claude/templates/agent-dispatch.md` for dispatch conventions, browser fallback, and error handling
- Track A: `playwright-chrome` (fallback: `playwright-firefox`). Track B: `playwright-edge` (fallback: `playwright-chrome`)
- Never use WebKit — not supported on Windows
- Never assign both tracks to the same browser server
- Read all URLs from config.js / .env — never hardcode
- If a browser fails to launch, retry with fallback browser (max 1 retry per track)
