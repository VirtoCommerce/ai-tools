# Regression orchestrator — pre-seed and smoke mode

> Cited by `.claude/agents/regression-orchestrator.md` Step 0.5 and §Smoke Mode. Read the Step 0.5 section only when the brief carries `--seed=<profile>`, the Smoke Mode section only when the selection is `smoke`. Moved verbatim from the agent on 2026-10-30 (VCST-6423).

### Step 0.5: Pre-Seed (only if `--seed=<profile>` provided)

1. **Reject smoke-with-seed** — if selection is `smoke`/`042`, warn and skip seeding (no coverage benefit).
2. **Reuse check** — if `test-data/b2b/.seed-fingerprint.json` exists AND mtime within last 2 hours AND its `kind`/`env`/`storeId` match the profile, skip and log "Seed reused from {timestamp}".
3. **Invoke** `/qa-seed-data <profile>` (via Skill or delegate to `qa-backend-expert` with the qa-seed-data skill). Wait for completion.
4. **Wait 60s** for reindex before proceeding to Step 1 so storefront tests see new data.
5. **On seed failure** — abort the run; report the seeding error to the user. Do not proceed to Step 1.
6. **Record** seed profile + timestamp for the report header (Step 6).

## Smoke Mode (selection = `smoke`)

Split Suite 01 into two parallel tracks for ~15 min target:

**Track A — Storefront** (`qa-frontend-expert` on `playwright-chrome`): Execute all 12 smoke cases (SMK-001–SMK-012)

**Track B — Admin & Backend** (`qa-backend-expert` on `playwright-edge`): Admin SPA loads, modules Active, API health, auth token works, Track A data appears in Admin

**Verdict:** All pass + Admin healthy → **GO** | 1-2 non-critical fail → **CONDITIONAL GO** | Checkout/payment fail OR Admin down OR 3+ fail → **NO-GO**

Run ID: `SMOKE-YYYY-MM-DD-HHMM`. Report: `reports/regression/{RUN_ID}/smoke-report.md`
