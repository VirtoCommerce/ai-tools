# Running round two — the explain-eight task

Task `TASK-EXPLAIN.md`, oracle `ORACLE-EXPLAIN.md`. Round one is finished and written up in
`RESULT.md`; its call-count prediction was falsified and this round does not repeat the design.

**Predictions sealed before the first arm: `sha256:212ba2eb94b677ad`**, at
`C:/_VIRTO/_predictions/comparison-r2-2026-09-15.md`, outside both repositories.
Verify with `node measurements/kb-live-2026-09/preregister.mjs verify <file> 212ba2eb94b677ad`.

## Order

**B, then A, then C.** C last, so it works on whatever the deployment has become rather than on a
state arranged for it. The pair that matters is **C against A** — round one measured the
repository's advantage as negative, so B is run for the demo's third column, not for the claim.

No call cap. 600 is a stop, not a budget: round one showed a cap that nearly binds compresses every
arm toward it and is worth about 83 calls on its own.

## Before each arm

    node measurements/kb-comparison-2026-09/preflight.mjs B|A|C     # must print READY

## Arm B — the QA repository

| | |
|---|---|
| launch from | `C:/_VIRTO/vc-mcp-testing-module` |
| context | the repository as it stands on `main`; `plugins/vc-kb/` is NOT on main and PR #298 stays unmerged until every arm has run |
| log | `C:/_VIRTO/_comparison-logs/round2/arm-B` |
| screenshots | `reports/bugs/screenshots/_incoming/chrome`, empty at the start |

`.claude/settings.local.json` is wired already: the PostToolUse logging hook, `VC_MEASURE_CAP=600`,
`browser_network_request` denied. `browser_evaluate` is in the allow list but the repository's own
`enforce-real-user.mjs` hook refuses it, which is how the arena arms are configured too — no arm can
script the page.

## Arms A and C — the arena

Copy `arena-settings/settings.arm-{a,c}.json` to `C:/_VIRTO/_arena/.claude/settings.json`.
The two differ by exactly two lines: `KB_BASE` (the treatment) and `VC_MEASURE_OUT`.
Point `VC_MEASURE_OUT` at `C:/_VIRTO/_comparison-logs/round2/arm-{A,C}` before starting.

Arm C's prompt is the task plus **one sentence** and nothing else:

> A knowledge base about this platform is available. Ask it with
> `node C:/_VIRTO/vc-kb-lab/bin/kb.mjs ask "<question>"` for facts and
> `... how "<what you are trying to do>"` for procedures; an uncovered question returns an explicit MISS.

## The rule during a run

**Paste the task verbatim, then say nothing.** If an arm asks a question about the platform, the
only honest answer is *"everything you need is in the task"*. An arm that is told anything else is
no longer comparable with the ones that were not.

## After each arm

1. Save the arm's report to `C:/_VIRTO/_comparison-logs/round2/arm-X/report.md` — **outside** every
   working directory, because an arm reads its own.
2. Move its screenshots out of the working directory the same way.
3. Do NOT grade yet. Grading happens once, against `ORACLE-EXPLAIN.md`, after the last arm.

## Held until the last arm has finished

Three writes to the corpus, all deliberately deferred: `kb dispute` on `KB-469AA660`, `KB-C51ACC81`
and the flow `KB-AFB2D3C5`, which assert an order cannot be deleted when it can; `kb amend` on the
flow's step; `kb confirm` on `KB-6AA0D7FB` and `KB-A646D086`.
