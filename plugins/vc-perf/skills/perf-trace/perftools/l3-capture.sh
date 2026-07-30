#!/usr/bin/env bash
# Agentic L3 trace capture against the running backend from inside a SANDBOXED AGENT session
# (e.g. Claude Code) — no host terminal needed. See perftools/README.md → "Agentic run".
# Outside a sandbox it degrades gracefully: the Unix-socket route is Linux-only, so when no
# socket is found (Windows uses named pipes) it falls back to plain `dotnet-trace collect -p`.
#
# Usage:
#   l3-capture.sh <backend-pid> <profile> <duration> <output-abs-path>
#
#   backend-pid   The REAL application host pid — NOT a `dotnet run`/watch launcher (or an
#                 orchestrator like Aspire running `dotnet run --build`), whose trace is idle
#                 MSBuild/CLI frames. Find the app pid by tracing each diagnostic socket in the
#                 restart cohort ~5s: the APP's trace is tens of MB (~hundreds of threads:
#                 Kestrel + threadpool) with VirtoCommerce/Kestrel frames; a launcher's is small
#                 with MSBuild frames. The app pid is stable until the next backend restart.
#   profile       dotnet-sampled-thread-time (CPU/thread) | gc-verbose (alloc) | gc-collect (cheap)
#   duration      dd:hh:mm:ss (dotnet-trace's format, e.g. 00:00:01:40 = 100s)
#   output        ABSOLUTE writable path ending in .nettrace (relative/$TMPDIR fails — see below)
#
# WHY THE INDIRECTION (do not "simplify"):
#   - `dotnet-trace collect -p <pid>` fails from a sandboxed agent session: the session is in its
#     own PID namespace, so the host pid is invisible. Use `--diagnostic-port <socket>,connect`
#     (no pid lookup) instead — the socket is visible in the shared /tmp.
#   - A bare `dotnet-trace` runs INSIDE the sandbox seccomp, which blocks the AF_UNIX/epoll
#     syscalls .NET's Socket ctor needs -> SocketException(13). Invoke the dotnet-trace DLL
#     through the `dotnet` host so the top-level command matches the agent's exec allowlist
#     (Claude Code: `sandbox.excludedCommands` — `dotnet:*`) and runs OUTSIDE the seccomp. This
#     script works only if it (or `dotnet-trace`) is itself in the allowlist so its child `dotnet`
#     inherits the exclusion; otherwise run the final `dotnet "$DLL" collect ...` line directly.
#   - Disabling the sandbox does NOT help — it makes AF_UNIX EPERM (worse). Never do it.
#   - $TMPDIR is EMPTY for excluded commands, so a relative/$TMPDIR output lands at `/` -> denied.
#     An absolute path is required (point it at a writable results dir).
set -euo pipefail

PID="${1:?backend app pid required (the real Kestrel host, not a dotnet run/watch launcher)}"
PROFILE="${2:-dotnet-sampled-thread-time}"
DURATION="${3:-00:00:01:40}"
OUT="${4:?absolute output path required}"

case "$OUT" in
    /*|[A-Za-z]:*) : ;;
    *) echo "l3-capture: output must be an ABSOLUTE path (relative paths are unreliable across hosts/sandboxes)"; exit 2 ;;
esac

# Socket-first (Linux, incl. any sandboxed agent session): connect by diagnostic socket — no pid
# lookup, works across PID namespaces. `|| true` so a no-match doesn't trip `set -e`/`pipefail`.
SOCK=$(ls -t /tmp/dotnet-diagnostic-"${PID}"-*-socket 2>/dev/null | head -1) || true
if [ -n "$SOCK" ]; then
    # Prefer the DLL-through-`dotnet` form (sandbox exec-allowlist friendly — see WHY above);
    # fall back to the tool shim when the global-tool store isn't at the default location.
    DLL=$(find "$HOME/.dotnet/tools/.store/dotnet-trace" -name dotnet-trace.dll -path '*/tools/*' 2>/dev/null | head -1) || true
    echo "l3-capture: pid=$PID sock=$SOCK profile=$PROFILE duration=$DURATION out=$OUT"
    if [ -n "$DLL" ]; then
        exec dotnet "$DLL" collect --diagnostic-port "${SOCK},connect" --profile "$PROFILE" --duration "$DURATION" -o "$OUT"
    fi
    command -v dotnet-trace >/dev/null 2>&1 || { echo "l3-capture: dotnet-trace not found (dotnet tool install -g dotnet-trace)"; exit 3; }
    exec dotnet-trace collect --diagnostic-port "${SOCK},connect" --profile "$PROFILE" --duration "$DURATION" -o "$OUT"
fi

# No Unix socket — Windows (named-pipe transport, invisible to the /tmp glob) or a wrong pid.
# Fall back to the standard by-pid invocation; requires a host terminal (from a sandboxed agent
# session the pid is invisible — see WHY above) and dotnet-trace on PATH.
command -v dotnet-trace >/dev/null 2>&1 || { echo "l3-capture: no diagnostic socket for pid $PID and dotnet-trace not on PATH (wrong pid? check the backend; dotnet tool install -g dotnet-trace)"; exit 4; }
echo "l3-capture: pid=$PID (no Unix socket — using dotnet-trace -p) profile=$PROFILE duration=$DURATION out=$OUT"
exec dotnet-trace collect -p "$PID" --profile "$PROFILE" --duration "$DURATION" -o "$OUT"
