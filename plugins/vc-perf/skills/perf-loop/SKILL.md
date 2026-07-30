---
name: perf-loop
description: >
  Orchestrates the three-layer performance loop (bench → load → diagnose → optimize → verify)
  on the local Aspire-hosted backend. Use when the user asks to "run the perf loop", "load test
  X", "profile the backend", "where do the allocations come from", "why is this operation slow",
  or to verify a performance fix end-to-end. Routes to the right layer and tool; does not
  duplicate them. For pure BenchmarkDotNet before/after comparison use `perf-benchmark` directly.
user-invocable: true
---

# perf-loop — the three-layer performance loop

The loop: **L1 bench → L2 load → L3 diagnose → optimize → verify (re-run L1 + L2/L3)**.
Each layer has its own harness and its own doc — this skill is the router and the
cross-layer discipline. A fully worked end-to-end example lives in your project's
evidence/notes dir (see the discipline section below) — check there for prior loop
write-ups before starting a new one.

> **Resolving `$pluginRoot`**: every path below uses `$pluginRoot` as a placeholder for this
> plugin's active install path — resolve it once per task via `claude plugin list --json` (see
> [`../../knowledge/plugin-root.md`](../../knowledge/plugin-root.md)) and reuse it. It is NOT a
> shell variable and `$CLAUDE_PLUGIN_ROOT` does **not** expand in the Bash tool shell.

| Layer | Harness | Doc / skill | Answers |
|---|---|---|---|
| L1 | `$pluginRoot/skills/perf-benchmark/` (BenchmarkDotNet, I/O mocked) | skill `perf-benchmark` | Did MY code's alloc/time envelope regress? (machine-readable verdict) |
| L2 | `$pluginRoot/skills/perf-loadtest/loadtests/` (k6, full real stack) | `perf-loadtest/loadtests/README.md` | How does the running system behave under load? (p95, counters) |
| L3 | `$pluginRoot/skills/perf-trace/perftools/` + dotnet-counters/trace | `perf-trace/perftools/README.md` | WHY — which code is responsible? (attribution) |

## Step 0 — route the question

| Question shape | Entry point |
|---|---|
| "did my change regress?" (code-level, before/after) | L1: `perf-benchmark` (Dry alloc verdict, seconds) |
| "how does N/RATE affect latency/GC on the real stack?" | L2: `$pluginRoot/skills/perf-loadtest/loadtests/run.sh` |
| "who allocates / who burns CPU / where is the time?" | L3 under L2 load: `$pluginRoot/skills/perf-trace/perftools/README.md` decision matrix |
| "verify a fix end-to-end" | full loop: L2+L3 baseline → apply fix → rebuild → L2+L3 again → L1 verdict if the change is bench-visible |
| "what SHOULD I suspect in this hot path?" (pre-measurement) | optional L0 hypothesis pass — the loop verifies, never trusts it: (a) VC-specific antipatterns → `$pluginRoot/knowledge/vc-perf-antipatterns.md`; (b) generic .NET → `dotnet-diag:analyzing-dotnet-performance`; (c) when the suspect path is EF → `dotnet-data:optimizing-ef-core-queries`. (b)/(c) are soft prerequisites — see the L0 note below |

Marketplace composition (see your project's evidence/notes dir for the comparison writeup):
`dotnet-diag:microbenchmarking` backs L1 BDN internals; adding
`Microsoft.AspNetCore.Hosting,Microsoft-AspNetCore-Server-Kestrel` (and `System.Net.*` for outbound
deps) to a trace's `--providers` yields request-lifecycle wall-time from the same capture.
`dotnet-trace collect-linux` was probed and DEFERRED: capture works but the preview format is
PerfView-only — the TraceEvent parsers can't decode it yet. Plain `collect` stays the workhorse.

**L0 soft prerequisites.** The generic .NET lenses live in the `dotnet-agent-skills` marketplace
(`dotnet-diag` = `analyzing-dotnet-performance` + `microbenchmarking`; `dotnet-data` =
`optimizing-ef-core-queries`). vc-perf does NOT hard-depend on them (they are a different
marketplace) — `/perf-init` detects them and prints the `/plugin marketplace add VirtoCommerce/... ` +
`/plugin install` commands to add them if missing. The VC-specific L0 list
(`$pluginRoot/knowledge/vc-perf-antipatterns.md`) ships with vc-perf and needs no prerequisite.

**L1 blind spot (structural):** L1 mocks the repository/`DbContext`, so anything in the real
save path (`SaveChangesAsync`, EF change tracking, triggers) does not exist there. A save-path
fix shows a FLAT L1 verdict — that is expected, not "no effect". Verify save-path work with
L2+L3 only. (This is premortem H-003 made concrete; see the worked example.)

## The three axes — never conflate them

| Axis | Metric | Measured by | Note |
|---|---|---|---|
| Allocation churn (traffic) | `gc.heap.total_allocated` rate, `GCAllocationTick` | counters + `gc-verbose` trace → `allocparse` | Transient gen0 pressure. Single-user latency-neutral; payoff is GC pressure under concurrency |
| Time | k6 p95 / OTel spans / `dotnet-sampled-thread-time` → `cpuparse` | L2 + L3 | On-CPU vs off-CPU differ: async DB waits are invisible to thread sampling — use the `database` profile / OTel spans for wall-time |
| Footprint / leak | `working_set`, `gc.last_collection.heap.size` (gen2/LOH), `dotnet-gcdump` diff | counters + gcdump | Needs a long run; a churn finding says nothing about footprint |

State which axis your hypothesis is about BEFORE measuring, and report results per axis.

## Diagnose session — operational sequence

1. Backend up via Aspire (`cd` to the Aspire host at `perf.aspireHostPath` from
   project-profile.json, then `aspire run`). Target pid = the app binary, NOT the `dotnet run`
   wrapper carrying the same name: match `perf.platformProcess` from project-profile.json, e.g.
   `pgrep -f "bin/[^ ]*/<perf.platformProcess>"`. On Windows/Git Bash `pgrep` is absent — use
   `dotnet-counters ps | grep -F "<perf.platformProcess>"` instead. A trace attached to the
   wrapper still "completes" — recognition: parser total ≪ expected (MBs instead of GBs) means
   wrong pid, not "no allocations". If module DLLs were overlaid, also check the pid's start
   time postdates the deploy.
2. **Counters first** (cheap envelope): start `dotnet-counters monitor/collect` in the
   background, drive load with `$pluginRoot/skills/perf-loadtest/loadtests/run.sh`,
   harvest the CSV when the k6 summary lands.
3. **Trace second**: STOP counters (EventPipe conflicts — see `perf-trace/perftools/README.md`
   gotchas), then `dotnet-trace collect` with the profile the axis calls for, under the same k6
   scenario.
4. Parse with the perftools file-based apps —
   `dotnet run $pluginRoot/skills/perf-trace/perftools/allocparse.cs` / `cpuparse.cs`;
   attribute to the responsible frames.
5. Fix → redeploy (backend rebuild via Aspire) → repeat 2–4 with identical knobs (`ITEMS`,
   `RATE`, scenario) → compare.

## Cross-layer discipline

- **Identical knobs across compared runs.** A baseline at `ITEMS=100` compares only with a
  fix-run at `ITEMS=100`, same scenario, same co-located setup.
- **Read attribution in absolutes first.** When a fix removes one slice, every other share
  inflates (EF 42%→46% with absolute bytes unchanged) — compare bytes per responsible frame
  across runs; shares second.
- **Categorical beats statistical.** A frame DISAPPEARING from the responsible-caller list
  (ctor no longer invoked) is a structural verdict, immune to run variance — it survives a
  cross-session baseline. A frame merely shrinking needs a same-session A/B with identical knobs.
- **Results are RELATIVE.** Single-VU, co-located k6 + backend + DB on a dev machine: deltas
  and shares are trustworthy, absolute numbers are not.
- **Claude Code sandbox (the full loop runs from inside a CC session — no host terminal):** the
  tools work because they are in `sandbox.excludedCommands` (`curl:*`, `dotnet:*`, `k6:*`,
  `bash …/run.sh:*`, `bash …/l3-capture.sh:*`, `dotnet-trace:*`), which run them OUTSIDE the
  seccomp. **NEVER pass
  `dangerouslyDisableSandbox: true`** — counter-intuitively it makes AF_UNIX `socket()` fail EPERM
  and breaks `dotnet-trace` (a bare, non-excluded `dotnet-trace` also fails `SocketException(13)`).
  Run `run.sh` normally (k6 dials localhost fine); invoke dotnet-trace via the excluded `dotnet`
  host and attach with `--diagnostic-port <socket>,connect` (NOT `-p <pid>` — the PID namespace
  hides the host pid); `-o` must be absolute (`$TMPDIR` is empty in the excluded env). Full recipe
  + `l3-capture.sh`: the `perf-trace` skill's `perftools/README.md` → "Agentic run".
- **Keep evidence.** Raw parser output and counters CSVs go to your project's evidence dir;
  findings get a dated note in your project's research/notes dir (see its own README/index for
  the map).
- **Fix scope is a decision, not a default.** A platform-level fix (e.g. a `vc-platform`
  chokepoint) measured as a local POC must be reverted after measurement and promoted through
  an upstream PR/ticket — never left in the local platform checkout.
- **A diagnose session ends with ranked optimization candidates, not at attribution.** The
  loop's next stage is «optimize» — the session report (chat AND the dated note) must close
  with a ranked candidate list: evidence share, fix shape, where the fix lands (FE / client project /
  upstream), and the verification plan. Tooling/harness follow-ups are listed separately and
  never substitute for candidates. (Surfaced 2026-07-09: the getFullCart baseline wrap-up
  led with tooling items and buried the candidates in the note's prose.)
