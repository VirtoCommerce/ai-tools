// compare-reports.cs — generic BenchmarkDotNet before/after verdict engine.
//
// Usage:  dotnet run compare-reports.cs -- <baseline.json> <current.json> [options]
//   --alloc-threshold <pct>   Allocation regression threshold, % increase (default 5).
//   --time-threshold  <pct>   Mean-time regression threshold, % increase (default 10).
//   --job-kind <measured|short|dry>
//                             Declared reliability of the runs. Overrides sample-count inference.
//                             Only `measured` lets the time axis gate the verdict.
//
// net10 file-based app — no .csproj, no external packages (System.Text.Json is in the BCL).
//
// What it is: a MODULE-AGNOSTIC comparison primitive. It reads two BenchmarkDotNet full-JSON reports
// (`*-report-full-compressed.json`, emitted by `--exporters json`) — each side is either a single such
// file or a DIRECTORY of them (BenchmarkDotNet writes one per benchmark class, so a multi-class run
// produces several; passing the results directory merges them). It matches benchmark cases by their
// FullName, and produces a TWO-AXIS verdict:
//   * Allocations — ALWAYS trustworthy: managed allocation is deterministic per code path, identical
//     across Dry / Short / full runs and across machines. This axis always gates the verdict.
//   * Time (Mean) — GATED: a single cold Dry/Short sample is dominated by JIT + first-touch, not the
//     algorithm, and time is not comparable across machines. The time axis gates the verdict ONLY when
//     the run is `measured` (declared, or inferred from Statistics.N) AND both reports ran on the same
//     host. Otherwise its ratios are reported but flagged unreliable and excluded from the verdict.
//
// It knows nothing about any consuming module (XCart, XOrder, a client project, ...). It is written to sit next to
// any module's benchmark suite. The module-/mode-specific orchestration (which runner, which two
// revisions, which job) lives in the caller (the skill), never here.
//
// Output contract:
//   stdout = the verdict JSON (for programmatic / agent consumption).
//   stderr = a one-line human summary.
//   exit 0 = no regression · 1 = regression detected · 2 = usage / parse error.

using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Text.Json.Serialization;

const double DefaultAllocPct = 5.0;
const double DefaultTimePct = 10.0;
const int ReliableMinSamples = 10;   // Statistics.N at/above this ⇒ inferred "measured" (Default job ≈ 15+).

const string Usage =
    "Usage: dotnet run compare-reports.cs -- <baseline> <current> "
    + "[--alloc-threshold <pct>] [--time-threshold <pct>] [--job-kind measured|short|dry] "
    + "[--match fullname|method]\n"
    + "  <baseline>/<current>: a *-report-full-compressed.json file, OR a directory of them "
    + "(one per benchmark class — multi-class runs produce several; the directory merges them).";

// ---------------- parse args ----------------
var positional = new List<string>();
var allocPct = DefaultAllocPct;
var timePct = DefaultTimePct;
string? jobKind = null;
var matchMode = "fullname";   // fullname: exact (same-runner); method: Method(Parameters), runner-agnostic

for (var i = 0; i < args.Length; i++)
{
    switch (args[i])
    {
        case "--alloc-threshold":
            allocPct = ParseDouble(NextArg(ref i), "--alloc-threshold");
            break;
        case "--time-threshold":
            timePct = ParseDouble(NextArg(ref i), "--time-threshold");
            break;
        case "--job-kind":
            jobKind = NextArg(ref i).ToLowerInvariant();
            break;
        case "--match":
            matchMode = NextArg(ref i).ToLowerInvariant();
            break;
        case "-h":
        case "--help":
            Console.Error.WriteLine(Usage);
            return 2;
        default:
            positional.Add(args[i]);
            break;
    }
}

if (positional.Count != 2)
{
    Console.Error.WriteLine(Usage);
    return 2;
}

if (jobKind is not (null or "measured" or "short" or "dry"))
{
    Console.Error.WriteLine($"--job-kind must be measured|short|dry, got '{jobKind}'.");
    return 2;
}

if (matchMode is not ("fullname" or "method"))
{
    Console.Error.WriteLine($"--match must be fullname|method, got '{matchMode}'.");
    return 2;
}

// ---------------- load reports ----------------
var baseline = Load(positional[0]);
var current = Load(positional[1]);

// ---------------- index both sides by match key ----------------
// Match key is FullName (default — same runner, before/after) or Method(Parameters) (--match method:
// cross-runner own-vs-upstream, where namespace + class names differ by design and only the operation +
// workload params coincide). A non-unique key collapses two cases — fail loud rather than mis-match.
var baselineByKey = IndexByKey(baseline, "baseline");
var currentByKey = IndexByKey(current, "current");

// ---------------- machine comparison (time is not comparable across hosts) ----------------
var crossMachine = !SameHost(baseline.HostEnvironmentInfo, current.HostEnvironmentInfo);

// ---------------- time-axis reliability ----------------
// Min Statistics.N across every matched case in BOTH reports: the time axis is only as trustworthy as
// the thinnest sample on either side.
var matchedKeys = currentByKey.Keys.Where(baselineByKey.ContainsKey).ToList();

var minSamples = int.MaxValue;
foreach (var key in matchedKeys)
{
    minSamples = Math.Min(minSamples, currentByKey[key].Statistics?.N ?? 0);
    minSamples = Math.Min(minSamples, baselineByKey[key].Statistics?.N ?? 0);
}
if (minSamples == int.MaxValue)
{
    minSamples = 0;
}

var declaredMeasured = jobKind == "measured";
var declaredUnreliable = jobKind is "short" or "dry";
var inferredMeasured = minSamples >= ReliableMinSamples;
var timeReliable = !crossMachine && (declaredMeasured || (!declaredUnreliable && inferredMeasured));

var timeReason = crossMachine
    ? "different host — time not comparable across machines"
    : declaredMeasured ? "declared measured"
    : declaredUnreliable ? $"declared {jobKind} — time excluded from verdict"
    : inferredMeasured ? $"inferred measured (min Statistics.N={minSamples})"
    : $"too few samples (min Statistics.N={minSamples} < {ReliableMinSamples}) — time excluded from verdict";

// ---------------- per-benchmark verdict ----------------
var rows = new List<BenchVerdict>();
var added = new List<string>();

foreach (var (key, cur) in currentByKey)
{
    if (!baselineByKey.TryGetValue(key, out var bse))
    {
        added.Add(cur.FullName ?? key);
        continue;
    }

    var (allocRatio, allocDelta, allocStatus) = Axis(bse.Memory?.BytesAllocatedPerOperation, cur.Memory?.BytesAllocatedPerOperation, allocPct);
    var (meanRatio, meanDelta, meanStatusRaw) = Axis(bse.Statistics?.Mean, cur.Statistics?.Mean, timePct);
    var meanStatus = timeReliable ? meanStatusRaw : "unreliable";

    rows.Add(new BenchVerdict(
        cur.FullName ?? key,
        cur.Parameters,
        bse.Memory?.BytesAllocatedPerOperation,
        cur.Memory?.BytesAllocatedPerOperation,
        allocRatio, allocDelta, allocStatus,
        bse.Statistics?.Mean,
        cur.Statistics?.Mean,
        meanRatio, meanDelta, meanStatus));
}

var removed = baselineByKey
    .Where(x => !currentByKey.ContainsKey(x.Key))
    .Select(x => x.Value.FullName ?? x.Key)
    .OrderBy(x => x)
    .ToList();

// ---------------- roll up ----------------
var allocRegressed = rows.Count(x => x.AllocStatus == "regressed");
var allocImproved = rows.Count(x => x.AllocStatus == "improved");
var meanRegressed = rows.Count(x => x.MeanStatus == "regressed");
var meanImproved = rows.Count(x => x.MeanStatus == "improved");

var regressed = allocRegressed > 0 || (timeReliable && meanRegressed > 0);
var improved = allocImproved > 0 || (timeReliable && meanImproved > 0);

// Zero matched cases is NOT "neutral" — nothing was compared. An agent loop reading "neutral"/exit 0
// would conclude "no regression, ship it" when the two reports share no benchmark. Make it loud.
var noMatch = rows.Count == 0;

string verdict;
if (noMatch)
{
    verdict = "no-match";
}
else if (regressed)
{
    verdict = "regressed";
}
else if (improved)
{
    verdict = "improved";
}
else
{
    verdict = "neutral";
}

var result = new Verdict(
    "perf-verdict/1",
    verdict,
    regressed,
    new Thresholds(allocPct, timePct),
    new TimeAxis(timeReliable, timeReason, crossMachine, minSamples),
    new Hosts(HostOf(baseline.HostEnvironmentInfo), HostOf(current.HostEnvironmentInfo)),
    new Summary(rows.Count, added.OrderBy(x => x).ToList(), removed, allocRegressed, allocImproved, meanRegressed, meanImproved),
    rows.OrderByDescending(x => x.AllocDeltaPct ?? double.MinValue).ToList());

Console.WriteLine(JsonSerializer.Serialize(result, OutputCtx.Default.Verdict));

// one-line human summary on stderr
var timeNote = timeReliable
    ? $"time {meanRegressed}↑/{meanImproved}↓"
    : $"time n/a ({(crossMachine ? "cross-machine" : "unreliable job")})";
Console.Error.WriteLine(
    $"[{verdict.ToUpperInvariant()}] {rows.Count} cases · alloc {allocRegressed}↑/{allocImproved}↓ · {timeNote}"
    + (added.Count > 0 ? $" · +{added.Count} added" : "")
    + (removed.Count > 0 ? $" · -{removed.Count} removed" : ""));

if (noMatch)
{
    return 2;
}

return regressed ? 1 : 0;

// ================= helpers =================

// Build a key → benchmark map for one report, per the active --match mode. Fails loud (exit 2) on a
// duplicate key: under --match method two cases sharing Method(Parameters) would silently collapse.
Dictionary<string, Bench> IndexByKey(Report report, string label)
{
    var dict = new Dictionary<string, Bench>();
    foreach (var b in report.Benchmarks)
    {
        var key = Key(b);
        if (key is null)
        {
            continue;
        }

        if (!dict.TryAdd(key, b))
        {
            Console.Error.WriteLine(
                $"Ambiguous match key '{key}' in {label} report under --match {matchMode}: two cases share it. "
                + "Use --match fullname, or narrow with --filter.");
            Environment.Exit(2);
        }
    }

    return dict;
}

// fullname: exact FullName (same runner). method: Method(Parameters) — drops namespace + class so a
// downstream override (e.g. a client project's benchmark subclass in its own namespace) matches the upstream stock benchmark.
string? Key(Bench b) => matchMode == "method"
    ? (string.IsNullOrEmpty(b.Method) ? null : $"{b.Method}({b.Parameters})")
    : (string.IsNullOrEmpty(b.FullName) ? null : b.FullName);

// Returns (ratio, deltaPercent, status). status ∈ regressed | improved | neutral | n/a.
// n/a when a baseline value is missing or zero (no meaningful ratio).
(double?, double?, string) Axis(double? baseVal, double? curVal, double thresholdPct)
{
    if (baseVal is not > 0 || curVal is null)
    {
        return (null, null, "n/a");
    }

    var ratio = curVal.Value / baseVal.Value;
    var deltaPct = (ratio - 1.0) * 100.0;
    var status = deltaPct > thresholdPct ? "regressed"
        : deltaPct < -thresholdPct ? "improved"
        : "neutral";

    return (Round(ratio, 4), Round(deltaPct, 2), status);
}

// A "side" is either a single full-JSON report file OR a directory of them. BenchmarkDotNet emits one
// `*-report-full-compressed.json` per benchmark CLASS, so a multi-class run (--categories, or a broad
// --filter that spans classes) produces several files — passing the results directory merges them all.
// Merge = union of Benchmarks; host/title come from the first file (one run shares a single host).
Report Load(string path)
{
    if (Directory.Exists(path))
    {
        var files = Directory.GetFiles(path, "*-report-full-compressed.json")
            .OrderBy(x => x, StringComparer.Ordinal)
            .ToList();
        if (files.Count == 0)
        {
            Console.Error.WriteLine($"No *-report-full-compressed.json found in directory: {path}");
            Environment.Exit(2);
        }

        var merged = LoadOne(files[0]);
        foreach (var f in files.Skip(1))
        {
            merged.Benchmarks.AddRange(LoadOne(f).Benchmarks);
        }

        return merged;
    }

    if (File.Exists(path))
    {
        return LoadOne(path);
    }

    Console.Error.WriteLine($"File or directory not found: {path}");
    Environment.Exit(2);
    return null!; // unreachable
}

Report LoadOne(string path)
{
    try
    {
        var report = JsonSerializer.Deserialize(File.ReadAllText(path), InputCtx.Default.Report);
        if (report?.Benchmarks is null)
        {
            Console.Error.WriteLine($"Not a BenchmarkDotNet report (no Benchmarks array): {path}");
            Environment.Exit(2);
        }

        return report!;
    }
    catch (JsonException ex)
    {
        Console.Error.WriteLine($"Failed to parse {path}: {ex.Message}");
        Environment.Exit(2);
        throw; // unreachable
    }
}

static bool SameHost(HostInfo? a, HostInfo? b)
{
    if (a is null || b is null)
    {
        return true; // can't tell — don't penalize
    }

    return a.ProcessorName == b.ProcessorName
        && a.LogicalCoreCount == b.LogicalCoreCount
        && a.OsVersion == b.OsVersion;
}

static HostSummary? HostOf(HostInfo? h) =>
    h is null ? null : new HostSummary(h.ProcessorName, h.LogicalCoreCount, h.OsVersion, h.RuntimeVersion, h.BenchmarkDotNetVersion);

static double Round(double v, int digits) => Math.Round(v, digits, MidpointRounding.AwayFromZero);

string NextArg(ref int idx)
{
    if (idx + 1 >= args.Length)
    {
        Console.Error.WriteLine($"Missing value for {args[idx]}.");
        Environment.Exit(2);
    }

    return args[++idx];
}

static double ParseDouble(string s, string flag)
{
    if (!double.TryParse(s, NumberStyles.Float, CultureInfo.InvariantCulture, out var v))
    {
        Console.Error.WriteLine($"{flag} expects a number, got '{s}'.");
        Environment.Exit(2);
    }

    return v;
}

// ================= input model (subset of BenchmarkDotNet full JSON) =================

sealed class Report
{
    public string? Title { get; set; }
    public HostInfo? HostEnvironmentInfo { get; set; }
    public List<Bench> Benchmarks { get; set; } = [];
}

sealed class HostInfo
{
    public string? ProcessorName { get; set; }
    public int? LogicalCoreCount { get; set; }
    public string? OsVersion { get; set; }
    public string? RuntimeVersion { get; set; }
    public string? BenchmarkDotNetVersion { get; set; }
}

sealed class Bench
{
    public string? FullName { get; set; }
    public string? Method { get; set; }
    public string? Parameters { get; set; }
    public Stats? Statistics { get; set; }
    public Mem? Memory { get; set; }
}

sealed class Stats
{
    public int N { get; set; }
    public double Mean { get; set; }
}

sealed class Mem
{
    public long BytesAllocatedPerOperation { get; set; }
}

// ================= output model (the verdict contract) =================

sealed record Verdict(
    string Schema,
    string Result,
    bool Regressed,
    Thresholds Thresholds,
    TimeAxis Time,
    Hosts Hosts,
    Summary Summary,
    List<BenchVerdict> Benchmarks);

sealed record Thresholds(double AllocPct, double TimePct);

sealed record TimeAxis(bool Reliable, string Reason, bool CrossMachine, int MinSamples);

sealed record Hosts(HostSummary? Baseline, HostSummary? Current);

sealed record HostSummary(string? Processor, int? LogicalCores, string? Os, string? Runtime, string? BdnVersion);

sealed record Summary(
    int Matched,
    List<string> Added,
    List<string> Removed,
    int AllocRegressed,
    int AllocImproved,
    int MeanRegressed,
    int MeanImproved);

sealed record BenchVerdict(
    string FullName,
    string? Parameters,
    long? AllocBaseline,
    long? AllocCurrent,
    double? AllocRatio,
    double? AllocDeltaPct,
    string AllocStatus,
    double? MeanBaselineNs,
    double? MeanCurrentNs,
    double? MeanRatio,
    double? MeanDeltaPct,
    string MeanStatus);

// ================= JSON source-gen contexts (trim/AOT-safe; file-based apps run the analyzers) =================

// Input: the BenchmarkDotNet report is PascalCase; case-insensitive for resilience.
[JsonSourceGenerationOptions(PropertyNameCaseInsensitive = true)]
[JsonSerializable(typeof(Report))]
internal partial class InputCtx : JsonSerializerContext;

// Output: camelCase verdict contract, nulls omitted, indented for human + agent readability.
[JsonSourceGenerationOptions(
    PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase,
    DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    WriteIndented = true)]
[JsonSerializable(typeof(Verdict))]
internal partial class OutputCtx : JsonSerializerContext;
