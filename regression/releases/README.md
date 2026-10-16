# Release regressions

One folder per stable-bundle regression (`stable-16/`, `stable-17/` …). Each holds the plan, the state of
every wave and the triage ledger, so several QA can run the waves in parallel on one environment and anyone
can continue a wave someone else started.

![Parallel release regression](release-regression-flow.svg)

- **Plan a release:** `/qa-release-plan <release> --from vN --to vN --env <TEST_ENV> --ticket <KEY>`
- **Run, triage and publish one wave:** `/qa-release-wave <release> <wave> --claim` · overview: `/qa-release-wave <release> status`
- **Check a folder:** `npm run release:check -- <release>` (CI runs `--all`)
- **Contract** — layout, fields, verdicts, parallel-run rules: [`.claude/knowledge/execution/release-regression.md`](../../.claude/knowledge/execution/release-regression.md)

`PROGRESS.md` in each folder is generated (`npm run release:status -- <release> --write`); never edit it by hand.
