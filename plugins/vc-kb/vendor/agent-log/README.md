# agent-log — the measurement logger, vendored

A copy of the toolkit that instrumented the step-0 demand measurement (seven QA runs). It is
vendored the same way `../minisearch.js` is: one directory, no install step, nothing resolved at
runtime from outside this repository.

## Where the canonical copy lives, and why this one is not it

    C:/_VIRTO/_kb-work/handover/agent-log-toolkit/tools/        the working copy
    …/vc-mcp-testing-module/docs/adr/measurements/
        kb-demand-2026-09/handover-toolkit/tools/               committed with the measurement

Both are byte-identical to each other and were byte-identical to this directory at the moment it
was created. **They stay that way.** The step-0 numbers were produced by that exact code, and a
measurement whose instrument keeps changing underneath it cannot be re-run — the same reason the
seeded corpus is frozen at `vc-knowledge@seed-w0.5` rather than edited in place.

So the divergence is one-directional and deliberate: this copy moves, those do not.

## What diverges, and why

`log-row.mjs` — three values added to the `backed_by` vocabulary, and all three added to
`NEEDS_A_CALL`:

| value | when |
| --- | --- |
| `KB-DERIVED` | the answer came from the plane projected out of a running deployment |
| `KB-EXPERIENTIAL` | the answer came from the plane an agent wrote by hand |
| `KB-MISS` | the base was asked and held nothing |

The reasoning is in the comment at the enum itself. The short form: with the original five values a
base-answered row has to be filed as `LIVE` (nothing was probed) or `ASSUMED` (something *was*
read), and "did the base answer, or did the agent go to the deployment" — the question the whole
base exists to settle — stops being recoverable from the log.

`reconcile.mjs` is **unmodified**, and is meant to stay that way. It joins a `tool-log-*.jsonl`
to a `questions-*.csv` and never reads `backed_by`, so new values in that column cost it nothing.
If a change here ever requires editing `reconcile.mjs`, that is the signal to stop and reconsider
the change rather than the reconciler.

## Verifying this copy

    node vendor/agent-log/test-log-row.mjs      # 45
    node vendor/agent-log/test-tool-log.mjs     # 25
    node vendor/agent-log/test-reconcile.mjs    # 14

84 assertions, and they passed on this copy after the divergence above.

## What uses what

* `log-row.mjs` — invoked by `src/journal.mjs` (`add` only). The `kb` door writes the question
  half of a row; the outcome half (`mark`) stays with the agent, because `held`,
  `found_elsewhere`, `used` and `applied` are judgments only the agent can make.
* `tool-log.mjs` — the `PostToolUse` hook. Independent ground truth; not wired by this repository.
* `reconcile.mjs`, `merge-runs.mjs` — analysis, read-only.
* `memory-guard.mjs` — parks project-memory entries a session must not see. This is what makes
  "graded by a session that has not read the journal" checkable instead of promised.
* `scrub-scan.mjs`, `scrub-apply.mjs` — secrets in artifacts at rest.
* `make-reference-capture.mjs` — generates a synthetic-but-tool-produced session, to see the shape.
