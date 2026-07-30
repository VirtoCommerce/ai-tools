#!/usr/bin/env bash
# T0 runner: k6 + dotnet-counters, file-first artifacts.
# Usage: loadtests/run.sh [smoke|steady]
# Env knobs forwarded to the scenario: BASE_URL, ITEMS, RATE, PRODUCT_ID, PRODUCT_IDS,
# PRODUCT_FILTER, DISTINCT_PRODUCTS, SKIP_ORDER, STORE_ID. USER_POOL, SEED_PASSWORD,
# SEED_EMAIL_FORMAT configure the multi-user seeding pool (see README.md). SCENARIO picks
# the scenario file (basename under scenarios/, default cart-order-loop). PLATFORM_PROCESS
# names the backend host binary for the EventPipe sidecar (default
# VirtoCommerce.Platform.Web; feed from profile perf.platformProcess). Credentials:
# PERF_API_USER / PERF_API_PASSWORD (required env). No secrets are printed or passed via argv.
# Other knobs: K6 (k6 binary path, default `k6` on PATH); PAYLOAD_DIR (a consumer scenarios/+queries/
# dir to run instead of the bundled ones, see below); RESULTS_DIR (artifact base dir — set to a
# workspace path so artifacts survive plugin updates, see below).
set -euo pipefail

DIR=$(cd "$(dirname "$0")" && pwd)
PROFILE="${1:-smoke}"
if [ "$PROFILE" != "smoke" ] && [ "$PROFILE" != "steady" ]; then
    echo "invalid profile: '$PROFILE' (expected smoke|steady). Pass a scenario via SCENARIO=, not as arg 1." >&2
    exit 1
fi
BASE_URL="${BASE_URL:-https://localhost:8090}"
SCENARIO="${SCENARIO:-cart-order-loop}"

# PAYLOAD_DIR lets a consumer project supply its own scenarios/ (+ optional queries/)
# while reusing this plugin's stable transport (lib/) and config.js. Empty/unset keeps
# today's behaviour unchanged: run the plugin's own bundled scenarios from $DIR.
RUN_DIR="$DIR"
if [ -n "${PAYLOAD_DIR:-}" ]; then
    if [ ! -d "$PAYLOAD_DIR" ]; then
        echo "PAYLOAD_DIR not found: $PAYLOAD_DIR" >&2
        exit 1
    fi
    if [ ! -d "$PAYLOAD_DIR/scenarios" ]; then
        echo "PAYLOAD_DIR has no scenarios/: $PAYLOAD_DIR" >&2
        exit 1
    fi
    RUN_DIR="$(mktemp -d)"
    trap 'rm -rf "$RUN_DIR"' EXIT
    cp -r "$DIR/lib" "$RUN_DIR/"
    cp "$DIR/config.js" "$RUN_DIR/"
    cp -r "$PAYLOAD_DIR/scenarios" "$RUN_DIR/"
    if [ -d "$PAYLOAD_DIR/queries" ]; then
        cp -r "$PAYLOAD_DIR/queries" "$RUN_DIR/"
    elif [ -d "$DIR/queries" ]; then
        cp -r "$DIR/queries" "$RUN_DIR/"
    fi
fi

SCENARIO_FILE="$RUN_DIR/scenarios/$SCENARIO.js"
if [ ! -f "$SCENARIO_FILE" ]; then
    echo "scenario not found: $SCENARIO_FILE" >&2
    exit 1
fi

K6="${K6:-k6}"
if ! command -v "$K6" >/dev/null 2>&1 && [ ! -x "$K6" ]; then
    echo "k6 not found — set K6 to the binary path or add k6 to PATH" >&2
    exit 1
fi

: "${PERF_API_USER:?PERF_API_USER not set}"
: "${PERF_API_PASSWORD:?PERF_API_PASSWORD not set}"
export PERF_API_USER PERF_API_PASSWORD

# Artifact stamp: the revision of the code UNDER TEST — the consumer repo you invoke this from
# (cwd), not the plugin install dir. Non-git cwd (or no git) degrades to "nogit", never aborts.
# PERF_SHA overrides it (CI, or a run driven from a script whose cwd is not the repo under test).
# The resolved repo is echoed with the run header: taking the stamp from cwd means a shell sitting
# in a *different* repo silently mislabels the artifact, and an A/B compared across two
# differently-stamped arms is worse than one with no stamp at all.
if [ -n "${PERF_SHA:-}" ]; then
    SHA="$PERF_SHA"
    SHA_REPO="(PERF_SHA override)"
else
    SHA=$(git rev-parse --short HEAD 2>/dev/null || echo nogit)
    SHA_REPO=$(git rev-parse --show-toplevel 2>/dev/null || echo "(not a git repo)")
fi
STAMP=$(date +%Y%m%d-%H%M%S)
# RESULTS_DIR is the base directory for artifacts. Default keeps today's behaviour ($DIR/results),
# but $DIR is inside the plugin INSTALL dir (a managed marketplace/cache clone) — results there are
# ephemeral (wiped on plugin update) and pollute a repo you don't own. Set RESULTS_DIR to a path in
# the consumer workspace (e.g. RESULTS_DIR="$PWD/.vc-perf/results", gitignored) to keep artifacts.
RESULTS_DIR="${RESULTS_DIR:-$DIR/results}"
OUT="$RESULTS_DIR/$PROFILE"
if [ "$SCENARIO" != "cart-order-loop" ]; then
    OUT="$RESULTS_DIR/$SCENARIO/$PROFILE"
fi
mkdir -p "$OUT"
SUMMARY="$OUT/$STAMP-$SHA.summary.json"

# EventPipe sidecar on the backend pid (optional). Match the app binary, not the
# `dotnet run` wrapper that carries the same name. Process name defaults to the VC host
# binary; override via PLATFORM_PROCESS (fed from profile perf.platformProcess) for
# projects that rename the host.
PLATFORM_PROCESS="${PLATFORM_PROCESS:-VirtoCommerce.Platform.Web}"
if command -v pgrep >/dev/null 2>&1; then
    # pgrep -f matches an extended regex — escape dots so `VirtoCommerce.Platform.Web`
    # (or any custom name) matches literally and can't attach to a differently-named neighbour.
    BACKEND_PID=$(pgrep -f "bin/[^ ]*/${PLATFORM_PROCESS//./\\.}" | head -1 || true)
else
    # Windows/Git Bash has no pgrep — fall back to the dotnet-counters process list.
    BACKEND_PID=$(dotnet-counters ps 2>/dev/null | grep -F "$PLATFORM_PROCESS" | awk '{print $1}' | head -1 || true)
fi

# EventPipe is single-consumer per pid: at most ONE of {dotnet-trace, dotnet-counters}
# may attach. TRACE=1 (alloc attribution) wins and forces the counters sidecar off.
TRACE_PID=""
TRACE_FILE=""
COUNTERS_PID=""
COUNTERS_CSV=""

if [ "${TRACE:-0}" = "1" ]; then
    # TRACE=1 wins and owns the pid exclusively: attach dotnet-trace if possible, otherwise
    # SKIP the sidecar — never fall through to counters. EventPipe is single-consumer, and a run
    # asked to produce an allocation .nettrace must not silently become a counters run instead.
    if [ -n "$BACKEND_PID" ] && command -v dotnet-trace >/dev/null 2>&1; then
        TRACE_FILE="$OUT/$STAMP-$SHA.alloc.nettrace"
        # gc-verbose surfaces GCAllocationTick (sampled ~every 100 KB) with type names +
        # stacks — the input for allocation-by-caller attribution. --duration caps an
        # orphaned capture; the EXIT trap stops it as soon as k6 finishes.
        dotnet-trace collect -p "$BACKEND_PID" --profile gc-verbose -o "$TRACE_FILE" \
            --duration 00:00:10:00 >/dev/null 2>&1 &
        TRACE_PID=$!
        echo "dotnet-trace (gc-verbose) collecting from pid $BACKEND_PID → $TRACE_FILE"
    else
        echo "note: TRACE=1 but no backend pid or dotnet-trace not found — skipping sidecar (NOT falling back to counters) — k6 summary only" >&2
    fi
elif [ "${NO_COUNTERS:-0}" != "1" ] && [ -n "$BACKEND_PID" ] && command -v dotnet-counters >/dev/null 2>&1; then
    COUNTERS_CSV="$OUT/$STAMP-$SHA.counters.csv"
    # --duration caps the capture so an externally-killed runner can't orphan it.
    dotnet-counters collect -p "$BACKEND_PID" --format csv -o "$COUNTERS_CSV" \
        --counters System.Runtime --duration 00:00:10:00 >/dev/null 2>&1 &
    COUNTERS_PID=$!
    echo "dotnet-counters collecting from pid $BACKEND_PID → $COUNTERS_CSV"
else
    echo "note: EventPipe sidecar skipped (TRACE off + NO_COUNTERS, or pid/tool not found) — k6 summary only"
fi

# Waits up to $2 seconds for pid $1 to exit. Returns 1 if it is still alive after that.
# `wait` alone cannot express a deadline, and a sidecar that ignores its stop signal would
# otherwise block the runner until --duration elapses.
wait_for_exit() {
    _pid=$1
    _deadline=$2
    _waited=0
    while kill -0 "$_pid" 2>/dev/null; do
        [ "$_waited" -ge "$_deadline" ] && return 1
        sleep 1
        _waited=$((_waited + 1))
    done

    return 0
}

stop_sidecars() {
    # dotnet-trace DOES honour SIGINT, and needs it: on the way out it flushes and writes the
    # .nettrace footer ("Stopping the trace. This may take several minutes depending on the
    # application being traced"), so it must not be hurried. Measured: exits ~2 s after SIGINT
    # with a complete file. The unbounded wait is deliberate — a big trace legitimately takes
    # a while, and truncating it is worse than waiting.
    if [ -n "$TRACE_PID" ]; then
        kill -INT "$TRACE_PID" 2>/dev/null || true
        wait "$TRACE_PID" 2>/dev/null || true
    fi
    # dotnet-counters does NOT honour SIGINT without a controlling terminal — which a backgrounded
    # sidecar never has. Measured: it ignored SIGINT for 10 s+, so the `wait` here blocked until
    # --duration expired and the whole runner hung for ten minutes after k6 had already finished
    # and written its summary. SIGTERM stops it in ~2 s and the CSV is written complete.
    # SIGINT is still sent first, so a future version that grows a handler shuts down its own way.
    if [ -n "$COUNTERS_PID" ]; then
        kill -INT "$COUNTERS_PID" 2>/dev/null || true
        if ! wait_for_exit "$COUNTERS_PID" 3; then
            kill -TERM "$COUNTERS_PID" 2>/dev/null || true
            # Last resort: a wedged sidecar must never again outlive the run that started it.
            wait_for_exit "$COUNTERS_PID" 15 || kill -KILL "$COUNTERS_PID" 2>/dev/null || true
        fi
        wait "$COUNTERS_PID" 2>/dev/null || true
    fi
    # Folds in the PAYLOAD_DIR ephemeral run-dir cleanup — this trap replaces the one set
    # right after mktemp, so RUN_DIR removal has to live here too, not just at mktemp time.
    if [ "$RUN_DIR" != "$DIR" ]; then
        # `|| true`: with `set -e` re-enabled after the k6 run, a failed cleanup here must not
        # abort before the artifact printout and `exit $K6_EXIT` below (matches kill/wait above).
        rm -rf "$RUN_DIR" || true
    fi
}
trap stop_sidecars EXIT

echo "k6 run: scenario=$SCENARIO profile=$PROFILE sha=$SHA base=$BASE_URL"
# Only announce labelling when gql.js will actually apply it — it honours the exact value 1, so
# `OP_TAG=0` must not print a line claiming requests are labelled.
if [ "${OP_TAG:-}" = "1" ]; then
    echo "  sha from: $SHA_REPO   OP_TAG=1 (requests labelled ?op=<name>)"
else
    echo "  sha from: $SHA_REPO"
fi
# A k6 threshold breach exits non-zero — a valid verdict, not a script failure. Suspend
# `set -e` around the run so the artifact printout and exit-code propagation below still happen.
set +e
"$K6" run \
    -e PROFILE="$PROFILE" \
    -e BASE_URL="$BASE_URL" \
    -e SUMMARY_PATH="$SUMMARY" \
    "$SCENARIO_FILE"
K6_EXIT=$?
set -e

stop_sidecars
trap - EXIT

echo "artifacts:"
echo "  $SUMMARY"
if [ -n "$COUNTERS_CSV" ] && [ -f "$COUNTERS_CSV" ]; then
    echo "  $COUNTERS_CSV"
fi
if [ -n "$TRACE_FILE" ] && [ -f "$TRACE_FILE" ]; then
    echo "  $TRACE_FILE"
fi

exit $K6_EXIT
