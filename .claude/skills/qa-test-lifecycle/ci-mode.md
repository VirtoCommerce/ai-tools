# /qa-test-lifecycle — CI integration

Supporting file for [`/qa-test-lifecycle`](../../commands/qa-test-lifecycle.md), moved here from the command to keep the command under its BUDGET-004 baseline. Read it under `--ci`, and before changing `ci/run-full-cycle.ts`.

## CI Integration

### Full Cycle Pipeline (`ci/run-full-cycle.ts`)

In CI mode, `/qa-test-lifecycle --ci` replaces the old 2-command flow — `/qa-sync-tests` was **removed**
(its command file is deleted, not aliased), so both change-driven sync and standalone review are this one
command at different scopes:

```
PR merged → ci/run-full-cycle.ts
              │
              ├─ Phase 1: SCOPE + SYNC + REVIEW          [runs unless SKIP_SYNC]
              │   → /qa-test-lifecycle {CHANGE_SOURCE} --ci --skip-generate --skip-verify
              │   → emits AFFECTED_SUITES: <ids> for Phase 3
              │
              ├─ Phase 2: REVIEW ONLY                    [runs ONLY when SKIP_SYNC=true]
              │   → /qa-test-lifecycle suite <ids> --ci --skip-sync --skip-generate --skip-verify
              │
              └─ Phase 3: REGRESSION (run affected suites)
                  → Delegates to ci/run-regression.ts
```

**Phases 1 and 2 are mutually exclusive.** Phase 4 (Review) always runs inside this command, so a
change-driven Phase 1 has already reviewed the suites it synced — re-running the review as Phase 2
would only pay for it twice. Consequence: `SKIP_LIFECYCLE` skips the **standalone** review pass only.
There is no "sync without reviewing" mode, because this command has none.

Neither CI phase generates cases (`--skip-generate`) or verifies live (`--skip-verify`, no browser in
CI) — so **CI can never clear GRD-001**, and any case it touches that carries an ungrounded assertion
stays `Draft` (G10 unmet) until an interactive run without `--skip-verify` grounds it.

### npm scripts

```bash
npm run ci:cycle                                    # Full cycle (requires CHANGE_SOURCE env var)
CHANGE_SOURCE="PR #123" npm run ci:cycle            # Full cycle for a PR
CHANGE_SOURCE="diff" npm run ci:cycle:sync-only     # Phase 1 only (scope + sync + review; no standalone review, no regression)
SUITE_SELECTION=critical npm run ci:cycle:no-sync    # Skip sync, run review+regression on critical suites
```

### CI mode behavior (`--ci`)

When `--ci` flag is set:
- Phase 5 (browser verification) is skipped automatically
- Ends with the line the CI caller's prompt asks for (`AFFECTED_SUITES: …`); no JSON block — the caller parses that line only
- No interactive prompts
- **The confirmation is replaced by PR review, and the write scope NARROWS — it does not widen.** `--ci`
  holds a *narrower* privilege than an interactive run: it may write only what the deterministic linter
  proved or what agreeing axes confirmed (see the Phase-4b write-scope table). It **never** promotes
  `Automation_Status` out of `Draft`, **never** deprecates a case, and **never** writes a Dim-11
  MISSING / CONTRADICTORY / UNGROUNDED / RETIRE verdict.
- Because Phase 5 is skipped, `--ci` **cannot ground a `{HYPOTHESIS}`/`{SPEC}` assertion** — a suite
  generated in the same `--ci` run stays `Draft` (G10 unmet) and is not regression-eligible until a
  later run without `--skip-verify` grounds it.
