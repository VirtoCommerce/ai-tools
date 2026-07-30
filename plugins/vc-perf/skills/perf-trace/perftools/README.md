# perftools — L3 diagnostic layer (profiling and attribution)

L3 of the three-layer performance toolchain:

| Layer | Where | Question it answers |
|---|---|---|
| L1 | `benchmarks/` (BenchmarkDotNet, I/O mocked) | Did the code-level allocation/time envelope regress? |
| L2 | `loadtests/` (k6, full real stack) | How does the running system behave under scripted load? |
| **L3** | **this folder** + `dotnet-counters` / `dotnet-trace` | **WHY — which code is responsible for what L2 observed?** |

L3 runs against the live backend while an L2 scenario drives traffic.

## Setup

```bash
dotnet tool install -g dotnet-counters dotnet-trace dotnet-gcdump
```

Find the backend process — the real app host, not a `dotnet run`/watch launcher: `dotnet-counters ps`
(or `dotnet-trace ps`) and pick the app binary (`PLATFORM_PROCESS` from your profile, default
`VirtoCommerce.Platform.Web`). On Git Bash where `pgrep` is absent, `dotnet-counters ps | grep` works.

## Agentic run from a sandboxed agent session (e.g. Claude Code)

The whole loop can run from inside a sandboxed agent session — no host terminal. Use `l3-capture.sh`
(wraps the recipe + gotchas — it must be in your allowlist, see the wrapper bullet) or the raw
`dotnet … collect` command (always covered by `dotnet:*`). Outside a sandbox the wrapper degrades
gracefully: the socket route is Linux-only, and when no `/tmp` socket exists (Windows uses named
pipes) it falls back to plain `dotnet-trace collect -p <pid>` — so the same command line works from
a host terminal on any OS. Rules that cost real time to learn:

- **NEVER disable the sandbox** for a dotnet-trace call (`dangerouslyDisableSandbox: true` in Claude
  Code) — counter-intuitively it makes AF_UNIX `socket()` fail EPERM (worse, not better). Run normally.
- **Invoke via the `dotnet` host, not bare `dotnet-trace`.** The agent's exec allowlist (Claude Code:
  `sandbox.excludedCommands` — `dotnet:*`, `dotnet-trace:*`) runs the command OUTSIDE the seccomp that
  otherwise blocks the AF_UNIX/epoll syscalls .NET's `Socket` ctor needs (a bare sandboxed
  `dotnet-trace` fails `SocketException(13)`). If `dotnet-trace:*` isn't allow-listed, call the DLL
  through the host: `dotnet $(find ~/.dotnet/tools/.store/dotnet-trace -name dotnet-trace.dll -path '*/tools/*'|head -1) collect ...`
- **If you use the `l3-capture.sh` wrapper, allow-list it too** (`bash …/l3-capture.sh:*`, mirroring
  `run.sh`). The agent matches `excludedCommands` on the TOP-LEVEL command and descendants inherit the
  jail — an un-allow-listed wrapper runs inside seccomp and re-jails its child `dotnet`, reproducing the
  EPERM this section prevents. Can't add it? Run the raw `dotnet "$DLL" collect …` line directly (it
  matches `dotnet:*`).
- **Use `--diagnostic-port <socket>,connect`, not `-p <pid>`.** A sandboxed session is in its own PID
  namespace, so `-p` (and `dotnet-trace ps`) can't see the host process. The diagnostic socket is
  visible in the shared `/tmp` (`/tmp/dotnet-diagnostic-<pid>-*-socket`) — the pid is embedded in the
  filename, which is what `l3-capture.sh` takes as its first arg.
- **The pid is the REAL app host, not a launcher.** A `dotnet run`/watch host — or an orchestrator like
  Aspire that runs `dotnet run --build` — shows a launcher pid whose trace is idle MSBuild/CLI frames.
  Find the app by tracing candidate sockets ~5s each: the app's trace is tens of MB (~hundreds of
  threads) with VirtoCommerce/Kestrel/Hangfire frames; the launcher's is small with MSBuild frames.
- **`-o` must be ABSOLUTE** — `$TMPDIR` is empty in the excluded environment, so a relative/`$TMPDIR`
  path resolves at `/` → permission denied. Point it at a writable results dir.

`$pluginRoot` below is this plugin's active install path — resolve it once per task via
`claude plugin list --json` (see [`../../../knowledge/plugin-root.md`](../../../knowledge/plugin-root.md));
it is NOT a shell variable and `$CLAUDE_PLUGIN_ROOT` does **not** expand in the Bash tool shell.

```bash
# CPU/thread capture under an L2 load window (100s) — wrapper (needs `bash …/l3-capture.sh:*` allow-listed):
bash $pluginRoot/skills/perf-trace/perftools/l3-capture.sh \
  <APP_PID> dotnet-sampled-thread-time 00:00:01:40 /abs/path/to/results/trace.nettrace
# …or the raw line, always covered by dotnet:* (no extra allow-listing):
dotnet $(find ~/.dotnet/tools/.store/dotnet-trace -name dotnet-trace.dll -path '*/tools/*'|head -1) \
  collect --diagnostic-port /tmp/dotnet-diagnostic-<APP_PID>-<disamb>-socket,connect \
  --profile dotnet-sampled-thread-time --duration 00:00:01:40 -o /abs/path/to/results/trace.nettrace
# then parse (file-based app; `dotnet run` is excluded too):
dotnet run $pluginRoot/skills/perf-trace/perftools/cpuparse.cs /abs/path/to/results/trace.nettrace 40 > out.txt
```

L2 (k6) needs no special handling: the `run.sh` invocation is in the allowlist, so it dials the backend
fine — just run it (no sandbox-disable).

## Which tool for which question

| Question | Tool / capture | Read with |
|---|---|---|
| Allocation churn (traffic) — who allocates? | `dotnet-trace collect -p <pid> --profile gc-verbose` | `allocparse` |
| On-CPU time — who burns CPU? | `dotnet-trace collect -p <pid> --profile dotnet-sampled-thread-time` | `cpuparse` |
| Wall-time in DB / EF commands | `dotnet-trace collect -p <pid> --profile database`, or OTel spans in Aspire dashboard | PerfView / manual |
| **Which operation causes which backend calls, and where its time goes** | `aspire otel spans <res> --follow --format Json` during a **1 VU** `OP_TAG=1` run | **`op_attrib`** |
| **How often per request does the module do X in-process** (no client span to attribute) | same capture, module emits `<prefix>count.*` span attributes; concurrency OK | **`counters_metric`** |
| **Cache-invalidation / search volume per iteration, and its true share of wall time** | same capture + the k6 iteration count | **`publish_metric`** |
| Leak / resident footprint | `dotnet-gcdump collect -p <pid>` before/after, diff | `dotnet-gcdump report`, PerfView |
| GC behaviour, gen sizes, LOH | `dotnet-counters monitor -p <pid> System.Runtime` (`gc.collections`, `gc.last_collection.heap.size`, `gc.pause.time`, `gc.heap.total_allocated`, `process.memory.working_set`) | live / CSV |

Axes are independent: heavy allocation churn can coexist with flat latency (gen0 is cheap
single-user) and zero footprint growth. Measure the axis your hypothesis is actually about.

## Gotchas (each cost real time once)

- **EventPipe is single-consumer per profile session in practice**: stop `dotnet-counters`
  before starting `dotnet-trace` on the same pid, or the trace fails to attach.
- `dotnet-counters monitor` may hang its teardown for ~minutes after the load stops (ignores
  SIGINT). Run it in the background with `--duration`, harvest the CSV when the k6 summary is
  written, then `pkill` the leftover.
- The CPU profile is `dotnet-sampled-thread-time`. `--profile cpu-sampling` / `thread-time`
  are `dotnet-trace collect-linux` (kernel perf) profiles and are rejected by plain `collect`.
- `GCAllocationTick` samples ~1 event per 100KB allocated per heap — magnitudes are
  representative, not exact. Fine for shares and A/B comparison, not for absolute byte counts.
- `dotnet-trace convert --format speedscope` on a `gc-verbose` trace yields 0 samples — the
  converter only reads CPU SampleProfiler events. That is why these parsers exist.
- Thread-stack sampling counts **on-CPU** time only. An async request awaiting a DB round-trip
  occupies no thread, so DB wall-time is invisible to `cpuparse` — a request can be 2–3% of
  samples while dominating latency. For wall-time use the `database` profile or OTel spans.

## Why custom parsers (and not an existing tool)

Existing tooling fully covers **capture** — that is what `dotnet-trace` / `dotnet-counters` /
`dotnet-gcdump` are used for above. The gap is **programmatic analysis** of non-CPU events,
cross-platform, in text form (the consumer of a baseline↔fix comparison is a diff / an agent,
not a pair of eyes on a GUI):

| Tool | Why it doesn't cover this |
|---|---|
| `dotnet-trace convert --format speedscope` | Converts **only** CPU SampleProfiler events — a `gc-verbose` trace yields 0 samples (verified) |
| `dotnet-trace report topN` | CPU top-functions only; no allocation-by-type/stack, no filtering |
| PerfView | Has the right views (GC Heap Alloc Stacks, Thread Time) but is Windows-only GUI — not scriptable, not cross-platform |
| dotMemory / dotTrace / VS Profiler | GUI, licensed, not scriptable into a measure→fix→re-measure loop |
| `dotnet-gcdump` | Different axis: resident heap snapshots (footprint/leak), not allocation-traffic attribution |
| `dotnet-counters` | Aggregates only ("how much"), no stacks ("who") |

The parsers are ~100 lines each on top of `Microsoft.Diagnostics.Tracing.TraceEvent` — the
official Microsoft library PerfView itself is built on; this is the documented, supported path
for custom trace analysis, not hand-rolled format parsing. They add two views no stock tool has:

- **Responsible caller** — first non-BCL frame walking up the stack (otherwise the top is all
  `System.Private.CoreLib!Dictionary...` instead of `EntityFrameworkCore!ChangeDetector...`);
- **ACTIVE view** (cpuparse) — filters idle threadpool waits and background pollers, without
  which request-path code drowns (it was 2.6% of raw samples in the worked example).

**Visual tools remain fully usable on top of the same captures.** The `.nettrace` files are
standard: open them in PerfView or Visual Studio on Windows, or `dotnet-trace convert --format
speedscope` a CPU trace for [speedscope.app](https://www.speedscope.app/). The parsers replace
nothing — they make the same data consumable headless and diffable.

## Parsers

Standalone .NET 10 **file-based apps** (single `.cs`, no `.csproj`/`obj`/`bin`; not in your
module's `.sln`), each pinning `Microsoft.Diagnostics.Tracing.TraceEvent` via a `#:package`
directive at the top of the file. Each takes a `.nettrace` file and writes a text report to stdout;
the first run also materialises a `.etlx` next to the trace (stack resolution). Cross-platform
(Linux/WSL/Windows) — run with `dotnet run <file>.cs`.

```bash
# Allocation attribution: by type, leaf frame, first non-BCL caller, module;
# optional comma-separated method substrings print a representative full stack each.
dotnet run perftools/allocparse.cs -- /path/to/alloc.nettrace 25 "LocalDetectChanges,PropertyValidator..ctor"

# On-CPU attribution: leaf / responsible-caller views, plus an ACTIVE view that filters
# idle threadpool waits and background pollers (Hangfire, OTel, Redis, AppInsights).
dotnet run perftools/cpuparse.cs -- /path/to/cpu.nettrace 25

# DB command attribution (from a `--profile database` capture): SQL shape counts, optional `inspect`.
dotnet run perftools/dbparse.cs -- /path/to/db.nettrace
```

The BCL-module and idle/background filter lists live at the top of each parser `.cs` — extend
them when a new background subsystem shows up in traces.

### `op_attrib.mjs` — per-operation attribution from OTel spans (no `dotnet-trace`, no rebuild)

The others read a `.nettrace`. This one reads an **Aspire OTel span capture** and answers a
different question: *which GraphQL operation caused which backend calls, and where did its time
go?* Node only, no dependencies, no code change to the system under test — which is the point: it
replaces the in-process counters you would otherwise hand-write, instrument, rebuild and redeploy
to learn "how many searches does one `addOrUpdateCartShipment` issue?".

```bash
# paths relative to skills/perf-trace/ (as with the dotnet run examples above)
aspire otel spans backend --apphost "$AH" --follow --format Json --non-interactive > spans.json &
OP_TAG=1 ITERATIONS=6 ../perf-loadtest/loadtests/run.sh smoke   # 1 VU — see the condition below
kill %1
node perftools/op_attrib.mjs spans.json --last [--rows]
```

Output: calls issued per request per operation (ES / SQL / Redis / outbound HTTP, median), where
each operation's **time** goes per backend, each operation's share of wall time, ES calls split by
target index, and — separately — background Hangfire work that ran inside the window but was not
caused by the requests.

Three things it does that a naive reading of the same spans gets wrong:

- **It does not group by `traceId`.** Measured on a VC backend: every `POST /graphql` server span
  was ALONE in its trace (152 of 152) — trace context is not propagated into the downstream ES /
  SQL / Redis client spans. Grouping by trace attributes nothing, and a "root = longest parentless
  span" fallback yields a table that looks per-request but is not. It attributes by **time
  containment** instead, which is why the capture must be **1 VU**: with overlapping requests a
  span cannot be assigned to one of several in flight. The script counts overlaps and **refuses**
  rather than printing numbers that mean nothing.
- **It unions time instead of summing it.** Overlapping calls inside one request would otherwise
  sum past the request's own duration — the same discipline that corrects a "55% of spans are Redis
  PUBLISH" reading to its true 1–2.5% of wall time.
- **It never double-counts a datastore call.** The ES client emits both a logical span
  (`search`, carrying `db.system`) and the raw HTTP span for the same call (no `db.system`);
  buckets are keyed on `db.system`, and the uninstrumented leg to any host already seen carrying
  `db.system` is dropped.

An `in-proc` column reports duration minus the union of ALL downstream calls — CPU, lock waits, GC.
A large share there means the next step is a CPU profile (`cpuparse`), not another call-count cut.

### `counters_metric.mjs` — in-process counts per operation, from the same capture

`op_attrib` can only see work that leaves the process. When the question is "how many times per
request does the module build a validation context / clone the cart", there is no client span to
attribute, and the module has to emit the count itself. The convention this tool reads: the module
tags **its request's own activity** with `<prefix>count.<name>` (exact integers) and optionally
`<prefix>time.<name>` (accumulated ms).

```bash
node perftools/counters_metric.mjs spans.json --prefix opus. [--since <iso>] [--until <iso>]
```

Because these ride on the request's own server span, reading them is a group-by rather than an
attribution — so unlike `op_attrib` this is **not restricted to 1 VU**. It *is* restricted to one
load window: see the window note below, which applies to this tool and `publish_metric` alike.

Two things to know before writing the emitting side:

- **Tag `HttpContext.Features.Get<IHttpActivityFeature>()?.Activity`, never `Activity.Current`.** On
  a backend with Application Insights enabled, `Activity.Current` inside a request is a *parentless*
  `Microsoft.ApplicationInsights.OperationContext` — Internal, unrecorded, never exported, and the
  ASP.NET activity is not reachable by walking `.Parent` either. Tags written there vanish entirely
  (measured: 0 attributes on 119 exported server spans). The symptom is this tool reporting "no
  server spans carry an attribute with prefix X" on a run you know emitted them.
- **A count is a lead, not a finding.** Emit a `time.*` alongside anything you intend to act on.
  Measured on one backend: a cart→order conversion ran 9–18× per request and cost 0.1–0.5% of request
  time. The tool prints `median [min..max]` and marks varying counters precisely so a *fixed* cost per
  invocation is distinguishable from a *per-item* multiplier — the cheapest discriminator there is.

### `publish_metric.mjs` — invalidation and search volume per iteration

```bash
node perftools/publish_metric.mjs spans.json <iterations> [--search-host <substr>] [--since <iso>] [--until <iso>]
```

`<iterations>` is `metrics.iterations.values.count` from the k6 summary — note the `.values.` level.
Reports Redis `PUBLISH` and search calls inside the load window, per iteration, plus the **union** of
their intervals as a share of wall time.

#### The load window, and when to pin it (both span readers)

A capture is **not one run**: `--follow` replays the dashboard's ring-buffer history, so previous
runs, warm-up probing and idle background work are in the same file (measured: 35 min of capture
around a 7 min run). Both readers therefore derive a window by clustering server spans on idle gaps
(`--idle-gap`, default 60 s) and taking the busiest cluster, and both print the block count and the
request count in the window.

**Reps driven back-to-back merge into one window.** `run.sh` has no inter-rep sleep, so consecutive
reps land inside the idle gap and are treated as a single run — measured, that doubled the headline
per-iteration figure. The tell is a request count in the banner that is larger than one rep's worth.
When reps run close together, stop guessing and pin the window:

```bash
node perftools/publish_metric.mjs spans.json 180 --since 2026-07-27T10:45:00Z --until 2026-07-27T10:52:00Z
```

**Denormalise before claiming a win.** A per-iteration figure moves with both numerator and
denominator: measured once, PUBLISH/iteration halved while publishes/second *rose* 16% — the change
was throughput, not less work. The absolute in-window count and window length are printed for exactly
this check.
