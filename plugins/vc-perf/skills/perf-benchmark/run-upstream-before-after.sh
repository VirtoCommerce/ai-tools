#!/usr/bin/env bash
# run-upstream-before-after.sh — "dependency before/after": did an UPSTREAM change regress? Runs the
# upstream module's own benchmark runner at two revisions of the upstream source and emits the verdict
# via compare-reports.cs. This is a property of the upstream module, measured on the upstream runner —
# your client project's module is not involved.
#
# Same runner both sides (same namespace) → --match fullname.
#
# Note: the upstream runner's built-in `--baseline-src` flag does before/after in ONE BenchmarkDotNet
# run (emitting Ratio / Alloc-Ratio columns) and is the lighter path when you just want to eyeball the
# table — see the runner's README. This helper instead produces TWO clean single-job JSON reports so the
# structured, thresholded compare-reports.cs verdict applies (the single-run JSON cannot be split: its
# before/after share a FullName and the JSON drops the Job label).
#
# Usage:
#   run-upstream-before-after.sh <target> <upstream-baseline-ref> [--filter <pattern>]
#     [--job dry|short|default] [--alloc-threshold <pct>] [--time-threshold <pct>] [--upstream-root <dir>]
#
#   upstream-baseline-ref  the "before" revision IN THE UPSTREAM REPO (e.g. dev, a SHA, a tag). The
#                          upstream repo's current working tree is the "after".
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

usage() {
    cat >&2 <<'USAGE'
Usage:
  run-upstream-before-after.sh <target> <upstream-baseline-ref> [--filter <pattern>]
    [--categories <c1,c2,...>] [--job dry|short|default] [--alloc-threshold <pct>]
    [--time-threshold <pct>] [--upstream-root <dir>]

  target                 which upstream module — an entry from perf.benchmark.xapiTargets (e.g.
                         cart, order); resolves to vc-module-x-<target> by convention, override
                         via UPSTREAM_REPO_<TARGET> / UPSTREAM_RUNNER_DIR_<TARGET>.
  upstream-baseline-ref  the "before" revision in the UPSTREAM repo. Its working tree is "after".
  --filter               BenchmarkDotNet filter (default '*'). Scope to ONE operation.
  --categories           Comma-separated BenchmarkCategory names (e.g. items,configuration) → BDN
                         --anyCategories. Scope to an AREA. Composes with --filter (intersection).
  --job                  dry (smoke, default) | short | default. Only `default` lets the TIME axis gate.
  --upstream-root        workspace holding the upstream vc-module-x-* checkouts (default: the repo's parent — sibling checkouts).

  SCOPE: prefer --filter (one operation) or --categories (one area). Do NOT run the full suite ('*')
  in the loop — it is ~13h measured. Measure only what your change touches.
USAGE
}

if [[ $# -lt 2 ]]; then
    usage
    exit 2
fi

DOMAIN="$1"
BASELINE_REF="$2"
shift 2

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

# The target set is open (any entry from perf.benchmark.xapiTargets); the upstream repo and its
# runner dir default to the VC benchmark-engine convention (vc-module-x-<target>), override via
# UPSTREAM_REPO_<TARGET> / UPSTREAM_RUNNER_DIR_<TARGET> for a non-standard layout.
TARGET_KEY="$(tr '[:lower:]-' '[:upper:]_' <<< "$DOMAIN")"
up_repo_var="UPSTREAM_REPO_${TARGET_KEY}"
up_runner_var="UPSTREAM_RUNNER_DIR_${TARGET_KEY}"
UP_REPO="$UPSTREAM_ROOT/${!up_repo_var:-vc-module-x-${DOMAIN}}"
RUNNER_DIR="${!up_runner_var:-benchmarks/VirtoCommerce.X$(printf '%s' "${DOMAIN:0:1}" | tr '[:lower:]' '[:upper:]')${DOMAIN:1}.Benchmark}"

if [[ ! -d "$UP_REPO/.git" && ! -f "$UP_REPO/.git" ]]; then
    echo "Upstream repo not found: $UP_REPO (set --upstream-root, or ${up_repo_var} for a non-standard layout)." >&2
    exit 2
fi

if ! git -C "$UP_REPO" cat-file -e "${BASELINE_REF}^{commit}" 2>/dev/null; then
    echo "Baseline ref '$BASELINE_REF' is not a valid commit in $UP_REPO." >&2
    exit 2
fi

if [[ ! -d "$UP_REPO/$RUNNER_DIR" ]]; then
    echo "Upstream runner not found: $UP_REPO/$RUNNER_DIR (set ${up_runner_var} for a non-standard layout — see /perf-init)." >&2
    exit 2
fi

# Both runners take native BenchmarkDotNet --job (Decision A dropped the cart-only --smoke/--short
# aliases from the shared BenchmarkProgram), so there is no per-domain dialect split anymore.
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

WORKTREE_PARENT="$(mktemp -d)"
WORKTREE="$WORKTREE_PARENT/upstream-baseline"
# Each side is the run's results DIRECTORY, not a single file: BenchmarkDotNet writes one
# *-report-full-compressed.json per benchmark class, so a multi-class scope (--categories, or a broad
# --filter) emits several. compare-reports.cs reads the whole directory and merges them. The two runs use
# distinct tree roots, so their results dirs never collide; compare runs before the worktree is removed.
BASE_RESULTS="$WORKTREE/$RUNNER_DIR/BenchmarkDotNet.Artifacts/results"
CUR_RESULTS="$UP_REPO/$RUNNER_DIR/BenchmarkDotNet.Artifacts/results"

cleanup() {
    git -C "$UP_REPO" worktree remove --force "$WORKTREE" 2>/dev/null || true
    rm -rf "$WORKTREE_PARENT"
}
trap cleanup EXIT

echo "[upstream-before-after] upstream=$DOMAIN baseline=$BASELINE_REF job=$JOB filter='$FILTER' categories='${CATEGORIES[*]+"${CATEGORIES[*]}"}'" >&2
git -C "$UP_REPO" worktree add --detach "$WORKTREE" "$BASELINE_REF" >&2

# Carry any gitignored nuget.config under benchmarks/ into the worktree (x-order's bench-feed config is
# gitignored; x-cart has none). Generic: copy whatever the main tree has that the worktree lacks.
while IFS= read -r cfg; do
    rel="${cfg#"$UP_REPO/"}"
    dst="$WORKTREE/$rel"
    if [[ ! -f "$dst" && -d "$(dirname "$dst")" ]]; then
        cp "$cfg" "$dst"
    fi
done < <(find "$UP_REPO/benchmarks" -name nuget.config 2>/dev/null)

run_one() { # $1 = tree root, $2 = label
    local root="$1" label="$2"
    echo "[upstream-before-after] running $label ($root/$RUNNER_DIR)..." >&2
    (
        cd "$root/$RUNNER_DIR"
        rm -rf BenchmarkDotNet.Artifacts
        dotnet run -c Release -- ${JOB_FLAGS[@]+"${JOB_FLAGS[@]}"} --filter "$FILTER" ${CAT_FLAGS[@]+"${CAT_FLAGS[@]}"} --exporters json
    ) >&2
}

run_one "$WORKTREE" "upstream baseline ($BASELINE_REF)"
run_one "$UP_REPO" "upstream current"

# compare-reports.cs exit 1 = regression (a valid verdict) — don't let `set -e` abort on it.
set +e
dotnet run "$SCRIPT_DIR/compare-reports.cs" -- "$BASE_RESULTS" "$CUR_RESULTS" --match fullname --job-kind "$JOB_KIND" ${COMPARE_EXTRA[@]+"${COMPARE_EXTRA[@]}"}
rc=$?
set -e
exit "$rc"
