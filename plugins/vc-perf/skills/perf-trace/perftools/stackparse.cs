#:package Microsoft.Diagnostics.Tracing.TraceEvent@3.1.16
#:property ManagePackageVersionsCentrally=false
#:property Nullable=enable

using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Diagnostics.Tracing.Etlx;

// Usage: stackparse <trace.nettrace> <frame-substring>[,<substring2>,...] [topN] [maxDepth]
//
// Representative-stack attribution for CPU samples (SampleProfiler events): selects samples
// whose call stack contains any of the given substrings (matched against Module!FullMethodName),
// then reports (a) ranked responsible callers — the first non-BCL frame ABOVE the deepest
// matched frame — and (b) the top representative caller chains, grouped from the matched
// frame upward. Complements cpuparse, which stops at the first non-BCL frame and therefore
// can't see through owners like System.Linq.Queryable.
if (args.Length < 2)
{
    Console.Error.WriteLine("usage: stackparse <trace.nettrace> <frame-substring>[,<substring2>,...] [topN] [maxDepth]");
    Environment.Exit(1);
}
var path = args[0];
var needles = args[1].Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
var topN = args.Length > 2 ? int.Parse(args[2]) : 15;
var maxDepth = args.Length > 3 ? int.Parse(args[3]) : 30;
bool IsBcl(string m) => m is "System.Private.CoreLib" or "System.Collections"
    or "System.Collections.Immutable" or "System.Linq" or "System.Linq.Expressions"
    or "System.Linq.Queryable" or "System.Memory" or "System.ObjectModel" or "System.Private.Xml"
    or "netstandard" or "System.Text.RegularExpressions" or "System.Runtime"
    or "System.Collections.Concurrent" or "System.Threading" or "System.Threading.Tasks"
    or "System.Text.Json" or "System.Net.Sockets";

var etlx = TraceLog.CreateFromEventPipeDataFile(path);
using var log = new TraceLog(etlx);
long total = 0;
long matched = 0;
var byCaller = new Dictionary<string, long>();
var byChain = new Dictionary<string, long>();
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

    // Walk leaf -> root; remember the shallowest (closest-to-root) matched frame so the
    // caller chain starts above the whole matched region, not inside it.
    var frames = new List<(string Module, string Method)>();
    var lastMatchIndex = -1;
    var i = 0;
    for (var f = cs; f != null; f = f.Caller, i++)
    {
        var module = f.CodeAddress.ModuleName;
        var method = f.CodeAddress.FullMethodName;
        frames.Add((module, method));
        var full = $"{module}!{method}";
        if (needles.Any(n => full.Contains(n, StringComparison.OrdinalIgnoreCase)))
        {
            lastMatchIndex = i;
        }
    }
    if (lastMatchIndex < 0)
    {
        continue;
    }

    matched++;

    var caller = "(root)";
    for (var j = lastMatchIndex + 1; j < frames.Count; j++)
    {
        if (!IsBcl(frames[j].Module))
        {
            caller = $"{frames[j].Module}!{frames[j].Method}";
            break;
        }
    }
    byCaller[caller] = byCaller.GetValueOrDefault(caller) + 1;

    var chainFrames = frames.Skip(lastMatchIndex).Take(maxDepth).Select(x => $"{x.Module}!{x.Method}");
    var chain = string.Join("\n    <- ", chainFrames);
    byChain[chain] = byChain.GetValueOrDefault(chain) + 1;
}

if (total == 0 || matched == 0)
{
    Console.Error.WriteLine(total == 0
        ? "stackparse: no sample events in this trace — wrong profile or an empty capture."
        : $"stackparse: 0 of {total} samples matched [needles: {string.Join(", ", needles)}] — check the needle list.");
    Environment.Exit(1);
}

Console.WriteLine($"# Samples: {total} total, {matched} matched ({100.0 * matched / total:F2}%) [needles: {string.Join(", ", needles)}]");
Console.WriteLine($"\n## Ranked responsible callers (first non-BCL frame above matched region)");
foreach (var kv in byCaller.OrderByDescending(x => x.Value).Take(topN))
{
    Console.WriteLine($"{100.0 * kv.Value / matched,6:F1}% ({kv.Value,5})  {kv.Key}");
}
Console.WriteLine($"\n## Top {topN} representative caller chains (from matched frame up, max {maxDepth} frames)");
foreach (var kv in byChain.OrderByDescending(x => x.Value).Take(topN))
{
    Console.WriteLine($"\n[{kv.Value} samples, {100.0 * kv.Value / matched:F1}% of matched]");
    Console.WriteLine($"    {kv.Key}");
}
