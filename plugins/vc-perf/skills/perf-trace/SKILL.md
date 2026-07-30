---
name: perf-trace
description: Capture a dotnet-trace / dotnet-counters session against the live backend and parse it with perftools (allocparse/cpuparse/dbparse) to attribute WHO is responsible for what L2 observed. Use when you know load behaves a certain way (L2) and need to find the responsible code — allocation churn, on-CPU time, or DB command shape.
---

# perf-trace — L3 of the three-layer performance loop

The attribution layer of the loop (**L1 bench → L2 load → L3 diagnose**, see skill
`perf-loop` for the router and cross-layer discipline). L3 runs against the live backend
**while an L2 scenario drives traffic**, and answers WHY — which code is responsible for what L2
observed.

## Finding the backend pid

Resolve the app binary's pid, not the `dotnet run` wrapper carrying the same name — match
`perf.platformProcess` from `project-profile.json`:

```bash
pgrep -f "bin/[^ ]*/<perf.platformProcess>"
# or, cross-platform (also works on Windows/Git Bash, where pgrep is absent):
dotnet-counters ps | grep -F "<perf.platformProcess>"
```

## Capture → parse flow

1. Start load with the L2 harness (`perf-loadtest` skill) targeting `perf.backendUrl`.
2. Capture with `dotnet-trace collect`, using the profile the axis calls for:

   ```bash
   dotnet-trace collect -p <pid> --profile gc-verbose -o alloc.nettrace                 # allocation churn
   dotnet-trace collect -p <pid> --profile dotnet-sampled-thread-time -o cpu.nettrace    # on-CPU time
   dotnet-trace collect -p <pid> --profile database -o db.nettrace                       # DB command wall-time
   ```

3. Parse with the matching file-based app under `$pluginRoot/skills/perf-trace/perftools/`
   (`$pluginRoot` is this plugin's active install path — resolve it once per task via
   `claude plugin list --json`, see [`../../knowledge/plugin-root.md`](../../knowledge/plugin-root.md);
   it is NOT a shell variable and `$CLAUDE_PLUGIN_ROOT` does **not** expand in the Bash tool shell):

   ```bash
   dotnet run $pluginRoot/skills/perf-trace/perftools/allocparse.cs -- alloc.nettrace 25
   dotnet run $pluginRoot/skills/perf-trace/perftools/cpuparse.cs -- cpu.nettrace 25
   dotnet run $pluginRoot/skills/perf-trace/perftools/dbparse.cs -- db.nettrace
   ```

Full decision matrix (which tool for which question), gotchas, and why these parsers exist
instead of an off-the-shelf tool: `perftools/README.md`.

## Start here when the question is "which operation costs what"

Before reaching for `dotnet-trace` at all: if the question is *which GraphQL operation issues which
backend calls, and where its time goes*, the OTel spans Aspire already collects answer it with **no
profiler, no rebuild, and no in-process counters**. This is the cheapest first cut of L3 and it
routinely reorders the candidate list before any code is touched.

```bash
aspire otel spans backend --apphost "$AH" --follow --format Json --non-interactive > spans.json &
OP_TAG=1 ITERATIONS=6 <loadtests>/run.sh smoke     # OP_TAG labels each request ?op=<name>; 1 VU
kill %1
node $pluginRoot/skills/perf-trace/perftools/op_attrib.mjs spans.json --last
```

Requires **1 VU** (`smoke`): attribution is by time containment, so requests must not overlap — the
tool counts overlaps and refuses rather than emitting meaningless numbers. Details and the three
traps it avoids (no `traceId` grouping, union-not-sum time, no datastore double-count):
`perftools/README.md`.

Reach for `dotnet-trace` when this leaves a large **`in-proc`** share — time no downstream call
explains — since that is where allocation/CPU attribution is the only way forward.

## EventPipe is single-consumer — the gotcha that costs real time

`dotnet-counters` and `dotnet-trace` cannot both attach to the same pid at once. **Stop
`dotnet-counters` before starting `dotnet-trace`** on the same backend pid, or the trace fails to
attach. If the L2 harness's counters sidecar is running, disable it (its `NO_COUNTERS=1` knob)
before a trace capture.

## Role in the loop

L3 never runs standalone — it attributes what L2 (`perf-loadtest`) already showed. After fixing,
redeploy and repeat capture → parse with identical knobs, then re-verify with L1 if the change is
bench-visible.
