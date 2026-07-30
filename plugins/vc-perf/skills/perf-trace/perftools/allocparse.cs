#:package Microsoft.Diagnostics.Tracing.TraceEvent@3.1.16
#:property ManagePackageVersionsCentrally=false
#:property Nullable=enable

using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Diagnostics.Tracing;
using Microsoft.Diagnostics.Tracing.Etlx;
using Microsoft.Diagnostics.Tracing.Parsers.Clr;

// Usage: allocparse <trace.nettrace> [topN] [targetSubstring1,targetSubstring2,...]
//
// Attributes managed allocation from a `dotnet-trace collect --profile gc-verbose` capture
// (GCAllocationTick events). Four passes: by type, by leaf frame, by first non-BCL caller,
// and (optionally) representative full stacks for caller-supplied target method substrings.
if (args.Length < 1)
{
    Console.Error.WriteLine("usage: allocparse <trace.nettrace> [topN] [targetSubstring1,targetSubstring2,...]");
    Environment.Exit(1);
}
var path = args[0];
var topN = args.Length > 1 ? int.Parse(args[1]) : 25;
var targets = args.Length > 2 ? args[2].Split(',', StringSplitOptions.RemoveEmptyEntries) : [];

// ---- Pass 1: allocation by TYPE (cheap, EventPipe stream) ----
var byType = new Dictionary<string, (long bytes, long ticks)>();
long total = 0;
using (var src = new EventPipeEventSource(path))
{
    src.Clr.GCAllocationTick += (GCAllocationTickTraceData d) =>
    {
        var amt = d.AllocationAmount64;
        total += amt;
        var t = d.TypeName ?? "(unknown)";
        var cur = byType.TryGetValue(t, out var v) ? v : (0L, 0L);
        byType[t] = (cur.Item1 + amt, cur.Item2 + 1);
    };
    src.Process();
}

if (total == 0)
{
    Console.Error.WriteLine("allocparse: no GCAllocationTick events in this trace — wrong profile (need gc-verbose) or an empty capture.");
    Environment.Exit(1);
}

Console.WriteLine($"# GCAllocationTick total (sampled): {total / 1e9:F2} GB across all threads/iterations");
Console.WriteLine($"# NOTE: GCAllocationTick samples ~ every 100KB allocated per heap; magnitudes are representative, not exact.\n");
Console.WriteLine($"## Top {topN} allocated TYPES");
Console.WriteLine($"{"bytes(MB)",12} {"share",7}  type");
foreach (var kv in byType.OrderByDescending(x => x.Value.bytes).Take(topN))
{
    Console.WriteLine($"{kv.Value.bytes / 1e6,12:F1} {100.0 * kv.Value.bytes / total,6:F1}%  {kv.Key}");
}

// ---- Pass 2: allocation by CALL STACK + RESPONSIBLE caller (single pass over log.Events) ----
Console.WriteLine($"\n## Top {topN} allocation call-stack leaf frames (by GCAllocationTick, stack-resolved)");
var etlx = TraceLog.CreateFromEventPipeDataFile(path);
using var log = new TraceLog(etlx);
var byFrame = new Dictionary<string, long>();     // leaf method
var byModule = new Dictionary<string, long>();    // owning module
var byOwner = new Dictionary<string, long>();     // first non-BCL caller
long stacked = 0, nostack = 0;
// keep in sync with cpuparse.cs IsBcl
bool IsBcl(string m) => m is "System.Private.CoreLib" or "System.Collections"
    or "System.Collections.Immutable" or "System.Linq" or "System.Linq.Expressions"
    or "System.Memory" or "System.ObjectModel" or "System.Private.Xml" or "netstandard"
    or "System.Text.RegularExpressions" or "System.Runtime" or "System.Collections.Concurrent"
    or "System.Threading" or "System.Threading.Tasks" or "System.Text.Json" or "System.Net.Sockets";
foreach (var data in log.Events)
{
    if (data is not GCAllocationTickTraceData tick)
    {
        continue;
    }

    var cs = data.CallStack();
    if (cs == null)
    {
        nostack += tick.AllocationAmount64;
        continue;
    }

    stacked += tick.AllocationAmount64;
    var leaf = cs.CodeAddress.FullMethodName;
    var module = cs.CodeAddress.ModuleName;
    byFrame[$"{module}!{leaf}"] = byFrame.GetValueOrDefault($"{module}!{leaf}") + tick.AllocationAmount64;
    byModule[module] = byModule.GetValueOrDefault(module) + tick.AllocationAmount64;

    var owner = "(bcl-only)";
    for (var f = cs; f != null; f = f.Caller)
    {
        if (!IsBcl(f.CodeAddress.ModuleName))
        {
            owner = $"{f.CodeAddress.ModuleName}!{f.CodeAddress.FullMethodName}";
            break;
        }
    }
    byOwner[owner] = byOwner.GetValueOrDefault(owner) + tick.AllocationAmount64;
}
Console.WriteLine($"# stack-resolved {stacked / 1e9:F2} GB, no-stack {nostack / 1e9:F2} GB");
Console.WriteLine($"{"bytes(MB)",12} {"share",7}  module!leafMethod");
foreach (var kv in byFrame.OrderByDescending(x => x.Value).Take(topN))
{
    Console.WriteLine($"{kv.Value / 1e6,12:F1} {100.0 * kv.Value / stacked,6:F1}%  {kv.Key}");
}

// ---- Pass 3: attribute to the first "responsible" (non-BCL) caller ----
Console.WriteLine($"\n## Allocation by RESPONSIBLE caller (first non-BCL frame walking up from leaf)");
Console.WriteLine($"{"bytes(MB)",12} {"share",7}  responsible module!method");
foreach (var kv in byOwner.OrderByDescending(x => x.Value).Take(topN))
{
    Console.WriteLine($"{kv.Value / 1e6,12:F1} {100.0 * kv.Value / stacked,6:F1}%  {kv.Key}");
}

// ---- Pass 4: representative full stacks for target owners (entry-path confirmation) ----
// Targets come from the third CLI argument (comma-separated method-name substrings),
// e.g. "LocalDetectChanges,IsAssignableFrom" to confirm how a suspect frame is reached.
foreach (var target in targets)
{
    long best = 0;
    TraceCallStack? bestStack = null;
    foreach (var data in log.Events)
    {
        if (data is not GCAllocationTickTraceData tick)
        {
            continue;
        }

        var cs = data.CallStack();
        if (cs == null)
        {
            continue;
        }

        var hit = false;
        for (var f = cs; f != null; f = f.Caller)
        {
            if (f.CodeAddress.FullMethodName.Contains(target))
            {
                hit = true;
                break;
            }
        }
        if (hit && tick.AllocationAmount64 > best)
        {
            best = tick.AllocationAmount64;
            bestStack = cs;
        }
    }
    Console.WriteLine($"\n## Representative stack for '{target}' (largest single tick, leaf→root, 22 frames)");
    var n = 0;
    for (var f = bestStack; f != null && n < 22; f = f.Caller, n++)
    {
        Console.WriteLine($"    {f.CodeAddress.ModuleName}!{f.CodeAddress.FullMethodName}");
    }
}

Console.WriteLine($"\n## Allocation by MODULE (leaf frame owner)");
Console.WriteLine($"{"bytes(MB)",12} {"share",7}  module");
foreach (var kv in byModule.OrderByDescending(x => x.Value).Take(topN))
{
    Console.WriteLine($"{kv.Value / 1e6,12:F1} {100.0 * kv.Value / stacked,6:F1}%  {kv.Key}");
}
