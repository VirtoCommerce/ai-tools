---
description: "Diagnose why an operation is slow or where its allocations/CPU/DB time come from — the L2 (load) + L3 (attribution) entry point. Routes to the right layer/tool and ends with ranked optimization candidates. Thin command over the perf-loop skill."
argument-hint: "[operation, e.g. 'getFullCart' or 'addItemsCart under load']"
disable-model-invocation: true
---

# /perf-loop — diagnose (L2 + L3)

Entry point for the "how does it behave under load / who is responsible" question. The **`perf-loop`
skill** carries the how (3-layer router, 3-axis discipline, capture→parse sequence, cross-layer rules);
this command just invokes it against the profile's backend and closes with ranked candidates (via the
`perf-analyst` agent for non-trivial attribution).

- Needs a running backend (`perf.backendUrl` / `perf.aspireHostPath`) and the L3 tools
  (`dotnet-trace`/`dotnet-counters`, installed by `/perf-init`).
- For the pure L1 "did my code's envelope regress?" question, use `/perf-benchmark` instead.
- To turn a finding into a fix + PR, hand off to `/perf-fix`.
