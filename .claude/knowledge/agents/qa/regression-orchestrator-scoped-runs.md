# Regression orchestrator — scoped runs (`--cases` / `--ids`)

> Cited by `.claude/agents/regression-orchestrator.md` Step 3 item 3a. Read it when the run was given `--cases <tier>` or `--ids <IDs>`; a full run never reads it. Moved verbatim from the agent on 2026-10-30 (VCST-6423).

## Step 3 item 3a — narrow the resolved CSV (`--cases` / `--ids`)

3a. **`--cases <tier>` or `--ids <IDs>` only — narrow the resolved CSV to those cases, before lanes
    sees it:**

   ```bash
   npm run suites:filter -- reports/regression/{RUN_ID}/suite-{ID}-resolved.csv \
     --priority <tier> [--also-ids <ids>] \
     --out reports/regression/{RUN_ID}/suite-{ID}-resolved.scoped.csv \
     --scope-out reports/regression/{RUN_ID}/suite-{ID}-filter.json
   ```

   Then pass the **scoped** file to step 4: `npm run suites:lanes -- {ID} --run-id {RUN_ID} --csv
   reports/regression/{RUN_ID}/suite-{ID}-resolved.scoped.csv`.

   **Write a NEW file — never `--out` back over the source.** Overwriting destroys the only record of
   what the suite held, so "6 of 44" stops being re-derivable and the Step-6 Scope Exclusions claim
   becomes unfalsifiable; it also makes the step non-idempotent (a re-run filters an already-filtered
   file) and a crash mid-write truncates the resolved CSV with no recovery. `plan-lanes.ts` emits a
   new `…-resolved.browser.csv` for exactly this reason.

   **`--scope-out` is mandatory on a scoped run, not decorative.** The sidecar carries `sourceCases`
   — the suite's unfiltered size — which `suites:merge` folds into the results envelope and
   `triage:history` writes as `scoped` + `suite_total`. Without it a 6-of-44 run records `total: 6`
   and reports 6/6 = 100% coverage, so `estimate-calibration`'s 95% truncation guard never fires and
   `regression:recalibrate` calibrates a 44-case suite from a sixth of its work — feeding a false
   number straight back into the `--target` budget the scoping exists to satisfy.

   This hop is where a change-scoped run gets its scope. Filtering HERE — after `@td()` resolution,
   before `suites:lanes` — means lanes, the machine lane, the merge, the results envelope, triage and
   promotion are all untouched: they see a smaller suite, not a new mechanism.

   **A legacy 11-column header (exit 2) is RUN WHOLE, and named in Step 6.** `parseSuite` maps
   positionally, so `Priority` is not `Priority` there and filtering would drop real cases with total
   confidence. Running it whole is the fail-safe choice: dropping the suite would silently delete
   Critical coverage, whereas running it costs time you can see. Pass the *unfiltered*
   `suite-{ID}-resolved.csv` to `suites:lanes` and write no sidecar for it. If that blows the run's
   time budget, the fix is to drop the suite from the **selection** deliberately, not to let the
   filter appear to have applied.

   **`--ids <IDs>` is the exact-set form, and it replaces the tier rather than narrowing it.**
   `npm run suites:filter -- … --ids <IDs> --out … --scope-out …` selects precisely those cases and
   reads no `Priority` at all — so an unreadable one is *not* a finding on this path (nothing
   consulted it). It is mutually exclusive with `--priority`/`--also-ids`, and it is what
   `/qa-test` `5-loop`'s RED→GREEN track re-runs exactly the previously-failed cases. **An
   empty `tiers` in the sidecar therefore means *ids-only*, never *unfiltered*** — `sourceCases` is
   still the denominator, and `--scope-out` is just as mandatory. On an ids-only run **most suites in
   the selection legitimately contribute zero cases**, so the zero-kept line stops being an edge case
   and becomes the norm; report it, do not treat it as a failure.

  **`--also-ids` is how a case that is not in the tier still runs** — `/qa-test` passes its own newly
   authored `Draft` case IDs, which are in scope by construction whatever their priority. The id list
   is run-global while the filter runs per suite, so **`missingAlsoIds` is expected noise on every
   suite that does not own the case**: reconcile it once at run level (an id missing from *every*
   suite is the real miss) rather than reporting it per suite.

   **Every exclusion is reported, never silent** (Step 6). The filter prints the kept/dropped counts,
   names any row whose `Priority` it could not read, and says so when a suite contributes **zero**
   cases — 11 of 128 suites hold no Critical case at all, and a suite that disappears without a line
   is indistinguishable from a suite that passed. Build Step 6's section from the
   `suite-{ID}-filter.json` sidecars, **not** from scrollback.
