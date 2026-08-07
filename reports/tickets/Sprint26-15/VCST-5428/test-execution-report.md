# VCST-5428 — Verification Report — ✅ PASS on vcptcore-qa (was BLOCKED on qa1)

## FINAL VERDICT: 🟢 PASS — fix confirmed on vcptcore-qa

After the PR #901 prerelease was deployed to **vcptcore-qa** (`VirtoCommerce.Catalog 3.1040.0-pr-901-9a41`, verified live via `/api/platform/modules`), the STR was re-run:

- Stores → B2B-store → Search configuration → Facets → open **Brand** → change Aggregation size 25→26 → OK → **Save**; then restore 26→25 → Save.
- **Result: console clean on BOTH saves** — the 3 pre-existing benign `logo.svg` 404s only, **NO `TypeError: parentBlade.refresh is not a function`, NO unhandled rejection.**
- `PUT /api/catalog/aggregationproperties/B2B-store/properties → 204` both times — config still saves. Config left restored (Brand size 25).
- Baseline before the flow: same 3 benign 404s → the fix removes the error the bug described.

The `blade.refresh` guard added by PR #901 to `search-configuration.js` resolves the defect. Suggested JIRA: *Finish test → TESTED* (pending user confirmation).

> The section below documents the earlier **BLOCKED** attempt on the sibling env **vcptcore-qa1**, where the same build was NOT deployed (deploy hadn't landed). Kept for the record.

---

# (Earlier) VCST-5428 — Verification attempt — BLOCKED on vcptcore-qa1 (fix artifact not deployed)

**Ticket:** [VCST-5428](https://virtocommerce.atlassian.net/browse/VCST-5428) — *[AgenticFix] Admin console error "parentBlade.refresh is not a function" + unhandled rejection on every Facets save* · Bug · Priority Low (cosmetic) · Status *Ready for test*
**Fix under test:** [vc-module-catalog#901](https://github.com/VirtoCommerce/vc-module-catalog/pull/901) (OPEN, base `dev`, approved) — adds a guarded `blade.refresh` to `Scripts/blades/search-configuration.js`
**Env:** vcptcore-qa1 (Admin SPA) @ Platform 3.1051.0, **VirtoCommerce.Catalog 3.1038.0**
**Date:** 2026-07-28 · Browser: playwright-edge · Executed inline (single-surface Admin SPA console check)

## Verdict: 🟧 BLOCKED — cannot verify

The PR #901 fix **is not deployed on qa1**, so the fix code was never exercised. The bug still reproduces on the deployed build, exactly as originally reported. This is **not** a FAIL (the fix was not on the env) and **not** a PASS.

## Key finding — deploy manifest updated, but the deploy has NOT landed on the running instance

The `vc-deploy-dev@vcptcore-qa1` manifest **correctly points at the PR #901 prerelease**, but the live platform is still running the previous build:

| | `backend/packages.json` (branch `vcptcore-qa1`) | Live on qa1 (System Info / Modules) |
|---|---|---|
| PlatformVersion | 3.1051.0 | 3.1051.0 ✅ |
| **VirtoCommerce.Catalog** | AzureBlob → **`VirtoCommerce.Catalog_3.1039.0-pr-901-a16e.zip`** | **`3.1038.0`** ❌ |

So the manifest change to deploy PR #901 was made, but the environment still serves `3.1038.0` (the pre-fix build). The fix bytes are not running. Re-verified live twice (~11:33 and ~16:04 local) — still `3.1038.0`, so it is not a mid-deploy transient that has since settled. Likely the "Cloud platform deployment" Action for the `vcptcore-qa1` branch hasn't completed/triggered, or the instance didn't restart to pick up the new blob.

Evidence: `screenshots/VCST-5428-qa1-catalog-3.1038.0-no-pr901.png` (module info blade: ID `VirtoCommerce.Catalog`, Version `3.1038.0`) + the manifest BlobName above.

## Reproduction on the deployed build (STR from ticket)

1. Admin → Stores → B2B-store → Search configuration → Facets.
2. Opened filtering property **BRAND**, changed Aggregation size 25→26 (to dirty the blade — opening+OK alone leaves the blade pristine and Save disabled), clicked OK.
3. Clicked **Save**.

**Result — bug present (matches ticket "Actual"):**
- `PUT /api/catalog/aggregationproperties/B2B-store/properties → 204` — config saves successfully.
- Console error fired on save:
  ```
  TypeError: i.parentBlade.refresh is not a function
      at /modules/$(VirtoCommerce.Catalog)/dist/app.js?v=8DEE8CB3FD33300:1:12688
      ... at p.$digest / p.$apply / O.onload (vendor.js)
  Possibly unhandled rejection: {}
  ```
- **Deterministic:** reproduced on both saves (26 save, then 25 restore-save) — 2/2. Config left unchanged (BRAND size restored to 25).

Baseline console before the flow: only 3 benign `logo.svg` 404s (unrelated app-shell noise). The `parentBlade.refresh` error appears **only** after each Facets Save.

## Steps skipped (with reason)
- **BA story review (Step 1b):** N/A — this is a Bug with STR, no story/ACs.
- **Exploratory (Step 5):** not run — with the fix absent, exploring the unfixed build adds nothing; re-run after the correct artifact is deployed.
- **App Insights correlation (Step 6a):** skipped — `APPINSIGHTS_*` unconfigured for qa1.

## Next step (for the human)
Deploy the **PR #901 prerelease** Catalog artifact (`…-pr-901-…`) to qa1 — e.g. `/qa-deploy-pr VCST-5428` — then re-run `/qa-test VCST-5428` (or `/qa-verify-fix`). Note PR #901 is unmerged; `/qa-deploy-pr` pins the open PR's prerelease build. JIRA left at *Ready for test* (no transition — nothing to pass or fail yet).
