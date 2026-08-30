#!/usr/bin/env bash
# run-own-before-after.sh — "own before/after": compare two revisions of THIS module's own source on the
# same benchmark runner, and emit the two-axis verdict via compare-reports.cs. Answers "did my change regress
# this module's cart/order paths?" (as opposed to comparing my override against the upstream module).
#
# WHY A WORKTREE: comparing two revisions means building the runner from each. We must NEVER
# `git checkout` / `git stash` the working tree — the operator works concurrently in this repo. A
# detached worktree at the baseline ref is the only safe mechanism. The per-runner `nuget.config`
# (local bench-feed mapping) is gitignored, so a fresh worktree checkout lacks it — we copy all three
# in (Core's is needed transitively by both runners).
#
# OUTPUT: compare-reports.cs writes the verdict JSON to stdout and a one-line summary to stderr. This script
# propagates compare-reports.cs's exit code: 0 = no regression, 1 = regression, 2 = usage/parse error. Exit 1
# is a VALID verdict, not a script failure — handled explicitly below.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

usage() {
    cat >&2 <<'USAGE'
Usage:
  run-own-before-after.sh <baseline-git-ref> <target> [--filter <pattern>] [--categories <c1,c2,...>]
                      [--job dry|short|default] [--alloc-threshold <pct>] [--time-threshold <pct>]

  baseline-git-ref  the "before" revision (dev, a commit SHA, a tag). The current working tree is "after".
  target            which benchmark runner to drive — an entry from perf.benchmark.xapiTargets
                    (e.g. cart, order). Runner dir = RUNNER_DIR_<TARGET> env if set, else
                    benchmarks/<BENCH_PREFIX>.Benchmark.<Target>.
  --filter          BenchmarkDotNet filter (default '*' — all cases). Scope to ONE operation, e.g.
                    '*ChangeCartItemQuantity*'.
  --categories      Comma-separated BenchmarkCategory names (e.g. items,configuration) → BDN
                    --anyCategories. Scope to an AREA. Composes with --filter (intersection).
  --job             dry (smoke, default) | short | default. Only `default` (a measured run) lets the
                    TIME axis gate the verdict; dry/short keep time advisory (alloc always gates).

  SCOPE: prefer --filter (one operation) or --categories (one area). Do NOT run the full suite ('*')
  in the optimization loop — it is ~13h measured. Measure only what your change touches.
USAGE
}

if [[ $# -lt 2 ]]; then
    usage
    exit 2
fi

BASELINE_REF="$1"
RUNNER="$2"
shift 2

FILTER='*'
CATEGORIES=()
JOB='dry'
COMPARE_EXTRA=()

while [[ $# -gt 0 ]]; do
    case "$1" in
        --filter) FILTER="$2"; shift 2 ;;
        --categories) IFS=',' read -ra CATEGORIES <<< "$2"; shift 2 ;;
        --job) JOB="$2"; shift 2 ;;
        --alloc-threshold|--time-threshold) COMPARE_EXTRA+=("$1" "$2"); shift 2 ;;
        -h|--help) usage; exit 2 ;;
        *) echo "Unknown argument: $1" >&2; usage; exit 2 ;;
    esac
done

# Per-category scoping: BDN --anyCategories <c1> <c2> selects benchmarks tagged with ANY of them.
# Composes with --filter (AND), so the default --filter '*' leaves category as the only narrowing.
CAT_FLAGS=()
[[ ${#CATEGORIES[@]} -gt 0 ]] && CAT_FLAGS=(--anyCategories "${CATEGORIES[@]}")

# runner dirs come from perf.benchmark.runnerDirs; BENCH_PREFIX is the per-project benchmark
# project prefix. No default — a wrong guess would silently point at the wrong project's
# runner dirs; set it via env or /perf-init from the profile. The target set is open (any entry
# from perf.benchmark.xapiTargets): RUNNER_DIR_<TARGET> env wins, else the conventional layout.
BENCH_PREFIX="${BENCH_PREFIX:?set BENCH_PREFIX (your benchmark project prefix, e.g. Acme.MainModule) — see /perf-init}"
TARGET_KEY="$(tr '[:lower:]-' '[:upper:]_' <<< "$RUNNER")"
runner_dir_var="RUNNER_DIR_${TARGET_KEY}"
RUNNER_DIR="${!runner_dir_var:-benchmarks/${BENCH_PREFIX}.Benchmark.$(printf '%s' "${RUNNER:0:1}" | tr '[:lower:]' '[:upper:]')${RUNNER:1}}"

# Job → (run flags, compare-reports.cs --job-kind). Both runners take native BenchmarkDotNet --job
# (Decision A dropped the cart-only --smoke/--short aliases from the shared BenchmarkProgram), so there
# is no per-domain dialect split to hide anymore.
# Every array VALUE expansion in this file is guarded as `${arr[@]+"${arr[@]}"}` (and `[*]` likewise),
# never bare: each of these arrays is empty on some invocation, and under `set -u` bash < 4.4 —
# stock macOS /bin/bash is 3.2 — aborts on an empty one. The two forms are indistinguishable on
# bash 5, so undoing a guard is invisible to anyone likely to review it. (`${#arr[@]}` is a length,
# safe bare; the `"${CATEGORIES[@]}"` beside it runs only when the array is non-empty.)
case "$JOB" in
    dry)    JOB_FLAGS=(--job Dry);   JOB_KIND=dry ;;
    short)  JOB_FLAGS=(--job Short); JOB_KIND=short ;;
    default|measured) JOB_FLAGS=(); JOB_KIND=measured ;;
    *) echo "--job must be dry|short|default, got '$JOB'." >&2; exit 2 ;;
esac

REPO="$(git rev-parse --show-toplevel)"

if ! git -C "$REPO" cat-file -e "${BASELINE_REF}^{commit}" 2>/dev/null; then
    echo "Baseline ref '$BASELINE_REF' is not a valid commit in $REPO." >&2
    exit 2
fi

if [[ ! -d "$REPO/$RUNNER_DIR" ]]; then
    echo "Runner dir not found: $REPO/$RUNNER_DIR (set ${runner_dir_var} for a non-standard layout — see /perf-init)." >&2
    exit 2
fi

WORKTREE_PARENT="$(mktemp -d)"
WORKTREE="$WORKTREE_PARENT/perf-baseline"
# Each side is the run's results DIRECTORY, not a single file: BenchmarkDotNet writes one
# *-report-full-compressed.json per benchmark class, so a multi-class scope (--categories, or a broad
# --filter spanning classes) emits several. compare-reports.cs reads the whole directory and merges them.
# The two runs use distinct tree roots, so their results dirs never collide; compare runs before the
# worktree is removed (the cleanup trap fires on EXIT, after the comparison).
BASE_RESULTS="$WORKTREE/$RUNNER_DIR/BenchmarkDotNet.Artifacts/results"
CUR_RESULTS="$REPO/$RUNNER_DIR/BenchmarkDotNet.Artifacts/results"

cleanup() {
    git -C "$REPO" worktree remove --force "$WORKTREE" 2>/dev/null || true
    rm -rf "$WORKTREE_PARENT"
}
trap cleanup EXIT

echo "[own-before-after] baseline=$BASELINE_REF runner=$RUNNER job=$JOB filter='$FILTER' categories='${CATEGORIES[*]+"${CATEGORIES[*]}"}'" >&2
git -C "$REPO" worktree add --detach "$WORKTREE" "$BASELINE_REF" >&2

# Carry any gitignored nuget.config under benchmarks/ into the worktree. Generic: copy whatever
# the main tree has that the worktree lacks.
while IFS= read -r cfg; do
    rel="${cfg#"$REPO/"}"
    dst="$WORKTREE/$rel"
    if [[ ! -f "$dst" && -d "$(dirname "$dst")" ]]; then
        cp "$cfg" "$dst"
    fi
done < <(find "$REPO/benchmarks" -name nuget.config 2>/dev/null)

run_one() { # $1 = tree root, $2 = label
    local root="$1" label="$2"
    echo "[own-before-after] running $label ($root/$RUNNER_DIR)..." >&2
    (
        cd "$root/$RUNNER_DIR"
        rm -rf BenchmarkDotNet.Artifacts
        dotnet run -c Release -- ${JOB_FLAGS[@]+"${JOB_FLAGS[@]}"} --filter "$FILTER" ${CAT_FLAGS[@]+"${CAT_FLAGS[@]}"} --exporters json
    ) >&2
}

run_one "$WORKTREE" "baseline ($BASELINE_REF)"
run_one "$REPO" "current (working tree)"

# compare-reports.cs exit 1 = regression (a valid verdict) — don't let `set -e` abort on it.
set +e
dotnet run "$SCRIPT_DIR/compare-reports.cs" -- "$BASE_RESULTS" "$CUR_RESULTS" --job-kind "$JOB_KIND" ${COMPARE_EXTRA[@]+"${COMPARE_EXTRA[@]}"}
rc=$?
set -e
exit "$rc"
