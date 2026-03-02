---
description: "Run 12 P0 smoke tests (Suite 01) for daily pre-deployment validation. Quick GO/NO-GO verdict in ~15 min."
argument-hint: "[storefront|admin]"
disable-model-invocation: true
---

# /qa-smoke — Quick Smoke Test Run

Run the 12 P0 smoke tests (Suite 01) for daily pre-deployment validation. This is a shortcut that delegates to the regression-orchestrator's smoke mode.

## Usage
```
/qa-smoke              # Run full smoke suite (12 tests + admin health)
/qa-smoke storefront   # Storefront tests only (Track A)
/qa-smoke admin        # Admin backend health checks only (Track B)
```

---

## Execution

Delegate to the **regression-orchestrator** agent with `smoke` selection:

1. Use the Task tool with `subagent_type: regression-orchestrator`
2. Pass the prompt: "Run regression with selection = smoke. Environment URLs from config.js."
3. If the user specified `storefront` or `admin`, include that in the prompt so the orchestrator only runs the relevant track.
4. The regression-orchestrator handles everything: browser assignment, 2-track parallel execution, GO/NO-GO verdict, and report generation.
5. When the agent returns, relay the verdict and report path to the user.

The regression-orchestrator's **Smoke Mode** section defines the full execution plan (Track A storefront on playwright-chrome, Track B admin on playwright-edge, verdict rules, report format).

---

## Quick Reference: Verdict Rules

| Condition | Verdict |
|-----------|---------|
| All 12 pass + Admin healthy | **GO** |
| 1-2 non-critical fail | **CONDITIONAL GO** |
| Checkout/payment fail | **NO-GO** |
| Admin broken | **NO-GO** |
| 3+ failures | **NO-GO** |
