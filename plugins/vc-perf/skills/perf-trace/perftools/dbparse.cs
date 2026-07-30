#:package Microsoft.Diagnostics.Tracing.TraceEvent@3.1.16
#:property ManagePackageVersionsCentrally=false
#:property Nullable=enable

using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Diagnostics.Tracing;

// Usage: dbparse <trace.nettrace> [inspect]
//
// Attributes DB command load from a `dotnet-trace collect --profile database` capture. Default
// mode aggregates EF Core command events (count by normalized SQL shape — volume + rate answer
// "how much DB work"; per-command duration isn't in the default capture). `inspect`
// mode lists every provider/event with counts — run it first on a new capture to confirm the
// event names this build emits, then adjust the command-event matching below if needed.
if (args.Length < 1)
{
    Console.Error.WriteLine("usage: dbparse <trace.nettrace> [inspect]");
    Environment.Exit(1);
}
var path = args[0];
var mode = args.Length > 1 ? args[1] : "aggregate";

if (mode == "inspect")
{
    var byEvent = new Dictionary<string, long>();
    var fields = new Dictionary<string, string>();
    var sample = new Dictionary<string, string>();
    using var src = new EventPipeEventSource(path);
    src.Dynamic.All += (TraceEvent d) =>
    {
        var key = $"{d.ProviderName}|{d.ProviderGuid}|{(int)d.ID}|{d.EventName}";
        byEvent[key] = byEvent.GetValueOrDefault(key) + 1;
        if (!fields.ContainsKey(key))
        {
            fields[key] = string.Join(",", d.PayloadNames ?? []);
            // Grab a text-looking payload (SQL) if present.
            foreach (var pn in d.PayloadNames ?? [])
            {
                var v = d.PayloadByName(pn)?.ToString() ?? "";
                if (v.Length > 20 && (v.Contains("SELECT", StringComparison.OrdinalIgnoreCase) || v.Contains("INSERT", StringComparison.OrdinalIgnoreCase) || v.Contains("UPDATE", StringComparison.OrdinalIgnoreCase)))
                {
                    sample[key] = $"{pn}={v[..Math.Min(80, v.Length)]}";
                    break;
                }
            }
        }
    };
    src.Process();
    Console.WriteLine("# count  provider|guid|id|name  ::  payloadNames  ::  sampleSql");
    foreach (var kv in byEvent.OrderByDescending(x => x.Value).Take(20))
    {
        Console.WriteLine($"{kv.Value,10:N0}  {kv.Key}\n            fields: {fields.GetValueOrDefault(kv.Key)}\n            sql: {sample.GetValueOrDefault(kv.Key, "(none)")}");
    }
    return;
}

// Aggregate mode: EF Core `CommandExecuted` carries the SQL text and elapsed time. Group by a
// normalized shape (verb + first table, digits/whitespace collapsed) so per-row INSERT/UPDATE
// variants fold into one bucket and per-command counts are meaningful.
// DiagnosticSource DB command activities (EF Core / Npgsql) surface as
// Microsoft-Diagnostics-DiagnosticSource Activity2/Start with SourceName + EventName. Group by
// those to quantify command volume per source/event (SQL text itself is only present if the
// capture's transform spec requested it; volume + rate already answer "how much DB work").
long total = 0;
var byShape = new Dictionary<string, long>();
var bySource = new Dictionary<string, long>();

// DiagnosticSource Arguments arrive as an object[] of {Key,Value} pairs (or similar). Pull a
// value that looks like SQL if present; return null when the transform didn't capture the text.
string? ExtractSql(object? args)
{
    if (args is null)
    {
        return null;
    }
    if (args is string s && s.Length > 10)
    {
        return s;
    }
    if (args is System.Collections.IEnumerable seq)
    {
        foreach (var item in seq)
        {
            var text = item?.ToString() ?? "";
            var verbs = new[] { "SELECT", "INSERT", "UPDATE", "DELETE" };
            var at = verbs
                .Select(v => text.IndexOf(v, StringComparison.OrdinalIgnoreCase))
                .Where(x => x >= 0)
                .DefaultIfEmpty(-1)
                .Min();
            if (at >= 0)
            {
                return text[at..];
            }
        }
    }

    return null;
}

string Normalize(string sql)
{
    if (string.IsNullOrEmpty(sql))
    {
        return "(empty)";
    }
    var s = sql.TrimStart();
    var verb = new string(s.TakeWhile(char.IsLetter).ToArray()).ToUpperInvariant();
    var table = "";
    var token = verb switch
    {
        "SELECT" => "FROM ",
        "DELETE" => "FROM ",
        "INSERT" => "INTO ",
        "UPDATE" => "UPDATE ",
        _ => " ",
    };
    var idx = s.IndexOf(token, StringComparison.OrdinalIgnoreCase);
    if (idx >= 0)
    {
        var after = s[(idx + token.Length)..].TrimStart('"', ' ');
        table = new string(after.TakeWhile(c => char.IsLetterOrDigit(c) || c is '_' or '.').ToArray());
    }

    return $"{verb} {table}".Trim();
}

using (var src = new EventPipeEventSource(path))
{
    src.Dynamic.All += (TraceEvent d) =>
    {
        // Match both raw EF CommandExecuted (if the SQL transform was captured) and the generic
        // DiagnosticSource Activity2/Start carrying SourceName+EventName for DB command activities.
        var sourceName = d.PayloadByName("SourceName")?.ToString();
        var innerEvent = d.PayloadByName("EventName")?.ToString();
        if (sourceName is not null && d.EventName is "Activity2/Start" or "Activity1/Start" or "Activity/Start")
        {
            bySource[$"{sourceName} :: {innerEvent}"] = bySource.GetValueOrDefault($"{sourceName} :: {innerEvent}") + 1;

            // SQL text is only present if captured in Arguments; try to pull it for a shape breakdown.
            var args = d.PayloadByName("Arguments");
            var sql = ExtractSql(args);
            if (sql is not null)
            {
                total++;
                var shape = Normalize(sql);
                byShape[shape] = byShape.GetValueOrDefault(shape) + 1;
            }

            return;
        }
    };
    src.Process();
}

if (bySource.Count == 0)
{
    Console.Error.WriteLine("dbparse: no DB DiagnosticSource activities — wrong profile (need --profile database) or empty capture.");
    Environment.Exit(1);
}

Console.WriteLine("# DB command activities by DiagnosticSource source :: event");
Console.WriteLine($"{"count",10}  source :: event");
foreach (var kv in bySource.OrderByDescending(x => x.Value))
{
    Console.WriteLine($"{kv.Value,10:N0}  {kv.Key}");
}

if (byShape.Count > 0)
{
    Console.WriteLine($"\n# SQL shapes (from captured command text): {total:N0} commands");
    Console.WriteLine($"{"count",10}  shape");
    foreach (var kv in byShape.OrderByDescending(x => x.Value))
    {
        Console.WriteLine($"{kv.Value,10:N0}  {kv.Key}");
    }
}
else
{
    Console.WriteLine("\n# No SQL text captured in Arguments (transform spec didn't include CommandText) — volume above only.");
}
