#!/usr/bin/env bash
# run-vs-upstream.sh — "own vs upstream": run the SAME benchmark on THIS module's runner and on the
# UPSTREAM module's runner, and emit the overhead verdict via compare-reports.cs. Answers "how much does
# my override cost over the stock upstream path?"
#
# Uses --match method: the two runners' namespaces and class names differ by design (this module's
# runner subclasses into its own namespace, often with a prefix), so only the operation + workload
# params coincide — matching on FullName would find nothing. compare-reports.cs reports the upstream side
# as baseline and this module's side as current, so an alloc/time ratio > 1 is THIS module's overhead.
#
# Validity: compare FULL operations, not isolated overridden methods. An overridden method reimplemented
# differently is two different operations, not an overhead delta. Filter to full mutations / commands.
#
# Usage:
#   run-vs-upstream.sh <target> [--filter <pattern>] [--job dry|short|default]
#                      [--alloc-threshold <pct>] [--time-threshold <pct>] [--upstream-root <dir>]
#
#   --upstream-root   workspace dir holding the upstream vc-module-x-* checkouts
#                     (default: the repo's parent dir — sibling checkouts).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

usage() {
    cat >&2 <<'USAGE'
Usage:
  run-vs-upstream.sh <target> [--filter <pattern>] [--categories <c1,c2,...>] [--job dry|short|default]
                     [--alloc-threshold <pct>] [--time-threshold <pct>] [--upstream-root <dir>]

  target          which target to compare (this module's runner vs the upstream module's runner) —
                  an entry from perf.benchmark.xapiTargets (e.g. cart, order). Own runner dir comes
                  from RUNNER_DIR_<TARGET>; upstream defaults to vc-module-x-<target>, override via
                  UPSTREAM_REPO_<TARGET> / UPSTREAM_RUNNER_DIR_<TARGET>.
  --filter        BenchmarkDotNet filter (default '*'). Prefer full operations over isolated methods.
  --categories    Comma-separated BenchmarkCategory names (e.g. items,configuration) → BDN
                  --anyCategories. Scope to an AREA. Composes with --filter (intersection).
  --job           dry (smoke, default) | short | default. Only `default` lets the TIME axis gate.
  --upstream-root workspace holding the upstream vc-module-x-* checkouts (default: the repo's parent — sibling checkouts).

  SCOPE: prefer --filter (one operation) or --categories (one area). Do NOT run the full suite ('*')
  in the optimization loop — it is ~13h measured. Measure only what your change touches.
USAGE
}

if [[ $# -lt 1 ]]; then
    usage
    exit 2
fi

DOMAIN="$1"
shift

FILTER='*'
CATEGORIES=()
JOB='dry'
# honors the UPSTREAM_ROOT env (fed from perf.benchmark.upstreamRoot via /perf-init); --upstream-root wins
UPSTREAM_ROOT="${UPSTREAM_ROOT:-}"
COMPARE_EXTRA=()

while [[ $# -gt 0 ]]; do
    case "$1" in
        --filter) FILTER="$2"; shift 2 ;;
        --categories) IFS=',' read -ra CATEGORIES <<< "$2"; shift 2 ;;
        --job) JOB="$2"; shift 2 ;;
        --upstream-root) UPSTREAM_ROOT="$2"; shift 2 ;;
        --alloc-threshold|--time-threshold) COMPARE_EXTRA+=("$1" "$2"); shift 2 ;;
        -h|--help) usage; exit 2 ;;
        *) echo "Unknown argument: $1" >&2; usage; exit 2 ;;
    esac
done

# Per-category scoping: --anyCategories selects benchmarks tagged with ANY listed category; composes
# with --filter (AND). The default --filter '*' leaves category as the only narrowing.
CAT_FLAGS=()
[[ ${#CATEGORIES[@]} -gt 0 ]] && CAT_FLAGS=(--anyCategories "${CATEGORIES[@]}")

REPO="$(git rev-parse --show-toplevel)"
# default: sibling checkouts (workspace = the repo's parent dir); deeper monorepo nestings set
# perf.benchmark.upstreamRoot (env UPSTREAM_ROOT) or pass --upstream-root
[[ -z "$UPSTREAM_ROOT" ]] && UPSTREAM_ROOT="$(cd "$REPO/.." && pwd)"

# runner dirs come from perf.benchmark.runnerDirs. No default — a wrong guess would silently
# point at the wrong project's runner dir; set via env or /perf-init from the profile. The target
# set is open (any entry from perf.benchmark.xapiTargets); the upstream side defaults to the VC
# benchmark-engine convention (vc-module-x-<target>), override via UPSTREAM_REPO_<TARGET> /
# UPSTREAM_RUNNER_DIR_<TARGET> for a non-standard layout.
TARGET_KEY="$(tr '[:lower:]-' '[:upper:]_' <<< "$DOMAIN")"
runner_dir_var="RUNNER_DIR_${TARGET_KEY}"
BENCH_PREFIX="${BENCH_PREFIX:?set BENCH_PREFIX (your benchmark project prefix, e.g. Acme.MainModule) — see /perf-init}"
OWN_DIR="$REPO/${!runner_dir_var:-benchmarks/${BENCH_PREFIX}.Benchmark.$(printf '%s' "${DOMAIN:0:1}" | tr '[:lower:]' '[:upper:]')${DOMAIN:1}}"
up_repo_var="UPSTREAM_REPO_${TARGET_KEY}"
up_runner_var="UPSTREAM_RUNNER_DIR_${TARGET_KEY}"
UP_DIR="$UPSTREAM_ROOT/${!up_repo_var:-vc-module-x-${DOMAIN}}/${!up_runner_var:-benchmarks/VirtoCommerce.X$(printf '%s' "${DOMAIN:0:1}" | tr '[:lower:]' '[:upper:]')${DOMAIN:1}.Benchmark}"

if [[ ! -d "$OWN_DIR" ]]; then
    echo "Own runner not found: $OWN_DIR (set ${runner_dir_var} for a non-standard layout — see /perf-init)." >&2
    exit 2
fi

if [[ ! -d "$UP_DIR" ]]; then
    echo "Upstream runner not found: $UP_DIR (set --upstream-root, or ${up_repo_var} / ${up_runner_var} for a non-standard layout)." >&2
    exit 2
fi

# Job → run flags + compare-reports.cs --job-kind. Both domains' runners take native BenchmarkDotNet
# --job (Decision A dropped the cart-only --smoke/--short aliases), so there is no dialect split.
case "$JOB" in
    dry)    JOB_FLAGS=(--job Dry);   JOB_KIND=dry ;;
    short)  JOB_FLAGS=(--job Short); JOB_KIND=short ;;
    default|measured) JOB_FLAGS=(); JOB_KIND=measured ;;
    *) echo "--job must be dry|short|default, got '$JOB'." >&2; exit 2 ;;
esac

# Each side is the run's results DIRECTORY, not a single file: BenchmarkDotNet writes one
# *-report-full-compressed.json per benchmark class, so a multi-class scope (--categories, or a broad
# --filter) emits several. compare-reports.cs reads the whole directory and merges them. The upstream and
# own runners are distinct dirs, so their results never collide.
UP_RESULTS="$UP_DIR/BenchmarkDotNet.Artifacts/results"
OWN_RESULTS="$OWN_DIR/BenchmarkDotNet.Artifacts/results"

run_one() { # $1 = runner dir, $2 = label
    local dir="$1" label="$2"
    echo "[vs-upstream] running $label ($dir)..." >&2
    (
        cd "$dir"
        rm -rf BenchmarkDotNet.Artifacts
        dotnet run -c Release -- "${JOB_FLAGS[@]}" --filter "$FILTER" "${CAT_FLAGS[@]}" --exporters json
    ) >&2
}

echo "[vs-upstream] domain=$DOMAIN job=$JOB filter='$FILTER' categories='${CATEGORIES[*]}'" >&2
run_one "$UP_DIR" "upstream (baseline)"
run_one "$OWN_DIR" "own (current)"

# compare-reports.cs exit 1 = regression (this module's overhead exceeds threshold) — a valid verdict.
set +e
dotnet run "$SCRIPT_DIR/compare-reports.cs" -- "$UP_RESULTS" "$OWN_RESULTS" --match method --job-kind "$JOB_KIND" "${COMPARE_EXTRA[@]}"
rc=$?
set -e
exit "$rc"
