#:package Microsoft.Diagnostics.Tracing.TraceEvent@3.1.16
#:property ManagePackageVersionsCentrally=false
#:property Nullable=enable

using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Diagnostics.Tracing.Etlx;

// Usage: cpuparse <trace.nettrace> [topN]
//
// Attributes thread-time from a `dotnet-trace collect --profile dotnet-sampled-thread-time`
// capture (SampleProfiler events, ~100Hz per managed thread).
//
// IMPORTANT: this profile samples EVERY managed thread whether it is on-CPU or not, so a share here
// is THREAD time, not CPU time. Two views, both sample-counted:
//   RAW    - every sample. Answers "what are the threads doing at all", not "what costs CPU".
//   ACTIVE - denylist: known idle modules, wait leaves and unsymbolicated native leaves removed.
//            A denylist can only remove what it already knows, so treat ACTIVE as a hint.
//
// A leaf with neither module nor method is NATIVE code the symbolicator could not name (runtime
// internals, GC, syscalls, native waits) — NOT a failure to resolve managed symbols, which resolve
// fine. ACTIVE used to omit that case, so those samples survived the filter and collapsed into one
// nameless entry owning ~98% of the view. That was read as "symbols do not resolve on this stand"
// and cost an investigation several build-deploy cycles of hand-written counters.
//
// For an actual CPU profile (and a flame graph), prefer the converter — it is the same trace, read
// properly, and it works on every platform:
//     dotnet-trace convert <t>.nettrace --format speedscope
// The converter emits explicit CPU_TIME / UNMANAGED_CODE_TIME pseudo-frames that this sample-counted
// view does not have; attribute only intervals whose LEAF is CPU_TIME. Measured on one VC backend:
// UNMANAGED_CODE_TIME 5,889,575 ms vs CPU_TIME 138,501 ms, i.e. 97.7% of thread TIME not computing.
// Note the export is `evented` (open/close pairs with `at`), NOT `sampled` — there is no `weights`
// array, and a reader that expects one silently computes zero.
//
// Platform note: profile availability differs per OS — run `dotnet-trace list-profiles` and check the
// `(collect-linux)` / `(collect-windows)` marker. Those are KERNEL-sampled profiles and cannot name
// JIT frames without extra setup (on Linux, `DOTNET_PerfMapEnabled=1`). `dotnet-sampled-thread-time`
// and `gc-verbose` are managed EventPipe profiles and carry names from rundown on every platform —
// judge "can this host be profiled" by those, never by a kernel profile that was never configured.
if (args.Length < 1)
{
    Console.Error.WriteLine("usage: cpuparse <trace.nettrace> [topN]");
    Environment.Exit(1);
}
var path = args[0];
var topN = args.Length > 1 ? int.Parse(args[1]) : 25;
bool IsBcl(string m) => m is "System.Private.CoreLib" or "System.Collections"
    or "System.Collections.Immutable" or "System.Linq" or "System.Linq.Expressions"
    or "System.Memory" or "System.ObjectModel" or "System.Private.Xml" or "netstandard"
    or "System.Text.RegularExpressions" or "System.Runtime" or "System.Collections.Concurrent"
    or "System.Threading" or "System.Threading.Tasks" or "System.Text.Json" or "System.Net.Sockets";

//A frame with neither module nor method is a NATIVE code address TraceEvent could not symbolicate —
//runtime internals, the GC, syscalls, native waits. It is not a failure to resolve MANAGED symbols
//(those all resolve); it is time spent outside managed code. `dotnet-trace convert --format speedscope`
//labels the same thing UNMANAGED_CODE_TIME. Rendering it as a bare "!" is what made it look like a
//broken symbol pipeline and got an entire stand written off as unprofilable.
//TraceEvent renders an unresolved frame differently per platform and per symbol availability: empty
//strings on Linux EventPipe captures, "?" on Windows/ETW. Treat both as the same thing rather than
//matching whichever shape the machine you developed on happened to produce.
bool IsUnresolvedName(string? s) => string.IsNullOrWhiteSpace(s) || s == "?";

bool IsUnresolvedNative(string? module, string? method)
    => IsUnresolvedName(module) && IsUnresolvedName(method);

string Label(string? module, string? method)
{
    if (IsUnresolvedNative(module, method))
    {
        return "(native / unmanaged — no symbols; = UNMANAGED_CODE_TIME in speedscope)";
    }

    return string.IsNullOrEmpty(module) ? method! : $"{module}!{method}";
}

var etlx = TraceLog.CreateFromEventPipeDataFile(path);
using var log = new TraceLog(etlx);
long total = 0;
long managedLeafTotal = 0;
long unmanagedTotal = 0;
var byLeaf = new Dictionary<string, long>();
var byOwner = new Dictionary<string, long>();
foreach (var d in log.Events)
{
    if (d.ProviderName is null || !d.ProviderName.Contains("SampleProfiler"))
    {
        continue;
    }

    var cs = d.CallStack();
    if (cs == null)
    {
        continue;
    }

    total++;
    var leafNative = IsUnresolvedNative(cs.CodeAddress.ModuleName, cs.CodeAddress.FullMethodName);
    var leaf = Label(cs.CodeAddress.ModuleName, cs.CodeAddress.FullMethodName);
    byLeaf[leaf] = byLeaf.GetValueOrDefault(leaf) + 1;
    var owner = "(bcl-only)";
    for (var f = cs; f != null; f = f.Caller)
    {
        if (!IsBcl(f.CodeAddress.ModuleName) && !IsUnresolvedNative(f.CodeAddress.ModuleName, f.CodeAddress.FullMethodName))
        {
            owner = Label(f.CodeAddress.ModuleName, f.CodeAddress.FullMethodName);
            break;
        }
    }
    byOwner[owner] = byOwner.GetValueOrDefault(owner) + 1;

    if (leafNative)
    {
        unmanagedTotal++;
    }
    else
    {
        managedLeafTotal++;
    }
}
if (total == 0)
{
    Console.Error.WriteLine("cpuparse: no CPU sample events in this trace — wrong profile (need dotnet-sampled-thread-time / cpu-sampling) or an empty capture.");
    Environment.Exit(1);
}

Console.WriteLine($"# Thread-time samples: {total}  (THREAD time, NOT CPU time — see the split below)");
Console.WriteLine($"#   managed leaf         : {managedLeafTotal,10} = {100.0 * managedLeafTotal / total,5:F1}%");
Console.WriteLine($"#   native / no symbols  : {unmanagedTotal,10} = {100.0 * unmanagedTotal / total,5:F1}%  (blocked, waiting, GC, syscalls)");
Console.WriteLine("#   For a real CPU profile use the speedscope route — it separates CPU_TIME from");
Console.WriteLine("#   UNMANAGED_CODE_TIME explicitly, which this view cannot:");
Console.WriteLine("#     dotnet-trace convert <trace>.nettrace --format speedscope");
Console.WriteLine("#     then attribute only intervals whose LEAF is CPU_TIME (the export is `evented`:");
Console.WriteLine("#     open/close pairs with `at`, no `weights` array).");

Console.WriteLine($"\n## Top {topN} SELF (leaf) methods by THREAD-time sample %");
foreach (var kv in byLeaf.OrderByDescending(x => x.Value).Take(topN))
{
    Console.WriteLine($"{100.0 * kv.Value / total,6:F1}%  {kv.Key}");
}
Console.WriteLine($"\n## Top {topN} RESPONSIBLE callers (first non-BCL) by THREAD-time sample %");
foreach (var kv in byOwner.OrderByDescending(x => x.Value).Take(topN))
{
    Console.WriteLine($"{100.0 * kv.Value / total,6:F1}%  {kv.Key}");
}

// ---- ACTIVE view: exclude idle/background/wait samples, surface request-path work ----
// Denylist-based, so it can only remove what it already knows about — which is exactly how it failed:
// native/unsymbolicated leaves were not on the list, survived the filter, and collapsed into one
// nameless entry owning ~98% of the view. They are excluded now, but treat ACTIVE as a hint and the
// speedscope CPU_TIME view as the answer.
string[] idleModules =
[
    "Hangfire.Core", "Hangfire.PostgreSql", "OpenTelemetry",
    "OpenTelemetry.Instrumentation.StackExchangeRedis", "Microsoft.ApplicationInsights",
    "Microsoft.AI.PerfCounterCollector", "StackExchange.Redis", "System.IO.FileSystem.Watcher",
];
string[] waitLeaves =
[
    "UNMANAGED_CODE_TIME",
    "WaitHandle.", "LowLevelLifoSemaphore", "Thread.Sleep", "Monitor.Wait",
    "ManualResetEventSlim.Wait", "Task.InternalWaitCore", "PollGC", "Heartbeat.TimerLoop",
    "HostingAbstractionsHostExtensions.Run", "WaitForDispatchers",
];
var active = new Dictionary<string, long>();
long activeTotal = 0;
foreach (var d in log.Events)
{
    if (d.ProviderName is null || !d.ProviderName.Contains("SampleProfiler"))
    {
        continue;
    }

    var cs = d.CallStack();
    if (cs == null)
    {
        continue;
    }

    //A native/unsymbolicated LEAF means the thread was not executing managed code at this sample.
    //Without this the whole blocked population lands in ACTIVE under one nameless entry.
    if (IsUnresolvedNative(cs.CodeAddress.ModuleName, cs.CodeAddress.FullMethodName))
    {
        continue;
    }

    var idle = false;
    var owner = "(bcl-only)";
    var ownerSet = false;
    for (var f = cs; f != null; f = f.Caller)
    {
        var m = f.CodeAddress.ModuleName;
        var full = f.CodeAddress.FullMethodName;
        if (idleModules.Contains(m))
        {
            idle = true;
            break;
        }
        if (!string.IsNullOrEmpty(full) && waitLeaves.Any(w => full.Contains(w)))
        {
            idle = true;
            break;
        }
        if (!ownerSet && !IsBcl(m) && !IsUnresolvedNative(m, full))
        {
            owner = Label(m, full);
            ownerSet = true;
        }
    }
    if (idle)
    {
        continue;
    }

    activeTotal++;
    active[owner] = active.GetValueOrDefault(owner) + 1;
}
Console.WriteLine($"\n## ACTIVE (idle/background/wait excluded): {activeTotal} samples = {100.0 * activeTotal / total:F1}% of all");
foreach (var kv in active.OrderByDescending(x => x.Value).Take(topN))
{
    Console.WriteLine($"{100.0 * kv.Value / activeTotal,6:F1}% (act) / {100.0 * kv.Value / total,4:F2}% (all)  {kv.Key}");
}
