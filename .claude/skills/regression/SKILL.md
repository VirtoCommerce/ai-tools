# Regression Test Run
1. Read the test suite list from /config/regression-suites.json
2. Launch isolated Chromium browser contexts (max 4 parallel agents)
3. Each agent runs its suite with HAR capture enabled
4. If any agent fails, retry once then log failure
5. Consolidate all results into /reports/regression-YYYY-MM-DD.md
6. Never use WebKit on Windows. Default to Chromium.

# Run a full regression suite batch from a shell script:

Before doing anything, outline your step-by-step plan for this task. Include: which agents you'll spawn, what browser config each will use, how you'll handle failures, and what the final deliverable looks like. Wait for my approval before executing.

Run regression testing in 3 batches of 4 suites each. Wait for each batch to fully complete before starting the next. Each agent gets its own isolated browser context. If an agent fails with an internal error, retry it once in the next batch. Track progress in a TodoWrite checklist.

claude -p "Run regression suites auth, cart, checkout, search against QA env. Use isolated chromium browsers, max 4 parallel. Save consolidated report to reports/regression-$(date +%Y-%m-%d).md" --allowedTools "Read,Edit,Write,Bash,Glob,Task,TodoWrite" --max-turns 100


# Autonomous Test-Fix-Verify Development Loop

Implement an autonomous test-fix-verify loop for our frontend regression suite. Follow this exact protocol:

1. DISCOVER: Run `npx playwright test --reporter=json` and parse the JSON output. Identify all failing tests.

2. DIAGNOSE: For each failing test:
   - Read the test file and the component/page it tests
   - Read the error message and stack trace
   - Read any recent git changes to related files
   - Classify the failure: environment issue, test flake, actual regression, or test needs updating

3. FIX: For failures classified as 'actual regression' or 'test needs updating':
   - Propose a specific code fix (either to source code or test code)
   - Apply the fix using Edit
   - Log what you changed and why in `fix-log.md`

4. VERIFY: Re-run ONLY the previously-failing tests with `npx playwright test <test-file> --reporter=json`
   - If they pass: mark as resolved in fix-log.md
   - If they still fail: try ONE more fix approach, then mark as 'needs-human-review'

5. REPORT: After all failures are processed, generate `auto-fix-report.md` with:
   - Total failures found / auto-fixed / needs-human-review
   - Each fix with before/after explanation
   - Confidence level for each fix

Maximum 3 fix iterations per failing test. Do NOT modify more than 5 files without checking in with me. Start now by running the test suite.

# Living Test Intelligence Dashboard Generation

Build a comprehensive QA test intelligence dashboard system. I need:

1. A Python script `generate_dashboard.py` that:
   - Reads all test result JSON files from `./test-results/` directory
   - Reads the regression test coverage CSV/markdown reports in the project
   - Generates an HTML dashboard (`dashboard.html`) with embedded charts using plotly (for interactive) with PNG fallbacks

2. The dashboard must include these exact sections:
   - **Coverage Overview**: Donut chart showing test coverage by category (E2E, API, Unit, etc.) with EXACT numbers as labels — double-check every number against source data
   - **Browser Compatibility Matrix**: Heatmap grid showing pass/fail/skip per test suite per browser (Chrome, Firefox, Edge, WebKit)
   - **Trend Analysis**: Line chart showing pass rate over the last N test runs (read from timestamped result files)
   - **Flaky Test Detection**: Table of tests that passed and failed across different runs, sorted by flakiness score
   - **Failure Category Breakdown**: Bar chart categorizing failures (environment, timeout, assertion, crash)
   - **Execution Time Distribution**: Histogram of test durations with p50/p95/p99 markers

3. A shell wrapper `update-dashboard.sh` that can be called after any test run to regenerate

4. Make sure all chart labels are positioned to avoid overlap (use rotation, smart placement, or legend tables instead of inline labels)

Start by scanning my project to find all existing test result files and coverage reports, then build the dashboard based on real data. Verify every number in the generated charts matches the source data before finishing.
