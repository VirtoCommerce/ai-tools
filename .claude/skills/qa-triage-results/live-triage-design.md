# Live (incremental) triage — design note

Supporting file for [`SKILL.md`](SKILL.md). **Not implemented** — read it only when implementing
incremental triage; no current run uses it.

Today triage starts only after the run completes, so on a ~240-case run the whole classification
cost lands as a serial tail. Overlapping it with execution is a real wall-clock win — the evidence
is already on disk the moment a case fails (`traces/{TC-ID}-FAIL-trace.json`, screenshots, the
lane HAR). **The win is only safe for the stages that need neither a browser nor a write.**

**Split at the browser boundary:**

| Stage | Browser? | Writes? | When |
|---|---|---|---|
| `triage:collect` (deterministic evidence bundle) | No | No | **Live**, per failure |
| Classify (`regression-triage-agent`) | No | No | **Live**, batched (~5 failures/agent) |
| Cross-suite correlation + fingerprint dedup | No | No | **Live**, cheap |
| Live-verify a `REAL_BUG` | **Yes** | No | **After** the run |
| `--fix` test-case edits | No | **Yes** | After that suite is `done` |
| `/qa-bug` drafting (needs repro) | **Yes** | Yes | **After** the run |

**Mechanism.** A `Monitor` tails `reports/regression/{RUN_ID}/suite-*-results.json` for newly-added
`FAIL` rows → batches them → spawns a **browserless** classifier per batch → accumulates
`reports/regression/{RUN_ID}/triage-provisional.json`. On run completion, **reconcile** and only
then run the browser stages.

**Four hazards that make the naive "triage everything live" version worse than serial — each is why
a stage sits where it does above:**

1. **Lane contention.** Max 3 concurrent browser agents (all three click-capable since 2026-09-08,
   `.claude/rules/agents.md`), so a full run already owns every lane. A live-verifying agent would
   steal a lane from the run it is accelerating. Anything needing a browser therefore waits.
2. **Retries have not settled.** The orchestrator retries a failed suite once via the fallback chain,
   so a FAIL at T can be a PASS at T+20m. Every live verdict is **provisional** until the suite is
   `done`; the reconcile step drops failures that later passed. Skipping it drafts bugs for flakes.
3. **Cross-case correlation is lost per-case.** One root cause typically produces failures across
   several suites (a platform `TypeLoadException` surfaced as failures across 042/078/031 on
   2026-08-06). Classify in **batches with the accumulated ledger in context**, never one case in
   isolation, or you file N bugs for one cause.
4. **Write/state hazards.** `--fix` edits suite CSVs while a runner may be executing that suite (the
   runner snapshots to `suite-*-resolved.csv`, but a later `suites:sync` would disagree), and a
   `/qa-bug` repro mutates env state under the live suites. Both are gated behind suite completion.

**Acceptance criteria for the implementation:** a provisional verdict is never presented as final; the
reconcile step is mandatory and logged (how many provisional verdicts were dropped on retry); zero
browser agents are spawned while any suite is `running`; and the ledger records, per finding, the
suite state at classification time so a reader can tell what was still in flight.
