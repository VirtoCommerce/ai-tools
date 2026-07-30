---
name: perf-benchmark
description: Run VirtoCommerce x-module BenchmarkDotNet suites (the XAPI targets configured in perf.benchmark.xapiTargets) and turn two runs into a machine-readable performance verdict. Use to check whether a change regressed allocations or time across two revisions of this module's own source, between this module's override and the upstream stock path, or across an upstream before/after. Advisory only — never a CI gate.
---

# perf-benchmark

A local development & code-analysis instrument for the VirtoCommerce experience-API benchmark suites
(the XAPI targets configured in `perf.benchmark.xapiTargets` — extensible to any module). It runs
the shared BenchmarkDotNet benchmarks and
turns two runs into a **two-axis verdict** an agent can branch on. **Advisory only — never a CI gate.**

Primary consumer: an **agent** driving an optimization loop ("change code → measure → did it regress?").
So the verdict is a structured JSON contract with an exit code, not a human report.

> **Scope every run.** Never benchmark the full suite in the optimization loop — it is **~13h measured**.
> Scope to what your change touches: `--filter` (one operation) or `--categories` (one area). See
> [Scope your run](#scope-your-run--do-not-run-the-full-suite-in-the-loop) below.

## The two-axis verdict (why allocations and time are gated differently)

Every comparison reports two independent axes, because they have different trustworthiness:

- **Allocations** — `Memory.BytesAllocatedPerOperation`. Warmup-independent (unlike time — no JIT-speed
  dependence) and machine-independent, so they read cheaply on any job. But the metric is
  **per-operation**, and `Job.Dry` runs a **single invocation**, folding first-call allocations (lazy
  init, mapper compilation, cache population) into the figure rather than amortizing them. So Dry is
  trustworthy for a **gross** alloc delta (a balloon — 2×+), but does **not** resolve a **small** one
  (≲5%) and can even flip its sign; the byte-exact per-op number needs a job with enough invocations
  (Short/Default) to amortize first-call noise. **Always gates the verdict** — the `--alloc-threshold`
  (5% default) fires on the gross delta and ignores small-delta noise, so the gate itself is robust.
- **Time** — `Statistics.Mean`. A single cold Dry/Short sample is dominated by JIT + first-touch, not
  the algorithm, and time is not comparable across machines. **Gates the verdict ONLY when the run is
  `measured`** (a full job) **and both runs are on the same host.** Otherwise its ratios are still
  reported, but flagged `unreliable` and excluded from the pass/fail decision.

This is deliberate: allocations catch GC-pressure regressions cheaply on every run; time catches
CPU-bound regressions (a slower loop that allocates the same) but only from a job that actually warmed
up. A change that doesn't move allocations but doubles time is a real regression — run a measured job to
see it.

## Job selection — default to Dry; ask the human before a measured run

The agent's **default job is `--job dry`** — it is the helpers' built-in default, so **omit `--job`** and
you get it. This is deliberate, and the reasoning is the whole point of the tool's economics:

- **Allocations read cheaply on Dry** (warmup-independent) → a Dry run yields the **gross** Alloc Ratio
  in **seconds**, and the alloc axis **always gates the verdict**. Most managed-code regressions move
  allocations (extra LINQ, `.ToList()`, boxing, string building, re-materialization), so Dry catches the
  majority **for free**. Caveat: BDN reports memory per-operation and Dry runs one invocation, so a
  **small** delta (≲5%) is noisy there (first-call allocations fold in) — escalate to Short/Default to
  resolve it; the gross balloon is robust on Dry.
- **`--job default` (measured) is the only TIME-trustworthy job**, but it costs **15–25 s/case** — tens
  of minutes for one scoped operation, **~13 h** for the full suite. Its *only* added value over Dry is
  the time axis.
- **`--job short` has one real niche: resolve a SMALL alloc delta cheaply.** Unlike Dry
  (`InvocationCount=1`), Short auto-tunes invocations per iteration (the pilot stage — the same mechanism
  Default uses), so it **amortizes first-call allocations** and reports a **byte-accurate** Alloc figure,
  matching Default at a fraction of the cost (3 iterations vs ~15 — the extra iterations buy TIME
  stability, not alloc accuracy). Reach for it when a small alloc delta (≲5%) is the question but a
  trustworthy time number is not. Its **time** stays non-verdict-grade (3 iterations, high variance) —
  never read Short's `Mean` as a verdict.

**Escalate to `--job default` ONLY when the cheap alloc axis cannot answer the question:**

1. The change is plausibly **CPU-only** — an algorithmic/loop change in a hot path that does **not** move
   allocations. Dry is blind there: a flat Alloc Ratio alongside a real time regression reads as "fine".
2. You need a **trustworthy `Mean`** for the decision itself ("is this 1.3× slower?").

For a **small alloc delta** (≲5%, not a time question), use **`--job short`** — it resolves the alloc
accurately (invocations amortized) without Default's time-stability cost; that is not a reason to spend a
full measured run.

**Before launching a measured run, ASK THE HUMAN.** `--job default` is tens of minutes (scoped) to hours
(full) — do not spend that autonomously. Report the Dry **alloc** verdict you already have first, then
state *why* a measured run is warranted (which of the two triggers above), the **scope** you'd run
(`--filter`/`--categories`), and the rough cost — and let the human approve or redirect. The default
posture is: **Dry every time; measured only on request.**

## The engine: compare-reports.cs (module-agnostic)

`compare-reports.cs` is a net10 file-based app (no `.csproj`, no packages). It reads two BenchmarkDotNet
full-JSON reports (`*-report-full-compressed.json`, emitted by `--exporters json`), matches cases, and
emits the verdict. It knows nothing about any module — it is written to move upstream next to the
benchmark suites it serves.

```bash
dotnet run compare-reports.cs -- <baseline.json> <current.json> \
  [--alloc-threshold <pct>]   # allocation regression threshold, default 5
  [--time-threshold <pct>]    # mean-time regression threshold, default 10
  [--job-kind measured|short|dry]   # declared run reliability; overrides sample-count inference
  [--match fullname|method]   # fullname (default): exact, same-runner. method: Method(Parameters),
                              #   runner-agnostic — needed cross-runner (own vs upstream)
```

Match key: `fullname` (default) compares same-runner runs (before/after). `method` keys on
`Method(Parameters)` only — dropping namespace + class — so a downstream override in its own namespace
matches the upstream stock benchmark. A non-unique key under `--match method` fails loud (exit 2) rather
than silently collapsing two cases.

- **stdout** — the verdict JSON (parse this).
- **stderr** — a one-line human summary, e.g. `[REGRESSED] 8 cases · alloc 4↑/0↓ · time n/a (unreliable job)`.
- **exit code** — `0` no regression · `1` regression detected · `2` usage/parse error **or no matched cases**
  (zero overlap is not "neutral" — nothing was compared, so it is loud, not a silent pass).

Verdict JSON shape (`schema: "perf-verdict/1"`):

```jsonc
{
  "schema": "perf-verdict/1",
  "result": "regressed | improved | neutral | no-match",
  "regressed": true,
  "thresholds": { "allocPct": 5, "timePct": 10 },
  "time": { "reliable": false, "reason": "...", "crossMachine": false, "minSamples": 1 },
  "hosts": { "baseline": { "processor": "...", "logicalCores": 16, ... }, "current": { ... } },
  "summary": { "matched": 8, "added": [], "removed": [], "allocRegressed": 4, "allocImproved": 0,
               "meanRegressed": 0, "meanImproved": 0 },
  "benchmarks": [
    { "fullName": "...CreateOrderFromCart(LineItemCount: 1, Shape: Flat)", "parameters": "...",
      "allocBaseline": 134835, "allocCurrent": 168544, "allocRatio": 1.25, "allocDeltaPct": 25,
      "allocStatus": "regressed",
      "meanBaselineNs": ..., "meanCurrentNs": ..., "meanRatio": 1.0, "meanDeltaPct": 0,
      "meanStatus": "unreliable" }   // "regressed"|"improved"|"neutral"|"unreliable"|"n/a"
  ]
}
```

Reading it as an agent: branch on `regressed` (or the exit code). When `time.reliable` is false, ignore
the `mean*` fields for decisions and rely on `allocStatus`. `benchmarks[]` is sorted worst-allocation-first.

## Comparison scenarios

Three scenarios, distinguished by *where the two sides come from*. They all reduce to "two JSON reports
→ compare-reports.cs".

> **Resolving `$pluginRoot`**: every command below uses `$pluginRoot` as a placeholder for this
> plugin's active install path — resolve it once per task via `claude plugin list --json` (see
> [`knowledge/plugin-root.md`](../../knowledge/plugin-root.md)) and reuse it. It is NOT a shell
> variable and `$CLAUDE_PLUGIN_ROOT` does **not** expand in the Bash tool shell.

### 1. Own before/after — IMPLEMENTED (harness) — requires benchmark runner projects in the target project

"Did **my** change regress this module's paths?" Two revisions of *this* module's own source, same
runner. Mechanism: a git worktree at the baseline revision (never `git checkout`/`stash` — the working
tree is in concurrent use) + the current tree, run each, compare.

```bash
BENCH_PREFIX=<your-benchmark-project-prefix> $pluginRoot/skills/perf-benchmark/run-own-before-after.sh <baseline-ref> <target> \
  [--filter <pattern>] [--categories <c1,c2,...>] [--job dry|short|default] [--alloc-threshold <pct>] [--time-threshold <pct>]

# examples — ALWAYS scope (see "Scope your run"); never the bare full suite in the loop
# BENCH_PREFIX is required (no default — see run-own-before-after.sh); use the project's own
# benchmark project prefix, e.g. Acme.MainModule for benchmarks/Acme.MainModule.Benchmark.Cart
BENCH_PREFIX=Acme.MainModule run-own-before-after.sh HEAD~1 cart --filter '*ChangeCartItemQuantity*'   # one operation (Dry default → alloc verdict, seconds)
BENCH_PREFIX=Acme.MainModule run-own-before-after.sh HEAD~1 cart --categories items,configuration       # one area (Dry default)
# add --job default ONLY for a trustworthy time number — and ask the human first (tens of minutes)
```

The helper copies the gitignored bench-feed `nuget.config` into the worktree, runs both sides with
`--exporters json`, calls `compare-reports.cs`, and passes `--job-kind` matching `--job` (so a `default` run
lets the time axis gate, `dry`/`short` keep it advisory). It exits with compare-reports.cs's code.

> Both runners take native BenchmarkDotNet `--job Dry`/`--job Short`/`--job Default` (Decision A dropped
> the cart-only `--smoke`/`--short` aliases from the shared `BenchmarkProgram`), so the helper passes
> `--job` uniformly — no per-runner dialect to hide.

### 2. Own vs upstream — IMPLEMENTED (harness) — requires benchmark runner projects in the target project

"How much overhead does my override add over the stock path?" The *same* benchmark on this module's
runner vs the upstream module's runner. The runner namespaces + class names differ by design, so this
uses `--match method`; the upstream side is the baseline, so a ratio > 1 is this module's overhead.

```bash
$pluginRoot/skills/perf-benchmark/run-vs-upstream.sh <target> \
  [--filter <pattern>] [--categories <c1,c2,...>] [--job dry|short|default] [--upstream-root <dir>] [--alloc-threshold <pct>] [--time-threshold <pct>]

run-vs-upstream.sh cart --filter '*ChangeCartItemQuantity*'   # Dry default; add --job default for trustworthy time (ask the human)
```

The helper runs the upstream runner (builds upstream from source, self-contained in its repo) and this
module's runner, then `compare-reports.cs --match method <upstream.json> <own.json>`. `--upstream-root`
defaults to the repo's parent dir (sibling checkouts); deeper monorepo nestings set
`perf.benchmark.upstreamRoot` (env `UPSTREAM_ROOT`).

`<target>` is any entry from `perf.benchmark.xapiTargets` (e.g. `cart`, `order`). Each helper resolves
the own runner dir from `RUNNER_DIR_<TARGET>` (see `/perf-init`); the upstream side defaults to the VC
convention `vc-module-x-<target>/benchmarks/VirtoCommerce.X<Target>.Benchmark` and can be overridden per
target via `UPSTREAM_REPO_<TARGET>` / `UPSTREAM_RUNNER_DIR_<TARGET>` for a non-standard layout. (Today
the upstream benchmark engines ship for Cart and Order; any module that gains one works by the same
convention with no plugin change.)

> **Validity**: compare FULL operations (`ChangeCartItemQuantity`, `CreateOrderFromCart`, …), not an
> isolated overridden method. Where this module *reimplements* a method wholesale (e.g. `RecalculateAsync`),
> the two sides are different operations, not an overhead delta — the ratio there is meaningless.

### 3. Dependency before/after — IMPLEMENTED (harness) — requires benchmark runner projects in the target project

"Did an **upstream** change regress?" A property of the upstream module, measured on its own runner at
two upstream revisions (this module is not involved). Same runner both sides → `--match fullname`.

```bash
$pluginRoot/skills/perf-benchmark/run-upstream-before-after.sh <target> <upstream-baseline-ref> \
  [--filter <pattern>] [--categories <c1,c2,...>] [--job dry|short|default] [--upstream-root <dir>] [--alloc-threshold <pct>] [--time-threshold <pct>]

run-upstream-before-after.sh cart dev --filter '*CreateOrderFromCart*'   # Dry default; add --job default for trustworthy time (ask the human)
```

The helper worktrees the upstream repo at the baseline ref, runs the upstream runner there and in the
upstream working tree (two clean single-job JSONs), and compares them. `<upstream-baseline-ref>` is a ref
in the **upstream** repo.

> **Quick native alternative** (no structured verdict): the upstream runner's own `--baseline-src <path>`
> flag does before/after in ONE BenchmarkDotNet run, emitting `Ratio` / `Alloc Ratio` columns — lighter
> when you just want to eyeball the table. It **defaults to `--job Dry`** (gross Alloc Ratio in seconds
> — a small alloc delta ≲5% is noisy on Dry; the time Ratio is directional only — the runner says so),
> with `--job Short|Default` as the
> explicit override (the chosen job applies to both before and after). The helper above exists because
> that single run's JSON can't feed `compare-reports.cs` (its before/after share a FullName and the JSON
> drops the Job label).

## Prerequisites

- .NET 10 SDK (file-based apps + the runners' target framework).
- The bench-feed `nuget.config` present in each runner dir (gitignored, local). The helper carries it
  into worktrees automatically.
- Run from anywhere under the module repo — the helper resolves the repo root itself.

## Scope your run — do NOT run the full suite in the loop

The optimization loop is "change ONE operation → measure THAT operation → regressed?". Measuring all
~54 classes when you touched one handler is wasted work: **the full measured suite is ~13h** (≈54
classes, each an up-to-8-case `[Params]` product on a full job). Scope every run to what the change
touches — two axes of scoping, both forwarded to the runner by all three helpers:

- **Per operation** (the default mode) — `--filter '*ChangeCartItemQuantity*'`. The before/after verdict
  then compares exactly the cases you changed; the other classes only dilute the signal and burn hours.
- **Per area** — `--categories items,configuration`. Use when a change spans an area (a recalc
  middleware hits all of `items`; a shared validator hits a category). Forwarded to BDN
  `--anyCategories` (category-tag match), which is robust where a name glob is not: `AddConfigurationItem`
  has no "Items" in its name and `ChangeAllCartItemsSelected` does, so `--filter '*Items*'` selects the
  wrong set — the category tag does not. `--categories` composes with `--filter` (intersection).
- **Full suite** (`--filter '*'`, no scope) — only a rare dedicated sweep (e.g. a release gate), run
  detached/unattended (`setsid nohup … ; touch DONE`), **never** in the interactive loop.

Categories (from `Categories.cs`): `items`, `configuration`, `checkout`, `cart-state`, `coupon`,
`queries`, `recalculate`, `validation`, `wishlist`, `gifts`, `saved-for-later`, `dynamic-properties`.

Job cost is orthogonal to scope (see `dotnet-diag:microbenchmarking` for the full table): `--job dry`
(<1s/case) is the **default** — the alloc verdict for every routine check; `--job default` (15–25s/case)
only when the alloc axis can't answer and you need trustworthy time — and **ask the human first** (see
**Job selection — default to Dry** above). Scope (`--filter`/`--categories`) **and** job together set the
wall-clock — e.g. `--categories items` (Dry) is seconds, the full suite measured is ~13h.
